import { test } from 'node:test';
import assert from 'node:assert/strict';
import { geminiSynthesize, listGeminiTtsModels, GEMINI_VOICES } from '../../src/offscreen/gemini-tts.js';
import { GeminiListener, geminiSttSetup, geminiLiveToken } from '../../src/offscreen/gemini-stt.js';
import { DEFAULT_SETTINGS, missingKeys } from '../../src/shared/settings.js';
import { speechAccount } from '../../src/shared/elevenlabs.js';

const b64 = (int16) => Buffer.from(int16.buffer, int16.byteOffset, int16.byteLength).toString('base64');
const sse = (events) => new Response(events.map((e) => `data: ${JSON.stringify(e)}\r\n\r\n`).join(''), { status: 200 });
const audio = (int16) => ({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/l16; rate=24000; channels=1', data: b64(int16) } }] } }] });

async function collect(iterable) {
  const out = [];
  for await (const piece of iterable) out.push(piece);
  return out;
}

test('Gemini speech streams its PCM pieces as they come, the key in a header', async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, init, body: JSON.parse(init.body) };
    return sse([audio(new Int16Array([1, -2, 3])), audio(new Int16Array([400, -500]))]);
  };
  const chunks = await collect(geminiSynthesize({ key: ' gk ', voice: 'Kore', text: 'Merhaba.', fetchImpl }));
  assert.deepEqual(chunks.map((c) => [...c]), [[1, -2, 3], [400, -500]]);
  assert.equal(seen.init.headers['x-goog-api-key'], 'gk');
  assert.doesNotMatch(seen.url, /gk/);
  assert.match(seen.url, /gemini-3\.8-flash-lite-tts:streamGenerateContent\?alt=sse$/);
  assert.deepEqual(seen.body.generationConfig, { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } });
  assert.equal(seen.body.contents[0].parts[0].text, 'Merhaba.');
});

test('Gemini speech errors say what to fix', async () => {
  const say = (status, body) => collect(geminiSynthesize({ key: 'k', voice: 'Nobody', text: 'x', fetchImpl: async () => Response.json(body, { status }) }));
  await assert.rejects(say(400, { error: { message: 'API key not valid.', details: [{ reason: 'API_KEY_INVALID' }] } }), (e) => e.kind === 'auth');
  await assert.rejects(say(400, { error: { message: 'No matching speaker voice found for name: Nobody and language: ' } }), (e) => e.kind === 'voice' && /Nobody/.test(e.message));
  await assert.rejects(say(429, { error: { message: 'RESOURCE_EXHAUSTED' } }), (e) => e.kind === 'rate');
});

test('the TTS model list holds the speech models only; thirty voices are offered', async () => {
  const fetchImpl = async () => Response.json({ models: [{ name: 'models/gemini-3.8-flash-tts' }, { name: 'models/gemini-3.5-flash-lite' }, { name: 'models/gemini-3.1-flash-tts-preview' }, { name: 'models/gemini-3.8-flash-lite-tts' }] });
  assert.deepEqual(await listGeminiTtsModels({ key: 'k', fetchImpl }), ['gemini-3.1-flash-tts-preview', 'gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts']);
  assert.equal(GEMINI_VOICES.length, 30);
});

test('the Live setup takes the language and the chosen silence', () => {
  assert.deepEqual(geminiSttSetup({ languageCode: 'tr', silenceMs: 500 }).setup, {
    model: 'models/gemini-3.5-transcribe-live',
    inputAudioTranscription: { languageCodes: ['tr'] },
    realtimeInputConfig: { automaticActivityDetection: { silenceDurationMs: 500 } },
  });
  assert.deepEqual(geminiSttSetup({}).setup.inputAudioTranscription, {});
});

test('a refused key fails the token request as a key error', async () => {
  const fetchImpl = async () => Response.json({ error: { message: 'API key not valid.', details: [{ reason: 'API_KEY_INVALID' }] } }, { status: 400 });
  await assert.rejects(geminiLiveToken({ key: 'bad', fetchImpl }), (e) => e.kind === 'auth');
});

// A stand-in for the Live API's WebSocket.
class FakeSocket {
  static all = [];
  constructor(url) {
    this.url = url;
    this.sent = [];
    FakeSocket.all.push(this);
    setTimeout(() => this.onopen?.(), 0);
  }
  send(text) {
    this.sent.push(JSON.parse(text));
  }
  close(code = 1000) {
    this.closed = code;
  }
  serve(data) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
  drop(code = 1006) {
    this.onclose?.({ code, reason: '' });
  }
}

const tick = () => new Promise((r) => setTimeout(r, 5));

function listener(extra = {}) {
  FakeSocket.all = [];
  const events = [];
  let tokens = 0;
  const fetchImpl = async (url, init) => {
    assert.equal(init.headers['x-goog-api-key'], 'gk');
    tokens += 1;
    return Response.json({ name: `auth_tokens/t${tokens}` });
  };
  const l = new GeminiListener({
    key: 'gk',
    languageCode: 'tr',
    silenceMs: 600,
    WebSocketImpl: FakeSocket,
    fetchImpl,
    onPartial: (t) => events.push(['partial', t]),
    onCommitted: (t) => events.push(['final', t]),
    onStatus: (s) => events.push(['status', s]),
    onFatal: (e) => events.push(['fatal', e.kind]),
    ...extra,
  });
  return { l, events, tokens: () => tokens };
}

test('the listener opens with a single-use token, sends audio after setup and reports drafts and final text', async () => {
  const { l, events } = listener();
  l.start();
  l.sendAudio(new Int16Array([1, 2])); // before the stream is ready: kept
  await tick();
  const ws = FakeSocket.all[0];
  assert.match(ws.url, /access_token=auth_tokens%2Ft1$/);
  assert.doesNotMatch(ws.url, /gk/);
  assert.equal(ws.sent[0].setup.realtimeInputConfig.automaticActivityDetection.silenceDurationMs, 600);
  ws.serve({ setupComplete: {} });
  assert.equal(ws.sent.length, 2);
  assert.equal(ws.sent[1].realtimeInput.audio.mimeType, 'audio/pcm;rate=16000');
  assert.equal(ws.sent[1].realtimeInput.audio.data, b64(new Int16Array([1, 2])));
  ws.serve({ serverContent: { interimInputTranscription: { text: 'Bugünkü' } } });
  ws.serve({ serverContent: { inputTranscription: { text: 'Bugünkü görüşme. ' } } });
  assert.deepEqual(events.filter(([k]) => k !== 'status'), [['partial', 'Bugünkü'], ['final', 'Bugünkü görüşme.']]);
  assert.ok(events.some(([k, v]) => k === 'status' && v === 'ready'));
  l.stop();
});

test('a dropped stream keeps the sentence heard so far and reconnects with a new token', async () => {
  const { l, events, tokens } = listener();
  l.start();
  await tick();
  FakeSocket.all[0].serve({ setupComplete: {} });
  FakeSocket.all[0].serve({ serverContent: { interimInputTranscription: { text: 'Cuma günü saat üç' } } });
  FakeSocket.all[0].drop(1006);
  assert.deepEqual(events.filter(([k]) => k === 'final'), [['final', 'Cuma günü saat üç']]);
  l.sendAudio(new Int16Array([7]));
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(tokens(), 2);
  const second = FakeSocket.all[1];
  second.serve({ setupComplete: {} });
  assert.equal(second.sent.at(-1).realtimeInput.audio.data, b64(new Int16Array([7])));
  l.stop();
});

test('goAway renews the session at once', async () => {
  const { l } = listener();
  l.start();
  await tick();
  FakeSocket.all[0].serve({ setupComplete: {} });
  FakeSocket.all[0].serve({ goAway: { timeLeft: '50s' } });
  await tick();
  assert.equal(FakeSocket.all[0].closed, 1000);
  assert.equal(FakeSocket.all.length, 2);
  l.stop();
});

test('a refused setup (1008) ends the listener instead of retrying', async () => {
  const { l, events } = listener();
  l.start();
  await tick();
  FakeSocket.all[0].drop(1008);
  await tick();
  assert.ok(events.some(([k]) => k === 'fatal'));
  assert.equal(FakeSocket.all.length, 1);
});

test('Gemini as the speech service needs only the Gemini key, asked for once', () => {
  const s = { ...DEFAULT_SETTINGS, speechProvider: 'gemini', translationProvider: 'gemini', elevenLabsKey: '' };
  assert.deepEqual(missingKeys(s), ['Gemini']);
  assert.deepEqual(missingKeys({ ...s, geminiKey: 'g' }), []);
  assert.deepEqual(missingKeys({ ...s, translationProvider: 'claude', anthropicKey: 'a', geminiKey: 'g' }), []);
  // Soniox translating: Gemini only speaks, its key is still needed.
  assert.deepEqual(missingKeys({ ...s, translationProvider: 'soniox', sonioxKey: 'sx' }), ['Gemini']);
  assert.equal(speechAccount({ ...s, geminiKey: ' g ' }).kind, 'gemini');
  assert.equal(speechAccount({ ...s, geminiKey: ' g ' }).key, 'g');
});
