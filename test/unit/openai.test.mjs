import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OpenAITranslator, OpenAIError, openaiRestMs, listOpenAIModels } from '../../src/offscreen/openai-translator.js';
import { translationProvider, claudeModelOf, missingKeys, missingServers, DEFAULT_SETTINGS } from '../../src/shared/settings.js';

// A stand-in for an OpenAI-compatible server: /models and a streamed /chat/completions.
function fakeServer({ models = ['gpt-test', 'text-embedding-3-small', 'whisper-1'], status = 200, refuseReasoning = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, body, headers: init.headers || {} });
    if (status !== 200) return Response.json({ error: { message: 'nope' } }, { status });
    if (url.endsWith('/models')) return Response.json({ data: models.map((id) => ({ id })) });
    if (url.endsWith('/key')) return Response.json({ data: {} });
    if (refuseReasoning && 'reasoning_effort' in body) return Response.json({ error: { message: 'Unsupported parameter: reasoning_effort' } }, { status: 400 });
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

test('a reasoning model is asked not to think long, and asked again without it when refused', async () => {
  const { fetchImpl, calls } = fakeServer({ refuseReasoning: true });
  const tr = new OpenAITranslator({ base: 'https://openrouter.ai/api/v1', key: 'k', model: 'openai/gpt-5-mini', fetchImpl });
  assert.deepEqual(await collect(tr.translate(job)), ['Günaydın herkese.', 'Başlayalım mı?']);
  const chats = calls.filter((c) => c.url.endsWith('/chat/completions'));
  assert.equal(chats[0].body.reasoning_effort, 'low');
  assert.equal('reasoning_effort' in chats[1].body, false);
  assert.equal(chats[0].headers['X-Title'], 'Live Interpreter');
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
  assert.equal(translationProvider({ claudeModel: 'free' }), 'free');
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
  // A server of one's own with the same API may need no key.
  assert.deepEqual(missingKeys({ ...base, translationProvider: 'openai', openaiUrl: 'http://127.0.0.1:1234/v1' }), []);
  assert.deepEqual(missingServers({ ...base, translationProvider: 'openai', openaiUrl: 'x', openaiModel: 'm' }), []);
});
