import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sonioxSynthesize, closeSonioxTts, listSonioxVoices, SONIOX_TTS_WS, SONIOX_TTS_MODEL, SONIOX_VOICES } from '../../src/offscreen/soniox-tts.js';
import { speechAccount } from '../../src/shared/elevenlabs.js';
import { isSonioxSpeech, missingKeys, DEFAULT_SETTINGS } from '../../src/shared/settings.js';

// A stand-in for Soniox's TTS WebSocket. reply(socket, stream, text) plays the server.
function fakeServer(reply) {
  const sockets = [];
  class FakeSocket {
    constructor(url, protocols) {
      this.url = url;
      this.protocols = protocols;
      this.sent = [];
      this.readyState = 0;
      this.streams = new Map();
      sockets.push(this);
      setTimeout(() => {
        this.readyState = 1;
        this.onopen?.();
      }, 0);
    }
    send(data) {
      const msg = JSON.parse(data);
      this.sent.push(msg);
      if (msg.model) this.streams.set(msg.stream_id, msg);
      if (msg.text_end) setTimeout(() => reply(this, this.streams.get(msg.stream_id), msg.text), 0);
    }
    close() {
      this.readyState = 3;
    }
    serve(message) {
      this.onmessage?.({ data: JSON.stringify(message) });
    }
  }
  return { FakeSocket, sockets };
}

const pcmBase64 = (samples) => Buffer.from(new Int16Array(samples).buffer).toString('base64');

function speaks(socket, stream) {
  socket.serve({ stream_id: stream.stream_id, audio: pcmBase64([1, 2, 3]) });
  socket.serve({ stream_id: stream.stream_id, audio: pcmBase64([4, 5]), audio_end: true });
  socket.serve({ stream_id: stream.stream_id, terminated: true });
}

async function collect(gen) {
  const out = [];
  for await (const chunk of gen) out.push(...chunk);
  return out;
}

test('speaks a piece over the TTS WebSocket, key as subprotocol, 24 kHz PCM', async () => {
  const { FakeSocket, sockets } = fakeServer(speaks);
  const samples = await collect(sonioxSynthesize({ key: 'secret-key-1', voice: 'Emma', language: 'tr-TR', text: 'Merhaba.', speed: 1.1, WebSocketImpl: FakeSocket }));
  assert.deepEqual(samples, [1, 2, 3, 4, 5]);
  const socket = sockets[0];
  assert.equal(socket.url, SONIOX_TTS_WS);
  assert.deepEqual(socket.protocols, ['soniox-api-key', 'secret-key-1']);
  const [config, text] = socket.sent;
  assert.deepEqual(
    { model: config.model, language: config.language, voice: config.voice, audio_format: config.audio_format, sample_rate: config.sample_rate, speed: config.speed },
    { model: SONIOX_TTS_MODEL, language: 'tr', voice: 'Emma', audio_format: 'pcm_s16le', sample_rate: 24000, speed: 1.1 },
  );
  assert.deepEqual(text, { stream_id: config.stream_id, text: 'Merhaba.', text_end: true });
  assert.equal(JSON.stringify(socket.sent).includes('secret-key-1'), false, 'the key never goes in a message');
  closeSonioxTts();
});

test('pieces share one open connection, each with its own stream', async () => {
  const { FakeSocket, sockets } = fakeServer(speaks);
  await collect(sonioxSynthesize({ key: 'k2', voice: 'Emma', language: 'en', text: 'One.', WebSocketImpl: FakeSocket }));
  await collect(sonioxSynthesize({ key: 'k2', voice: 'Daniel', language: 'en', text: 'Two.', WebSocketImpl: FakeSocket }));
  assert.equal(sockets.length, 1);
  const ids = sockets[0].sent.filter((m) => m.model).map((m) => m.stream_id);
  assert.equal(new Set(ids).size, 2);
  closeSonioxTts();
});

test('a refused key fails with its status, and the next piece opens a new connection', async () => {
  const { FakeSocket, sockets } = fakeServer((socket, stream) => socket.serve({ stream_id: stream.stream_id, error_code: 401, error_type: 'unauthenticated', error_message: 'Invalid API key.' }));
  await assert.rejects(collect(sonioxSynthesize({ key: 'bad', voice: 'Emma', language: 'en', text: 'Hi.', WebSocketImpl: FakeSocket })), (err) => err.name === 'SonioxError' && err.status === 401);
  // A connection-wide error (no stream_id) drops the connection.
  const { FakeSocket: Other, sockets: others } = fakeServer((socket) => socket.serve({ error_code: 402, error_type: 'balance', error_message: 'Organization balance exhausted.' }));
  await assert.rejects(collect(sonioxSynthesize({ key: 'poor', voice: 'Emma', language: 'en', text: 'Hi.', WebSocketImpl: Other })), (err) => err.status === 402);
  await assert.rejects(collect(sonioxSynthesize({ key: 'poor', voice: 'Emma', language: 'en', text: 'Hi.', WebSocketImpl: Other })), (err) => err.status === 402);
  assert.equal(others.length, 2);
  assert.equal(sockets.length, 1);
  closeSonioxTts();
});

test('stopping a piece cancels its stream', async () => {
  const { FakeSocket, sockets } = fakeServer((socket, stream) => socket.serve({ stream_id: stream.stream_id, audio: pcmBase64([1, 2]) }));
  const controller = new AbortController();
  const gen = sonioxSynthesize({ key: 'k3', voice: 'Emma', language: 'en', text: 'A long piece.', signal: controller.signal, WebSocketImpl: FakeSocket });
  const first = await gen.next();
  assert.deepEqual([...first.value], [1, 2]);
  controller.abort();
  await assert.rejects(gen.next());
  const cancel = sockets[0].sent.find((m) => m.cancel);
  assert.ok(cancel, 'cancel sent');
  closeSonioxTts();
});

test('a stream that goes quiet is given up', async () => {
  const { FakeSocket } = fakeServer(() => {});
  await assert.rejects(collect(sonioxSynthesize({ key: 'k4', voice: 'Emma', language: 'en', text: 'Hi.', stallMs: 50, WebSocketImpl: FakeSocket })), (err) => err.name === 'TimeoutError');
  closeSonioxTts();
});

test('the voice list comes from Soniox, or the built-in one', async () => {
  const fetchImpl = async (url, init) => {
    assert.equal(init.headers.Authorization, 'Bearer key');
    return { ok: true, json: async () => ({ models: [{ id: SONIOX_TTS_MODEL, voices: [{ id: 'Zed', gender: 'male' }, { id: 'Ada', gender: 'female' }] }] }) };
  };
  assert.deepEqual(await listSonioxVoices('key', { fetchImpl }), [{ id: 'Zed', gender: 'male' }, { id: 'Ada', gender: 'female' }]);
  assert.equal(await listSonioxVoices('key', { fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }), SONIOX_VOICES);
  assert.ok(SONIOX_VOICES.some((v) => v.id === 'Emma' && v.gender === 'female'));
});

test('Soniox as the speech service needs no ElevenLabs key', () => {
  const on = { ...DEFAULT_SETTINGS, sonioxKey: 'sk', speechProvider: 'soniox', translationProvider: 'soniox' };
  assert.equal(isSonioxSpeech(on), true);
  assert.deepEqual(speechAccount(on), { kind: 'soniox', local: false, key: 'sk', base: '' });
  assert.deepEqual(missingKeys(on), []);
  const elevenlabs = { ...on, speechProvider: 'elevenlabs' };
  assert.equal(isSonioxSpeech(elevenlabs), false);
  assert.equal(speechAccount(elevenlabs).kind, undefined);
  assert.ok(missingKeys(elevenlabs).includes('ElevenLabs'));
});
