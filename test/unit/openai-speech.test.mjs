import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Segmenter } from '../../src/offscreen/segmenter.js';
import { OpenAITranscriber, openaiSynthesize, listAudioModels, listAudioVoices, OPENAI_VOICES } from '../../src/offscreen/openai-speech.js';
import { speechAccount } from '../../src/shared/elevenlabs.js';
import { missingKeys, missingServers, DEFAULT_SETTINGS } from '../../src/shared/settings.js';
import { encodeWav } from '../../src/shared/pcm.js';

const RATE = 16000;
const tone = (secs, level = 0.3) => Int16Array.from({ length: Math.round(secs * RATE) }, (_, i) => Math.round(Math.sin((2 * Math.PI * 220 * i) / RATE) * level * 32767));
const quiet = (secs) => new Int16Array(Math.round(secs * RATE));
const chunks = (pcm) => Array.from({ length: Math.ceil(pcm.length / 1600) }, (_, i) => pcm.subarray(i * 1600, (i + 1) * 1600));
const join = (...parts) => {
  const out = new Int16Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

test('the segmenter ends an utterance after the silence and cuts long speech', () => {
  const seg = new Segmenter({ silenceSecs: 0.7 });
  const done = [];
  for (const c of chunks(join(quiet(0.5), tone(2), quiet(1), tone(1.5), quiet(1)))) done.push(...seg.push(c));
  assert.equal(done.length, 2);
  assert.ok(done[0].length / RATE > 2 && done[0].length / RATE < 3.3);
  const long = new Segmenter({ maxSecs: 3 });
  const cut = [];
  for (const c of chunks(tone(7))) cut.push(...long.push(c));
  assert.equal(cut.length, 2);
  assert.equal(new Segmenter().push(tone(0.06)).length, 0);
});

function fakeAudioServer({ texts = ['Hello there.', 'How are you?'], status = 200 } = {}) {
  const calls = [];
  let n = 0;
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    if (status !== 200) return Response.json({ error: { message: 'no' } }, { status });
    if (url.endsWith('/audio/transcriptions')) {
      const form = init.body;
      calls.at(-1).fields = { model: form.get('model'), language: form.get('language'), type: form.get('file').type };
      // The first request answers last: the order must still be kept.
      await new Promise((r) => setTimeout(r, n === 0 ? 40 : 1));
      return Response.json({ text: texts[n++ % texts.length] });
    }
    if (url.endsWith('/models')) return Response.json({ data: ['whisper-1', 'gpt-4o-mini-tts', 'tts-1', 'gpt-4o-transcribe', 'gpt-5'].map((id) => ({ id })) });
    return new Response('', { status: 404 });
  };
  return { fetchImpl, calls };
}

test('each utterance is sent as a WAV file and comes back in the order it was said', async () => {
  const { fetchImpl, calls } = fakeAudioServer();
  const heard = [];
  const stt = new OpenAITranscriber({ name: 'in', base: 'https://api.groq.com/openai/v1', key: 'k', model: 'whisper-large-v3-turbo', languageCode: 'en', fetchImpl, onCommitted: (t) => heard.push(t) });
  stt.start();
  for (const c of chunks(join(tone(1.2), quiet(1), tone(1.2), quiet(1)))) stt.sendAudio(c);
  await stt.queue;
  assert.deepEqual(heard, ['Hello there.', 'How are you?']);
  assert.equal(calls[0].url, 'https://api.groq.com/openai/v1/audio/transcriptions');
  assert.deepEqual(calls[0].fields, { model: 'whisper-large-v3-turbo', language: 'en', type: 'audio/wav' });
  assert.equal(calls[0].init.headers.Authorization, 'Bearer k');
});

test('an automatic language is left to the service, and made-up lines are dropped', async () => {
  const { fetchImpl, calls } = fakeAudioServer({ texts: ['Thanks for watching!'] });
  const heard = [];
  const stt = new OpenAITranscriber({ name: 'in', model: 'whisper-1', languageCode: 'auto', fetchImpl, onCommitted: (t) => heard.push(t) });
  stt.start();
  for (const c of chunks(join(tone(1), quiet(1)))) stt.sendAudio(c);
  await stt.queue;
  assert.equal(calls[0].fields.language, null);
  assert.deepEqual(heard, []);
});

test('a refused key stops recognition for good', async () => {
  const { fetchImpl } = fakeAudioServer({ status: 401 });
  let fatal = null;
  const stt = new OpenAITranscriber({ name: 'in', model: 'whisper-1', fetchImpl, onFatal: (e) => (fatal = e) });
  stt.start();
  for (const c of chunks(join(tone(1), quiet(1)))) stt.sendAudio(c);
  await stt.queue;
  assert.ok(fatal?.fatal);
  assert.equal(stt.status, 'failed');
});

test('speech streams raw 24 kHz PCM, and falls back to WAV where PCM is refused', async () => {
  const pcm = new Int16Array(4800).fill(1000);
  const pcmFetch = async () => new Response(new Uint8Array(pcm.buffer), { status: 200, headers: { 'content-type': 'audio/pcm' } });
  const got = [];
  for await (const c of openaiSynthesize({ model: 'gpt-4o-mini-tts', voice: 'alloy', text: 'Hi', fetchImpl: pcmFetch })) got.push(...c);
  assert.equal(got.length, 4800);

  const asked = [];
  const wav = new Uint8Array(encodeWav(new Int16Array(22050).fill(2000), 22050));
  const wavFetch = async (url, init) => {
    const format = JSON.parse(init.body).response_format;
    asked.push(format);
    if (format === 'pcm') return Response.json({ error: { message: 'unsupported format' } }, { status: 400 });
    return new Response(wav, { status: 200, headers: { 'content-type': 'audio/wav' } });
  };
  let total = 0;
  for await (const c of openaiSynthesize({ base: 'http://127.0.0.1:8880/v1', model: 'kokoro', voice: 'af_bella', text: 'Hi', fetchImpl: wavFetch })) total += c.length;
  assert.deepEqual(asked, ['pcm', 'wav']);
  assert.ok(Math.abs(total - 24000) < 50, `${total} samples`);
});

test('model lists keep the models for the job; OpenAI has its own voices', async () => {
  const { fetchImpl } = fakeAudioServer();
  assert.deepEqual(await listAudioModels({ kind: 'stt', key: 'k', fetchImpl }), ['gpt-4o-transcribe', 'whisper-1']);
  assert.deepEqual(await listAudioModels({ kind: 'tts', key: 'k', fetchImpl }), ['gpt-4o-mini-tts', 'tts-1']);
  assert.deepEqual(await listAudioVoices({}), OPENAI_VOICES);
});

test('the speech account takes the keys under Translation when none is typed', () => {
  const s = { ...DEFAULT_SETTINGS, translationProvider: 'free', speechProvider: 'openai', oaiSttServer: 'groq', groqKey: 'gk', openaiKey: 'ok' };
  const account = speechAccount(s);
  assert.equal(account.stt.base, 'https://api.groq.com/openai/v1');
  assert.equal(account.stt.key, 'gk');
  assert.equal(account.stt.model, 'whisper-large-v3-turbo');
  assert.equal(account.tts.key, 'ok');
  assert.deepEqual(missingKeys(s), []);
  assert.deepEqual(missingKeys({ ...s, groqKey: '', openaiKey: '' }), ['Groq', 'OpenAI']);
  assert.deepEqual(missingServers({ ...s, oaiTtsServer: 'custom' }), ['speech']);
});
