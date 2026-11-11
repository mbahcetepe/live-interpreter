import { loadSettings, saveSettings, missingKeys, missingServers, isLocalSpeech, isOpenAISpeech, isSonioxSpeech } from '../shared/settings.js';
import { formatUsage } from '../shared/usage.js';
import { setLanguage, t, applyI18n, languageLabel, joinNames, locale, UI_LANGUAGES } from '../shared/i18n.js';
import { isSupportedUrl, isMediaUrl, platformForUrl } from '../shared/platforms.js';
import { describeMissingServers } from '../shared/setup-messages.js';

const $ = (id) => document.getElementById(id);

const HINT_KEYS = { incoming: 'popup.hint.in', outgoing: 'popup.hint.out' };

let settings;
let tab;
let state;
let siteAccess = true;

function setSeg(id, value) {
  for (const button of $(id).querySelectorAll('button')) {
    button.setAttribute('aria-checked', String(button.dataset.value === value));
  }
  const key = id === 'incoming' ? 'inHint' : 'outHint';
  $(key).textContent = t(`${HINT_KEYS[id]}.${value}`);
}

function notice(text, { bad = false, action } = {}) {
  const box = $('notice');
  box.hidden = !text;
  box.className = `notice${bad ? ' bad' : ''}`;
  box.replaceChildren();
  if (!text) return;
  box.append(document.createTextNode(text));
  if (action) {
    const button = document.createElement('button');
    button.textContent = action.label;
    button.addEventListener('click', action.run);
    box.append(document.createElement('br'), button);
  }
}

// Google Meet, Teams or Zoom on the web (src/shared/platforms.js).
const isMeet = () => isSupportedUrl(tab?.url);
// Any other web page: its sound (a video, a radio) is translated, nothing goes back into it.
const isMedia = () => isMediaUrl(tab?.url);
const canStart = () => isMeet() || isMedia();

function render() {
  const running = state.status === 'running' && state.tabId === tab?.id;
  const busy = state.status === 'starting';
  const elsewhere = state.status === 'running' && state.tabId !== tab?.id;
  const engine = running ? state.engine : null;
  const diagnostic = running && state.mode === 'diagnostic';

  const missing = missingKeys(settings);
  const servers = missingServers(settings);
  const toSettings = { label: t('popup.openSettings'), run: () => chrome.runtime.openOptionsPage() };
  if (state.status === 'error' && state.error) notice(state.error, { bad: true });
  else if (!canStart()) notice(t('popup.openMeet'));
  else if (missing.length && !running) notice(t('popup.keysMissing', { names: joinNames(missing) }), { action: toSettings });
  else if (servers.length && !running) notice(describeMissingServers(servers), { action: toSettings });
  else if (elsewhere) notice(t('popup.elsewhere'));
  else if (isMedia() && !running) notice(t('popup.mediaHint'));
  else notice('');

  // A video tab has only one direction, and no clone, recording or call test.
  const media = isMedia();
  $('outgoing').closest('.field').hidden = media;
  $('incoming').querySelector('[data-value="off"]').hidden = media;

  // The local speech server cannot clone a voice.
  $('consentRow').hidden = media || !settings.offerTheirClone || settings.incomingMode !== 'voice' || isLocalSpeech(settings) || isOpenAISpeech(settings) || isSonioxSpeech(settings);
  // A video with spoken translation can go without subtitles.
  $('mediaSubsRow').hidden = !media || settings.incomingMode !== 'voice';
  $('mediaSubs').checked = settings.mediaSubtitles !== false;
  // A recording has to be chosen before the start: the tab picture is captured then.
  $('recordRow').hidden = running || busy || media;

  const primary = $('primary');
  primary.disabled = busy || !canStart() || (!running && (missing.length > 0 || servers.length > 0));
  primary.textContent = busy ? t('popup.starting') : running ? (diagnostic ? t('popup.endTest') : t('popup.stop')) : media ? t('popup.startMedia') : t('popup.start');
  primary.classList.toggle('stop', running);
  $('test').hidden = running || media;
  $('test').disabled = busy || !isMeet();
  $('chime').hidden = !running;

  $('live').hidden = !running;
  if (engine) {
    const stt = Object.values(engine.stt || {}).filter((s) => s !== 'off');
    let text = t('popup.state.listening');
    if (diagnostic) text = engine.page?.connected ? t('popup.state.testOn') : t('popup.state.connecting');
    else if (stt.some((s) => s === 'connecting' || s === 'reconnecting')) text = t('popup.state.connecting');
    else if (engine.outgoingMode === 'voice' && engine.page?.muted) text = t('popup.state.mutedMeet');
    $('liveState').textContent = text;
    $('liveLatency').textContent =
      engine.latencyMs != null
        ? t('common.seconds', { n: (engine.latencyMs / 1000).toLocaleString(locale(), { maximumFractionDigits: 1 }) })
        : '-';
    $('liveUsage').textContent = diagnostic ? '-' : formatUsage(engine.usage);
  }
}

// The first start on Zoom asks for access to it; the page hook is put in from the next
// page load, so the tab has to be reloaded once.
async function askSiteAccess() {
  const site = platformForUrl(tab?.url);
  const granted = await chrome.permissions.request({ origins: site.origins }).catch(() => false);
  if (!granted) throw new Error(t('popup.siteDenied', { site: site.name }));
  siteAccess = true;
  notice(t('popup.siteReload', { site: site.name }), {
    action: { label: t('popup.reloadTab'), run: () => chrome.tabs.reload(tab.id).then(() => window.close()) },
  });
}

async function start(mode) {
  try {
    if (!siteAccess) return await askSiteAccess();
    notice('');
    // The stream id expires within seconds, so it is fetched last.
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
    const options =
      mode === 'diagnostic'
        ? { mode }
        : isMedia()
          ? { mode: 'media', incomingMode: settings.incomingMode === 'off' ? 'text' : settings.incomingMode }
          : { incomingMode: settings.incomingMode, outgoingMode: settings.outgoingMode, cloneConsent: $('consent').checked, record: $('record').checked };
    state = { ...state, status: 'starting' };
    render();
    const reply = await chrome.runtime.sendMessage({ type: 'start', tabId: tab.id, streamId, options });
    if (!reply?.ok) throw new Error(reply?.error || t('popup.startFailed'));
  } catch (err) {
    state = { ...state, status: 'error', error: err.message };
    render();
  }
}

// Static texts, the language pair labels and the mode hints, in the chosen language.
function applyLanguage(code) {
  setLanguage(code);
  applyI18n();
  $('version').textContent = `v${chrome.runtime.getManifest().version}`;
  $('uiLanguage').replaceChildren(...UI_LANGUAGES.map((l) => new Option(l.code.toUpperCase(), l.code, false, l.code === code)));
  const mine = languageLabel(settings.myLanguage);
  const theirs = languageLabel(settings.theirLanguage);
  $('pair').textContent = `${theirs} ↔ ${mine}`;
  // A video tab speaks its own language, or one found as it plays.
  const tabLanguage = languageLabel(settings.mediaLanguage || 'auto');
  $('inLabel').textContent = isMedia() ? t('popup.mediaLabel', { from: tabLanguage, to: mine }) : t('popup.inLabel', { from: theirs, to: mine });
  if (isMedia()) $('pair').textContent = `${tabLanguage} → ${mine}`;
  $('outLabel').textContent = t('popup.outLabel', { from: mine, to: theirs });
  setSeg('incoming', settings.incomingMode);
  setSeg('outgoing', settings.outgoingMode);
}

async function changeMode(kind, value) {
  settings = await saveSettings({ [kind]: value });
  setSeg(kind === 'incomingMode' ? 'incoming' : 'outgoing', value);
  if (state.status === 'running') chrome.runtime.sendMessage({ type: 'options', options: { [kind]: value } }).catch(() => {});
  render();
}

async function init() {
  const [loaded, tabs, session] = await Promise.all([
    loadSettings(),
    chrome.tabs.query({ active: true, currentWindow: true }),
    chrome.storage.session.get('state'),
  ]);
  settings = loaded;
  tab = tabs[0];
  state = session.state || { status: 'idle' };
  // Zoom's access is asked for on the first start there; known now, so the request can
  // be made straight from the click (Chrome allows it only during a click).
  const site = platformForUrl(tab?.url);
  if (site?.optional) siteAccess = await chrome.permissions.contains({ origins: site.origins }).catch(() => false);

  applyLanguage(settings.uiLanguage);
  $('consent').checked = Boolean(state.status === 'running' && state.engine?.cloneConsent);
  $('uiLanguage').addEventListener('change', async () => {
    settings = await saveSettings({ uiLanguage: $('uiLanguage').value });
    applyLanguage(settings.uiLanguage);
    render();
  });
  for (const button of $('incoming').querySelectorAll('button')) {
    button.addEventListener('click', () => changeMode('incomingMode', button.dataset.value));
  }
  for (const button of $('outgoing').querySelectorAll('button')) {
    button.addEventListener('click', () => changeMode('outgoingMode', button.dataset.value));
  }
  $('consent').addEventListener('change', () => {
    if (state.status === 'running') {
      chrome.runtime.sendMessage({ type: 'options', options: { cloneConsent: $('consent').checked } }).catch(() => {});
    }
  });
  $('mediaSubs').addEventListener('change', async () => {
    settings = await saveSettings({ mediaSubtitles: $('mediaSubs').checked });
    render();
  });
  $('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('primary').addEventListener('click', async () => {
    if (state.status === 'running' && state.tabId === tab.id) {
      await chrome.runtime.sendMessage({ type: 'stop' }).catch(() => {});
    } else {
      await start('translate');
    }
  });
  $('test').addEventListener('click', () => start('diagnostic'));
  $('records').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('recording.html') }));
  $('chime').addEventListener('click', () => chrome.runtime.sendMessage({ type: 'chime' }).catch(() => {}));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes.state) {
      state = changes.state.newValue || { status: 'idle' };
      render();
    }
    if (area === 'local' && changes.settings) {
      const language = settings.uiLanguage;
      settings = { ...settings, ...changes.settings.newValue };
      if (settings.uiLanguage !== language) applyLanguage(settings.uiLanguage);
      render();
    }
  });
  render();
}

init();
