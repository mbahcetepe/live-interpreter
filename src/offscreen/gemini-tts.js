// Speech with Google Gemini's TTS models (streamGenerateContent with an AUDIO answer).
// The answer streams as server-sent events, each holding a base64 piece of 16-bit
// little-endian PCM at 24 kHz, mono; the pieces are yielded as they come.
//
// Measured on 11 November 2026: gemini-3.8-flash-lite-tts gives the first sound 0.45-0.64 s
// after the request (the Interactions API took about 2 s). Every voice speaks every
// language and finds it from the text; a question or an order in the text is read out,
// not answered. There is no speed setting.

import { GEMINI_URL } from './gemini-translator.js';
import { OpenAIError, limiter } from './openai-translator.js';
import { PcmByteAligner } from '../shared/pcm.js';
import { t } from '../shared/i18n.js';

export const GEMINI_TTS_MODEL = 'gemini-3.8-flash-lite-tts';
export const GEMINI_TTS_RATE = 24000;
const LABEL = 'Gemini';
const FIRST_AUDIO_MS = 10_000;
const STALL_MS = 8000;

// The prebuilt voices (the API has no list of them).
export const GEMINI_VOICES = [
  'Achernar', 'Achird', 'Algenib', 'Algieba', 'Alnilam', 'Aoede', 'Autonoe', 'Callirrhoe', 'Charon', 'Despina',
  'Enceladus', 'Erinome', 'Fenrir', 'Gacrux', 'Iapetus', 'Kore', 'Laomedeia', 'Leda', 'Orus', 'Puck',
  'Pulcherrima', 'Rasalgethi', 'Sadachbia', 'Sadaltager', 'Schedar', 'Sulafat', 'Umbriel', 'Vindemiatrix', 'Zephyr', 'Zubenelgenubi',
];
export const GEMINI_DEFAULT_VOICES = { mine: 'Puck', theirs: 'Kore' };

// The TTS models the key can use.
export async function listGeminiTtsModels({ key, fetchImpl = (...a) => fetch(...a), signal }) {
  const res = await fetchImpl(`${GEMINI_URL}/models?pageSize=1000`, { headers: { 'x-goog-api-key': String(key || '').trim() }, signal });
  if (!res.ok) throw await speechError(res);
  const data = await res.json();
  return (data.models || [])
    .map((m) => String(m.name || '').replace(/^models\//, ''))
    .filter((id) => /-tts($|-)/.test(id))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

async function speechError(res, voice = '') {
  let detail = '';
  let reason = '';
  try {
    const data = await res.json();
    detail = String(data?.error?.message || '').slice(0, 200);
    reason = JSON.stringify(data?.error?.details || '');
  } catch {
    // no readable body
  }
  if (res.status === 401 || res.status === 403 || /API_KEY_INVALID|API key not valid/i.test(reason + detail)) return new OpenAIError(t('oai.auth', { name: LABEL }), { kind: 'auth', status: res.status });
  if (res.status === 404) return new OpenAIError(t('oai.model', { name: LABEL, model: GEMINI_TTS_MODEL, detail }), { kind: 'model', status: 404, detail });
  if (res.status === 429) return new OpenAIError(t('oai.rate', { name: LABEL }), { kind: 'rate', status: 429 });
  if (/speaker voice/i.test(detail)) return new OpenAIError(t('gemini.voice', { voice }), { kind: 'voice', status: res.status, detail });
  return new OpenAIError(t('oai.http', { name: LABEL, status: res.status, detail }), { kind: 'http', status: res.status, detail });
}

function decodeBase64(data) {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function* geminiSynthesize({ key, model = GEMINI_TTS_MODEL, voice, text, signal, fetchImpl = (...a) => fetch(...a), firstAudioMs = FIRST_AUDIO_MS, stallMs = STALL_MS }) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: String(text) }] }],
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice || GEMINI_DEFAULT_VOICES.theirs } } } },
  };
  const limit = limiter(signal, firstAudioMs);
  let res;
  try {
    res = await fetchImpl(`${GEMINI_URL}/models/${encodeURIComponent(model || GEMINI_TTS_MODEL)}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: { 'x-goog-api-key': String(key || '').trim(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: limit.signal,
    });
  } catch (err) {
    limit.done();
    if (err?.name === 'TimeoutError' || limit.signal.reason?.name === 'TimeoutError') throw new OpenAIError(t('oai.timeout', { name: LABEL }), { kind: 'timeout' });
    if (err?.name === 'AbortError') throw err;
    throw new OpenAIError(t('oai.network', { name: LABEL }), { kind: 'network' });
  }
  if (!res.ok) {
    limit.done();
    throw await speechError(res, voice);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const aligner = new PcmByteAligner();
  let buffer = '';
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
        for (const part of data.candidates?.[0]?.content?.parts || []) {
          if (!part.inlineData?.data) continue;
          limit.poke(stallMs);
          const pcm = aligner.push(decodeBase64(part.inlineData.data));
          if (pcm.length) yield pcm;
        }
      }
    }
  } finally {
    limit.done();
    reader.cancel().catch(() => {});
  }
}
