// Speech recognition and speech through OpenAI's audio API, which OpenAI, Groq (recognition
// only) and self-hosted servers (Speaches, LocalAI, Kokoro-FastAPI) all speak:
//
//   POST {base}/audio/transcriptions   a recording in, its text out
//   POST {base}/audio/speech           text in, audio out
//
// These services take whole recordings, not a live stream, so the audio is cut into
// utterances here (segmenter.js) and each one is sent when it ends.

import { Segmenter } from './segmenter.js';
import { encodeWav, float32ToInt16, PcmByteAligner } from '../shared/pcm.js';
import { StreamResampler } from '../shared/dsp.js';
import { AUTO_LANGUAGE } from '../shared/languages.js';
import { t } from '../shared/i18n.js';

export const OPENAI_AUDIO_URL = 'https://api.openai.com/v1';
export const GROQ_AUDIO_URL = 'https://api.groq.com/openai/v1';

// OpenAI's own voices; other servers say theirs at /audio/voices.
export const OPENAI_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse'];

// Whisper makes these up from silence and noise (subtitle credits, video outros).
const MADE_UP = /(altyaz[ıi]|subtitles? by|thanks? for watching|izlediğiniz için teşekkür|abone ol|like and subscribe|amara\.org|^\W*$)/i;

export class SpeechServiceError extends Error {
  constructor(message, { status, fatal = false } = {}) {
    super(message);
    this.status = status;
    this.fatal = fatal;
  }
}

function headers(key, json) {
  const h = {};
  if (key) h.Authorization = `Bearer ${key}`;
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

async function failure(res, name) {
  let detail = '';
  try {
    const data = await res.json();
    detail = String(data?.error?.message || data?.detail || data?.message || '').slice(0, 200);
  } catch {
    // no readable body
  }
  if (res.status === 401 || res.status === 403) return new SpeechServiceError(t('oai.auth', { name }), { status: res.status, fatal: true });
  if (res.status === 429) return new SpeechServiceError(t('oai.rate', { name }), { status: 429 });
  return new SpeechServiceError(t('oai.http', { name, status: res.status, detail }), { status: res.status, fatal: res.status === 404 });
}

// ---- recognition -----------------------------------------------------------------------

// Has the same face as ScribeRealtime (stt.js): start, stop, sendAudio and the callbacks,
// so the engine treats both alike. There are no partials: each utterance comes back once.
export class OpenAITranscriber {
  constructor({ name, base, key = '', model, languageCode, vadSilenceSecs = 0.7, keyterms = [], fetchImpl, onCommitted, onStatus, onFatal, log }) {
    this.name = name;
    this.base = String(base || OPENAI_AUDIO_URL).replace(/\/+$/, '');
    this.key = key;
    this.model = model;
    this.languageCode = languageCode && languageCode !== AUTO_LANGUAGE ? languageCode : '';
    this.keyterms = keyterms;
    this.fetch = fetchImpl || ((...a) => fetch(...a));
    this.onCommitted = onCommitted;
    this.onStatus = onStatus;
    this.onFatal = onFatal;
    this.log = log || (() => {});
    this.segmenter = new Segmenter({ silenceSecs: vadSilenceSecs });
    this.queue = Promise.resolve();
    this.stopped = true;
    this.status = 'idle';
    this.label = new URL(this.base).hostname;
  }

  set apiKey(account) {
    // The engine hands over a new speech account when the settings change.
    if (account?.stt) Object.assign(this, { base: account.stt.base, key: account.stt.key, model: account.stt.model });
  }

  start() {
    this.stopped = false;
    this.setStatus('ready');
  }

  stop() {
    this.stopped = true;
    this.segmenter = new Segmenter({ silenceSecs: this.segmenter.silenceSecs });
    this.setStatus('stopped');
  }

  setStatus(status) {
    this.status = status;
    this.onStatus?.(status);
  }

  sendAudio(int16) {
    if (this.stopped) return;
    for (const utterance of this.segmenter.push(int16)) this.transcribe(utterance);
  }

  // One request at a time, so the transcripts come back in the order they were said.
  transcribe(audio) {
    this.queue = this.queue.then(() => this.request(audio)).catch((err) => {
      if (err?.fatal) {
        this.stop();
        this.setStatus('failed');
        this.onFatal?.(err);
      } else {
        this.log('warn', `${this.name}: ${err?.message || err}`);
      }
    });
  }

  async request(audio, attempt = 0) {
    if (this.stopped) return;
    const form = new FormData();
    form.append('file', new Blob([encodeWav(float32ToInt16(audio), 16000)], { type: 'audio/wav' }), 'speech.wav');
    form.append('model', this.model);
    form.append('response_format', 'json');
    form.append('temperature', '0');
    if (this.languageCode) form.append('language', this.languageCode);
    if (this.keyterms.length) form.append('prompt', this.keyterms.join(', ').slice(0, 400));
    let res;
    try {
      res = await this.fetch(`${this.base}/audio/transcriptions`, { method: 'POST', headers: headers(this.key), body: form });
    } catch {
      if (attempt < 1) return this.request(audio, attempt + 1);
      throw new SpeechServiceError(t('oai.network', { name: this.label }));
    }
    if (!res.ok) {
      const err = await failure(res, this.label);
      if (!err.fatal && attempt < 1 && (res.status === 429 || res.status >= 500)) {
        await new Promise((r) => setTimeout(r, 600));
        return this.request(audio, attempt + 1);
      }
      throw err;
    }
    const text = String((await res.json())?.text || '').trim();
    if (this.stopped || !text || MADE_UP.test(text)) return;
    this.onCommitted?.(text);
  }
}

// ---- speech ----------------------------------------------------------------------------

function readWav(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 12;
  let rate = 24000;
  let channels = 1;
  while (at + 8 <= view.byteLength) {
    const id = String.fromCharCode(...bytes.subarray(at, at + 4));
    const size = view.getUint32(at + 4, true);
    if (id === 'fmt ') {
      channels = view.getUint16(at + 10, true);
      rate = view.getUint32(at + 12, true);
    } else if (id === 'data') {
      const end = Math.min(view.byteLength, at + 8 + size);
      const frames = Math.floor((end - at - 8) / (2 * channels));
      const out = new Float32Array(frames);
      for (let i = 0; i < frames; i++) out[i] = view.getInt16(at + 8 + i * 2 * channels, true) / 32768;
      return { samples: out, rate };
    }
    at += 8 + size + (size % 2);
  }
  throw new Error('no audio in the answer');
}

// Yields 24 kHz 16-bit chunks, like synthesize() for ElevenLabs. Raw PCM is asked for
// first (OpenAI streams it); a server that does not offer it gets asked for WAV.
// instructions: how to speak (only OpenAI's gpt-*-tts models take it).
export async function* openaiSynthesize({ base, key = '', model, voice, text, speed = 1, instructions = '', signal, fetchImpl = (...a) => fetch(...a), wavOnly = false }) {
  const root = String(base || OPENAI_AUDIO_URL).replace(/\/+$/, '');
  const name = new URL(root).hostname;
  const ask = (format) =>
    fetchImpl(`${root}/audio/speech`, {
      method: 'POST',
      headers: headers(key, true),
      body: JSON.stringify({ model, voice, input: text, response_format: format, speed, ...(instructions && /gpt-.*tts/i.test(model || '') ? { instructions } : {}) }),
      signal,
    });
  let res;
  try {
    res = wavOnly ? await ask('wav') : await ask('pcm');
    if (!wavOnly && (res.status === 400 || res.status === 422)) res = await ask('wav');
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new SpeechServiceError(t('oai.network', { name }));
  }
  if (!res.ok) throw await failure(res, name);
  const type = res.headers.get('content-type') || '';
  if (/wav|wave/i.test(type) || wavOnly || res.url?.includes('format=wav')) {
    const { samples, rate } = readWav(new Uint8Array(await res.arrayBuffer()));
    const resampler = new StreamResampler(rate, 24000);
    const out = [...resampler.process(samples), ...resampler.flush()];
    yield float32ToInt16(Float32Array.from(out));
    return;
  }
  const reader = res.body.getReader();
  const aligner = new PcmByteAligner();
  let head = true;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      // A server that sent WAV for "pcm" anyway: its header is not sound.
      if (head && value.length >= 12 && String.fromCharCode(...value.subarray(0, 4)) === 'RIFF') {
        const rest = [value];
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          rest.push(next.value);
        }
        const all = new Uint8Array(rest.reduce((n, c) => n + c.length, 0));
        let at = 0;
        for (const c of rest) {
          all.set(c, at);
          at += c.length;
        }
        const { samples, rate } = readWav(all);
        const resampler = new StreamResampler(rate, 24000);
        yield float32ToInt16(Float32Array.from([...resampler.process(samples), ...resampler.flush()]));
        return;
      }
      head = false;
      const samples = aligner.push(value);
      if (samples.length) yield samples;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

// ---- lists for the settings page -------------------------------------------------------

export async function listAudioModels({ base, key = '', kind, fetchImpl = (...a) => fetch(...a) }) {
  const root = String(base || OPENAI_AUDIO_URL).replace(/\/+$/, '');
  const res = await fetchImpl(`${root}/models`, { headers: headers(key) }).catch(() => {
    throw new SpeechServiceError(t('oai.network', { name: new URL(root).hostname }));
  });
  if (!res.ok) throw await failure(res, new URL(root).hostname);
  const ids = ((await res.json()).data || []).map((m) => m.id);
  const wanted = kind === 'stt' ? /(whisper|transcribe|stt|parakeet|canary)/i : /(tts|speech|kokoro|piper|voice)/i;
  const matching = ids.filter((id) => wanted.test(id) && !(kind === 'tts' && /transcribe/i.test(id)));
  return (matching.length ? matching : ids).sort();
}

export async function listAudioVoices({ base, key = '', fetchImpl = (...a) => fetch(...a) }) {
  const root = String(base || OPENAI_AUDIO_URL).replace(/\/+$/, '');
  if (root === OPENAI_AUDIO_URL) return OPENAI_VOICES;
  try {
    const res = await fetchImpl(`${root}/audio/voices`, { headers: headers(key) });
    if (res.ok) {
      const data = await res.json();
      const voices = (data.voices || data.data || data || []).map((v) => (typeof v === 'string' ? v : v.id || v.name)).filter(Boolean);
      if (voices.length) return voices;
    }
  } catch {
    // a server without a voice list
  }
  return OPENAI_VOICES;
}
