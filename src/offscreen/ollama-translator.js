// Translation on the person's own Ollama server (on this computer, the local network or
// a Tailscale network). The prompt is the one Claude gets (translator.js); the answer is
// streamed and cut into speakable sentences while it is still being written.
//
// The extension removes the Origin header from its own requests to the server (see
// src/shared/servers.js), so Ollama needs no OLLAMA_ORIGINS setting.

import { buildSystemPrompt, buildUserMessage } from './translator.js';
import { SentenceSplitter, isOnlyPunctuation } from '../shared/text.js';
import { serverBase } from '../shared/servers.js';
import { t } from '../shared/i18n.js';

// A first answer can take long when the model is still being loaded into memory.
const FIRST_TOKEN_MS = 20_000;
const STALL_MS = 8000;
const VERIFY_MS = 6000;

export class OllamaError extends Error {
  // kind: 'network' | 'origin' | 'model' | 'http' | 'timeout'
  constructor(message, { kind = 'http', status } = {}) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

// How long an Ollama server is left alone after a failure while the next one stands in.
export function ollamaRestMs(err) {
  if (err?.kind === 'model' || err?.kind === 'origin') return Infinity;
  if (err?.kind === 'network' || err?.kind === 'timeout' || err?.name === 'TimeoutError') return 15_000;
  if (err?.status >= 500) return 15_000;
  return 0;
}

// Ollama lists "gemma4:latest" for a model pulled as "gemma4".
export function hasModel(models, wanted) {
  const name = String(wanted || '').trim();
  const full = name.includes(':') ? name : `${name}:latest`;
  return (models || []).some((m) => m?.name === name || m?.name === full || m?.model === name || m?.model === full);
}

function timer(signal, ms) {
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
    poke: (limit) => arm(limit),
    done() {
      clearTimeout(id);
      signal?.removeEventListener('abort', follow);
    },
  };
}

export class OllamaTranslator {
  constructor({ url, model, label = 'Ollama', myLanguage, theirLanguage, meetingContext = '', keyterms = [], fetchImpl, firstTokenMs = FIRST_TOKEN_MS, stallMs = STALL_MS, log }) {
    this.base = serverBase(url);
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
    // Some models refuse the `think` field; it is left out from then on.
    this.sendThink = true;
  }

  // The model and the server are fixed for a translator; the engine makes a new one
  // when they change.
  update({ myLanguage, theirLanguage, meetingContext, keyterms } = {}) {
    if (myLanguage) this.myLanguage = myLanguage;
    if (theirLanguage) this.theirLanguage = theirLanguage;
    if (meetingContext !== undefined) this.meetingContext = meetingContext;
    if (keyterms) this.keyterms = keyterms;
  }

  async request(path, { method = 'GET', body, signal } = {}) {
    let res;
    try {
      res = await this.fetch(`${this.base}${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal,
      });
    } catch (err) {
      if (err?.name === 'AbortError' && !(signal?.reason?.name === 'TimeoutError')) throw err;
      if (err?.name === 'TimeoutError' || signal?.reason?.name === 'TimeoutError') {
        throw new OllamaError(t('ollama.timeout', { name: this.label }), { kind: 'timeout' });
      }
      throw new OllamaError(t('ollama.network', { name: this.label, url: this.base }), { kind: 'network' });
    }
    if (res.status === 403) throw new OllamaError(t('ollama.origin', { name: this.label }), { kind: 'origin', status: 403 });
    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.text()).slice(0, 200);
      } catch {
        // no body
      }
      if (res.status === 404 && /model/i.test(detail)) {
        throw new OllamaError(t('ollama.noModel', { name: this.label, model: this.model }), { kind: 'model', status: 404 });
      }
      throw new OllamaError(t('ollama.http', { name: this.label, status: res.status, detail }), { kind: 'http', status: res.status });
    }
    return res;
  }

  // The server answers and has the model. The model is also loaded into memory now, so
  // the first sentence of the call does not wait for it.
  async verify() {
    const limit = timer(null, VERIFY_MS);
    try {
      const res = await this.request('/api/tags', { signal: limit.signal });
      const { models } = await res.json();
      if (!hasModel(models, this.model)) {
        throw new OllamaError(t('ollama.noModel', { name: this.label, model: this.model }), { kind: 'model' });
      }
    } finally {
      limit.done();
    }
    this.warm();
    return [];
  }

  warm() {
    this.fetch(`${this.base}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, prompt: '', keep_alive: '30m' }),
    }).catch(() => {});
  }

  async *translate({ text, from, to, history, concise, media, signal }) {
    const system = buildSystemPrompt({
      from,
      to,
      myLanguage: this.myLanguage,
      theirLanguage: this.theirLanguage,
      meetingContext: this.meetingContext,
      keyterms: this.keyterms,
      concise,
      media,
    });
    const user = buildUserMessage({ text, from, to, history });
    const body = {
      model: this.model,
      stream: true,
      keep_alive: '30m',
      options: { temperature: 0.2, num_predict: 512 },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    };
    const limit = timer(signal, this.firstTokenMs);
    try {
      let res;
      try {
        res = await this.request('/api/chat', { method: 'POST', body: this.sendThink ? { ...body, think: false } : body, signal: limit.signal });
      } catch (err) {
        if (!(err instanceof OllamaError) || err.status !== 400 || !this.sendThink) throw err;
        this.sendThink = false;
        this.log('info', `${this.label}: ${this.model} does not take the think field, asking without it`);
        res = await this.request('/api/chat', { method: 'POST', body, signal: limit.signal });
      }
      yield* this.read(res, limit);
    } finally {
      limit.done();
    }
  }

  // Ollama streams one JSON object per line.
  async *read(res, limit) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const splitter = new SentenceSplitter();
    let buffer = '';
    let started = false;
    try {
      for (;;) {
        let chunk;
        try {
          chunk = await reader.read();
        } catch (err) {
          if (limit.signal.reason?.name === 'TimeoutError') throw new OllamaError(t('ollama.timeout', { name: this.label }), { kind: 'timeout' });
          throw err;
        }
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          let data;
          try {
            data = JSON.parse(line);
          } catch {
            continue;
          }
          if (data.error) throw new OllamaError(t('ollama.http', { name: this.label, status: 'stream', detail: String(data.error).slice(0, 200) }));
          const piece = data.message?.content || '';
          if (piece) {
            if (!started) started = true;
            limit.poke(this.stallMs);
            for (const sentence of splitter.push(clean(piece, false))) if (!isOnlyPunctuation(sentence)) yield sentence;
          }
        }
      }
    } finally {
      reader.cancel().catch(() => {});
    }
    const rest = clean(splitter.flush(), true);
    if (rest && !isOnlyPunctuation(rest)) yield rest;
  }
}

// Models sometimes echo the tags of the prompt around the answer.
function clean(text, last) {
  const out = String(text || '').replace(/<\/?utterance>/g, '');
  return last ? out.trim() : out;
}

// The models a server has that can write text: embedding-only models (bge-m3,
// nomic-embed-text) are left out, by what Ollama says each one can do.
export async function listOllamaModels(url, { fetchImpl = (...a) => fetch(...a) } = {}) {
  const base = serverBase(url);
  let res;
  try {
    res = await fetchImpl(`${base}/api/tags`);
  } catch {
    throw new OllamaError(t('ollama.network', { name: base, url: base }), { kind: 'network' });
  }
  if (!res.ok) throw new OllamaError(t('ollama.http', { name: base, status: res.status, detail: '' }), { status: res.status });
  const { models = [] } = await res.json();
  const checked = await Promise.all(
    models.map(async (m) => {
      try {
        const info = await fetchImpl(`${base}/api/show`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: m.name }) });
        const caps = info.ok ? (await info.json()).capabilities : null;
        if (Array.isArray(caps) && !caps.includes('completion')) return null;
      } catch {
        // an older Ollama without capabilities: keep the model
      }
      return { id: m.name, size: m.size || 0, params: m.details?.parameter_size || '', quant: m.details?.quantization_level || '' };
    }),
  );
  return checked.filter(Boolean).sort((a, b) => a.id.localeCompare(b.id));
}
