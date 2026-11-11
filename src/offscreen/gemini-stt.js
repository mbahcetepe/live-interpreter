// Speech recognition with Gemini's Live API (gemini-3.5-transcribe-live), one stream per
// side of the call. 16 kHz PCM goes in as realtimeInput; the words come back as a live
// draft (interimInputTranscription) and, once the speaker pauses, as the final text
// (inputTranscription). The pause is the Live API's own voice activity detection, set to
// the silence chosen in the settings.
//
// The API key never goes into the WebSocket's address: a single-use token is fetched
// first (auth_tokens, the key in a header) and the socket opens with that.
//
// A Live session lasts at most about 10 minutes, and the server says so ahead (goAway).
// The stream is renewed after a final text, when nobody is mid-sentence, from 8 minutes
// on, or at once on goAway; audio sent while it reconnects is kept and sent after.
//
// Measured on 11 November 2026 with a Turkish sentence: the socket and setup take about
// 0.6 s, drafts come every 0.5 s, the final text 0.64 s after the speech ends at a 500 ms
// silence. The Live API does not tell speakers apart.

import { t } from '../shared/i18n.js';

export const GEMINI_STT_MODEL = 'gemini-3.5-transcribe-live';
const TOKEN_URL = 'https://generativelanguage.googleapis.com/v1alpha/auth_tokens';
const LIVE_WS = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained';
const RENEW_AFTER_MS = 8 * 60_000;
const RECONNECT_DELAYS = [250, 1000, 2000, 4000, 8000];
// Audio kept while the stream reconnects: 20 s of 100 ms chunks.
const MAX_PENDING = 200;

export class GeminiSttError extends Error {
  constructor(message, { kind = 'http', status } = {}) {
    super(message);
    this.name = 'GeminiSttError';
    this.kind = kind;
    this.status = status;
  }
}

function base64(pcm) {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// A single-use token for one Live session, valid to open it within a minute.
export async function geminiLiveToken({ key, fetchImpl = (...a) => fetch(...a), now = () => Date.now() }) {
  let res;
  try {
    res = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'x-goog-api-key': String(key || '').trim(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ uses: 1, expireTime: new Date(now() + 30 * 60_000).toISOString(), newSessionExpireTime: new Date(now() + 60_000).toISOString() }),
    });
  } catch {
    throw new GeminiSttError(t('oai.network', { name: 'Gemini' }), { kind: 'network' });
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    // no readable body
  }
  if (res.ok && data.name) return data.name;
  const detail = String(data?.error?.message || '').slice(0, 200);
  if (res.status === 401 || res.status === 403 || /API_KEY_INVALID|API key not valid/i.test(detail + JSON.stringify(data?.error?.details || ''))) {
    throw new GeminiSttError(t('oai.auth', { name: 'Gemini' }), { kind: 'auth', status: res.status });
  }
  if (res.status === 429) throw new GeminiSttError(t('oai.rate', { name: 'Gemini' }), { kind: 'rate', status: 429 });
  throw new GeminiSttError(t('oai.http', { name: 'Gemini', status: res.status, detail }), { status: res.status });
}

export function geminiSttSetup({ model = GEMINI_STT_MODEL, languageCode = '', silenceMs = 700 }) {
  return {
    setup: {
      model: `models/${model}`,
      inputAudioTranscription: languageCode ? { languageCodes: [languageCode] } : {},
      realtimeInputConfig: { automaticActivityDetection: { silenceDurationMs: Math.round(silenceMs) } },
    },
  };
}

export class GeminiListener {
  // onPartial(text): the sentence so far; onCommitted(text): the final text of a sentence.
  // onStatus('connecting'|'ready'|'reconnecting'|'off'); onFatal(err): the key is refused or
  // the stream cannot be kept up.
  constructor({ name = 'gemini', key, model = GEMINI_STT_MODEL, languageCode = '', silenceMs = 700, onPartial, onCommitted, onStatus, onFatal, log, WebSocketImpl, fetchImpl, now }) {
    this.name = name;
    this.key = String(key || '').trim();
    this.model = model;
    this.languageCode = languageCode;
    this.silenceMs = silenceMs;
    this.onPartial = onPartial || (() => {});
    this.onCommitted = onCommitted || (() => {});
    this.onStatus = onStatus || (() => {});
    this.onFatal = onFatal || (() => {});
    this.log = log || (() => {});
    this.WebSocketImpl = WebSocketImpl || globalThis.WebSocket;
    this.fetchImpl = fetchImpl || ((...a) => fetch(...a));
    this.now = now || (() => Date.now());
    this.stopped = true;
    this.ws = null;
    this.ready = false;
    this.pending = [];
    this.retries = 0;
    this.draft = '';
  }

  start() {
    this.stopped = false;
    this.fatal = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    this.ready = false;
    this.pending = [];
    const ws = this.ws;
    this.ws = null;
    try {
      ws?.close(1000);
    } catch {
      // already closed
    }
    this.onStatus('off');
  }

  sendAudio(pcm) {
    if (this.stopped) return;
    if (!this.ready) {
      this.pending.push(pcm);
      if (this.pending.length > MAX_PENDING) this.pending.shift();
      return;
    }
    this.send(pcm);
  }

  send(pcm) {
    try {
      this.ws.send(JSON.stringify({ realtimeInput: { audio: { data: base64(pcm), mimeType: 'audio/pcm;rate=16000' } } }));
    } catch {
      this.pending.push(pcm);
    }
  }

  async connect() {
    if (this.stopped) return;
    this.onStatus(this.retries ? 'reconnecting' : 'connecting');
    let token;
    try {
      token = await geminiLiveToken({ key: this.key, fetchImpl: this.fetchImpl, now: this.now });
    } catch (err) {
      if (err.kind === 'auth') return this.fail(err);
      return this.retry(err.message);
    }
    if (this.stopped) return;
    let ws;
    try {
      ws = new this.WebSocketImpl(`${LIVE_WS}?access_token=${encodeURIComponent(token)}`);
    } catch (err) {
      return this.retry(err?.message || String(err));
    }
    this.ws = ws;
    this.ready = false;
    ws.onopen = () => {
      if (ws !== this.ws) return;
      ws.send(JSON.stringify(geminiSttSetup({ model: this.model, languageCode: this.languageCode, silenceMs: this.silenceMs })));
    };
    ws.onmessage = async (event) => {
      if (ws !== this.ws) return;
      let data;
      try {
        const text = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data instanceof Blob ? await event.data.arrayBuffer() : event.data);
        data = JSON.parse(text);
      } catch {
        return;
      }
      this.onMessage(data);
    };
    ws.onclose = (event) => {
      if (ws !== this.ws) return;
      this.ready = false;
      if (this.stopped || this.fatal) return;
      // 1007/1008: the request itself was refused (a model the key cannot use, a bad setup).
      if (event.code === 1007 || event.code === 1008) {
        return this.fail(new GeminiSttError(t('oai.http', { name: 'Gemini', status: event.code, detail: String(event.reason || '').slice(0, 200) }), { kind: 'model', status: event.code }));
      }
      this.flushDraft();
      this.retry(`closed ${event.code} ${event.reason || ''}`.trim());
    };
    ws.onerror = () => {};
  }

  retry(why) {
    if (this.stopped) return;
    const delay = RECONNECT_DELAYS[this.retries];
    if (delay == null) return this.fail(new GeminiSttError(t('oai.network', { name: 'Gemini' }), { kind: 'network' }));
    this.retries += 1;
    this.log('warn', `${this.name}: ${why}, reconnecting in ${delay} ms`);
    this.onStatus('reconnecting');
    setTimeout(() => this.connect(), delay);
  }

  fail(err) {
    if (this.fatal) return;
    this.fatal = true;
    this.log('error', `${this.name}: ${err.message}`);
    this.stop();
    this.onFatal(err);
  }

  onMessage(data) {
    if (data.setupComplete) {
      this.ready = true;
      this.retries = 0;
      this.openedAt = this.now();
      this.onStatus('ready');
      const waiting = this.pending;
      this.pending = [];
      for (const pcm of waiting) this.send(pcm);
      return;
    }
    if (data.goAway) {
      this.log('info', `${this.name}: the session ends soon (${data.goAway.timeLeft || '?'}), renewing it`);
      this.renew();
      return;
    }
    const content = data.serverContent;
    if (!content) return;
    const draft = content.interimInputTranscription?.text;
    if (draft) {
      this.draft = draft;
      this.onPartial(draft);
    }
    const final = content.inputTranscription?.text;
    if (final !== undefined) {
      this.draft = '';
      if (final.trim()) this.onCommitted(final.trim());
      if (this.now() - (this.openedAt || 0) > RENEW_AFTER_MS) this.renew();
    }
  }

  // A sentence cut by a lost connection is kept as heard so far.
  flushDraft() {
    if (this.draft.trim()) this.onCommitted(this.draft.trim());
    this.draft = '';
  }

  // A fresh stream: the old one is closed; audio in between waits in pending.
  renew() {
    if (this.stopped) return;
    const old = this.ws;
    this.ws = null;
    this.ready = false;
    try {
      old?.close(1000);
    } catch {
      // already closed
    }
    this.flushDraft();
    this.connect();
  }
}

