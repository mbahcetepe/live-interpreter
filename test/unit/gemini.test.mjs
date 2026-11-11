import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeminiTranslator, listGeminiModels, geminiContents, THINKING_STEPS } from '../../src/offscreen/gemini-translator.js';
import { openaiRestMs } from '../../src/offscreen/openai-translator.js';
import { DEFAULT_SETTINGS, missingKeys, missingServers, PROVIDERS } from '../../src/shared/settings.js';

const job = { text: 'Thanks for joining.', from: 'en', to: 'tr', history: [] };

function sse(events) {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\r\n\r\n`).join('');
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

const text = (s, extra = {}) => ({ candidates: [{ content: { role: 'model', parts: [{ text: s, ...extra }] } }] });

async function collect(iterable) {
  const out = [];
  for await (const piece of iterable) out.push(piece);
  return out;
}

test('the model list keeps text models only and reads the key from a header', async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, init };
    return Response.json({
      models: [
        { name: 'models/gemini-3.5-flash-lite', displayName: 'Gemini 3.5 Flash Lite', supportedGenerationMethods: ['generateContent'], thinking: true },
        { name: 'models/gemini-3.8-flash-tts', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.1-flash-image', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-embedding-2', supportedGenerationMethods: ['embedContent'] },
        { name: 'models/gemini-3.5-transcribe-live', supportedGenerationMethods: ['bidiGenerateContent'] },
        { name: 'models/gemma-4-26b-a4b-it', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
      ],
    });
  };
  const models = await listGeminiModels({ key: ' k1 ', fetchImpl });
  assert.deepEqual(models.map((m) => m.id), ['gemini-2.5-flash', 'gemini-3.5-flash-lite', 'gemma-4-26b-a4b-it']);
  assert.equal(seen.init.headers['x-goog-api-key'], 'k1');
  assert.doesNotMatch(seen.url, /k1/);
});

test("Claude's assistant turns become Gemini's model turns", () => {
  assert.deepEqual(geminiContents([{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }]), [
    { role: 'user', parts: [{ text: 'a' }] },
    { role: 'model', parts: [{ text: 'b' }] },
  ]);
});

test('thinking settings are tried from the fastest down and the one that worked is remembered', async () => {
  const sent = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    sent.push(body.generationConfig.thinkingConfig);
    // Like gemini-2.5-pro: no budget of 0, no levels; 128 tokens work.
    const tc = body.generationConfig.thinkingConfig || {};
    if (tc.thinkingBudget === 0) return Response.json({ error: { code: 400, message: 'Budget 0 is invalid. This model only works in thinking mode.' } }, { status: 400 });
    if (tc.thinkingLevel) return Response.json({ error: { code: 400, message: 'Thinking level is not supported for this model.' } }, { status: 400 });
    return sse([text('Katıldığınız için '), text('teşekkürler.')]);
  };
  const tr = new GeminiTranslator({ key: 'k', model: 'test-pro-a', myLanguage: 'tr', theirLanguage: 'en', fetchImpl });
  assert.deepEqual(await collect(tr.translate(job)), ['Katıldığınız için teşekkürler.']);
  assert.deepEqual(sent, [{ thinkingBudget: 0 }, { thinkingLevel: 'MINIMAL' }, { thinkingLevel: 'LOW' }, { thinkingBudget: 128 }]);
  sent.length = 0;
  await collect(tr.translate(job));
  assert.deepEqual(sent, [{ thinkingBudget: 128 }]);
  assert.equal(THINKING_STEPS.at(-1).thinkingConfig, undefined);
});

test('thought parts are not spoken', async () => {
  const fetchImpl = async () => sse([text('Let me think about Turkish grammar.', { thought: true }), text('Merhaba. '), text('Nasılsınız?')]);
  const tr = new GeminiTranslator({ key: 'k', model: 'test-thinks', fetchImpl });
  assert.equal((await collect(tr.translate(job))).join(' '), 'Merhaba. Nasılsınız?');
});

test('a wrong key is reported as a key error, not as a refused thinking setting', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return Response.json({ error: { code: 400, message: 'API key not valid. Please pass a valid API key.', details: [{ reason: 'API_KEY_INVALID' }] } }, { status: 400 });
  };
  const tr = new GeminiTranslator({ key: 'bad', model: 'test-badkey', fetchImpl });
  await assert.rejects(collect(tr.translate(job)), (err) => err.kind === 'auth' && openaiRestMs(err) === Infinity);
  assert.equal(calls, 1);
});

test('a model that is gone, a rate limit and a block are errors the call can act on', async () => {
  const gone = new GeminiTranslator({ key: 'k', model: 'gemini-2.5-flash-lite', fetchImpl: async () => Response.json({ error: { message: 'no longer available' } }, { status: 404 }) });
  await assert.rejects(collect(gone.translate(job)), (err) => err.kind === 'model');
  const busy = new GeminiTranslator({ key: 'k', model: 'm', fetchImpl: async () => Response.json({ error: { message: 'RESOURCE_EXHAUSTED' } }, { status: 429 }) });
  await assert.rejects(collect(busy.translate(job)), (err) => err.kind === 'rate' && openaiRestMs(err) === 30_000);
  const blocked = new GeminiTranslator({ key: 'k', model: 'test-block', fetchImpl: async () => sse([{ promptFeedback: { blockReason: 'SAFETY' } }]) });
  await assert.rejects(collect(blocked.translate(job)), /SAFETY/);
});

test('verify asks for the model itself', async () => {
  let asked;
  const tr = new GeminiTranslator({ key: 'k', model: 'gemini-3.5-flash-lite', fetchImpl: async (url) => ((asked = url), Response.json({ name: 'models/gemini-3.5-flash-lite' })) });
  assert.deepEqual(await tr.verify(), []);
  assert.match(asked, /\/models\/gemini-3\.5-flash-lite$/);
});

test('Gemini is a translation service that needs a key and a model', () => {
  assert.ok(PROVIDERS.some((p) => p.id === 'gemini'));
  const s = { ...DEFAULT_SETTINGS, translationProvider: 'gemini', elevenLabsKey: 'el' };
  assert.deepEqual(missingKeys(s), ['Gemini']);
  assert.deepEqual(missingKeys({ ...s, geminiKey: 'g' }), []);
  assert.deepEqual(missingServers({ ...s, geminiKey: 'g', geminiModel: '' }), ['model']);
  assert.equal(DEFAULT_SETTINGS.geminiModel, 'gemini-3.5-flash-lite');
});
