// Persistent settings live in chrome.storage.local under one key. Everything the
// extension needs at runtime is read through loadSettings(), so new fields only
// need a default here.

import { LANGUAGES, AUTO_LANGUAGE } from './languages.js';

// Labels are i18n keys (see shared/i18n.js).
export const CLAUDE_MODELS = [
  { id: 'claude-opus-5-5', labelKey: 'model.opus' },
  { id: 'claude-sonnet-5-5', labelKey: 'model.sonnet' },
  { id: 'claude-haiku-5-5', labelKey: 'model.haiku' },
];
const CLAUDE_IDS = new Set(CLAUDE_MODELS.map((m) => m.id));

// Who translates. 'openai' is OpenAI itself; 'compatible' is a server of one's own with
// the same API (LM Studio, vLLM, llama.cpp, a company gateway); 'openrouter' reaches
// hundreds of models with one key. shortKey names the service in the panel.
export const PROVIDERS = [
  { id: 'claude', labelKey: 'provider.claude' },
  // Soniox hears and translates in one stream, so it also does the listening.
  { id: 'soniox', labelKey: 'provider.soniox' },
  { id: 'openai', labelKey: 'provider.openai' },
  { id: 'openrouter', labelKey: 'provider.openrouter' },
  { id: 'gemini', labelKey: 'provider.gemini' },
  { id: 'ollama', labelKey: 'provider.ollama' },
  { id: 'compatible', labelKey: 'provider.compatible', shortKey: 'server.compatible' },
];

// Whisper models that know only English: Distil-Whisper (distil-large-v3 and the like) and
// the ".en" models. Given other speech they write an English rendering of it, not the words.
export const MULTILINGUAL_WHISPER = 'large-v3-turbo';
export function isEnglishOnlyWhisper(model) {
  return /(^|\/)distil-|\.en$/i.test(String(model || ''));
}

// The model to ask the local server for, for speech in this language ('' = the server's own).
export function whisperModelFor(model, languageCode) {
  const lang = String(languageCode || '').split(/[-_]/)[0].toLowerCase();
  if (isEnglishOnlyWhisper(model) && lang !== 'en') return MULTILINGUAL_WHISPER;
  return model || '';
}

// Before translationProvider existed, claudeModel held 'ollama' as well (and 'free', for
// free translation, which is gone: Claude takes its place).
export function translationProvider(settings) {
  const chosen = settings?.translationProvider;
  if (PROVIDERS.some((p) => p.id === chosen)) return chosen;
  if (settings?.claudeModel === 'ollama') return 'ollama';
  return 'claude';
}

// The Claude model to use: the chosen one, or Haiku when the field still holds an old value.
export const claudeModelOf = (settings) => (CLAUDE_IDS.has(settings?.claudeModel) ? settings.claudeModel : 'claude-haiku-5-5');

export const isOllamaTranslation = (settings) => translationProvider(settings) === 'ollama';
export const isClaudeTranslation = (settings) => translationProvider(settings) === 'claude';
// Speech recognition and speech on the local speech server instead of ElevenLabs.
export const isLocalSpeech = (settings) => settings.speechProvider === 'local';
// Speech recognition and speech through OpenAI's audio API (offscreen/openai-speech.js).
export const isOpenAISpeech = (settings) => settings.speechProvider === 'openai';
// Soniox translates (Translation › Service): it hears and translates in one stream, so it
// does the listening too, and the speech service only speaks.
export const isSoniox = (settings) => translationProvider(settings) === 'soniox';

// Soniox is the speech service: it listens (without translating, unless it translates
// too) and speaks.
export const isSonioxSpeech = (settings) => settings.speechProvider === 'soniox';
// Gemini hears (Live API) and speaks (TTS) with the key under Translation › Gemini.
export const isGeminiSpeech = (settings) => settings.speechProvider === 'gemini';

// Soniox listens: it translates, or it is the speech service.
export const isSonioxListening = (settings) => isSoniox(settings) || isSonioxSpeech(settings);

export const OPENAI_URL = 'https://api.openai.com/v1';
export const OPENROUTER_URL = 'https://openrouter.ai/api/v1';

export const TTS_MODELS = [
  { id: 'eleven_flash_v2_5', labelKey: 'tts.flash' },
  { id: 'eleven_v4_turbo', labelKey: 'tts.v4' },
];

export const DEFAULT_SETTINGS = {
  uiLanguage: 'en', // interface language: one of UI_LANGUAGES (shared/i18n.js)

  elevenLabsKey: '',
  anthropicKey: '',
  // A Groq key from before 2.6, when free translation used it; Groq speech recognition
  // still falls back to it.
  groqKey: '',

  // On the very first start these follow the browser's language (firstRunDefaults).
  myLanguage: 'en',
  theirLanguage: 'es',
  // What a video or radio tab speaks; 'auto' lets speech recognition find it.
  mediaLanguage: AUTO_LANGUAGE,

  // How the counterpart reaches me: spoken translation, subtitles only (no speech
  // credits used), or off. And whether they hear my translated voice or my own.
  incomingMode: 'voice', // 'voice' | 'text' | 'off'
  outgoingMode: 'voice', // 'voice' | 'off'

  // Voice the counterpart hears when I speak (ideally my own clone).
  myVoiceId: '',
  myVoiceName: '',
  myVoiceOwnedId: '', // a clone this extension made from my recording (replaced on re-record)
  // Voice I hear for the counterpart until (or unless) their clone is ready.
  theirVoiceId: '',
  theirVoiceName: '',

  // Cloning the counterpart's voice is offered per meeting and always needs their consent.
  offerTheirClone: true,
  cloneSeconds: 45,
  deleteCloneAfter: true,

  // '' until chosen: then it follows claudeModel's old meaning (translationProvider()).
  translationProvider: '',
  claudeModel: 'claude-opus-5-5',
  // When the chosen translation fails on a sentence, the ones behind it translate it.
  translationFallback: true,
  // OpenAI itself. openaiUrl is no longer used (2.6.1: such servers are 'compatible').
  openaiUrl: '',
  openaiKey: '',
  openaiModel: '',
  openrouterKey: '',
  openrouterModel: '',
  // A server of one's own with OpenAI's API; LM Studio's address on this computer.
  compatibleUrl: 'http://localhost:1234/v1',
  compatibleKey: '',
  compatibleModel: '',
  // Google Gemini (AI Studio key).
  geminiKey: '',
  geminiModel: 'gemini-3.5-flash-lite',
  // Ollama: the main server and an optional second one (another computer) behind it.
  ollamaUrl: '',
  ollamaModel: 'gemma4:12b',
  ollamaBackupUrl: '',
  ollamaBackupModel: '',
  // 'elevenlabs' or 'local' (speech-server/ on the person's own computer).
  speechProvider: 'elevenlabs',
  useSoniox: false,
  sonioxKey: '',
  sonioxMyVoice: '',
  sonioxTheirVoice: '',
  // Gemini as the speech service: it hears (Live API) and speaks (TTS) with geminiKey.
  geminiMyVoice: '',
  geminiTheirVoice: '',
  geminiTtsModel: 'gemini-3.8-flash-lite-tts',
  localSpeechUrl: '',
  localSpeechKey: '',
  // On the local speech server: the recognition model ('' = the server's own) and the
  // voices ('' = its first and second voice for the language).
  localWhisperModel: '',
  localMyVoice: '',
  localTheirVoice: '',
  // 'openai': OpenAI's audio API, from OpenAI, Groq (recognition) or a server of one's own.
  // An empty key falls back to the same service's key under Translation.
  oaiSttServer: 'openai', // 'openai' | 'groq' | 'custom'
  oaiSttUrl: '',
  oaiSttKey: '',
  oaiSttModel: '',
  oaiTtsServer: 'openai', // 'openai' | 'custom'
  oaiTtsUrl: '',
  oaiTtsKey: '',
  oaiTtsModel: '',
  oaiMyVoice: '',
  oaiTheirVoice: '',
  ttsModel: 'eleven_flash_v2_5',
  meetingContext: '',
  keyterms: '',

  // Levels are linear gains (0..1).
  // The counterpart's own voice in voice mode, while nothing / a translation is speaking.
  // Silent by default: in voice mode only the translation is heard. Subtitle mode and
  // off always play their voice at full level.
  originalVolume: 0,
  duckVolume: 0,
  translationVolume: 1,
  monitorVolume: 0, // hear my own translated voice locally

  vadSilenceSecs: 0.7,
  halfDuplex: false,
  micDeviceLabel: '', // '' = same microphone as Meet, falling back to the system default
  outputDeviceLabel: '', // '' = system default output
  stability: 0.5,
  similarity: 0.8,
  showOverlay: true,
  // Each session's transcript is kept on this computer (recordings page).
  saveTranscripts: true,
  subtitleBar: true, // the translation as subtitles low in the Meet window
  pronounceForeign: true, // foreign words read the way they are said in their own language
  pronunciations: '', // the user's own list: "API = ey pi ay", one per line
  mediaSubtitles: true, // on a video tab with voice translation: subtitles too (false: voice only)
  settingsVersion: 2,
};

export async function loadSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return migrateSettings(settings);
}

// The interface starts in English. My language starts as the browser's, theirs as English
// (or Spanish for someone who speaks English).
export function firstRunDefaults(locale = globalThis.navigator?.language || 'en') {
  const code = String(locale).toLowerCase().split('-')[0];
  const mine = LANGUAGES.some((l) => l.code === code) ? code : 'en';
  return { myLanguage: mine, theirLanguage: mine === 'en' ? 'es' : 'en' };
}

// Before version 2 voice mode kept their original voice at 0.3 (0.08 under a
// translation) by default. Settings still on those defaults move to the silent ones.
export function migrateSettings(stored) {
  const merged = { ...DEFAULT_SETTINGS, ...(stored ? {} : firstRunDefaults()), ...(stored || {}) };
  if ((stored?.settingsVersion ?? 1) < 2 && merged.originalVolume === 0.3 && merged.duckVolume === 0.08) {
    merged.originalVolume = 0;
    merged.duckVolume = 0;
  }
  // Before 2.6 Soniox was a tick box under Speech recognition and voices; it is now a
  // translation service like the others.
  if (merged.useSoniox === true) {
    merged.translationProvider = 'soniox';
    merged.useSoniox = false;
  }
  // Free translation is gone since 2.6: Claude takes its place.
  if (merged.translationProvider === 'free') merged.translationProvider = 'claude';
  // Before 2.6.1 a server of one's own was OpenAI with an address; it has its own entry now,
  // and its address, key and model go with it. OpenAI's own address stays OpenAI.
  const oldUrl = String(merged.openaiUrl || '').trim();
  if (oldUrl) {
    if (!/^(https?:\/\/)?api\.openai\.com(\/|$)/i.test(oldUrl)) {
      const chosen = merged.translationProvider === 'openai';
      merged.compatibleUrl = oldUrl;
      merged.compatibleKey = merged.openaiKey || '';
      if (chosen) merged.compatibleModel = merged.openaiModel || '';
      if (chosen) merged.translationProvider = 'compatible';
      merged.openaiKey = '';
      merged.openaiModel = '';
    }
    merged.openaiUrl = '';
  }
  return merged;
}

export async function saveSettings(patch) {
  const current = await loadSettings();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}

// Keys the chosen setup needs but does not have.
export function missingKeys(settings) {
  const missing = [];
  const provider = translationProvider(settings);
  const soniox = isSoniox(settings);
  if (isSonioxListening(settings) && !String(settings.sonioxKey || '').trim()) missing.push('Soniox');
  if (!settings.elevenLabsKey && !isLocalSpeech(settings) && !isOpenAISpeech(settings) && !isSonioxSpeech(settings) && !isGeminiSpeech(settings)) missing.push('ElevenLabs');
  // Gemini's key serves its speech and its translation alike, and is named once.
  if ((isGeminiSpeech(settings) || (provider === 'gemini' && !soniox)) && !String(settings.geminiKey || '').trim()) missing.push('Gemini');
  if (isOpenAISpeech(settings)) {
    const stt = settings.oaiSttServer || 'openai';
    // With Soniox listening, only the voice is needed from here.
    if (!soniox && stt === 'openai' && !String(settings.oaiSttKey || settings.openaiKey || '').trim()) missing.push('OpenAI');
    if (!soniox && stt === 'groq' && !String(settings.oaiSttKey || settings.groqKey || '').trim()) missing.push('Groq');
    if ((settings.oaiTtsServer || 'openai') === 'openai' && !String(settings.oaiTtsKey || settings.openaiKey || '').trim() && !missing.includes('OpenAI')) missing.push('OpenAI');
  }
  // Soniox translates too: the translation service is not used.
  if (soniox) return missing;
  if (provider === 'claude' && !settings.anthropicKey) missing.push('Anthropic');
  if (provider === 'openrouter' && !String(settings.openrouterKey || '').trim()) missing.push('OpenRouter');
  // OpenAI itself needs a key; a server of one's own with the same API may not.
  if (provider === 'openai' && !String(settings.openaiKey || '').trim()) missing.push('OpenAI');
  return missing;
}

// What else the chosen setup needs: a server address or a model ('ollama', 'speech', 'model').
export function missingServers(settings) {
  const missing = [];
  const provider = translationProvider(settings);
  if (provider === 'ollama' && !(String(settings.ollamaUrl || '').trim() && String(settings.ollamaModel || '').trim())) missing.push('ollama');
  if (provider === 'compatible' && !String(settings.compatibleUrl || '').trim()) missing.push('compatible');
  if ((provider === 'openai' || provider === 'compatible') && !String(settings[`${provider}Model`] || '').trim()) missing.push('model');
  if (provider === 'openrouter' && !String(settings.openrouterModel || '').trim()) missing.push('model');
  if (provider === 'gemini' && !String(settings.geminiModel || '').trim()) missing.push('model');
  if (isLocalSpeech(settings) && !String(settings.localSpeechUrl || '').trim()) missing.push('speech');
  if (isOpenAISpeech(settings) && ((settings.oaiSttServer === 'custom' && !String(settings.oaiSttUrl || '').trim()) || (settings.oaiTtsServer === 'custom' && !String(settings.oaiTtsUrl || '').trim()))) missing.push('speech');
  return missing;
}

export function parseKeyterms(text) {
  return String(text || '')
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 50);
}
