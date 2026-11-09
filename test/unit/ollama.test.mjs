import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OllamaTranslator, OllamaError, ollamaRestMs, hasModel } from '../../src/offscreen/ollama-translator.js';
import { FallbackTranslator } from '../../src/offscreen/fallback-translator.js';
import { serverBase, originPattern, originRules, configuredServers } from '../../src/shared/servers.js';
import { missingKeys, missingServers, DEFAULT_SETTINGS } from '../../src/shared/settings.js';

// A stand-in for fetch that answers like Ollama: /api/tags and a streamed /api/chat.
function fakeOllama({ models = ['gemma4:12b'], words = ['Günaydın ', 'herkese. ', 'Başlayalım mı?'], status = 200, refuseThink = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, body });
    if (status !== 200) return new Response('forbidden', { status });
    if (url.endsWith('/api/tags')) return Response.json({ models: models.map((name) => ({ name, model: name })) });
    if (url.endsWith('/api/generate')) return Response.json({ done: true });
    if (refuseThink && body && 'think' in body) return new Response('{"error":"does not support thinking"}', { status: 400 });
    if (!models.includes(body.model)) return new Response(`{"error":"model '${body.model}' not found"}`, { status: 404 });
    const lines = words.map((w) => JSON.stringify({ message: { role: 'assistant', content: w }, done: false }));
    lines.push(JSON.stringify({ done: true }));
    const stream = new ReadableStream({
      start(controller) {
        // Split across chunk boundaries the way a network does.
        const text = `${lines.join('\n')}\n`;
        for (let i = 0; i < text.length; i += 7) controller.enqueue(new TextEncoder().encode(text.slice(i, i + 7)));
        controller.close();
      },
    });
    return new Response(stream, { status: 200 });
  };
  return { fetchImpl, calls };
}

const job = { text: 'Good morning, everyone. Shall we begin?', from: 'en', to: 'tr', history: [] };
const collect = async (it) => {
  const out = [];
  for await (const x of it) out.push(x);
  return out;
};

test('an address becomes a server base with the usual port', () => {
  assert.equal(serverBase('100.65.147.84'), 'http://100.65.147.84:11434');
  assert.equal(serverBase('http://100.65.147.84:11434/'), 'http://100.65.147.84:11434');
  assert.equal(serverBase('http://localhost:8080'), 'http://localhost:8080');
  assert.equal(serverBase('https://ollama.example.com'), 'https://ollama.example.com');
  assert.equal(serverBase('100.65.147.84', { defaultPort: '8765' }), 'http://100.65.147.84:8765');
  assert.equal(serverBase(''), '');
  assert.equal(serverBase('ftp://x'), '');
  assert.equal(originPattern('http://100.65.147.84:11434'), 'http://100.65.147.84/*');
});

test('the Origin rule covers only Ollama servers in the settings and only this extension', () => {
  const settings = { claudeModel: 'ollama', ollamaUrl: '100.65.147.84', ollamaBackupUrl: 'http://100.77.37.21:11434', speechProvider: 'local', localSpeechUrl: '100.65.147.84' };
  const [rule] = originRules(settings, 'extid');
  assert.deepEqual(rule.condition.requestDomains, ['100.65.147.84', '100.77.37.21']);
  assert.deepEqual(rule.condition.initiatorDomains, ['extid']);
  assert.equal(rule.action.requestHeaders[0].header, 'origin');
  assert.deepEqual(originRules({ claudeModel: 'claude-opus-5-5', ollamaUrl: '100.65.147.84' }, 'extid'), []);
  assert.deepEqual(configuredServers(settings).map((s) => s.kind), ['ollama', 'ollama', 'speech']);
});

test('with Ollama no Anthropic key is needed, but the server address is', () => {
  const s = { ...DEFAULT_SETTINGS, claudeModel: 'ollama', elevenLabsKey: 'k' };
  assert.deepEqual(missingKeys(s), []);
  assert.deepEqual(missingServers(s), ['ollama']);
  assert.deepEqual(missingServers({ ...s, ollamaUrl: '100.65.147.84' }), []);
  assert.deepEqual(missingKeys({ ...DEFAULT_SETTINGS, elevenLabsKey: 'k' }), ['Anthropic']);
});

test('model names match with or without the tag', () => {
  const models = [{ name: 'gemma4:latest' }, { name: 'gemma4:12b' }];
  assert.equal(hasModel(models, 'gemma4'), true);
  assert.equal(hasModel(models, 'gemma4:12b'), true);
  assert.equal(hasModel(models, 'qwen3:14b'), false);
});

test('the translation streams in sentences, without thinking', async () => {
  const { fetchImpl, calls } = fakeOllama();
  const tr = new OllamaTranslator({ url: '100.65.147.84', model: 'gemma4:12b', myLanguage: 'tr', theirLanguage: 'en', fetchImpl });
  assert.deepEqual(await collect(tr.translate(job)), ['Günaydın herkese.', 'Başlayalım mı?']);
  const chat = calls.find((c) => c.url.endsWith('/api/chat'));
  assert.equal(chat.url, 'http://100.65.147.84:11434/api/chat');
  assert.equal(chat.body.think, false);
  assert.equal(chat.body.stream, true);
  assert.match(chat.body.messages.at(-1).content, /Good morning/);
});

test('a model that refuses the think field is asked again without it', async () => {
  const { fetchImpl, calls } = fakeOllama({ refuseThink: true });
  const tr = new OllamaTranslator({ url: 'h', model: 'gemma4:12b', fetchImpl });
  assert.deepEqual(await collect(tr.translate(job)), ['Günaydın herkese.', 'Başlayalım mı?']);
  assert.equal(calls.filter((c) => c.url.endsWith('/api/chat')).length, 2);
  await collect(tr.translate(job));
  assert.equal(calls.filter((c) => c.url.endsWith('/api/chat')).length, 3);
});

test('verify finds a missing model, a refused origin and an unreachable server', async () => {
  await assert.rejects(new OllamaTranslator({ url: 'h', model: 'nope', fetchImpl: fakeOllama().fetchImpl }).verify(), (e) => e instanceof OllamaError && e.kind === 'model');
  await assert.rejects(new OllamaTranslator({ url: 'h', model: 'gemma4:12b', fetchImpl: fakeOllama({ status: 403 }).fetchImpl }).verify(), (e) => e.kind === 'origin');
  const down = async () => {
    throw new TypeError('Failed to fetch');
  };
  await assert.rejects(new OllamaTranslator({ url: 'h', model: 'gemma4:12b', fetchImpl: down }).verify(), (e) => e.kind === 'network');
  assert.deepEqual(await new OllamaTranslator({ url: 'h', model: 'gemma4:12b', fetchImpl: fakeOllama().fetchImpl }).verify(), []);
});

test('a server that sends nothing in time is given up', async () => {
  const silent = async (url, init) =>
    new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }));
  const tr = new OllamaTranslator({ url: 'h', model: 'm', fetchImpl: silent, firstTokenMs: 30 });
  await assert.rejects(collect(tr.translate(job)), (e) => e.kind === 'timeout');
});

test('a server that is down rests for a while; a missing model for the whole call', () => {
  assert.equal(ollamaRestMs(new OllamaError('x', { kind: 'network' })), 15_000);
  assert.equal(ollamaRestMs(new OllamaError('x', { kind: 'model' })), Infinity);
  assert.equal(ollamaRestMs(new OllamaError('x', { kind: 'http', status: 500 })), 15_000);
});

test('a working second server hides a warning about the backup behind it', async () => {
  const ok = { model: 'm', update() {}, async verify() { return []; }, async *translate() {} };
  const secondWithUnreadyFree = { update() {}, async verify() { return [{ id: 'backup', key: 'warn.noBackup' }]; }, async *translate() {} };
  const chain = new FallbackTranslator({ primary: ok, backup: secondWithUnreadyFree, requirePrimary: false });
  assert.deepEqual(await chain.verify(), []);
});

test('an Ollama server that is down at the start lets the backup carry the call', async () => {
  const down = { model: 'm', update() {}, async verify() { throw new OllamaError('down', { kind: 'network' }); }, async *translate() { throw new Error('should rest'); } };
  const backup = { calls: 0, update() {}, async verify() { return []; }, async *translate() { this.calls += 1; yield 'Selam.'; } };
  const chain = new FallbackTranslator({ primary: down, backup, restFor: ollamaRestMs, name: 'Ollama', requirePrimary: false });
  const notes = await chain.verify();
  assert.equal(notes[0].key, 'warn.serverDown');
  assert.equal(notes[0].params.name, 'Ollama');
  assert.deepEqual(await collect(chain.translate(job)), ['Selam.']);
  assert.equal(backup.calls, 1);
  // Both down: the call does not start.
  const none = { ...backup, async verify() { throw new Error('no backup'); } };
  await assert.rejects(new FallbackTranslator({ primary: down, backup: none, requirePrimary: false }).verify(), /down/);
});
