import { t } from './i18n.js';
import { serverBase } from './servers.js';

// Thin client for the ElevenLabs REST endpoints the extension uses. Extension pages
// hold host permission for api.elevenlabs.io, so the API key travels in a header
// straight from this browser to ElevenLabs and nowhere else.

export const ELEVENLABS_API = 'https://api.elevenlabs.io';

// Where speech recognition and speech come from: ElevenLabs, or the person's own local
// speech server (speech-server/), which speaks the same API. Every function here takes
// either such an account or a plain ElevenLabs key.
// Defaults for OpenAI's audio API when no model is chosen.
export const OPENAI_STT_MODEL = { openai: 'whisper-1', groq: 'whisper-large-v3-turbo', custom: 'whisper-1' };
export const OPENAI_TTS_MODEL = { openai: 'gpt-4o-mini-tts', custom: 'tts-1' };
const AUDIO_BASE = { openai: 'https://api.openai.com/v1', groq: 'https://api.groq.com/openai/v1' };

export function speechAccount(settings) {
  // Soniox's voices (and Soniox listening, see isSonioxSpeech).
  // Gemini hears with the Live API and speaks with its TTS models.
  if (settings?.speechProvider === 'gemini') {
    return { kind: 'gemini', local: false, key: String(settings.geminiKey || '').trim(), base: '', ttsModel: settings.geminiTtsModel || 'gemini-3.8-flash-lite-tts' };
  }
  if (settings?.speechProvider === 'soniox') {
    return { kind: 'soniox', local: false, key: String(settings.sonioxKey || '').trim(), base: '' };
  }
  if (settings?.speechProvider === 'openai') {
    const sttServer = settings.oaiSttServer || 'openai';
    const ttsServer = settings.oaiTtsServer || 'openai';
    const sttKey = String(settings.oaiSttKey || (sttServer === 'groq' ? settings.groqKey : sttServer === 'openai' ? settings.openaiKey : '') || '').trim();
    const ttsKey = String(settings.oaiTtsKey || (ttsServer === 'openai' ? settings.openaiKey : '') || '').trim();
    return {
      kind: 'openai',
      local: false,
      key: '',
      base: '',
      stt: { base: sttServer === 'custom' ? serverBase(settings.oaiSttUrl, { defaultPort: '' }) : AUDIO_BASE[sttServer], key: sttKey, model: settings.oaiSttModel || OPENAI_STT_MODEL[sttServer] },
      tts: { base: ttsServer === 'custom' ? serverBase(settings.oaiTtsUrl, { defaultPort: '' }) : AUDIO_BASE.openai, key: ttsKey, model: settings.oaiTtsModel || OPENAI_TTS_MODEL[ttsServer] },
    };
  }
  if (settings?.speechProvider === 'local') {
    return { key: String(settings.localSpeechKey || '').trim(), base: serverBase(settings.localSpeechUrl, { defaultPort: '8765' }), local: true };
  }
  return { key: settings?.elevenLabsKey || '', base: ELEVENLABS_API, local: false };
}

function accountOf(apiKey) {
  return typeof apiKey === 'string' || !apiKey ? { key: apiKey || '', base: ELEVENLABS_API, local: false } : apiKey;
}

export function realtimeUrl(apiKey) {
  return `${accountOf(apiKey).base.replace(/^http/, 'ws')}/v1/speech-to-text/realtime`;
}

export class ElevenLabsError extends Error {
  constructor(status, body) {
    let code = '';
    let detail = '';
    try {
      const parsed = JSON.parse(body);
      const d = parsed.detail ?? parsed;
      if (typeof d === 'string') detail = d;
      else if (Array.isArray(d)) detail = d.map((x) => x.msg).join('; ');
      else {
        code = d.status || d.code || '';
        detail = d.message || '';
      }
    } catch {
      detail = String(body || '').slice(0, 300);
    }
    super(`ElevenLabs ${status}${code ? ` ${code}` : ''}: ${detail}`);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }

  get retryable() {
    if (this.code === 'quota_exceeded') return false;
    return this.status === 429 || this.status >= 500;
  }
}

// fetch rejects with a TypeError when the connection fails ("Failed to fetch"); an
// abort is a DOMException instead.
export function isNetworkError(err) {
  return err?.name === 'TypeError';
}

async function request(apiKey, path, init = {}) {
  const account = accountOf(apiKey);
  const res = await fetch(account.base + path, {
    ...init,
    headers: { 'xi-api-key': account.key, ...(init.headers || {}) },
  });
  if (!res.ok) {
    let body = '';
    try {
      body = await res.text();
    } catch {
      // body unavailable
    }
    throw new ElevenLabsError(res.status, body);
  }
  return res;
}

export async function fetchScribeToken(apiKey, { signal } = {}) {
  const res = await request(apiKey, '/v1/single-use-token/realtime_scribe', { method: 'POST', signal });
  const { token } = await res.json();
  return token;
}

// The local speech server only: its version, and what can be chosen on it.
export async function speechHealth(apiKey) {
  const res = await request(apiKey, '/health');
  return res.json();
}

export async function speechModels(apiKey) {
  const res = await request(apiKey, '/v1/models');
  return res.json();
}

// Older local speech servers cannot do what this extension asks of them.
export const SPEECH_PROTOCOL = 2;

export async function listVoices(apiKey) {
  const res = await request(apiKey, '/v1/voices');
  const json = await res.json();
  return json.voices || [];
}

export async function createVoiceClone(apiKey, { name, files, description }) {
  const form = new FormData();
  form.append('name', name);
  for (const file of files) form.append('files', file.blob, file.filename);
  if (description) form.append('description', description);
  const res = await request(apiKey, '/v1/voices/add', { method: 'POST', body: form });
  return res.json();
}

export async function deleteVoice(apiKey, voiceId) {
  await request(apiKey, `/v1/voices/${encodeURIComponent(voiceId)}`, { method: 'DELETE' });
}

// Starts a streamed text to speech request. The response body is raw 16-bit mono PCM.
export async function speechStream(
  apiKey,
  { voiceId, text, modelId, languageCode, voiceSettings, previousText, sampleRate = 24000, signal },
) {
  const body = { text, model_id: modelId };
  if (languageCode) body.language_code = languageCode;
  if (voiceSettings) body.voice_settings = voiceSettings;
  if (previousText) body.previous_text = previousText;
  return request(apiKey, `/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=pcm_${sampleRate}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
}

export function describeElevenLabsError(err, { local = false } = {}) {
  if (local) {
    if (isNetworkError(err)) return t('lsp.network');
    if (err instanceof ElevenLabsError && err.status === 401) return t('lsp.key');
    if (err instanceof ElevenLabsError && err.status === 501) return t('lsp.noClone');
    if (err instanceof ElevenLabsError && err.status === 422) return t('lsp.noVoice');
  }
  if (isNetworkError(err)) return t('el.network');
  if (err?.name === 'TimeoutError') return t('el.stalled');
  if (!(err instanceof ElevenLabsError)) return err?.message || String(err);
  if (err.status === 401) {
    if (err.code === 'quota_exceeded') return t('el.quota');
    if (err.code === 'missing_permissions') return t('el.permissions');
    return t('el.invalid');
  }
  if (err.status === 402) return t('el.paid');
  if (err.status === 403) return t('el.forbidden');
  if (err.status === 404) return t('el.voiceMissing');
  if (err.code === 'quota_exceeded') return t('stt.quota');
  if (err.status === 429) return t('el.busy');
  if (err.status >= 500) return t('el.down');
  return err.message;
}
