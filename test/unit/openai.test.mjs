import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OpenAITranslator, OpenAIError, openaiRestMs, listOpenAIModels } from '../../src/offscreen/openai-translator.js';
import { translationProvider, claudeModelOf, missingKeys, missingServers, DEFAULT_SETTINGS } from '../../src/shared/settings.js';

// A stand-in for an OpenAI-compatible server: /models and a streamed /chat/completions.
// refuse(body): true answers HTTP 400, like a model that does not take a field or value.
function fakeServer({ models = ['gpt-test', 'text-embedding-3-small', 'whisper-1'], status = 200, refuse = () => false } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, body, headers: init.headers || {} });
    if (status !== 200) return Response.json({ error: { message: 'nope' } }, { status });
    if (url.endsWith('/models')) return Response.json({ data: models.map((id) => ({ id })) });
    if (url.endsWith('/key')) return Response.json({ data: {} });
    if (body && refuse(body)) return Response.json({ error: { message: 'Unsupported value' } }, { status: 400 });
    const words = ['Günaydın ', 'herkese. ', 'Başlayalım mı?'];
    const lines = words.map((w) => `data: ${JSON.stringify({ choices: [{ delta: { content: w } }] })}\n\n`);
    lines.push('data: [DONE]\n\n');
    const text = lines.join('');
    const stream = new ReadableStream({
      start(c) {
        for (let i = 0; i < text.length; i += 9) c.enqueue(new TextEncoder().encode(text.slice(i, i + 9)));
        c.close();
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

test('the translation streams from chat completions in sentences', async () => {
  const { fetchImpl, calls } = fakeServer();
  const tr = new OpenAITranslator({ base: 'https://api.openai.com/v1/', key: 'sk-test', model: 'gpt-test', fetchImpl });
  assert.deepEqual(await collect(tr.translate(job)), ['Günaydın herkese.', 'Başlayalım mı?']);
  const chat = calls.find((c) => c.url.endsWith('/chat/completions'));
  assert.equal(chat.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(chat.headers.Authorization, 'Bearer sk-test');
  assert.equal(chat.body.stream, true);
  assert.equal('reasoning_effort' in chat.body, false);
});

test('a reasoning model is asked not to think, stepping up only as far as it requires', async () => {
  const { fetchImpl, calls } = fakeServer({ refuse: (b) => b.reasoning_effort === 'none' });
  const tr = new OpenAITranslator({ base: 'https://api.openai.com/v1', key: 'k', model: 'gpt-5-mini', fetchImpl });
  assert.deepEqual(await collect(tr.translate(job)), ['Günaydın herkese.', 'Başlayalım mı?']);
  const chats = () => calls.filter((c) => c.url.endsWith('/chat/completions'));
  assert.deepEqual(chats().map((c) => c.body.reasoning_effort), ['none', 'minimal']);
  // The next sentence goes straight to what worked.
  await collect(new OpenAITranslator({ base: 'https://api.openai.com/v1', key: 'k', model: 'gpt-5-mini', fetchImpl }).translate(job));
  assert.deepEqual(chats().map((c) => c.body.reasoning_effort), ['none', 'minimal', 'minimal']);
});

test('a server that takes no reasoning field at all is asked without one', async () => {
  const { fetchImpl, calls } = fakeServer({ refuse: (b) => 'reasoning_effort' in b });
  const tr = new OpenAITranslator({ base: 'https://api.openai.com/v1', key: 'k', model: 'gpt-5-nano', fetchImpl });
  assert.deepEqual(await collect(tr.translate(job)), ['Günaydın herkese.', 'Başlayalım mı?']);
  const chats = calls.filter((c) => c.url.endsWith('/chat/completions'));
  assert.equal(chats.length, 4);
  assert.equal('reasoning_effort' in chats[3].body, false);
});

test('OpenRouter turns reasoning off and asks for the quickest provider, for any model', async () => {
  const { fetchImpl, calls } = fakeServer();
  const tr = new OpenAITranslator({ base: 'https://openrouter.ai/api/v1', key: 'k', model: 'google/gemini-flash-latest', fetchImpl });
  await collect(tr.translate(job));
  const chat = calls.find((c) => c.url.endsWith('/chat/completions'));
  assert.deepEqual(chat.body.reasoning, { effort: 'none' });
  assert.deepEqual(chat.body.provider, { sort: 'latency' });
  assert.equal(chat.headers['X-Title'], 'Live Interpreter');
  // A model that must reason gets the lowest effort it takes.
  const strict = fakeServer({ refuse: (b) => ['none', 'minimal'].includes(b.reasoning?.effort) });
  await collect(new OpenAITranslator({ base: 'https://openrouter.ai/api/v1', key: 'k', model: 'deepseek/r1', fetchImpl: strict.fetchImpl }).translate(job));
  assert.deepEqual(strict.calls.filter((c) => c.url.endsWith('/chat/completions')).map((c) => c.body.reasoning?.effort), ['none', 'minimal', 'low']);
});

test('a model that does not reason on a server of your own gets no extra fields', async () => {
  const { fetchImpl, calls } = fakeServer();
  await collect(new OpenAITranslator({ base: 'http://127.0.0.1:1234/v1', model: 'qwen2.5', fetchImpl }).translate(job));
  const chat = calls.find((c) => c.url.endsWith('/chat/completions'));
  assert.equal('reasoning_effort' in chat.body || 'reasoning' in chat.body || 'provider' in chat.body, false);
});

test('verify finds a refused key and a model the server does not offer', async () => {
  await assert.rejects(new OpenAITranslator({ base: 'https://x/v1', key: 'bad', model: 'm', fetchImpl: fakeServer({ status: 401 }).fetchImpl }).verify(), (e) => e instanceof OpenAIError && e.kind === 'auth');
  await assert.rejects(new OpenAITranslator({ base: 'https://x/v1', model: 'missing', fetchImpl: fakeServer().fetchImpl }).verify(), (e) => e.kind === 'model');
  assert.deepEqual(await new OpenAITranslator({ base: 'https://x/v1', model: 'gpt-test', fetchImpl: fakeServer().fetchImpl }).verify(), []);
  assert.equal(openaiRestMs(new OpenAIError('x', { kind: 'auth' })), Infinity);
  assert.equal(openaiRestMs(new OpenAIError('x', { kind: 'rate' })), 30_000);
});

test("OpenAI's own model list is narrowed to chat models; another server's is not", async () => {
  const { fetchImpl } = fakeServer();
  assert.deepEqual((await listOpenAIModels({ base: 'https://api.openai.com/v1', fetchImpl })).map((m) => m.id), ['gpt-test']);
  assert.equal((await listOpenAIModels({ base: 'http://127.0.0.1:1234/v1', fetchImpl })).length, 3);
});

test('the provider follows the old claudeModel values until one is chosen', () => {
  assert.equal(translationProvider({ claudeModel: 'free' }), 'claude'); // free translation is gone
  assert.equal(translationProvider({ claudeModel: 'ollama' }), 'ollama');
  assert.equal(translationProvider({ claudeModel: 'claude-sonnet-5-5' }), 'claude');
  assert.equal(translationProvider({ claudeModel: 'free', translationProvider: 'openrouter' }), 'openrouter');
  assert.equal(claudeModelOf({ claudeModel: 'ollama' }), 'claude-haiku-5-5');
  assert.equal(claudeModelOf({ claudeModel: 'claude-opus-5-5' }), 'claude-opus-5-5');
});

test('each provider asks for what it needs', () => {
  const base = { ...DEFAULT_SETTINGS, elevenLabsKey: 'k' };
  assert.deepEqual(missingKeys({ ...base, translationProvider: 'openrouter' }), ['OpenRouter']);
  assert.deepEqual(missingServers({ ...base, translationProvider: 'openrouter', openrouterKey: 'k' }), ['model']);
  assert.deepEqual(missingKeys({ ...base, translationProvider: 'openai' }), ['OpenAI']);
  // A server of one's own with the same API (LM Studio) needs no key, only an address and a model.
  assert.deepEqual(missingKeys({ ...base, translationProvider: 'compatible' }), []);
  assert.deepEqual(missingServers({ ...base, translationProvider: 'compatible' }), ['model']);
  assert.deepEqual(missingServers({ ...base, translationProvider: 'compatible', compatibleUrl: ' ', compatibleModel: 'm' }), ['compatible']);
  assert.deepEqual(missingServers({ ...base, translationProvider: 'compatible', compatibleModel: 'm' }), []);
});

test('a server chosen under OpenAI moves to its own entry (LM Studio and the like)', async () => {
  const { migrateSettings, DEFAULT_SETTINGS: D } = await import('../../src/shared/settings.js');
  const moved = migrateSettings({ translationProvider: 'openai', openaiUrl: 'http://192.168.1.5:1234/v1', openaiKey: 'lm', openaiModel: 'qwen' });
  assert.equal(moved.translationProvider, 'compatible');
  assert.deepEqual([moved.compatibleUrl, moved.compatibleKey, moved.compatibleModel], ['http://192.168.1.5:1234/v1', 'lm', 'qwen']);
  assert.deepEqual([moved.openaiUrl, moved.openaiKey, moved.openaiModel], ['', '', '']);
  // Not chosen: the address and key still move, the choice stays.
  const kept = migrateSettings({ translationProvider: 'claude', openaiUrl: 'localhost:1234/v1', openaiKey: 'x', openaiModel: 'm' });
  assert.equal(kept.translationProvider, 'claude');
  assert.equal(kept.compatibleUrl, 'localhost:1234/v1');
  assert.equal(kept.compatibleModel, D.compatibleModel);
  // OpenAI's own address written out stays OpenAI, key and model kept.
  const openai = migrateSettings({ translationProvider: 'openai', openaiUrl: 'https://api.openai.com/v1', openaiKey: 'sk', openaiModel: 'gpt' });
  assert.deepEqual([openai.translationProvider, openai.openaiUrl, openai.openaiKey, openai.openaiModel, openai.compatibleUrl], ['openai', '', 'sk', 'gpt', D.compatibleUrl]);
  // Nothing to move: untouched, LM Studio's usual address offered.
  assert.equal(migrateSettings({ translationProvider: 'openai', openaiKey: 'sk' }).openaiKey, 'sk');
  assert.equal(D.compatibleUrl, 'http://localhost:1234/v1');
});

test('a setup that had free translation chosen moves to Claude', async () => {
  const { migrateSettings, PROVIDERS } = await import('../../src/shared/settings.js');
  assert.equal(migrateSettings({ translationProvider: 'free' }).translationProvider, 'claude');
  assert.ok(!PROVIDERS.some((p) => p.id === 'free'));
});
