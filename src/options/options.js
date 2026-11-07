import {
  loadSettings,
  saveSettings,
  translationProvider,
  claudeModelOf,
  isLocalSpeech,
  isOpenAISpeech,
  missingKeys,
  missingServers,
  PROVIDERS,
  CLAUDE_MODELS,
  TTS_MODELS,
  OPENAI_URL,
  OPENROUTER_URL,
} from '../shared/settings.js';
import { LANGUAGES, AUTO_LANGUAGE } from '../shared/languages.js';
import { setLanguage, t, applyI18n, languageLabel, UI_LANGUAGES } from '../shared/i18n.js';
import { listVoices, createVoiceClone, deleteVoice, speechStream, describeElevenLabsError, speechAccount, fetchScribeToken, realtimeUrl, speechHealth, speechModels, SPEECH_PROTOCOL } from '../shared/elevenlabs.js';
import { Translator, describeClaudeError } from '../offscreen/translator.js';
import { FreeTranslator, checkFreeKey, freeKeys, FREE_KEY_NAMES } from '../offscreen/free-translator.js';
import { OllamaTranslator, listOllamaModels } from '../offscreen/ollama-translator.js';
import { OpenAITranslator, listOpenAIModels } from '../offscreen/openai-translator.js';
import { OpenAITranscriber, openaiSynthesize, listAudioModels, listAudioVoices } from '../offscreen/openai-speech.js';
import { StreamResampler } from '../shared/dsp.js';
import { serverBase, originPattern, originRules } from '../shared/servers.js';
import { localPairs, localTranslationState, prepareLocalTranslation } from '../shared/local-translation.js';
import { PcmByteAligner, encodeWav, float32ToInt16 } from '../shared/pcm.js';
import { PcmScheduler } from '../shared/scheduler.js';

const $ = (id) => document.getElementById(id);

// The text to read for a voice clone, in the language the person speaks (English otherwise).
const READING_TEXTS = {
  tr:
    'Merhaba, bu kaydı sesimi tanıtmak için yapıyorum. Günlük hayatta insanlarla konuşmayı, yeni fikirleri tartışmayı ve birlikte bir şeyler üretmeyi seviyorum. ' +
    'Toplantılarda genellikle sakin ve anlaşılır konuşurum, ama heyecanlandığımda biraz hızlanırım. Bazen bir soru sorarım, değil mi? Bazen de bir şeyi net bir şekilde açıklarım. ' +
    'Sayıları ve tarihleri de söyleyeyim: on iki Mart, saat on dört otuz, yüz yirmi beş lira. Bir projeyi anlatırken önce amacını, sonra nasıl çalıştığını söylerim. Teşekkür ederim.',
  en:
    "Hello, I'm making this recording so my voice can be recognized. In everyday life I enjoy talking with people, discussing new ideas and building things together. " +
    "In meetings I usually speak calmly and clearly, but I speed up a little when I get excited. Sometimes I ask a question, don't I? Other times I explain something plainly. " +
    'Let me say some numbers and dates too: the twelfth of March, half past two in the afternoon, one hundred and twenty-five dollars. When I describe a project, I first explain its goal, then how it works. Thank you.',
};

// A sentence to translate in the tests, and to hear a voice say.
const SAMPLE = { text: 'Good morning, everyone. Shall we begin?', from: 'en' };
const PREVIEW_TEXT = {
  tr: 'Merhaba! Çeviriyi bu sesle duyacaksınız.',
  en: 'Hello! This is how the translated voice will sound.',
  de: 'Hallo! So klingt die übersetzte Stimme.',
  fr: 'Bonjour ! Voici la voix traduite.',
  es: '¡Hola! Así sonará la voz traducida.',
  zh: '你好！这就是翻译语音的声音。',
};

let settings;
let voices = [];
let localState = 'unknown';
let localSpeechInfo = null; // what the local speech server offers (/v1/models)

// ---- small helpers ---------------------------------------------------------------------

function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 1600);
}

function result(id, text, kind = '') {
  const el = $(id);
  el.textContent = text;
  el.className = `result ${kind}`;
}

let pending = {};
let saveTimer;
function save(patch, { quiet = false } = {}) {
  Object.assign(settings, patch);
  pending = { ...pending, ...patch };
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 300);
  if (!quiet) refreshStatus();
}

async function flushSave() {
  clearTimeout(saveTimer);
  const batch = pending;
  pending = {};
  if (Object.keys(batch).length) {
    await saveSettings(batch);
    toast(t('opt.saved'));
  }
}

function fillSelect(select, items, value) {
  select.replaceChildren(...items.map(([v, label]) => new Option(label, v, false, v === value)));
  if (value !== undefined) select.value = value;
}

function bindText(id, onChange) {
  const el = $(id);
  el.value = settings[id] ?? '';
  el.addEventListener('input', () => {
    save({ [id]: el.value.trim() });
    onChange?.();
  });
}

function bindSelect(id, { parse = (v) => v, onChange } = {}) {
  const el = $(id);
  el.addEventListener('change', () => {
    save({ [id]: parse(el.value) });
    onChange?.();
  });
}

function bindCheck(id) {
  const el = $(id);
  el.checked = Boolean(settings[id]);
  el.addEventListener('change', () => save({ [id]: el.checked }));
}

function bindSlider(id) {
  const el = $(id);
  const out = el.parentElement.querySelector('output');
  const show = () => (out.textContent = `${Math.round(Number(el.value) * 100)}%`);
  el.value = String(settings[id]);
  show();
  el.addEventListener('input', () => {
    show();
    save({ [id]: Number(el.value) }, { quiet: true });
  });
}

// Access to a server typed into the settings is asked for on a click.
async function allow(base) {
  const origins = [originPattern(base)];
  if (await chrome.permissions.contains({ origins })) return true;
  return chrome.permissions.request({ origins }).catch(() => false);
}

// ---- status ----------------------------------------------------------------------------

async function micGranted() {
  try {
    return (await navigator.permissions.query({ name: 'microphone' })).state;
  } catch {
    return 'prompt';
  }
}

async function refreshStatus() {
  const provider = translationProvider(settings);
  const missing = [...missingKeys(settings), ...missingServers(settings)];
  const speechOk = isLocalSpeech(settings) || isOpenAISpeech(settings) ? !missing.includes('speech') && !(isOpenAISpeech(settings) && missing.some((m) => m === 'Groq')) : !missing.includes('ElevenLabs');
  const translationOk =
    provider === 'free' ? localState === 'ready' || FREE_KEY_NAMES.some((k) => settings[k]) : !missing.some((m) => m !== 'ElevenLabs' && m !== 'speech');
  const speechName = isLocalSpeech(settings) ? t('opt.speech.local') : isOpenAISpeech(settings) ? t('opt.speech.openai') : 'ElevenLabs';
  $('check-speech').textContent = `${t('opt.speech.title')}: ${speechName}`;
  $('check-translation').textContent = `${t('opt.tr.title')}: ${t(PROVIDERS.find((p) => p.id === provider).labelKey)}`;
  $('check-speech').classList.toggle('done', speechOk);
  $('check-translation').classList.toggle('done', translationOk);
  $('check-mic').classList.toggle('done', (await micGranted()) === 'granted');
}

// ---- translation -----------------------------------------------------------------------

function renderProvider() {
  const provider = translationProvider(settings);
  $('translationProvider').value = provider;
  for (const box of document.querySelectorAll('[data-provider]')) box.hidden = box.dataset.provider !== provider;
  result('translationResult', '');
  if (provider === 'free') renderFree();
  else loadModels(provider, { quiet: true });
}

// The model lists: what each server offers, filled into its select. The chosen model
// stays in the list even before the server has answered.
const PICKERS = {
  openai: { select: 'openaiModel', setting: 'openaiModel' },
  openrouter: { select: 'openrouterModel', setting: 'openrouterModel' },
  ollama: { select: 'ollamaModel', setting: 'ollamaModel', url: 'ollamaUrl' },
  ollamaBackup: { select: 'ollamaBackupModel', setting: 'ollamaBackupModel', url: 'ollamaBackupUrl' },
};

function fillModels(kind, models) {
  const { select, setting } = PICKERS[kind];
  const current = settings[setting] || '';
  const items = models.map((m) => [m.id, describeModel(m)]);
  if (current && !items.some(([id]) => id === current)) items.unshift([current, current]);
  if (!current) items.unshift(['', t('opt.models.pick')]);
  fillSelect($(select), items, current);
}

function describeModel(m) {
  const extra = [m.name, m.params, m.size ? `${(m.size / 1e9).toFixed(1)} GB` : ''].filter(Boolean).join(', ');
  return extra ? `${m.id} (${extra})` : m.id;
}

// quiet: on opening the page, without asking for access or showing errors.
async function loadModels(kind, { quiet = false } = {}) {
  if (!PICKERS[kind]) return;
  fillModels(kind, []);
  try {
    let models;
    if (kind === 'openrouter') {
      models = await listOpenAIModels({ base: OPENROUTER_URL });
    } else if (kind === 'openai') {
      const base = serverBase(settings.openaiUrl, { defaultPort: '' }) || OPENAI_URL;
      if (base !== OPENAI_URL && !(quiet ? await chrome.permissions.contains({ origins: [originPattern(base)] }) : await allow(base))) return;
      if (base === OPENAI_URL && !settings.openaiKey) return;
      models = await listOpenAIModels({ base, key: settings.openaiKey });
    } else {
      const base = serverBase(settings[PICKERS[kind].url]);
      if (!base) return;
      if (!(quiet ? await chrome.permissions.contains({ origins: [originPattern(base)] }) : await allow(base))) return;
      await applyOriginRules();
      models = await listOllamaModels(base);
    }
    fillModels(kind, models);
    if (!quiet) result('translationResult', t('opt.models.found', { n: models.length }), 'ok');
  } catch (err) {
    if (!quiet) result('translationResult', err?.message || String(err), 'bad');
  }
}

// Ollama refuses POSTs with an Origin it does not know; the rule normally follows the
// saved settings, but a test from this page must not wait for that.
async function applyOriginRules() {
  await flushSave();
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [100], addRules: originRules(settings, chrome.runtime.id) }).catch(() => {});
}

function sampleTarget() {
  return settings.myLanguage === 'en' ? settings.theirLanguage : settings.myLanguage;
}

// One sentence through the chosen service, timed.
async function testTranslation() {
  const provider = translationProvider(settings);
  const missing = [...missingKeys(settings), ...missingServers(settings)].filter((m) => m !== 'ElevenLabs' && m !== 'speech');
  if (missing.length) return result('translationResult', t('opt.test.missing'), 'bad');
  result('translationResult', t('opt.testing'));
  const common = { myLanguage: settings.myLanguage, theirLanguage: settings.theirLanguage };
  const job = { ...SAMPLE, to: sampleTarget(), history: [] };
  const lines = [];
  let ok = true;
  const run = async (label, translator) => {
    try {
      await translator.verify();
      const started = performance.now();
      const pieces = [];
      for await (const piece of translator.translate(job)) pieces.push(piece);
      lines.push(t('opt.test.ok', { name: label, ms: Math.round(performance.now() - started), sample: pieces.join(' ') }));
    } catch (err) {
      ok = false;
      lines.push(`${label}: ${describeClaudeError(err)}`);
    }
  };
  if (provider === 'claude') {
    await run('Claude', new Translator({ ...common, apiKey: settings.anthropicKey, model: claudeModelOf(settings), maxRetries: 1 }));
  } else if (provider === 'openai' || provider === 'openrouter') {
    const openrouter = provider === 'openrouter';
    const base = openrouter ? OPENROUTER_URL : serverBase(settings.openaiUrl, { defaultPort: '' }) || OPENAI_URL;
    if (base !== OPENAI_URL && base !== OPENROUTER_URL && !(await allow(base))) return result('translationResult', t('opt.denied', { url: base }), 'bad');
    const label = t(openrouter ? 'provider.openrouter' : 'provider.openai');
    await run(label, new OpenAITranslator({ ...common, base, key: openrouter ? settings.openrouterKey : settings.openaiKey, model: openrouter ? settings.openrouterModel : settings.openaiModel, label }));
  } else if (provider === 'ollama') {
    const servers = [
      [t('server.ollama'), settings.ollamaUrl, settings.ollamaModel],
      [t('server.ollamaBackup'), settings.ollamaBackupUrl, settings.ollamaBackupModel],
    ].filter(([, url, model]) => serverBase(url) && model);
    for (const [, url] of servers) if (!(await allow(serverBase(url)))) return result('translationResult', t('opt.denied', { url: serverBase(url) }), 'bad');
    await applyOriginRules();
    for (const [label, url, model] of servers) await run(label, new OllamaTranslator({ ...common, url, model, label }));
  } else {
    const checks = await Promise.all(FREE_KEY_NAMES.filter((n) => settings[n]).map((n) => checkFreeKey(n, settings[n])));
    for (const c of checks) {
      lines.push(c.message);
      ok &&= c.ok;
    }
    await run(t('provider.free'), new FreeTranslator({ ...common, keys: freeKeys(settings) }));
  }
  result('translationResult', lines.join(' '), ok ? 'ok' : 'bad');
}

// ---- free translation ------------------------------------------------------------------

const LOCAL_STATE_TEXT = {
  ready: ['local.ready', 'ok'],
  download: ['local.download', ''],
  unavailable: ['local.unavailable', 'bad'],
  unsupported: ['local.unsupported', 'bad'],
};

function showLocalState(state) {
  localState = state;
  const [key, kind] = LOCAL_STATE_TEXT[state] || ['', ''];
  $('freeState').textContent = key ? t(key) : '';
  $('freeState').className = `pill ${kind}`;
  $('prepareFree').hidden = state !== 'download';
  refreshStatus();
}

async function renderFree() {
  if (translationProvider(settings) !== 'free') return;
  showLocalState(await localTranslationState(localPairs(settings)));
}

// Runs from a click: Chrome downloads language packs only after one.
async function prepareFree() {
  $('prepareFree').disabled = true;
  $('freeState').className = 'pill';
  $('freeState').textContent = t('local.preparing');
  const pairs = localPairs(settings);
  const prepared = prepareLocalTranslation(pairs, {
    onProgress: (loaded) => ($('freeState').textContent = t('local.preparingPct', { n: Math.round(loaded * 100) })),
  });
  const state = await Promise.race([prepared, new Promise((resolve) => setTimeout(() => resolve(localTranslationState(pairs)), 60000))]);
  $('prepareFree').disabled = false;
  showLocalState(state);
}

// ---- speech ----------------------------------------------------------------------------

function renderSpeech() {
  const provider = isLocalSpeech(settings) ? 'local' : isOpenAISpeech(settings) ? 'openai' : 'elevenlabs';
  $('speechProvider').value = provider;
  for (const box of document.querySelectorAll('[data-speech]')) box.hidden = box.dataset.speech !== provider;
  result('speechResult', '');
  if (provider === 'local') loadLocalSpeech({ quiet: true });
  else if (provider === 'openai') loadOpenAISpeech({ quiet: true });
  else loadVoices();
}

// ---- OpenAI's audio API ------------------------------------------------------------------

function renderCustomFields() {
  for (const el of document.querySelectorAll('[data-custom]')) el.hidden = settings[el.dataset.custom] !== 'custom';
  // Only OpenAI and Groq fall back to the key under Translation.
  $('oaiSttKey').placeholder = settings.oaiSttServer === 'custom' ? '' : t('opt.oaiSpeech.keyHint');
  $('oaiTtsKey').placeholder = settings.oaiTtsServer === 'custom' ? '' : t('opt.oaiSpeech.keyHint');
}

function fillChoice(id, items, current, fallback) {
  const list = [...new Set([...(current ? [current] : []), ...items])];
  fillSelect($(id), [['', t('opt.voice.auto') + (fallback ? ` (${fallback})` : '')], ...list.map((v) => [v, v])], current || '');
}

// The model and voice lists of the chosen servers. Servers of one's own are reached only
// once access to them has been given.
async function loadOpenAISpeech({ quiet = false } = {}) {
  renderCustomFields();
  const account = speechAccount(settings);
  fillChoice('oaiSttModel', [], settings.oaiSttModel, account.stt.model);
  fillChoice('oaiTtsModel', [], settings.oaiTtsModel, account.tts.model);
  fillChoice('oaiMyVoice', [], settings.oaiMyVoice, 'alloy');
  fillChoice('oaiTheirVoice', [], settings.oaiTheirVoice, 'nova');
  const reachable = async (base) => {
    if (!base) return false;
    if (/api\.openai\.com|api\.groq\.com/.test(base)) return true;
    return quiet ? chrome.permissions.contains({ origins: [originPattern(base)] }) : allow(base);
  };
  try {
    if (await reachable(account.stt.base) && (account.stt.key || settings.oaiSttServer === 'custom')) {
      fillChoice('oaiSttModel', await listAudioModels({ ...account.stt, kind: 'stt' }), settings.oaiSttModel, account.stt.model);
    }
    if (await reachable(account.tts.base) && (account.tts.key || settings.oaiTtsServer === 'custom')) {
      fillChoice('oaiTtsModel', await listAudioModels({ ...account.tts, kind: 'tts' }), settings.oaiTtsModel, account.tts.model);
      const voices = await listAudioVoices(account.tts);
      fillChoice('oaiMyVoice', voices, settings.oaiMyVoice, 'alloy');
      fillChoice('oaiTheirVoice', voices, settings.oaiTheirVoice, 'nova');
    }
  } catch (err) {
    if (!quiet) result('speechResult', err?.message || String(err), 'bad');
  }
}

// The whole way round: a sentence is spoken by the voice server and heard back by the
// recognition server.
async function testOpenAISpeech() {
  const account = speechAccount(settings);
  for (const base of [account.stt.base, account.tts.base]) {
    if (!base) return result('speechResult', t('opt.speech.noUrl'), 'bad');
    if (!/api\.openai\.com|api\.groq\.com/.test(base) && !(await allow(base))) return result('speechResult', t('opt.denied', { url: base }), 'bad');
  }
  const started = performance.now();
  const chunks = [];
  for await (const chunk of openaiSynthesize({ ...account.tts, voice: settings.oaiMyVoice || 'alloy', text: SAMPLE.text })) chunks.push(chunk);
  const ms = Math.round(performance.now() - started);
  const samples = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) for (let i = 0; i < c.length; i++) samples[at++] = c[i] / 32768;
  const resampler = new StreamResampler(24000, 16000);
  const audio = Float32Array.from([...resampler.process(samples), ...resampler.flush()]);
  let heard = '';
  const listener = new OpenAITranscriber({ name: 'test', ...account.stt, languageCode: 'en', onCommitted: (text) => (heard = text) });
  listener.stopped = false;
  await listener.request(audio);
  if (!heard) return result('speechResult', t('opt.oaiSpeech.nothing'), 'bad');
  result('speechResult', t('opt.oaiSpeech.ok', { seconds: (samples.length / 24000).toFixed(1), ms, heard }), 'ok');
}

function voiceOptions(placeholder) {
  const own = voices.filter((v) => v.category !== 'premade');
  const premade = voices.filter((v) => v.category === 'premade');
  const gender = (g) => (g === 'male' ? t('opt.voice.male') : g === 'female' ? t('opt.voice.female') : g);
  return [
    ['', placeholder],
    ...own.map((v) => [v.voice_id, t('opt.voice.yours', { name: v.name })]),
    ...premade.map((v) => [v.voice_id, `${v.name}${v.labels?.gender ? `, ${gender(v.labels.gender)}` : ''}`]),
  ];
}

function renderVoices() {
  const hint = settings.elevenLabsKey ? t('opt.voice.pickPlaceholder') : t('opt.voice.needKey');
  fillSelect($('myVoiceSelect'), voiceOptions(hint), settings.myVoiceId);
  fillSelect($('theirVoiceSelect'), voiceOptions(t('opt.their.auto')), settings.theirVoiceId);
}

async function loadVoices() {
  renderVoices();
  if (isLocalSpeech(settings) || !settings.elevenLabsKey) return;
  try {
    voices = await listVoices(settings.elevenLabsKey);
    renderVoices();
  } catch (err) {
    result('speechResult', describeElevenLabsError(err), 'bad');
  }
}

// The local server's models and voices. My voice speaks their language and theirs mine,
// so each list holds the voices of that language.
function renderLocalSpeech() {
  const info = localSpeechInfo;
  const models = info?.recognition?.models || [];
  const current = settings.localWhisperModel;
  const modelItems = [['', t('opt.speech.serverDefault', { model: info?.recognition?.default || '...' })], ...models.map((m) => [m, m])];
  if (current && !models.includes(current)) modelItems.push([current, current]);
  fillSelect($('localWhisperModel'), modelItems, current);
  const voiceList = (language) => [['', t('opt.voice.auto')], ...(info?.voices?.[language] || []).map((v) => [v, v])];
  fillSelect($('localMyVoice'), voiceList(settings.theirLanguage), settings.localMyVoice);
  fillSelect($('localTheirVoice'), voiceList(settings.myLanguage), settings.localTheirVoice);
  $('localMyVoiceLabel').textContent = t('opt.voice.mineIn', { language: languageLabel(settings.theirLanguage) });
  $('localTheirVoiceLabel').textContent = t('opt.voice.theirsIn', { language: languageLabel(settings.myLanguage) });
}

async function loadLocalSpeech({ quiet = false } = {}) {
  renderLocalSpeech();
  const account = speechAccount(settings);
  if (!account.base) return quiet ? undefined : result('speechResult', t('opt.speech.noUrl'), 'bad');
  if (!(quiet ? await chrome.permissions.contains({ origins: [originPattern(account.base)] }) : await allow(account.base))) {
    return quiet ? undefined : result('speechResult', t('opt.denied', { url: account.base }), 'bad');
  }
  try {
    localSpeechInfo = await speechModels(account);
    renderLocalSpeech();
  } catch (err) {
    if (!quiet) result('speechResult', describeElevenLabsError(err, account), 'bad');
  }
}

async function testSpeech() {
  result('speechResult', t('opt.testing'));
  if (isOpenAISpeech(settings)) {
    try {
      return await testOpenAISpeech();
    } catch (err) {
      return result('speechResult', err?.message || String(err), 'bad');
    }
  }
  if (!isLocalSpeech(settings)) {
    if (!settings.elevenLabsKey) return result('speechResult', t('opt.keys.elMissing'), 'bad');
    try {
      voices = await listVoices(settings.elevenLabsKey);
      renderVoices();
      return result('speechResult', t('opt.keys.elOk', { n: voices.length }), 'ok');
    } catch (err) {
      return result('speechResult', describeElevenLabsError(err), 'bad');
    }
  }
  const account = speechAccount(settings);
  if (!account.base) return result('speechResult', t('opt.speech.noUrl'), 'bad');
  if (!(await allow(account.base))) return result('speechResult', t('opt.denied', { url: account.base }), 'bad');
  try {
    const health = await speechHealth(account);
    localSpeechInfo = await speechModels(account).catch(() => null);
    renderLocalSpeech();
    const started = performance.now();
    const language = settings.theirLanguage;
    const response = await speechStream(account, { voiceId: settings.localMyVoice || 'local-1', text: PREVIEW_TEXT[language] || PREVIEW_TEXT.en, languageCode: language });
    const bytes = (await response.arrayBuffer()).byteLength;
    const speechMs = Math.round(performance.now() - started);
    const token = await fetchScribeToken(account);
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(`${realtimeUrl(account)}?token=${encodeURIComponent(token)}&audio_format=pcm_16000`);
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error(t('opt.speech.noSocket')));
      }, 6000);
      ws.onmessage = (event) => {
        const type = JSON.parse(event.data).message_type;
        clearTimeout(timer);
        ws.close();
        if (type === 'session_started') resolve();
        else reject(new Error(type));
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error(t('opt.speech.noSocket')));
      };
    });
    const old = !(health.protocol >= SPEECH_PROTOCOL);
    const text = t('opt.speech.ok', { version: health.version || '?', ms: speechMs, seconds: (bytes / 48000).toFixed(1) });
    result('speechResult', old ? `${text} ${t('lsp.old')}` : text, old ? 'bad' : 'ok');
  } catch (err) {
    result('speechResult', describeElevenLabsError(err, account), 'bad');
  }
}

let previewCtx;
async function preview(voiceId, languageCode) {
  const account = speechAccount(settings);
  if (account.kind === 'openai') return previewOpenAI(voiceId, languageCode);
  if (!account.key && !account.local) return toast(t('opt.voice.needKey'));
  if (!voiceId && !account.local) return toast(t('opt.voice.needVoice'));
  try {
    previewCtx ||= new AudioContext();
    await previewCtx.resume();
    const player = new PcmScheduler(previewCtx, previewCtx.destination);
    const response = await speechStream(account, {
      voiceId: voiceId || 'local-1',
      text: PREVIEW_TEXT[languageCode] || PREVIEW_TEXT.en,
      modelId: settings.ttsModel,
      languageCode,
    });
    const reader = response.body.getReader();
    const aligner = new PcmByteAligner();
    const id = `preview-${Date.now()}`;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const samples = aligner.push(value);
      if (samples.length) player.push(id, samples);
    }
    player.end(id);
  } catch (err) {
    toast(describeElevenLabsError(err, account));
  }
}

async function previewOpenAI(voice, languageCode) {
  const account = speechAccount(settings);
  try {
    previewCtx ||= new AudioContext();
    await previewCtx.resume();
    const player = new PcmScheduler(previewCtx, previewCtx.destination);
    const id = `preview-${Date.now()}`;
    for await (const chunk of openaiSynthesize({ ...account.tts, voice, text: PREVIEW_TEXT[languageCode] || PREVIEW_TEXT.en })) player.push(id, chunk);
    player.end(id);
  } catch (err) {
    toast(err?.message || String(err));
  }
}

// ---- my own voice (ElevenLabs clone) ---------------------------------------------------

async function createMyVoice(files) {
  if (!settings.elevenLabsKey) return result('myVoiceResult', t('opt.voice.needKey'), 'bad');
  result('myVoiceResult', t('opt.voice.creating'));
  const name = t('opt.voice.cloneName');
  try {
    const created = await createVoiceClone(settings.elevenLabsKey, {
      name,
      files,
      description: 'My own voice, cloned from my recording for live call translation.',
    });
    const previous = settings.myVoiceOwnedId;
    save({ myVoiceId: created.voice_id, myVoiceName: name, myVoiceOwnedId: created.voice_id });
    if (previous && previous !== created.voice_id) deleteVoice(settings.elevenLabsKey, previous).catch(() => {});
    await loadVoices();
    result('myVoiceResult', t('opt.voice.ready'), 'ok');
  } catch (err) {
    result('myVoiceResult', describeElevenLabsError(err), 'bad');
  }
}

let recorder = null;
let recordedWav = null;
let recordLabel = 'opt.voice.record';

async function toggleRecording() {
  if (recorder) {
    recorder.stop();
    return;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true } });
  } catch (err) {
    result('myVoiceResult', t('opt.voice.micFail', { name: err.name }), 'bad');
    return;
  }
  const chunks = [];
  recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const startedAt = Date.now();
  const timer = setInterval(() => {
    const s = Math.floor((Date.now() - startedAt) / 1000);
    $('recordTime').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    if (s >= 180) recorder?.stop();
  }, 250);
  recorder.onstop = async () => {
    clearInterval(timer);
    stream.getTracks().forEach((track) => track.stop());
    recorder = null;
    recordLabel = 'opt.voice.rerecord';
    $('recordBtn').textContent = t(recordLabel);
    $('recordBtn').classList.remove('recording');
    const seconds = (Date.now() - startedAt) / 1000;
    const blob = new Blob(chunks, { type: 'audio/webm' });
    $('recordPreview').src = URL.createObjectURL(blob);
    $('recordPreview').hidden = false;
    recordedWav = await toWav(blob);
    const enough = seconds >= 30;
    $('cloneRecording').disabled = !enough || !recordedWav;
    result('myVoiceResult', enough ? t('opt.voice.recordDone') : t('opt.voice.tooShort'), enough ? '' : 'bad');
  };
  recorder.start(1000);
  recordLabel = 'opt.voice.stopRecord';
  $('recordBtn').textContent = t(recordLabel);
  $('recordBtn').classList.add('recording');
  $('cloneRecording').disabled = true;
  result('myVoiceResult', t('opt.voice.recording'));
}

async function toWav(blob) {
  try {
    const ctx = new AudioContext();
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    await ctx.close();
    const mono = new Float32Array(buffer.length);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < data.length; i++) mono[i] += data[i] / buffer.numberOfChannels;
    }
    return new Blob([encodeWav(float32ToInt16(mono), buffer.sampleRate)], { type: 'audio/wav' });
  } catch {
    return null;
  }
}

// ---- microphone and devices ------------------------------------------------------------

async function grantMic() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
  } catch (err) {
    $('micState').textContent = t('opt.mic.denied', { name: err.name });
    $('micState').className = 'pill bad';
    return;
  }
  await refreshMic();
  await refreshDevices();
}

async function refreshMic() {
  const state = await micGranted();
  const el = $('micState');
  el.textContent = state === 'granted' ? t('opt.mic.granted') : state === 'denied' ? t('opt.mic.blocked') : t('opt.mic.notYet');
  el.className = `pill ${state === 'granted' ? 'ok' : state === 'denied' ? 'bad' : ''}`;
  $('grantMic').hidden = state === 'granted';
  refreshStatus();
}

async function refreshDevices() {
  const named = async (kind) => {
    if ((await micGranted()) !== 'granted') return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return [...new Map(devices.filter((d) => d.kind === kind && d.label && d.deviceId !== 'default' && d.deviceId !== 'communications').map((d) => [d.label, d])).values()];
  };
  fillSelect($('micDeviceLabel'), [['', t('opt.mic.sameAsMeet')], ...(await named('audioinput')).map((d) => [d.label, d.label])], settings.micDeviceLabel);
  fillSelect($('outputDeviceLabel'), [['', t('opt.mic.systemDefault')], ...(await named('audiooutput')).map((d) => [d.label, d.label])], settings.outputDeviceLabel);
}

// ---- start -----------------------------------------------------------------------------

// Everything on the page that depends on the interface language.
function renderTexts() {
  setLanguage(settings.uiLanguage);
  applyI18n();
  document.documentElement.lang = settings.uiLanguage;
  document.title = t('opt.title');
  $('version').textContent = `v${chrome.runtime.getManifest().version}`;
  fillSelect($('uiLanguage'), UI_LANGUAGES.map((l) => [l.code, l.name]), settings.uiLanguage);
  const languages = LANGUAGES.map((l) => [l.code, languageLabel(l.code)]);
  fillSelect($('myLanguage'), languages, settings.myLanguage);
  fillSelect($('theirLanguage'), languages, settings.theirLanguage);
  fillSelect($('mediaLanguage'), [[AUTO_LANGUAGE, languageLabel(AUTO_LANGUAGE)], ...languages], settings.mediaLanguage);
  fillSelect($('translationProvider'), PROVIDERS.map((p) => [p.id, t(p.labelKey)]), translationProvider(settings));
  fillSelect($('claudeModel'), CLAUDE_MODELS.map((m) => [m.id, t(m.labelKey)]), claudeModelOf(settings));
  fillSelect($('ttsModel'), TTS_MODELS.map((m) => [m.id, t(m.labelKey)]), settings.ttsModel);
  fillSelect($('cloneSeconds'), [30, 45, 60, 90].map((n) => [String(n), t('opt.their.secondsOption', { n })]), String(settings.cloneSeconds));
  $('vadSilenceSecs').value = String(settings.vadSilenceSecs);
  $('readingText').textContent = READING_TEXTS[settings.myLanguage] || READING_TEXTS.en;
  $('showKeys').textContent = t(document.querySelector('.key')?.type === 'password' ? 'opt.keys.show' : 'opt.keys.hide');
  $('recordBtn').textContent = t(recordLabel);
  for (const kind of Object.keys(PICKERS)) if (!$(PICKERS[kind].select).options.length) fillModels(kind, []);
  renderVoices();
  renderLocalSpeech();
  showLocalState(localState);
  refreshMic();
  refreshDevices();
}

async function init() {
  settings = await loadSettings();
  renderTexts();

  $('uiLanguage').addEventListener('change', async () => {
    settings = await saveSettings({ uiLanguage: $('uiLanguage').value });
    renderTexts();
    renderProvider();
  });
  $('showKeys').addEventListener('click', () => {
    const show = document.querySelector('.key').type === 'password';
    for (const el of document.querySelectorAll('.key')) el.type = show ? 'text' : 'password';
    $('showKeys').textContent = t(show ? 'opt.keys.hide' : 'opt.keys.show');
  });

  // Languages: the local voices and the free translation follow them.
  for (const id of ['myLanguage', 'theirLanguage', 'mediaLanguage']) {
    bindSelect(id, {
      onChange: () => {
        $('readingText').textContent = READING_TEXTS[settings.myLanguage] || READING_TEXTS.en;
        renderLocalSpeech();
        renderFree();
      },
    });
  }

  // Translation.
  bindSelect('translationProvider', {
    onChange: () => {
      // A Claude model left over from before the providers existed.
      if (translationProvider(settings) === 'claude' && claudeModelOf(settings) !== settings.claudeModel) save({ claudeModel: claudeModelOf(settings) });
      renderProvider();
    },
  });
  bindSelect('claudeModel');
  for (const id of ['anthropicKey', 'openaiUrl', 'openaiKey', 'openrouterKey', 'ollamaUrl', 'ollamaBackupUrl', ...FREE_KEY_NAMES, 'meetingContext', 'keyterms']) bindText(id);
  for (const kind of Object.keys(PICKERS)) bindSelect(PICKERS[kind].select);
  for (const button of document.querySelectorAll('[data-models]')) {
    if (button.dataset.models === 'speech' || button.dataset.models === 'oaiSpeech') continue;
    button.addEventListener('click', () => loadModels(button.dataset.models));
  }
  // A new address or key brings that server's list once typing stops.
  let reload;
  const later = (kind) => {
    clearTimeout(reload);
    reload = setTimeout(() => loadModels(kind, { quiet: true }), 900);
  };
  $('openaiUrl').addEventListener('input', () => later('openai'));
  $('openaiKey').addEventListener('input', () => later('openai'));
  $('ollamaUrl').addEventListener('change', () => loadModels('ollama'));
  $('ollamaBackupUrl').addEventListener('change', () => loadModels('ollamaBackup'));
  if (settings.ollamaBackupUrl) $('ollamaBackup').open = true;
  if (FREE_KEY_NAMES.some((id) => settings[id])) $('freeKeys').open = true;
  $('prepareFree').addEventListener('click', prepareFree);
  $('testTranslation').addEventListener('click', async () => {
    $('testTranslation').disabled = true;
    await testTranslation();
    $('testTranslation').disabled = false;
  });

  // Speech.
  bindSelect('speechProvider', { onChange: renderSpeech });
  for (const id of ['elevenLabsKey', 'localSpeechUrl', 'localSpeechKey']) bindText(id);
  $('elevenLabsKey').addEventListener('change', loadVoices);
  $('localSpeechUrl').addEventListener('change', () => loadLocalSpeech());
  bindSelect('ttsModel');
  for (const id of ['localWhisperModel', 'localMyVoice', 'localTheirVoice', 'oaiSttModel', 'oaiTtsModel', 'oaiMyVoice', 'oaiTheirVoice']) bindSelect(id);
  for (const id of ['oaiSttServer', 'oaiTtsServer']) {
    $(id).value = settings[id] || 'openai';
    bindSelect(id, { onChange: () => loadOpenAISpeech({ quiet: true }) });
  }
  for (const id of ['oaiSttUrl', 'oaiSttKey', 'oaiTtsUrl', 'oaiTtsKey']) bindText(id);
  for (const id of ['oaiSttUrl', 'oaiTtsUrl', 'oaiSttKey', 'oaiTtsKey']) $(id).addEventListener('change', () => loadOpenAISpeech());
  document.querySelectorAll('[data-models="oaiSpeech"]').forEach((b) => b.addEventListener('click', () => loadOpenAISpeech()));
  $('previewOaiMine').addEventListener('click', () => preview(settings.oaiMyVoice || 'alloy', settings.theirLanguage));
  $('previewOaiTheirs').addEventListener('click', () => preview(settings.oaiTheirVoice || 'nova', settings.myLanguage));
  document.querySelector('[data-models="speech"]').addEventListener('click', () => loadLocalSpeech());
  $('myVoiceSelect').addEventListener('change', () => {
    const voice = voices.find((v) => v.voice_id === $('myVoiceSelect').value);
    save({ myVoiceId: voice?.voice_id || '', myVoiceName: voice?.name || '' });
  });
  $('theirVoiceSelect').addEventListener('change', () => {
    const voice = voices.find((v) => v.voice_id === $('theirVoiceSelect').value);
    save({ theirVoiceId: voice?.voice_id || '', theirVoiceName: voice?.name || '' });
  });
  $('previewMine').addEventListener('click', () => preview(settings.myVoiceId, settings.theirLanguage));
  $('previewTheirs').addEventListener('click', () => preview(settings.theirVoiceId || voices.find((v) => v.category === 'premade')?.voice_id, settings.myLanguage));
  $('previewLocalMine').addEventListener('click', () => preview(settings.localMyVoice || 'local-1', settings.theirLanguage));
  $('previewLocalTheirs').addEventListener('click', () => preview(settings.localTheirVoice || 'local-2', settings.myLanguage));
  $('recordBtn').addEventListener('click', toggleRecording);
  $('cloneRecording').addEventListener('click', () => {
    if (recordedWav) createMyVoice([{ blob: recordedWav, filename: 'my-voice.wav' }]);
  });
  $('voiceFiles').addEventListener('change', () => {
    const files = [...$('voiceFiles').files].map((f) => ({ blob: f, filename: f.name }));
    if (files.length) createMyVoice(files);
  });
  bindSelect('cloneSeconds', { parse: Number });
  for (const id of ['offerTheirClone', 'deleteCloneAfter']) bindCheck(id);
  $('testSpeech').addEventListener('click', async () => {
    $('testSpeech').disabled = true;
    await testSpeech();
    $('testSpeech').disabled = false;
  });

  // Microphone and sound.
  $('grantMic').addEventListener('click', grantMic);
  for (const id of ['micDeviceLabel', 'outputDeviceLabel']) bindSelect(id);
  bindSelect('vadSilenceSecs', { parse: Number });
  for (const id of ['halfDuplex', 'showOverlay', 'subtitleBar', 'saveTranscripts']) bindCheck(id);
  for (const id of ['translationVolume', 'originalVolume', 'duckVolume', 'monitorVolume', 'stability', 'similarity']) bindSlider(id);
  navigator.mediaDevices.addEventListener('devicechange', refreshDevices);

  renderProvider();
  renderSpeech();
  refreshStatus();
}

init();
