// Soniox real-time speech recognition with translation in the same stream
// (https://soniox.com/docs): the words come back as they are heard, and their translation
// follows chunk by chunk, before the sentence is over. One session listens to one side.
//
//   audio (16 kHz PCM) -> Soniox -> original words (live line, transcript)
//                                -> translated words (subtitles, voice)
//
// Segments end at Soniox's endpoint (<end>). A segment's translation can still be arriving
// after it, so a segment is closed when the next one starts or when its translation has
// been quiet for a moment.

export const SONIOX_WS = 'wss://stt-rt.soniox.com/transcribe-websocket';
export const SONIOX_MODEL = 'stt-rt-v6';

const KEEPALIVE_MS = 8000;
const TRANSLATION_SETTLE_MS = 900;
const RECONNECT_DELAYS = [500, 1500, 4000];

export class SonioxError extends Error {
  constructor(message, { status = 0, type = '' } = {}) {
    super(message);
    this.name = 'SonioxError';
    this.status = status;
    this.type = type;
  }
}

// The config's language codes: Soniox takes two-letter codes ('tr', 'en', 'zh').
export function sonioxLanguage(code) {
  return String(code || '').toLowerCase().split(/[-_]/)[0];
}

// The first message of a stream.
// Without a target it only listens: the words come back, nothing is translated.
export function sonioxConfig({ model = SONIOX_MODEL, target = '', source = '', endpointDelayMs = 1000, terms = [] }) {
  const config = {
    model,
    audio_format: 'pcm_s16le',
    sample_rate: 16000,
    num_channels: 1,
    enable_endpoint_detection: true,
    max_endpoint_delay_ms: Math.min(3000, Math.max(500, Math.round(endpointDelayMs))),
    enable_language_identification: true,
  };
  if (target) config.translation = { type: 'one_way', target_language: sonioxLanguage(target) };
  const hints = [...new Set([sonioxLanguage(source), sonioxLanguage(target)].filter((x) => x && x !== 'auto'))];
  if (hints.length) config.language_hints = hints;
  if (terms.length) config.context = { terms: terms.slice(0, 100) };
  return config;
}

export class SonioxSession {
  // onOriginal(text): the segment's words so far (final and not yet final)
  // onSegmentStart(), onTranslation(piece): final translated words, in order
  // onSegmentEnd({ source, translation }), onStatus('connecting'|'ready'|'reconnecting'|'off')
  // onFatal(err): the key is refused or the stream cannot be kept up
  constructor({ name = 'soniox', apiKey, config, onOriginal, onSegmentStart, onTranslation, onSegmentEnd, onStatus, onFatal, log, WebSocketImpl }) {
    this.name = name;
    this.apiKey = String(apiKey || '').trim();
    this.config = config;
    this.onOriginal = onOriginal || (() => {});
    this.onSegmentStart = onSegmentStart || (() => {});
    this.onTranslation = onTranslation || (() => {});
    this.onSegmentEnd = onSegmentEnd || (() => {});
    this.onStatus = onStatus || (() => {});
    this.onFatal = onFatal || (() => {});
    this.log = log || (() => {});
    this.WebSocketImpl = WebSocketImpl || globalThis.WebSocket;
    this.stopped = true;
    this.ws = null;
    this.retries = 0;
    this.resetSegment();
  }

  resetSegment() {
    this.segment = null; // { source, translation } of the segment being heard
    this.closing = null; // a segment past its endpoint, still taking translated words
    this.tail = ''; // words not yet final
  }

  start() {
    this.stopped = false;
    this.connect();
  }

  connect() {
    if (this.stopped) return;
    this.onStatus(this.retries ? 'reconnecting' : 'connecting');
    let ws;
    try {
      // A browser cannot set headers on a WebSocket; the key goes as a subprotocol.
      ws = new this.WebSocketImpl(SONIOX_WS, ['soniox-api-key', this.apiKey]);
    } catch (err) {
      this.fail(new SonioxError(err?.message || String(err)));
      return;
    }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    this.open = false;
    ws.onopen = () => {
      if (ws !== this.ws) return;
      ws.send(JSON.stringify(this.config));
      this.open = true;
      this.onStatus('ready');
      this.lastSent = Date.now();
      clearInterval(this.keepalive);
      this.keepalive = setInterval(() => {
        if (this.open && Date.now() - this.lastSent > KEEPALIVE_MS) this.send(JSON.stringify({ type: 'keepalive' }));
      }, KEEPALIVE_MS / 2);
    };
    ws.onmessage = (event) => {
      if (ws !== this.ws) return;
      let data;
      try {
        data = JSON.parse(typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data));
      } catch {
        return;
      }
      this.onMessage(data);
    };
    ws.onclose = () => {
      if (ws !== this.ws) return;
      this.open = false;
      clearInterval(this.keepalive);
      if (this.stopped || this.fatal) return;
      this.closeSegment();
      const delay = RECONNECT_DELAYS[this.retries];
      if (delay == null) {
        this.fail(new SonioxError('connection lost'));
        return;
      }
      this.retries += 1;
      this.log('warn', `${this.name}: connection closed, reconnecting in ${delay} ms`);
      setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => {};
  }

  onMessage(data) {
    if (data.error_code || data.error_message) {
      const status = Number(data.error_code) || 0;
      const type = String(data.error_type || '');
      const err = new SonioxError(String(data.error_message || type || 'error'), { status, type });
      this.log('warn', `${this.name}: ${status} ${type} ${err.message}`);
      // A refused key or request will not get better by reconnecting.
      if (status === 400 || status === 401 || status === 402 || status === 403) this.fail(err);
      return;
    }
    if (data.finished) return;
    this.retries = 0;
    let tail = '';
    let tailTranslation = '';
    for (const token of data.tokens || []) {
      const text = token.text || '';
      if (text === '<end>' || text === '<fin>') {
        this.endpoint();
        continue;
      }
      if (token.translation_status === 'translation') {
        if (token.is_final === false) tailTranslation += text;
        else this.translated(text);
        continue;
      }
      if (token.is_final) this.heard(text);
      else tail += text;
    }
    this.tail = tail;
    this.tailTranslation = tailTranslation;
    const shown = `${this.segment?.source || ''}${tail}`.trim();
    if (shown || this.segment) this.onOriginal(shown);
  }

  // A final word of what was said: the start of a segment closes the one before it.
  heard(text) {
    if (!this.segment) {
      if (!text.trim()) return;
      this.closeSegment();
      this.segment = { source: '', translation: '' };
      this.onSegmentStart();
    }
    this.segment.source += text;
  }

  // Translated words belong to the segment still taking them: the one past its endpoint
  // first, else the one being heard.
  translated(text) {
    const target = this.closing || this.segment;
    if (!target) return;
    target.translation += text;
    this.onTranslation(text);
    if (this.closing) this.armSettle();
  }

  endpoint() {
    if (!this.segment) return;
    this.closeSegment();
    this.closing = this.segment;
    this.segment = null;
    // Listening only: no translation to wait for.
    if (!this.config?.translation) this.closeSegment();
    else this.armSettle();
  }

  armSettle() {
    clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => this.closeSegment(), TRANSLATION_SETTLE_MS);
  }

  closeSegment() {
    clearTimeout(this.settleTimer);
    const done = this.closing;
    this.closing = null;
    if (!done) return;
    this.onSegmentEnd({ source: done.source.trim(), translation: done.translation.trim() });
  }

  send(data) {
    if (!this.open || this.ws?.readyState !== 1) return false;
    try {
      this.ws.send(data);
      this.lastSent = Date.now();
      return true;
    } catch {
      return false;
    }
  }

  sendAudio(int16) {
    this.send(int16.buffer.byteLength === int16.byteLength ? int16.buffer : int16.slice().buffer);
  }

  fail(err) {
    if (this.fatal) return;
    this.fatal = err;
    this.stop();
    this.onFatal(err);
  }

  stop() {
    if (this.stopped && !this.ws) return;
    this.stopped = true;
    clearInterval(this.keepalive);
    clearTimeout(this.settleTimer);
    if (this.segment) {
      this.closing = this.segment;
      this.segment = null;
    }
    this.closeSegment();
    const ws = this.ws;
    this.ws = null;
    this.open = false;
    try {
      // An empty text frame ends the stream.
      if (ws?.readyState === 1) ws.send('');
      ws?.close();
    } catch {
      // already closed
    }
    this.onStatus('off');
  }
}
