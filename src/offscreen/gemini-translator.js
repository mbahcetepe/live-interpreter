// Translation with Google Gemini (generativelanguage.googleapis.com). The prompt is the
// one Claude gets (translator.js); the answer is streamed (server-sent events) and cut
// into speakable sentences. Google's API answers the extension's own origin (CORS), so
// no host permission is needed.
//
// Thinking: most Gemini models think before they answer unless told not to, which a live
// translation cannot wait for (gemini-3.8-flash: 5.6 s with thinking, 1.6 s without).
// Models differ in what they take: 2.5 Flash takes a budget of 0 but no level, 2.5 Pro
// thinks at least 128 tokens, 3.5 Flash-Lite refuses a budget of 0 but takes MINIMAL,
// 3.8 Flash refuses MINIMAL, Gemma takes only MINIMAL. So the settings are tried from
// the fastest down, each when the model refuses the one before (HTTP 400), and the one
// that worked is remembered per model.

import { buildSystemPrompt, buildMessages } from './translator.js';
import { OpenAIError, limiter } from './openai-translator.js';
import { SentenceSplitter, isOnlyPunctuation } from '../shared/text.js';
import { t } from '../shared/i18n.js';

export const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta';
export const GEMINI_DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const LABEL = 'Gemini';

const FIRST_TOKEN_MS = 15_000;
const STALL_MS = 8000;
const VERIFY_MS = 8000;

export const THINKING_STEPS = [
  { thinkingConfig: { thinkingBudget: 0 } },
  { thinkingConfig: { thinkingLevel: 'MINIMAL' } },
  { thinkingConfig: { thinkingLevel: 'LOW' } },
  { thinkingConfig: { thinkingBudget: 128 } },
  {},
];

// model -> index of the thinking setting that model took.
const THINKING_STEP = new Map();

// Text models only: not speech, images, music, embeddings, live audio or agents.
const NOT_TEXT = /(tts|image|banana|lyria|embedding|transcribe|native-audio|live|robotics|computer-use|antigravity|deep-research|customtools|omni|decision|^aqa$)/i;

async function geminiError(res, model) {
  let detail = '';
  let reason = '';
  try {
    const data = await res.json();
    detail = String(data?.error?.message || '').slice(0, 200);
    reason = JSON.stringify(data?.error?.details || '');
  } catch {
    // no readable body
  }
  // A wrong key is a 400 with API_KEY_INVALID, not a 401.
  if (res.status === 401 || res.status === 403 || /API_KEY_INVALID|API key not valid/i.test(reason + detail)) {
    return new OpenAIError(t('oai.auth', { name: LABEL }), { kind: 'auth', status: res.status });
  }
  if (res.status === 404) return new OpenAIError(t('oai.model', { name: LABEL, model, detail }), { kind: 'model', status: 404, detail });
  if (res.status === 429) return new OpenAIError(t('oai.rate', { name: LABEL }), { kind: 'rate', status: 429 });
  return new OpenAIError(t('oai.http', { name: LABEL, status: res.status, detail }), { kind: 'http', status: res.status, detail });
}

async function call(fetchImpl, url, init, signal) {
  try {
    return await fetchImpl(url, { ...init, signal });
  } catch (err) {
    if (err?.name === 'TimeoutError' || signal?.reason?.name === 'TimeoutError') throw new OpenAIError(t('oai.timeout', { name: LABEL }), { kind: 'timeout' });
    if (err?.name === 'AbortError') throw err;
    throw new OpenAIError(t('oai.network', { name: LABEL }), { kind: 'network' });
  }
}

// The text models the key can use, newest first within a family. The key goes in a
// header, never in the address.
export async function listGeminiModels({ key, fetchImpl = (...a) => fetch(...a), signal }) {
  const res = await call(fetchImpl, `${GEMINI_URL}/models?pageSize=1000`, { headers: { 'x-goog-api-key': String(key || '').trim() } }, signal);
  if (!res.ok) throw await geminiError(res, '');
  const data = await res.json();
  return (data.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => ({ id: String(m.name || '').replace(/^models\//, ''), name: m.displayName && m.displayName !== m.name ? m.displayName : '', thinking: Boolean(m.thinking) }))
    .filter((m) => m.id && !NOT_TEXT.test(m.id))
    .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
}

// Claude's turns are 'assistant'; Gemini's are 'model'.
export function geminiContents(messages) {
  return messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content) }] }));
}

export class GeminiTranslator {
  constructor({ key, model, myLanguage, theirLanguage, meetingContext = '', keyterms = [], fetchImpl, firstTokenMs = FIRST_TOKEN_MS, stallMs = STALL_MS, log }) {
    this.key = String(key || '').trim();
    this.model = String(model || '').trim() || GEMINI_DEFAULT_MODEL;
    this.label = LABEL;
    this.myLanguage = myLanguage;
    this.theirLanguage = theirLanguage;
    this.meetingContext = meetingContext;
    this.keyterms = keyterms;
    this.fetch = fetchImpl || ((...args) => fetch(...args));
    this.firstTokenMs = firstTokenMs;
    this.stallMs = stallMs;
    this.log = log || (() => {});
  }

  update({ myLanguage, theirLanguage, meetingContext, keyterms } = {}) {
    if (myLanguage) this.myLanguage = myLanguage;
    if (theirLanguage) this.theirLanguage = theirLanguage;
    if (meetingContext !== undefined) this.meetingContext = meetingContext;
    if (keyterms) this.keyterms = keyterms;
  }

  headers() {
    return { 'x-goog-api-key': this.key, 'Content-Type': 'application/json' };
  }

  // The key works and the model is offered.
  async verify() {
    const limit = limiter(null, VERIFY_MS);
    try {
      const res = await call(this.fetch, `${GEMINI_URL}/models/${encodeURIComponent(this.model)}`, { headers: this.headers() }, limit.signal);
      if (!res.ok) throw await geminiError(res, this.model);
    } finally {
      limit.done();
    }
    return [];
  }

  async *translate({ text, from, to, history, concise, media, marked, signal }) {
    const system = buildSystemPrompt({ from, to, myLanguage: this.myLanguage, theirLanguage: this.theirLanguage, meetingContext: this.meetingContext, keyterms: this.keyterms, concise, media, marked });
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: geminiContents(buildMessages({ text, from, to, history })),
    };
    const url = `${GEMINI_URL}/models/${encodeURIComponent(this.model)}:streamGenerateContent?alt=sse`;
    const limit = limiter(signal, this.firstTokenMs);
    try {
      let step = THINKING_STEP.get(this.model) ?? 0;
      let res;
      for (;;) {
        res = await call(this.fetch, url, { method: 'POST', headers: this.headers(), body: JSON.stringify({ ...body, generationConfig: { maxOutputTokens: 2048, ...THINKING_STEPS[step] } }) }, limit.signal);
        if (res.ok) break;
        const err = await geminiError(res, this.model);
        if (err.kind !== 'http' || err.status !== 400 || step >= THINKING_STEPS.length - 1) throw err;
        this.log('info', `Gemini: ${this.model} refused ${JSON.stringify(THINKING_STEPS[step])} (${err.detail}), trying the next thinking setting`);
        step += 1;
      }
      THINKING_STEP.set(this.model, step);
      yield* this.read(res, limit);
    } finally {
      limit.done();
    }
  }

  // "data: {json}" lines; thought parts (when a model thinks anyway) are not the answer.
  async *read(res, limit) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const splitter = new SentenceSplitter();
    let buffer = '';
    const clean = (s) => s.replace(/<\/?utterance>/g, '');
    try {
      for (;;) {
        let chunk;
        try {
          chunk = await reader.read();
        } catch (err) {
          if (limit.signal.reason?.name === 'TimeoutError') throw new OpenAIError(t('oai.timeout', { name: LABEL }), { kind: 'timeout' });
          throw err;
        }
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith('data:')) continue;
          let data;
          try {
            data = JSON.parse(line.slice(5).trim());
          } catch {
            continue;
          }
          if (data.error) throw new OpenAIError(t('oai.http', { name: LABEL, status: 'stream', detail: String(data.error.message || data.error).slice(0, 200) }));
          // A blocked prompt or answer comes back without text.
          const blocked = data.promptFeedback?.blockReason;
          if (blocked) throw new OpenAIError(t('oai.http', { name: LABEL, status: 'blocked', detail: blocked }));
          limit.poke(this.stallMs);
          for (const part of data.candidates?.[0]?.content?.parts || []) {
            if (part.thought || !part.text) continue;
            for (const sentence of splitter.push(clean(part.text))) if (!isOnlyPunctuation(sentence)) yield sentence;
          }
        }
      }
    } finally {
      reader.cancel().catch(() => {});
    }
    const rest = clean(splitter.flush()).trim();
    if (rest && !isOnlyPunctuation(rest)) yield rest;
  }
}
