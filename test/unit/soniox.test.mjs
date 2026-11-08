import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SonioxSession, sonioxConfig, sonioxLanguage, SONIOX_WS } from '../../src/offscreen/soniox.js';
import { DirectionPipeline, History, Speaker } from '../../src/offscreen/pipeline.js';
import { TranscriptLog } from '../../src/shared/transcript.js';
import { missingKeys, missingServers, DEFAULT_SETTINGS } from '../../src/shared/settings.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A stand-in for the browser's WebSocket: records what is sent; the test plays the server.
class FakeSocket {
  static last = null;
  constructor(url, protocols) {
    this.url = url;
    this.protocols = protocols;
    this.sent = [];
    this.readyState = 0;
    FakeSocket.last = this;
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.();
    }, 0);
  }
  send(data) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
  serve(message) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

const word = (text, extra = {}) => ({ text, is_final: true, ...extra });
const tr = (text, extra = {}) => ({ text, translation_status: 'translation', ...extra });

function session(overrides = {}) {
  const events = [];
  const s = new SonioxSession({
    apiKey: ' key-1 ',
    config: sonioxConfig({ target: 'tr', source: 'en' }),
    WebSocketImpl: FakeSocket,
    onOriginal: (text) => events.push(['original', text]),
    onSegmentStart: () => events.push(['start']),
    onTranslation: (piece) => events.push(['translation', piece]),
    onSegmentEnd: (seg) => events.push(['end', seg]),
    onStatus: (status) => events.push(['status', status]),
    onFatal: (err) => events.push(['fatal', err.status, err.type]),
    ...overrides,
  });
  return { s, events };
}

test('the config asks for 16 kHz PCM, endpoints and a one-way translation', () => {
  const c = sonioxConfig({ target: 'tr-TR', source: 'en', endpointDelayMs: 200, terms: ['Kubernetes'] });
  assert.equal(c.model, 'stt-rt-v6');
  assert.equal(c.audio_format, 'pcm_s16le');
  assert.equal(c.sample_rate, 16000);
  assert.equal(c.max_endpoint_delay_ms, 500);
  assert.deepEqual(c.translation, { type: 'one_way', target_language: 'tr' });
  assert.deepEqual(c.language_hints, ['en', 'tr']);
  assert.deepEqual(c.context, { terms: ['Kubernetes'] });
  assert.deepEqual(sonioxConfig({ target: 'tr', source: 'auto' }).language_hints, ['tr']);
  assert.equal(sonioxLanguage('zh_CN'), 'zh');
});

test('the key goes as a subprotocol and the config is the first message', async () => {
  const { s, events } = session();
  s.start();
  await sleep(5);
  const ws = FakeSocket.last;
  assert.equal(ws.url, SONIOX_WS);
  assert.deepEqual(ws.protocols, ['soniox-api-key', 'key-1']);
  assert.equal(JSON.parse(ws.sent[0]).model, 'stt-rt-v6');
  assert.ok(events.some(([e, v]) => e === 'status' && v === 'ready'));
  s.sendAudio(new Int16Array(1600));
  assert.equal(ws.sent[1].byteLength, 3200);
  s.stop();
  assert.equal(ws.sent.at(-1), '', 'an empty text frame ends the stream');
});

test('words become a segment; its translation streams in and the endpoint closes it', async () => {
  const { s, events } = session();
  s.start();
  await sleep(5);
  const ws = FakeSocket.last;
  ws.serve({ tokens: [word('Hi'), { text: ',', is_final: false }] });
  ws.serve({ tokens: [word(','), word(' thanks for joining'), tr('Merhaba,')] });
  ws.serve({ tokens: [word(' today.'), word('<end>'), tr(' bugün katıldığınız için'), tr(' teşekkürler.')] });
  await sleep(1000);
  assert.deepEqual(events.filter(([e]) => e === 'start').length, 1);
  assert.deepEqual(events.filter(([e]) => e === 'translation').map(([, p]) => p), ['Merhaba,', ' bugün katıldığınız için', ' teşekkürler.']);
  const end = events.find(([e]) => e === 'end')[1];
  assert.deepEqual(end, { source: 'Hi, thanks for joining today.', translation: 'Merhaba, bugün katıldığınız için teşekkürler.' });
  assert.ok(events.some(([e, t]) => e === 'original' && t === 'Hi,'), 'words not yet final show on the live line');
  s.stop();
});

test('a new segment closes the one before it, even if its translation is still due', async () => {
  const { s, events } = session();
  s.start();
  await sleep(5);
  const ws = FakeSocket.last;
  ws.serve({ tokens: [word('One.'), word('<end>'), tr('Bir.')] });
  ws.serve({ tokens: [word('Two.')] });
  const ends = events.filter(([e]) => e === 'end').map(([, seg]) => seg);
  assert.deepEqual(ends, [{ source: 'One.', translation: 'Bir.' }]);
  assert.equal(events.filter(([e]) => e === 'start').length, 2);
  s.stop();
  assert.deepEqual(events.filter(([e]) => e === 'end').at(-1)[1], { source: 'Two.', translation: '' });
});

test('an empty balance or a refused key stops the session for good', async () => {
  const { s, events } = session();
  s.start();
  await sleep(5);
  FakeSocket.last.serve({ tokens: [], error_code: 402, error_type: 'organization_balance_exhausted', error_message: 'Organization balance exhausted.' });
  assert.deepEqual(events.find(([e]) => e === 'fatal'), ['fatal', 402, 'organization_balance_exhausted']);
  assert.equal(s.stopped, true);
});

test('a streamed segment is shown, spoken clause by clause and kept in the transcript', async () => {
  const spoken = [];
  const emitted = [];
  const log = new TranscriptLog({ id: 't', startedAt: 0, kind: 'media' });
  const speaker = new Speaker({
    sink: { push() {}, end() {}, flush() {}, backlog: () => 0 },
    synth: async function* (item) {
      spoken.push(item.text);
      yield new Int16Array(1);
    },
  });
  const pipeline = new DirectionPipeline({
    dir: 'in',
    from: 'en',
    to: 'tr',
    translator: null,
    speaker,
    history: new History(8),
    emit: (e) => {
      emitted.push(e);
      log.add('in', e, 1000);
    },
  });
  const seg = pipeline.openSegment();
  seg.source('Hi, thanks for joining');
  seg.translation('Merhaba, bugün görüşmeye katıldığınız için, ');
  await sleep(5);
  assert.deepEqual(spoken, ['Merhaba, bugün görüşmeye katıldığınız için,'], 'the first clause is spoken before the segment ends');
  seg.source('Hi, thanks for joining the call today.');
  seg.translation('hepinize teşekkürler.');
  seg.end({ source: 'Hi, thanks for joining the call today.' });
  await sleep(10);
  assert.deepEqual(spoken, ['Merhaba, bugün görüşmeye katıldığınız için,', 'hepinize teşekkürler.']);
  assert.equal(emitted[0].phase, 'committed');
  assert.equal(emitted.at(-1).phase, 'translated');
  assert.deepEqual(log.snapshot().lines.map(({ source, translation }) => ({ source, translation })), [
    { source: 'Hi, thanks for joining the call today.', translation: 'Merhaba, bugün görüşmeye katıldığınız için, hepinize teşekkürler.' },
  ]);
});

test('with Soniox on, only its key and the voice are needed', () => {
  const base = { ...DEFAULT_SETTINGS, useSoniox: true, translationProvider: 'claude', anthropicKey: '', elevenLabsKey: 'el' };
  assert.deepEqual(missingKeys(base), ['Soniox']);
  assert.deepEqual(missingKeys({ ...base, sonioxKey: 's' }), []);
  assert.deepEqual(missingServers({ ...base, sonioxKey: 's', translationProvider: 'ollama', ollamaUrl: '' }), []);
  assert.deepEqual(missingKeys({ ...base, sonioxKey: 's', speechProvider: 'openai', openaiKey: '' }), ['OpenAI'], 'OpenAI still speaks');
});
