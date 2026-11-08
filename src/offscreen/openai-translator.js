// Translation through OpenAI's chat completions API: OpenAI itself, OpenRouter, or any
// server with the same API (LM Studio, vLLM, a company gateway). The prompt is the one
// Claude gets (translator.js); the answer is streamed and cut into speakable sentences.

import { buildSystemPrompt, buildUserMessage } from './translator.js';
import { SentenceSplitter, isOnlyPunctuation } from '../shared/text.js';
import { t } from '../shared/i18n.js';

const FIRST_TOKEN_MS = 15_000;
const STALL_MS = 8000;
const VERIFY_MS = 8000;

export class OpenAIError extends Error {
  // kind: 'network' | 'auth' | 'model' | 'rate' | 'http' | 'timeout'
  constructor(message, { kind = 'http', status } = {}) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

export function openaiRestMs(err) {
  if (err?.kind === 'auth' || err?.kind === 'model') return Infinity;
  if (err?.kind === 'rate') return 30_000;
  if (err?.kind === 'network' || err?.kind === 'timeout' || err?.name === 'TimeoutError') return 15_000;
  if (err?.status >= 500) return 15_000;
  return 0;
}

// Reasoning models think before they answer unless told not to, which a live
// translation cannot wait for. Models differ in the lowest effort they take.
const REASONING = /(^|\/)(o\d|gpt-[5-9])/i;

// Extra request fields, fastest first; each is tried in turn when a model refuses the one
// before (HTTP 400). OpenRouter takes one reasoning switch for every model and can route
// to the provider that answers first.
export function tuningFor(base, model) {
  if (String(base).includes('openrouter.ai')) {
    const provider = { sort: 'latency' };
    return [{ reasoning: { effort: 'none' }, provider }, { reasoning: { effort: 'minimal' }, provider }, { reasoning: { effort: 'low' }, provider }, { provider }, {}];
  }
  if (REASONING.test(model)) return [{ reasoning_effort: 'none' }, { reasoning_effort: 'minimal' }, { reasoning_effort: 'low' }, {}];
  return [{}];
}

// server|model -> index of the tuning that model took.
const TUNING_STEP = new Map();

function limiter(signal, ms) {
  const controller = new AbortController();
  let id = 0;
  const arm = (limit) => {
    clearTimeout(id);
    id = setTimeout(() => controller.abort(new DOMException('no answer in time', 'TimeoutError')), limit);
  };
  const follow = () => controller.abort(signal.reason);
  if (signal?.aborted) follow();
  else signal?.addEventListener('abort', follow, { once: true });
  arm(ms);
  return {
    signal: controller.signal,
    poke: arm,
    done() {
      clearTimeout(id);
      signal?.removeEventListener('abort', follow);
    },
  };
}

export class OpenAITranslator {
  // base: 'https://api.openai.com/v1', 'https://openrouter.ai/api/v1' or a server's '/v1'.
  constructor({ base, key = '', model, label = 'OpenAI', myLanguage, theirLanguage, meetingContext = '', keyterms = [], fetchImpl, firstTokenMs = FIRST_TOKEN_MS, stallMs = STALL_MS, log }) {
    this.base = String(base || '').replace(/\/+$/, '');
    this.key = String(key || '').trim();
    this.model = String(model || '').trim();
    this.label = label;
    this.myLanguage = myLanguage;
    this.theirLanguage = theirLanguage;
    this.meetingContext = meetingContext;
    this.keyterms = keyterms;
    this.fetch = fetchImpl || ((...args) => fetch(...args));
    this.firstTokenMs = firstTokenMs;
    this.stallMs = stallMs;
    this.log = log || (() => {});
    this.tuning = tuningFor(this.base, this.model);
  }

  update({ myLanguage, theirLanguage, meetingContext, keyterms } = {}) {
    if (myLanguage) this.myLanguage = myLanguage;
    if (theirLanguage) this.theirLanguage = theirLanguage;
    if (meetingContext !== undefined) this.meetingContext = meetingContext;
    if (keyterms) this.keyterms = keyterms;
  }

  headers(json) {
    const h = {};
    if (json) h['Content-Type'] = 'application/json';
    if (this.key) h.Authorization = `Bearer ${this.key}`;
    if (this.base.includes('openrouter.ai')) h['X-Title'] = 'Live Interpreter';
    return h;
  }

  async request(path, { method = 'GET', body, signal } = {}) {
    let res;
    try {
      res = await this.fetch(`${this.base}${path}`, { method, headers: this.headers(Boolean(body)), body: body ? JSON.stringify(body) : undefined, signal });
    } catch (err) {
      if (err?.name === 'TimeoutError' || signal?.reason?.name === 'TimeoutError') throw new OpenAIError(t('oai.timeout', { name: this.label }), { kind: 'timeout' });
      if (err?.name === 'AbortError') throw err;
      throw new OpenAIError(t('oai.network', { name: this.label }), { kind: 'network' });
    }
    if (res.ok) return res;
    let detail = '';
    try {
      const data = await res.json();
      detail = String(data?.error?.message || data?.message || '').slice(0, 200);
    } catch {
      // no readable body
    }
    if (res.status === 401 || res.status === 403) throw new OpenAIError(t('oai.auth', { name: this.label }), { kind: 'auth', status: res.status });
    if (res.status === 404 || /model/i.test(detail) && res.status === 400) throw new OpenAIError(t('oai.model', { name: this.label, model: this.model, detail }), { kind: 'model', status: res.status, detail });
    if (res.status === 429) throw new OpenAIError(t('oai.rate', { name: this.label }), { kind: 'rate', status: 429 });
    throw new OpenAIError(t('oai.http', { name: this.label, status: res.status, detail }), { kind: 'http', status: res.status, detail });
  }

  // The key works and the model is offered.
  async verify() {
    const limit = limiter(null, VERIFY_MS);
    try {
      const models = await listOpenAIModels({ base: this.base, key: this.key, fetchImpl: this.fetch, signal: limit.signal, all: true });
      if (this.base.includes('openrouter.ai') && this.key) await this.request('/key', { signal: limit.signal });
      if (models.length && !models.some((m) => m.id === this.model)) {
        throw new OpenAIError(t('oai.model', { name: this.label, model: this.model, detail: '' }), { kind: 'model' });
      }
    } catch (err) {
      if (err instanceof OpenAIError) throw err;
      throw new OpenAIError(t('oai.http', { name: this.label, status: '', detail: err?.message || String(err) }));
    } finally {
      limit.done();
    }
    return [];
  }

  async *translate({ text, from, to, history, concise, media, signal }) {
    const system = buildSystemPrompt({ from, to, myLanguage: this.myLanguage, theirLanguage: this.theirLanguage, meetingContext: this.meetingContext, keyterms: this.keyterms, concise, media });
    const user = buildUserMessage({ text, from, to, history });
    const body = {
      model: this.model,
      stream: true,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    };
    const limit = limiter(signal, this.firstTokenMs);
    try {
      // The fastest settings first; a model that refuses one (400) is asked with the next,
      // and the one that worked is remembered for this server and model.
      const key = `${this.base}|${this.model}`;
      let step = TUNING_STEP.get(key) ?? 0;
      let res;
      for (;;) {
        try {
          res = await this.request('/chat/completions', { method: 'POST', body: { ...body, ...this.tuning[step] }, signal: limit.signal });
          break;
        } catch (err) {
          if (!(err instanceof OpenAIError) || err.status !== 400 || step >= this.tuning.length - 1) throw err;
          this.log('info', `${this.label}: ${this.model} refused ${JSON.stringify(this.tuning[step])}, trying ${JSON.stringify(this.tuning[step + 1])}`);
          step += 1;
        }
      }
      TUNING_STEP.set(key, step);
      yield* this.read(res, limit);
    } finally {
      limit.done();
    }
  }

  // Server-sent events: "data: {json}" lines, ending with "data: [DONE]".
  async *read(res, limit) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const splitter = new SentenceSplitter();
    let buffer = '';
    try {
      for (;;) {
        let chunk;
        try {
          chunk = await reader.read();
        } catch (err) {
          if (limit.signal.reason?.name === 'TimeoutError') throw new OpenAIError(t('oai.timeout', { name: this.label }), { kind: 'timeout' });
          throw err;
        }
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') continue;
          let data;
          try {
            data = JSON.parse(payload);
          } catch {
            continue;
          }
          if (data.error) throw new OpenAIError(t('oai.http', { name: this.label, status: 'stream', detail: String(data.error.message || data.error).slice(0, 200) }));
          const piece = data.choices?.[0]?.delta?.content || '';
          if (!piece) continue;
          limit.poke(this.stallMs);
          for (const sentence of splitter.push(piece.replace(/<\/?utterance>/g, ''))) if (!isOnlyPunctuation(sentence)) yield sentence;
        }
      }
    } finally {
      reader.cancel().catch(() => {});
    }
    const rest = splitter.flush().replace(/<\/?utterance>/g, '').trim();
    if (rest && !isOnlyPunctuation(rest)) yield rest;
  }
}

// Not for translation: speech, images, embeddings, moderation and the like.
const NOT_CHAT = /(embed|whisper|tts|transcribe|dall-e|image|audio|realtime|moderation|search|davinci|babbage|computer-use|sora)/i;

// The models a server offers, sorted. OpenAI's own list is narrowed to chat models; for
// OpenRouter only the ones that write text are kept. all: no narrowing (to check a model).
export async function listOpenAIModels({ base, key = '', fetchImpl = (...a) => fetch(...a), signal, all = false }) {
  const root = String(base || '').replace(/\/+$/, '');
  const headers = key ? { Authorization: `Bearer ${key}` } : {};
  let res;
  try {
    res = await fetchImpl(`${root}/models`, { headers, signal });
  } catch (err) {
    if (err?.name === 'AbortError' && !(signal?.reason?.name === 'TimeoutError')) throw err;
    throw new OpenAIError(t('oai.network', { name: root }), { kind: 'network' });
  }
  if (res.status === 401 || res.status === 403) throw new OpenAIError(t('oai.auth', { name: root }), { kind: 'auth', status: res.status });
  if (!res.ok) throw new OpenAIError(t('oai.http', { name: root, status: res.status, detail: '' }), { status: res.status });
  const data = await res.json();
  let models = (data.data || data.models || []).map((m) => ({
    id: m.id,
    name: m.name && m.name !== m.id ? m.name : '',
    context: m.context_length || 0,
    output: m.architecture?.output_modalities,
  }));
  if (!all) {
    if (root.includes('openrouter.ai')) models = models.filter((m) => !m.output || m.output.includes('text'));
    else if (root.includes('api.openai.com')) models = models.filter((m) => !NOT_CHAT.test(m.id));
  }
  return models.sort((a, b) => a.id.localeCompare(b.id));
}
