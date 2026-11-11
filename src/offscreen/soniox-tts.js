// Soniox text to speech (https://docs.soniox.com/tts): the translation spoken by a Soniox
// voice over one WebSocket that stays open, one stream per piece of speech.
//
//   { stream_id, model, language, voice, audio_format, sample_rate, speed }   config
//   { stream_id, text, text_end: true }                                       the text
//   <- { stream_id, audio (base64) } ... { audio_end } { terminated }
//
// Every voice speaks every language; the language sets the delivery. A browser cannot
// set headers on a WebSocket, so the key goes as a subprotocol, as for speech recognition.

import { PcmByteAligner } from '../shared/pcm.js';
import { SonioxError, sonioxLanguage } from './soniox.js';

export const SONIOX_TTS_WS = 'wss://tts-rt.soniox.com/tts-websocket';
export const SONIOX_TTS_MODEL = 'tts-rt-v2';
export const SONIOX_TTS_MODELS_URL = 'https://api.soniox.com/v1/tts-models';

const SAMPLE_RATE = 24000;
// Soniox closes a connection that has been silent for 40 s.
const KEEPALIVE_MS = 20000;
// An idle connection is let go after this long; the next piece opens a new one.
const IDLE_CLOSE_MS = 5 * 60 * 1000;
// A stream that answers nothing for this long is given up.
const STALL_MS = 8000;
// Soniox allows three streams at once per account.
const MAX_STREAMS = 3;

// The voices of tts-rt-v2 (GET /v1/tts-models, November 2026), for when the list cannot
// be fetched. Each one speaks every language.
const BUILT_IN =
  'Daniel:m Nina:f Emma:f Adrian:m Grace:f Owen:m Mina:f Kenji:m Rafael:m Mateo:m Lucia:f Oliver:m Arthur:m Isla:f Victoria:f Cooper:m Mason:m Ruby:f Arjun:m Rohan:m Priya:f ' +
  'Bryce:m Trevor:m Evan:m Nathan:m Karan:m Wesley:m Curtis:m Miles:m Preston:m Walter:m Russell:m Tunde:m Nigel:m Shane:m Silas:m Reid:m Emilio:m Alistair:m Dominic:m ' +
  'Emerson:m Harlan:m Bennett:m Elliot:m Sebastian:m Haruto:m Freddie:m Logan:m Poppy:f Harper:f Cordelia:f Reese:f Hazel:f Juliet:f Piper:f Reyna:f Kayla:f Sloane:f Iris:f ' +
  'Freya:f Brooke:f Bonnie:f Imogen:f Arabella:f Colleen:f Margo:f Nora:f Bianca:f Sari:f Kabir:m Kavya:f Aarav:m Dev:m Nikhil:m Ashok:m Ishita:f Aman:m Shalini:f Manav:m ' +
  'Nisha:f Karthik:m Meena:f Vani:f Surya:m Deepa:f Sundar:m Gurpreet:m Madhura:f Venkat:m Rajan:m Lekha:f Sneha:f Bhavana:f Mohan:m Divya:f Camila:f Santiago:m Damian:m ' +
  'Facundo:m Valentina:f Alonso:m Renata:f Mariana:f Lorenzo:m Emiliano:m Paulina:f Alvaro:m Rodrigo:m Guillermo:m Marta:f Sergio:m Hector:m Javier:m Carmen:f Thiago:m ' +
  'Juliana:f Larissa:f Vinicius:m Bruna:f Leandro:m Diogo:m Rui:m Nuno:m Bernardo:m Matilde:f Duarte:m Julien:m Genevieve:f Olivier:m Antoine:m Elodie:f Camille:f Manon:f ' +
  'Mathieu:m Celine:f Baptiste:m Noemie:f Jonas:m Konrad:m Matthias:m Florian:m Annika:f Tobias:m Lena:f Reinhard:m Stefan:m Marlene:f Marco:m Giulia:f Riccardo:m Valeria:f ' +
  'Massimo:m Alessandro:m Davide:m Giulio:m Taras:m Andrei:m Yana:f Bohdan:m Vadim:m Kirill:m Marek:m Szymon:m Faisal:m Layla:f Hind:f Rania:f Yousef:m Karim:m Wei:m ' +
  'Meilin:f Haoran:m Zihan:m Aoi:f Yuki:f Sota:m Riku:m Hikari:f Nanami:f Yuto:m Sakura:f Rina:f Jihoon:m Minjun:m Seojun:m Daeho:m Jiwoo:f Hyunwoo:m Junseo:m Aiman:m ' +
  'Nurul:f Linh:f Bayu:m Rizky:m Wahyu:m Gilang:m Maricel:f Budi:m Mai:f Huong:f';

export const SONIOX_VOICES = BUILT_IN.split(' ').map((entry) => {
  const [id, g] = entry.split(':');
  return { id, gender: g === 'f' ? 'female' : 'male' };
});

// The voices a new setup starts with: one for my translated speech, one for theirs.
export const SONIOX_DEFAULT_VOICES = { mine: 'Daniel', theirs: 'Emma' };

// The voice list from Soniox, or the built-in one when it cannot be fetched (no network,
// or the browser refuses the cross-site request).
export async function listSonioxVoices(key, { fetchImpl = (...a) => fetch(...a) } = {}) {
  try {
    const response = await fetchImpl(SONIOX_TTS_MODELS_URL, { headers: { Authorization: `Bearer ${String(key || '').trim()}` } });
    if (!response.ok) return SONIOX_VOICES;
    const data = await response.json();
    const model = (data.models || []).find((m) => m.id === SONIOX_TTS_MODEL);
    const voices = (model?.voices || []).filter((v) => v?.id).map((v) => ({ id: v.id, gender: v.gender === 'female' ? 'female' : 'male' }));
    return voices.length ? voices : SONIOX_VOICES;
  } catch {
    return SONIOX_VOICES;
  }
}

class Slots {
  constructor(n) {
    this.free = n;
    this.waiting = [];
  }

  acquire(signal) {
    if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    if (this.free > 0) {
      this.free -= 1;
      return Promise.resolve(() => this.release());
    }
    return new Promise((resolve, reject) => {
      const entry = { resolve };
      this.waiting.push(entry);
      signal?.addEventListener(
        'abort',
        () => {
          const i = this.waiting.indexOf(entry);
          if (i >= 0) this.waiting.splice(i, 1);
          reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
    });
  }

  release() {
    const next = this.waiting.shift();
    if (next) next.resolve(() => this.release());
    else this.free += 1;
  }
}

const slots = new Slots(MAX_STREAMS);

// One open connection per key. Streams are told apart by their stream_id.
class Connection {
  constructor(key, WebSocketImpl) {
    this.key = key;
    this.WebSocketImpl = WebSocketImpl;
    this.streams = new Map();
    this.ws = null;
    this.ready = null;
    this.lastSent = 0;
    this.lastUsed = Date.now();
  }

  open() {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      let ws;
      try {
        ws = new this.WebSocketImpl(SONIOX_TTS_WS, ['soniox-api-key', this.key]);
      } catch (err) {
        this.ready = null;
        reject(new SonioxError(err?.message || String(err)));
        return;
      }
      this.ws = ws;
      ws.onopen = () => {
        this.lastSent = Date.now();
        clearInterval(this.timer);
        this.timer = setInterval(() => this.tick(), KEEPALIVE_MS / 2);
        resolve();
      };
      ws.onmessage = (event) => {
        let data;
        try {
          data = JSON.parse(typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data));
        } catch {
          return;
        }
        this.onMessage(data);
      };
      ws.onerror = () => {};
      ws.onclose = () => {
        if (this.ws !== ws) return;
        const err = new SonioxError('connection lost');
        this.drop(err);
        reject(err);
      };
    });
    return this.ready;
  }

  tick() {
    if (this.ws?.readyState !== 1) return;
    if (!this.streams.size && Date.now() - this.lastUsed > IDLE_CLOSE_MS) return this.close();
    if (Date.now() - this.lastSent > KEEPALIVE_MS) this.send({ keep_alive: true });
  }

  send(message) {
    if (this.ws?.readyState !== 1) return false;
    this.ws.send(JSON.stringify(message));
    this.lastSent = Date.now();
    return true;
  }

  onMessage(data) {
    const stream = this.streams.get(data.stream_id);
    // An error without a stream (a refused key) ends every stream on the connection.
    if ((data.error_code || data.error_type) && !stream) {
      this.drop(new SonioxError(String(data.error_message || data.error_type || 'error'), { status: Number(data.error_code) || 0, type: String(data.error_type || '') }));
      return;
    }
    if (stream) stream.handle(data);
  }

  // Everything on this connection fails with err, and the next piece opens a new one.
  drop(err) {
    clearInterval(this.timer);
    const ws = this.ws;
    this.ws = null;
    this.ready = null;
    for (const stream of this.streams.values()) stream.fail(err);
    this.streams.clear();
    try {
      ws?.close();
    } catch {
      // already closed
    }
    if (connections.get(this.key) === this) connections.delete(this.key);
  }

  close() {
    this.drop(new SonioxError('closed'));
  }
}

const connections = new Map();

function connectionFor(key, WebSocketImpl) {
  let connection = connections.get(key);
  if (!connection) {
    connection = new Connection(key, WebSocketImpl);
    connections.set(key, connection);
  }
  return connection;
}

// Closes the open connections (at the end of a session).
export function closeSonioxTts() {
  for (const connection of [...connections.values()]) connection.close();
}

let counter = 0;

// Yields Int16Array chunks of 24 kHz mono speech as they arrive.
export async function* sonioxSynthesize({ key, voice, language, text, speed = 1, signal, WebSocketImpl = globalThis.WebSocket, stallMs = STALL_MS }) {
  key = String(key || '').trim();
  if (!key) throw new SonioxError('no API key', { status: 401, type: 'unauthenticated' });
  const release = await slots.acquire(signal);
  const streamId = `li-${Date.now().toString(36)}-${++counter}`;
  const chunks = [];
  let wake = null;
  let finished = false;
  let failure = null;
  const notify = () => {
    const w = wake;
    wake = null;
    w?.();
  };
  const stream = {
    handle(data) {
      if (data.error_code || data.error_type) {
        failure = new SonioxError(String(data.error_message || data.error_type || 'error'), { status: Number(data.error_code) || 0, type: String(data.error_type || '') });
      }
      if (data.audio) chunks.push(data.audio);
      if (data.terminated) finished = true;
      notify();
    },
    fail(err) {
      failure ||= err;
      notify();
    },
  };
  let connection;
  const onAbort = () => {
    connection?.send({ stream_id: streamId, cancel: true });
    notify();
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    for (let attempt = 0; ; attempt++) {
      connection = connectionFor(key, WebSocketImpl);
      try {
        await connection.open();
        break;
      } catch (err) {
        if (attempt >= 1 || signal?.aborted) throw err;
      }
    }
    connection.lastUsed = Date.now();
    connection.streams.set(streamId, stream);
    connection.send({
      stream_id: streamId,
      model: SONIOX_TTS_MODEL,
      language: sonioxLanguage(language) || 'en',
      voice,
      audio_format: 'pcm_s16le',
      sample_rate: SAMPLE_RATE,
      speed: Math.min(1.3, Math.max(0.7, speed)),
    });
    connection.send({ stream_id: streamId, text, text_end: true });
    const aligner = new PcmByteAligner();
    for (;;) {
      if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
      if (chunks.length) {
        const bytes = Uint8Array.from(atob(chunks.shift()), (c) => c.charCodeAt(0));
        const samples = aligner.push(bytes);
        if (samples.length) yield samples;
        continue;
      }
      if (failure) throw failure;
      if (finished) return;
      const quiet = await new Promise((resolve) => {
        wake = () => resolve(false);
        setTimeout(() => resolve(true), stallMs);
      });
      wake = null;
      if (quiet && !chunks.length && !finished && !failure) {
        connection.send({ stream_id: streamId, cancel: true });
        throw new DOMException('Soniox speech stopped', 'TimeoutError');
      }
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
    connection?.streams.delete(streamId);
    if (connection) connection.lastUsed = Date.now();
    release();
  }
}
