// The engine runs in the extension's offscreen document for the length of a call.
//
//   Meet tab audio  -> Scribe (their language) -> Claude -> ElevenLabs -> my speakers
//   my microphone   -> Scribe (my language)    -> Claude -> ElevenLabs -> Meet tab -> the call
//
// With free translation chosen, the free services in free-translator.js take Claude's place.
//
// Offscreen documents only get chrome.runtime, so settings arrive from the service
// worker with each message, and everything for the Meet tab goes through a port the
// tab's content script opens.

import { PROVIDERS, isSoniox, whisperModelFor, isFreeTranslation, isOllamaTranslation, translationProvider, claudeModelOf, missingKeys, missingServers, parseKeyterms, OPENAI_URL, OPENROUTER_URL } from '../shared/settings.js';
import { OpenAITranslator, openaiRestMs } from './openai-translator.js';
import { serverBase } from '../shared/servers.js';
import { OllamaTranslator, ollamaRestMs } from './ollama-translator.js';
import { listVoices, createVoiceClone, deleteVoice, describeElevenLabsError, speechAccount, speechHealth, speechModels, SPEECH_PROTOCOL } from '../shared/elevenlabs.js';
import { PcmScheduler, testChime } from '../shared/scheduler.js';
import { int16ToBase64 } from '../shared/pcm.js';
import { EchoGuard, EarlySentences, isOnlyPunctuation } from '../shared/text.js';
import { AUTO_LANGUAGE, languageByCode } from '../shared/languages.js';
import { Usage } from '../shared/usage.js';
import { sanitizePageState } from '../shared/page-state.js';
import { describeMissingServers } from '../shared/setup-messages.js';
import { cleanModes } from '../background/message-policy.js';
import { ScribeRealtime } from './stt.js';
import { SonioxSession, sonioxConfig } from './soniox.js';
import { OpenAITranscriber, openaiSynthesize, listAudioModels } from './openai-speech.js';
import { Translator, describeClaudeError, claudeRestMs } from './translator.js';
import { FreeTranslator, freeKeys } from './free-translator.js';
import { FallbackTranslator } from './fallback-translator.js';
import { synthesize } from './tts.js';
import { DirectionPipeline, History, Speaker } from './pipeline.js';
import { CloneCollector } from './voice-clone.js';
import { saveChunk, saveRecording, recordingChunks, saveTranscript } from '../shared/recordings.js';
import { TranscriptLog } from '../shared/transcript.js';
import { speechText, displayText, parseLexicon } from '../shared/pronounce.js';
import { DebugSink, debugSinkUrl } from './debug-sink.js';

// The debug copy is compiled in only by `npm run build:debug`; a normal build ignores
// the page's request for it.
const DEBUG_BUILD = typeof __DEBUG_SINK__ !== 'undefined' && __DEBUG_SINK__;
import { setLanguage, t, joinNames, locale } from '../shared/i18n.js';

class UserError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

// A debug build also copies the log to the local debug sink (debug-sink.js).
let logSink = null;

function log(level, ...args) {
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn('[tercuman]', ...args);
  logSink?.event({ kind: 'log', level, text: args.map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' ') });
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
}

async function findDevice(kind, label) {
  if (!label) return null;
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.find((d) => d.kind === kind && d.label === label)?.deviceId || null;
}

// Soniox's refusals, in words that say what to do.
const languageName = (code) => languageByCode(code)?.english || code;

function describeSonioxError(err) {
  if (err?.status === 402 || /balance/i.test(err?.type || '')) return t('soniox.balance');
  if (err?.status === 401 || /api_key|unauthorized/i.test(`${err?.type} ${err?.message}`)) return t('soniox.key');
  return t('soniox.stopped', { message: err?.message || String(err) });
}

function describeSttFatal(err, cause) {
  if (cause) return describeElevenLabsError(cause);
  switch (err.type) {
    case 'auth_error':
      return t('stt.auth');
    case 'quota_exceeded':
      return t('stt.quota');
    case 'unaccepted_terms':
      return t('stt.terms');
    default:
      return t('stt.stopped', { message: err.message });
  }
}

// Behind Ollama, OpenAI or OpenRouter stands Claude (when a key is set), in its fastest
// model: it only translates the sentences the chosen service could not.
const OLLAMA_BACKUP_CLAUDE = 'claude-haiku-5-5';

// What decides which translators are made; a change rebuilds them mid-call.
function translationSetup(s) {
  const provider = translationProvider(s);
  if (provider === 'free' || provider === 'claude') return provider;
  if (provider === 'ollama') return ['ollama', serverBase(s.ollamaUrl), s.ollamaModel, serverBase(s.ollamaBackupUrl), s.ollamaBackupModel, Boolean(s.anthropicKey)].join('|');
  return [provider, s.openaiUrl, s.openaiKey, s.openaiModel, s.openrouterKey, s.openrouterModel, Boolean(s.anthropicKey)].join('|');
}

// How loud a video stays while its spoken translation plays.
const MEDIA_DUCK = 0.2;

const MUTE_IDLE_MS = 20000;
const START_TIMEOUT_MS = 20000;
// After the call has been joined, this long without a connected call (left, or kicked
// out) ends the translation, so nothing keeps listening and billing on Meet's goodbye
// screen. Long enough for a reload and a click on Join to bring the call back.
const CALL_GONE_MS = 30000;

let session = null;

// Read-only handle for DevTools and the live Meet test, which records what the user
// hears. Web pages cannot reach the offscreen document.
Object.defineProperty(globalThis, '__tercuman', { value: Object.freeze({ get session() { return session; } }) });

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.target !== 'offscreen') return false;
  // Only the service worker and the extension's own pages drive the engine; a content
  // script (which reports the call page's address) never does.
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return false;
  handle(msg).then(sendResponse, (err) => sendResponse({ ok: false, error: err?.message || String(err), code: err?.code }));
  return true;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'meet-tab') return;
  if (!session || port.sender?.tab?.id !== session.tabId) {
    port.disconnect();
    return;
  }
  session.attachTab(port);
});

async function handle(msg) {
  switch (msg.type) {
    case 'start': {
      if (session) {
        const old = session;
        session = null;
        await old.stop();
      }
      const next = new Session(msg);
      session = next;
      try {
        await next.start();
      } catch (err) {
        await next.stop();
        if (session === next) session = null;
        throw err;
      }
      return { ok: true, status: next.status() };
    }
    case 'stop': {
      const current = session;
      session = null;
      if (current) await current.stop();
      return { ok: true };
    }
    case 'options':
      session?.setOptions(msg.options || {});
      return { ok: true, status: session?.status() ?? null };
    case 'settings':
      session?.updateSettings(msg.settings);
      return { ok: true };
    case 'chime':
      session?.sendChime();
      return { ok: true };
    case 'status':
      return { ok: true, status: session?.status() ?? null };
    default:
      return { ok: false, error: `unknown message ${msg.type}` };
  }
}

class Session {
  constructor({ tabId, streamId, settings, options = {}, tab = {} }) {
    this.tabInfo = tab;
    setLanguage(settings.uiLanguage);
    this.tabId = tabId;
    this.streamId = streamId;
    this.settings = settings;
    this.diagnostic = options.mode === 'diagnostic';
    // A video, radio or any other tab: only its sound is translated, with no microphone.
    this.media = options.mode === 'media';
    this.incomingMode = this.diagnostic ? 'off' : options.incomingMode || settings.incomingMode;
    if (this.media && this.incomingMode === 'off') this.incomingMode = 'text';
    this.outgoingMode = this.diagnostic || this.media ? 'off' : options.outgoingMode || settings.outgoingMode;
    this.cloneConsent = Boolean(options.cloneConsent);
    this.recordRequested = Boolean(options.record);
    this.tabPort = null;
    this.page = { muted: true, senders: 0, micLabel: '', ctxState: 'unknown', backlog: 0, playing: false };
    this.levels = { tab: 0, mic: 0 };
    this.stt = { in: 'off', out: 'off' };
    // ElevenLabs, or the person's own local speech server (speech-server/).
    this.speech = speechAccount(settings);
    // The local server costs nothing; OpenAI's and Groq's prices are not in the estimate.
    this.usage = new Usage({ freeSpeech: this.speech.local || this.speech.kind === 'openai' });
    this.latencies = [];
    // The delay in its parts, for the panel: waiting for the speech to end, the first
    // translated words, the first sound of the voice (last few segments each).
    this.stages = { listen: [], translate: [], voice: [] };
    this.lastPartialAt = { in: 0, out: 0 };
    this.warnings = new Map();
    this.clone = { state: 'off' };
    this.error = null;
    this.stopped = false;
  }

  async start() {
    const s = this.settings;
    if (!this.diagnostic) {
      const missing = missingKeys(s);
      if (missing.length) throw new UserError(t('err.keysMissing', { names: joinNames(missing) }), 'keys');
      const servers = missingServers(s);
      if (servers.length) throw new UserError(describeMissingServers(servers), 'servers');
    }

    this.ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 });
    if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});
    await this.ctx.audioWorklet.addModule(chrome.runtime.getURL('capture-worklet.js'));
    await this.applyOutputDevice();
    this.silentSink = this.ctx.createGain();
    this.silentSink.gain.value = 0;
    this.silentSink.connect(this.ctx.destination);

    // A captured tab goes quiet for the user, so its audio is routed back to the
    // speakers here, at a level that dips while a translation is speaking.
    this.tabStream = await this.captureTab();
    const tabSource = this.ctx.createMediaStreamSource(this.tabStream);
    this.tabSource = tabSource;
    this.originalGain = this.ctx.createGain();
    this.originalGain.gain.value = this.originalLevel(false);
    tabSource.connect(this.originalGain).connect(this.ctx.destination);
    this.tabNode = this.captureNode((m) => this.onTabChunk(m));
    tabSource.connect(this.tabNode);
    this.tabStream.getAudioTracks()[0]?.addEventListener('ended', () => {
      // Closing the tab ends the capture too, and the service worker stops the session for
      // that at once. Only a capture that ends while the tab is still there is a failure.
      setTimeout(() => this.fail(new UserError(t('err.tabEnded'), 'tab-ended')), 1500);
    });

    this.translationGain = this.ctx.createGain();
    this.translationGain.gain.value = s.translationVolume;
    this.translationGain.connect(this.ctx.destination);
    this.localPlayer = new PcmScheduler(this.ctx, this.translationGain, { onPlayingChange: () => this.updateDucking() });
    this.monitorGain = this.ctx.createGain();
    this.monitorGain.gain.value = s.monitorVolume;
    this.monitorGain.connect(this.ctx.destination);
    this.monitorPlayer = new PcmScheduler(this.ctx, this.monitorGain);

    if (!this.media) await this.openMic();
    if (!this.diagnostic) await this.startTranslation();
    if (this.recordRequested) this.startRecording();

    this.statusTimer = setInterval(() => this.report(), 1000);
    this.report();
  }

  captureNode(onMessage) {
    const node = new AudioWorkletNode(this.ctx, 'capture-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { targetRate: 16000, chunkMs: 100 },
    });
    node.port.onmessage = (event) => onMessage(event.data);
    node.connect(this.silentSink);
    return node;
  }

  async captureTab() {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: this.streamId } },
        // A tab can be captured only once, so the picture for a recording comes now or never.
        video: this.recordRequested
          ? { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: this.streamId, maxWidth: 1920, maxHeight: 1080, maxFrameRate: 30 } }
          : false,
      });
    } catch (err) {
      throw new UserError(t('err.tabCapture', { name: err.name || err.message }), 'tab-capture');
    }
  }

  async openMic(preferredLabel) {
    const label = this.settings.micDeviceLabel || preferredLabel || this.page.micLabel;
    const deviceId = await findDevice('audioinput', label);
    const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 };
    if (deviceId) audio.deviceId = { exact: deviceId };
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio });
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
        throw new UserError(t('err.micPermission'), 'mic-permission');
      }
      if (!deviceId) throw new UserError(t('err.mic', { name: err.name }), 'mic');
      delete audio.deviceId;
      stream = await navigator.mediaDevices.getUserMedia({ audio });
    }
    this.micSource?.disconnect();
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = stream;
    this.micLabel = stream.getAudioTracks()[0]?.label || '';
    this.micSource = this.ctx.createMediaStreamSource(stream);
    if (!this.micNode) this.micNode = this.captureNode((m) => this.onMicChunk(m));
    this.micSource.connect(this.micNode);
    if (this.recordMicGain) this.micSource.connect(this.recordMicGain);
  }

  // When Meet uses a different microphone than ours, switch to the same one.
  async followMeetMic(label) {
    if (this.switchingMic || this.settings.micDeviceLabel || label === this.micLabel) return;
    this.switchingMic = true;
    try {
      if (await findDevice('audioinput', label)) await this.openMic(label);
    } catch (err) {
      log('warn', 'could not follow the Meet microphone', err);
    } finally {
      this.switchingMic = false;
    }
  }

  async applyOutputDevice() {
    const label = this.settings.outputDeviceLabel;
    if (!label || typeof this.ctx.setSinkId !== 'function') return;
    const id = await findDevice('audiooutput', label);
    if (id) await this.ctx.setSinkId(id).catch((err) => log('warn', 'setSinkId', err));
  }

  async startTranslation() {
    const s = this.settings;
    const keyterms = parseKeyterms(s.keyterms);
    // With Soniox the speech comes back translated; no translator is needed.
    this.translator = isSoniox(s) ? null : this.createTranslator(s);

    // Check the keys before the call depends on them, so a bad key shows up now.
    await withTimeout(Promise.all([this.translator ? this.verifyTranslator() : null, this.resolveVoices()]), START_TIMEOUT_MS).catch((err) => {
      throw err.message === 'timeout' ? new UserError(t('err.startTimeout'), 'timeout') : err;
    });

    this.history = new History(12);
    this.early = { in: new EarlySentences(), out: new EarlySentences() };
    this.sentGuard = new EchoGuard(); // my translated voice, in their language
    this.playedGuard = new EchoGuard(); // their translated voice, in my language

    this.incoming = new DirectionPipeline({
      dir: 'in',
      from: this.sourceLanguage(s),
      media: this.media,
      to: s.myLanguage,
      translator: this.translator,
      history: this.history,
      echoGuard: this.sentGuard,
      speaker: new Speaker({
        synth: (item) => this.speak(item, 'in'),
        sink: this.localSink(),
        onFirstAudio: (item) => this.onFirstAudio(item),
        onSpoken: (item, when) => this.playedGuard.remember(displayText(item.text), when),
        onError: (item, err) => this.onSpeechError('in', item, err),
        onDropped: (item) => log('info', `speech ${item.id} dropped: too far behind`),
      }),
      emit: (e) => this.caption('in', e),
      describeError: describeClaudeError,
      markWords: () => this.settings.pronounceForeign !== false,
      isConcise: () => this.localPlayer.backlog() + this.incoming.speaker.pendingSeconds() > 8,
    });
    this.outgoing = new DirectionPipeline({
      dir: 'out',
      from: s.myLanguage,
      to: s.theirLanguage,
      translator: this.translator,
      history: this.history,
      echoGuard: this.playedGuard,
      speaker: new Speaker({
        synth: (item) => this.speak(item, 'out'),
        sink: this.remoteSink(),
        onFirstAudio: (item) => this.onFirstAudio(item),
        onSpoken: (item, when) => this.sentGuard.remember(displayText(item.text), when),
        onError: (item, err) => this.onSpeechError('out', item, err),
        onDropped: (item) => log('info', `speech ${item.id} dropped: too far behind`),
      }),
      emit: (e) => this.caption('out', e),
      describeError: describeClaudeError,
      markWords: () => this.settings.pronounceForeign !== false,
      isConcise: () => this.page.backlog + this.outgoing.speaker.pendingSeconds() > 8,
    });
    this.incoming.setMode(this.incomingMode);
    this.outgoing.setMode(this.outgoingMode === 'voice' ? 'voice' : 'off');

    this.sttIn = this.createStt('in', this.sourceLanguage(s), keyterms);
    this.sttOut = this.createStt('out', s.myLanguage, keyterms);
    this.ensureStt('in', this.incomingMode !== 'off');
    // My side starts listening once Meet is actually sending my microphone (see onOutgoingOpened).
    this.ensureStt('out', this.outgoingMode === 'voice' && this.canSendOutgoing());
    if (this.cloneConsent) this.startClone();
    if (s.saveTranscripts !== false) {
      this.transcriptLog = new TranscriptLog({
        id: `t-${Date.now()}`,
        startedAt: Date.now(),
        title: this.tabInfo.title || '',
        url: this.tabInfo.url || '',
        kind: this.media ? 'media' : 'call',
        myLanguage: s.myLanguage,
        theirLanguage: this.sourceLanguage(s),
      });
    }
  }

  createTranslator(s) {
    const common = {
      myLanguage: s.myLanguage,
      theirLanguage: s.theirLanguage,
      meetingContext: s.meetingContext,
      keyterms: parseKeyterms(s.keyterms),
    };
    const free = () => new FreeTranslator({ ...common, keys: freeKeys(s), log });
    if (isFreeTranslation(s)) return free();
    const fallback = s.translationFallback !== false;
    const claude = (model) =>
      new Translator({
        ...common,
        apiKey: s.anthropicKey,
        model,
        onUsage: (used, usage) => this.usage.addClaude(used, usage),
        ...(fallback ? { timeoutMs: 10_000, maxRetries: 1 } : {}),
      });
    // A service that is out for the rest of the call says so once, in the panel.
    const onOff = (name, err) => this.warn(`off-${name}`, 'warn.serviceOff', { name, message: describeClaudeError(err) });
    const provider = translationProvider(s);
    if (provider === 'claude') {
      if (!fallback) return claude(claudeModelOf(s));
      return new FallbackTranslator({ primary: claude(claudeModelOf(s)), backup: free(), restFor: claudeRestMs, onOff, log });
    }
    // Any other provider first, then Claude Haiku (with a key), then free translation. A
    // Claude that is only the backup may fail its check without holding up the call.
    const behind = () =>
      s.anthropicKey
        ? new FallbackTranslator({ primary: claude(OLLAMA_BACKUP_CLAUDE), backup: free(), restFor: claudeRestMs, name: 'Claude', requirePrimary: false, onOff, log })
        : free();
    if (provider === 'openai' || provider === 'openrouter') {
      const openrouter = provider === 'openrouter';
      const name = t(openrouter ? 'provider.openrouter' : 'provider.openai');
      const primary = new OpenAITranslator({
        ...common,
        base: openrouter ? OPENROUTER_URL : serverBase(s.openaiUrl, { defaultPort: '' }) || OPENAI_URL,
        key: openrouter ? s.openrouterKey : s.openaiKey,
        model: openrouter ? s.openrouterModel : s.openaiModel,
        label: name,
        log,
      });
      if (!fallback) return primary;
      return new FallbackTranslator({ primary, backup: behind(), restFor: openaiRestMs, name, onOff, log });
    }
    if (isOllamaTranslation(s)) {
      // Ollama first, then a second Ollama server, then Claude (with a key), then free.
      let backup = behind();
      if (serverBase(s.ollamaBackupUrl) && String(s.ollamaBackupModel || '').trim()) {
        backup = new FallbackTranslator({
          primary: new OllamaTranslator({ ...common, url: s.ollamaBackupUrl, model: s.ollamaBackupModel, label: t('server.ollamaBackup'), log }),
          backup,
          restFor: ollamaRestMs,
          name: t('server.ollamaBackup'),
          requirePrimary: false,
          onOff,
          log,
        });
      }
      return new FallbackTranslator({
        primary: new OllamaTranslator({ ...common, url: s.ollamaUrl, model: s.ollamaModel, label: t('server.ollama'), log }),
        backup,
        restFor: ollamaRestMs,
        name: t('server.ollama'),
        requirePrimary: false,
        onOff,
        log,
      });
    }
    return free();
  }

  async verifyTranslator() {
    const free = this.translator instanceof FreeTranslator;
    try {
      const notes = await this.translator.verify();
      for (const note of notes || []) this.warn(note.id, note.key, note.params);
      if (notes?.some((note) => note.id === 'backup')) this.watchBackup();
    } catch (err) {
      throw new UserError(describeClaudeError(err), free ? 'free-translation' : 'translation');
    }
  }

  // The popup downloads Chrome's language packs as the call starts; the warning goes once
  // the backup can translate.
  watchBackup(tries = 0) {
    clearTimeout(this.backupTimer);
    this.backupTimer = setTimeout(async () => {
      if (this.stopped || !(this.translator instanceof FallbackTranslator)) return;
      if (await this.translator.backupReady()) {
        this.warnings.delete('backup');
        this.report();
      } else if (tries < 12) {
        this.watchBackup(tries + 1);
      }
    }, 10_000);
  }

  async resolveVoices() {
    const s = this.settings;
    if (this.speech.local) return this.resolveLocalVoices();
    if (this.speech.kind === 'openai') return this.resolveOpenAIVoices();
    this.myVoiceId = s.myVoiceId;
    this.theirVoiceId = s.theirVoiceId;
    let voices;
    try {
      voices = await listVoices(this.speech);
    } catch (err) {
      throw new UserError(describeElevenLabsError(err, this.speech), 'elevenlabs');
    }
    const exists = (id) => voices.some((v) => v.voice_id === id);
    const premade = voices.filter((v) => v.category === 'premade');
    const pool = premade.length ? premade : voices;
    if (!pool.length) throw new UserError(t('err.noVoices'), 'voices');
    if (!this.myVoiceId || !exists(this.myVoiceId)) {
      this.myVoiceId = pool[0].voice_id;
      // A video tab never speaks in my voice.
      if (!this.media) this.warn('my-voice', 'warn.myVoice');
    }
    if (!this.theirVoiceId || !exists(this.theirVoiceId)) this.theirVoiceId = (pool[1] || pool[0]).voice_id;
  }

  // What is heard on the tab: their language in a call; on a video tab the language set
  // for those, or 'auto' (speech recognition and translation find it).
  sourceLanguage(s) {
    return this.media ? s.mediaLanguage || AUTO_LANGUAGE : s.theirLanguage;
  }

  // The local speech server: the chosen voices (or its first and second voice for the
  // language), and a note when the server is older than this extension.
  async resolveLocalVoices() {
    const s = this.settings;
    try {
      await listVoices(this.speech);
      const health = await speechHealth(this.speech).catch(() => ({}));
      if (!(health.protocol >= SPEECH_PROTOCOL)) this.warn('speech-old', 'lsp.old');
      // The server's own recognition model, in case it is one that knows only English.
      this.speechServerModel = (await speechModels(this.speech).catch(() => ({})))?.recognition?.default || '';
    } catch (err) {
      throw new UserError(describeElevenLabsError(err, this.speech), 'speech');
    }
    this.myVoiceId = s.localMyVoice || 'local-1';
    this.theirVoiceId = s.localTheirVoice || 'local-2';
  }

  // OpenAI's audio API: the keys work (a model list answers) and the chosen voices.
  async resolveOpenAIVoices() {
    const s = this.settings;
    const { stt, tts } = this.speech;
    try {
      await listAudioModels({ base: stt.base, key: stt.key, kind: 'stt' });
      if (tts.base !== stt.base || tts.key !== stt.key) await listAudioModels({ base: tts.base, key: tts.key, kind: 'tts' });
    } catch (err) {
      throw new UserError(err?.message || String(err), 'speech');
    }
    this.myVoiceId = s.oaiMyVoice || 'alloy';
    this.theirVoiceId = s.oaiTheirVoice || 'nova';
  }

  // An English-only model (distil-large-v3) cannot write down other languages: speech that
  // is not English goes to a multilingual one instead.
  whisperParams(dir, languageCode) {
    const chosen = this.settings.localWhisperModel || this.speechServerModel || '';
    const model = whisperModelFor(chosen, languageCode);
    if (model === chosen) return this.settings.localWhisperModel ? { whisper_model: model } : {};
    log('info', `stt-${dir}: ${chosen} knows only English; ${languageCode || 'auto'} speech uses ${model}`);
    return { whisper_model: model };
  }

  createStt(dir, languageCode, keyterms) {
    if (isSoniox(this.settings)) return this.createSoniox(dir, keyterms);
    if (this.speech.kind === 'openai') {
      return new OpenAITranscriber({
        name: dir === 'in' ? 'stt-in' : 'stt-out',
        ...this.speech.stt,
        languageCode,
        vadSilenceSecs: this.settings.vadSilenceSecs,
        keyterms,
        onCommitted: (text) => this.onCommitted(dir, text),
        onStatus: (status) => {
          this.stt[dir] = status;
          this.report();
        },
        onFatal: (err) => this.fail(new UserError(t('stt.stopped', { message: err.message }), 'stt')),
        log,
      });
    }
    return new ScribeRealtime({
      name: dir === 'in' ? 'stt-in' : 'stt-out',
      apiKey: this.speech,
      // Left out, speech recognition finds the language itself.
      languageCode: languageCode === AUTO_LANGUAGE ? '' : languageCode,
      vadSilenceSecs: this.settings.vadSilenceSecs,
      keyterms,
      extraParams: this.speech.local ? this.whisperParams(dir, languageCode) : {},
      serverCommits: Boolean(this.speech.local),
      onPartial: (text) => this.onPartial(dir, text),
      onCommitted: (text) => this.onCommitted(dir, text),
      onServerMessage: (type, text) => this.debugSink?.event({ kind: 'stt-message', dir, type, text }),
      onStatus: (status) => {
        this.stt[dir] = status;
        this.debugSink?.event({ kind: 'stt', dir, status });
        this.report();
      },
      onFatal: (err, cause) => this.fail(new UserError(describeSttFatal(err, cause), 'stt')),
      log,
    });
  }

  // Soniox hears one side and translates it in the same stream: its words feed the live
  // line, and each segment's translation is spoken clause by clause as it arrives.
  createSoniox(dir, keyterms) {
    const s = this.settings;
    const target = dir === 'in' ? s.myLanguage : s.theirLanguage;
    const source = dir === 'in' ? this.sourceLanguage(s) : s.myLanguage;
    let segment = null;
    const pipeline = () => (dir === 'in' ? this.incoming : this.outgoing);
    return new SonioxSession({
      name: `soniox-${dir}`,
      apiKey: s.sonioxKey,
      config: sonioxConfig({ target, source: source === AUTO_LANGUAGE ? '' : source, terms: keyterms, endpointDelayMs: (s.vadSilenceSecs || 0.7) * 1000 }),
      onOriginal: (text) => {
        if (dir === 'out' && !this.canSendOutgoing()) return;
        this.debugSink?.event({ kind: 'partial', dir, text });
        if (segment) segment.source(text);
        else this.caption(dir, { phase: 'partial', source: text });
      },
      onSegmentStart: () => {
        if (dir === 'out' && !this.canSendOutgoing()) return;
        segment = pipeline()?.openSegment() || null;
      },
      onTranslation: (piece) => segment?.translation(piece),
      onSegmentEnd: (done) => {
        this.debugSink?.event({ kind: 'committed', dir, text: done.source });
        segment?.end(done);
        segment = null;
      },
      onStatus: (status) => {
        this.stt[dir] = status;
        this.debugSink?.event({ kind: 'stt', dir, status });
        this.report();
      },
      onFatal: (err) => this.fail(new UserError(describeSonioxError(err), 'stt')),
      log,
    });
  }

  restartStt() {
    if (this.stopped) return;
    const keyterms = parseKeyterms(this.settings.keyterms);
    this.sttIn.stop();
    this.sttOut.stop();
    this.early.in.reset();
    this.early.out.reset();
    this.sttIn = this.createStt('in', this.sourceLanguage(this.settings), keyterms);
    this.sttOut = this.createStt('out', this.settings.myLanguage, keyterms);
    this.ensureStt('in', this.incomingMode !== 'off');
    this.ensureStt('out', this.outgoingMode === 'voice' && this.canSendOutgoing());
  }

  ensureStt(dir, on) {
    const stt = dir === 'in' ? this.sttIn : this.sttOut;
    if (!stt) return;
    if (on && stt.stopped) stt.start();
    else if (!on && !stt.stopped) stt.stop();
    if (!on) this.stt[dir] = 'off';
  }

  // My speech is only listened to when it can actually reach the call: translation to
  // them is on, Meet is sending my microphone, and I am not muted in Meet.
  canSendOutgoing() {
    return this.outgoingMode === 'voice' && Boolean(this.tabPort) && !this.page.muted && this.page.senders > 0;
  }

  onTabChunk(m) {
    this.levels.tab = Math.max(m.rms, this.levels.tab * 0.7);
    if (m.raw && this.collector) this.collectClone(m.raw, m.rawRate, m.rms);
    if (!this.sttIn || this.sttIn.stopped) return;
    this.sttIn.sendAudio(m.pcm);
    this.debugSink?.pcm('in', m.pcm);
    this.usage.addStt(0.1);
  }

  onMicChunk(m) {
    this.levels.mic = Math.max(m.rms, this.levels.mic * 0.7);
    if (!this.sttOut || this.sttOut.stopped) return;
    const open = this.canSendOutgoing() && !(this.settings.halfDuplex && this.localPlayer.playing);
    const pcm = open ? m.pcm : new Int16Array(m.pcm.length);
    this.sttOut.sendAudio(pcm);
    this.debugSink?.pcm('out', pcm);
    this.usage.addStt(0.1);
  }

  // Finished sentences go to translation while the speaker is still talking (see
  // EarlySentences); the live line shows only what has not been sent yet.
  onPartial(dir, text) {
    this.debugSink?.event({ kind: 'partial', dir, text });
    if (dir === 'out' && !this.canSendOutgoing()) return;
    this.lastPartialAt[dir] = performance.now();
    const early = this.early?.[dir];
    const ready = early?.partial(text);
    // Sent while the speaker is still talking: no wait for the end of the speech.
    if (ready) this.translateSegment(dir, ready, { listenMs: 0 });
    this.caption(dir, { phase: 'partial', source: early ? early.live(text) : text });
  }

  onCommitted(dir, text) {
    this.debugSink?.event({ kind: 'committed', dir, text });
    if (dir === 'out' && !this.canSendOutgoing()) {
      this.early?.out.reset();
      return;
    }
    // From the last change in the live text (the speech ending) to this commit.
    const since = this.lastPartialAt[dir] ? performance.now() - this.lastPartialAt[dir] : null;
    this.lastPartialAt[dir] = 0;
    const listenMs = since != null && since < 8000 ? Math.round(since) : null;
    const rest = this.early ? this.early[dir].committed(text) : text;
    if (rest && !isOnlyPunctuation(rest)) this.translateSegment(dir, rest, { listenMs });
  }

  translateSegment(dir, text, meta = {}) {
    (dir === 'in' ? this.incoming : this.outgoing)?.onCommitted(text, meta);
  }

  speak(item, dir) {
    const s = this.settings;
    const voiceId = dir === 'in' ? this.theirCloneId || this.theirVoiceId : this.myVoiceId;
    // Speech waiting to play, queued or already in the player: catch up by speaking faster.
    const queued = (dir === 'in' ? this.incoming : this.outgoing)?.speaker.pendingSeconds() || 0;
    const backlog = (dir === 'in' ? this.localPlayer.backlog() : this.page.backlog) + queued;
    const speed = backlog > 5 ? 1.2 : backlog > 2.5 ? 1.1 : 1;
    const language = dir === 'in' ? s.myLanguage : s.theirLanguage;
    // Foreign words: the local voice knows one language and reads how they sound; the
    // others get the words themselves (and OpenAI is told how to say them).
    const text = speechText(item.text, { language, singleLanguage: Boolean(this.speech.local), lexicon: parseLexicon(s.pronunciations), enabled: s.pronounceForeign !== false });
    this.usage.addTts(text.length, s.ttsModel);
    if (this.speech.kind === 'openai') {
      const instructions = s.pronounceForeign !== false ? `Speak naturally in ${languageName(language)}. Say technical terms, acronyms, and brand and personal names from other languages the way they are said in their own language.` : '';
      return openaiSynthesize({ ...this.speech.tts, voice: voiceId, text, speed, instructions, signal: item.signal });
    }
    return synthesize({
      apiKey: this.speech,
      voiceId,
      text,
      modelId: s.ttsModel,
      languageCode: language,
      voiceSettings: { stability: s.stability, similarity_boost: s.similarity, speed },
      previousText: displayText(item.previousText),
      signal: item.signal,
    });
  }

  localSink() {
    return {
      push: (id, pcm) => this.localPlayer.push(id, pcm),
      end: (id) => this.localPlayer.end(id),
      flush: () => this.localPlayer.flush(),
      backlog: () => this.localPlayer.backlog(),
    };
  }

  remoteSink() {
    return {
      push: (id, pcm) => {
        this.postTab({ type: 'tts', op: 'chunk', id, data: int16ToBase64(pcm) });
        if (this.settings.monitorVolume > 0) this.monitorPlayer.push(id, pcm);
        this.recordSentPlayer?.push(id, pcm);
      },
      end: (id) => {
        this.postTab({ type: 'tts', op: 'end', id });
        this.monitorPlayer.end(id);
        this.recordSentPlayer?.end(id);
      },
      flush: () => {
        this.postTab({ type: 'tts', op: 'flush' });
        this.monitorPlayer.flush();
        this.recordSentPlayer?.flush();
      },
      backlog: () => this.page.backlog,
    };
  }

  onFirstAudio(item) {
    const segment = item.segment;
    if (segment.firstAudioAt) return;
    segment.firstAudioAt = performance.now();
    const ms = Math.round(segment.firstAudioAt - segment.committedAt);
    this.latencies.push(ms);
    if (this.latencies.length > 8) this.latencies.shift();
    const sample = (name, value) => {
      if (value == null || !Number.isFinite(value) || value < 0) return;
      this.stages[name].push(Math.round(value));
      if (this.stages[name].length > 8) this.stages[name].shift();
    };
    sample('listen', segment.listenMs);
    sample('translate', segment.firstTextAt ? segment.firstTextAt - segment.committedAt : null);
    sample('voice', item.firstChunkAt ? item.firstChunkAt - item.requestedAt : null);
    log('info', `${segment.id} first audio ${ms} ms after commit (listen ${segment.listenMs ?? '-'}, translate ${segment.firstTextAt ? Math.round(segment.firstTextAt - segment.committedAt) : '-'}, voice ${item.firstChunkAt ? Math.round(item.firstChunkAt - item.requestedAt) : '-'} ms)`);
  }

  // The translation stays readable; the line only says it could not be spoken.
  onSpeechError(dir, item, err) {
    log('error', `speech ${dir}`, err);
    this.caption(dir, { id: item.segment.id, phase: 'speech-error', error: t('speech.failed', { error: describeElevenLabsError(err, this.speech) }) });
  }

  caption(dir, event) {
    this.debugSink?.event({ kind: 'caption', dir, ...event });
    if (this.transcriptLog?.add(dir, event)) this.saveTranscriptSoon();
    this.postTab({ type: 'caption', dir, ...event });
  }

  originalLevel(playing) {
    if (this.incomingMode !== 'voice') return 1;
    // A video stays audible under its spoken translation, and at full level between.
    if (this.media) return playing ? MEDIA_DUCK : 1;
    return playing ? this.settings.duckVolume : this.settings.originalVolume;
  }

  updateDucking() {
    if (!this.originalGain) return;
    const target = this.originalLevel(this.localPlayer?.playing);
    this.originalGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
  }

  attachTab(port) {
    if (this.tabPort && this.tabPort !== port) {
      try {
        this.tabPort.disconnect();
      } catch {
        // gone already
      }
    }
    this.tabPort = port;
    port.onMessage.addListener((m) => this.onTabMessage(m));
    port.onDisconnect.addListener(() => {
      if (this.tabPort !== port) return;
      this.tabPort = null;
      this.page = { ...this.page, muted: true, senders: 0, backlog: 0 };
      this.outgoing?.flush();
      this.report();
    });
    this.postTab({
      type: 'hello',
      uiLanguage: this.settings.uiLanguage,
      diagnostic: this.diagnostic,
      showOverlay: this.settings.showOverlay,
      myLanguage: this.settings.myLanguage,
      theirLanguage: this.sourceLanguage(this.settings),
      incomingMode: this.incomingMode,
      outgoingMode: this.outgoingMode,
      offerClone: this.settings.offerTheirClone && !this.diagnostic && !this.speech.local && this.speech.kind !== 'openai' && !this.media,
      subtitleBar: this.showSubtitles(),
      cloneConsent: this.cloneConsent,
      media: this.media,
    });
    this.syncPageActivation();
    this.postTab({ type: 'clone', clone: this.clone });
    this.report();
  }

  pageShouldSend() {
    return this.diagnostic || this.outgoingMode === 'voice';
  }

  syncPageActivation() {
    this.postTab({ type: this.pageShouldSend() ? 'activate' : 'deactivate' });
  }

  postTab(msg) {
    try {
      this.tabPort?.postMessage(msg);
    } catch {
      // the tab went away; onDisconnect cleans up
    }
  }

  onTabMessage(m) {
    if (m?.type === 'debug-sink') {
      if (!DEBUG_BUILD) return;
      const url = debugSinkUrl(m.port);
      if (url && !this.debugSink) {
        this.debugSink = new DebugSink(url);
        logSink = this.debugSink;
        this.debugSink.event({ kind: 'start', settings: { ...this.settings, elevenLabsKey: undefined, anthropicKey: undefined, deeplKey: undefined, mistralKey: undefined, groqKey: undefined, localSpeechKey: undefined }, recording: Boolean(this.recorder) });
        log('info', `debug copies go to ${url}`);
        // A recording that began before this carries its file header in the chunks already saved.
        const rec = this.recording;
        if (rec) {
          Promise.all(rec.writes)
            .then(() => recordingChunks(rec.id))
            .then((chunks) => chunks.forEach((c) => this.debugSink?.recording(c.seq, c.blob)))
            .catch(() => {});
        }
      }
      return;
    }
    if (m?.type === 'page-state') {
      const state = sanitizePageState(m.state);
      this.debugSink?.event({ kind: 'page', state });
      const wasOpen = !this.page.muted && this.page.senders > 0;
      this.page = { ...this.page, ...state };
      // Only in a joined call: in the lobby the microphone shows on before any connection.
      const micOnInMeet = state.debug.dom === false;
      if (micOnInMeet && state.inCall && !(state.senders > 0)) this.unattachedSince ||= Date.now();
      else this.unattachedSince = 0;
      const isOpen = !this.page.muted && this.page.senders > 0;
      if (wasOpen && !isOpen) this.onOutgoingClosed();
      if (!wasOpen && isOpen) this.onOutgoingOpened();
      if (state.micLabel) this.followMeetMic(state.micLabel);
      this.watchCall(state.inCall);
    } else if (m?.type === 'ui') {
      if (m.action === 'options') this.setOptions(m.options || {});
      else if (m.action === 'chime') this.sendChime();
      else if (m.action === 'transcript') this.openTranscript();
    }
  }

  watchCall(inCall) {
    if (inCall) {
      this.joined = true;
      clearTimeout(this.callGoneTimer);
      this.callGoneTimer = 0;
    } else if (this.joined && !this.callGoneTimer) {
      this.callGoneTimer = setTimeout(() => {
        log('info', 'the call ended, stopping');
        chrome.runtime.sendMessage({ type: 'call-ended' }).catch(() => {});
      }, CALL_GONE_MS);
    }
  }

  // Muted in Meet (or no call yet): drop whatever was queued for them, and after a
  // while close the speech recognition for my side so it costs nothing.
  onOutgoingClosed() {
    this.outgoing?.flush();
    this.early?.out.reset();
    // Words still on the live line were never sent; they would stay there until I spoke again.
    this.caption('out', { phase: 'partial', source: '' });
    clearTimeout(this.muteTimer);
    this.muteTimer = setTimeout(() => {
      if (!this.canSendOutgoing()) this.ensureStt('out', false);
    }, MUTE_IDLE_MS);
    this.report();
  }

  onOutgoingOpened() {
    clearTimeout(this.muteTimer);
    if (this.outgoingMode === 'voice') this.ensureStt('out', true);
    this.report();
  }

  // The subtitle bar. On a video tab it is the translation's only text, so it shows unless
  // the translation is spoken and the subtitles were turned off; in a call, as set.
  showSubtitles(settings = this.settings) {
    if (this.diagnostic) return false;
    if (this.media) return !(this.incomingMode === 'voice' && settings.mediaSubtitles === false);
    return Boolean(settings.subtitleBar);
  }

  setOptions(raw) {
    const options = cleanModes(raw);
    if (typeof raw?.cloneConsent === 'boolean') options.cloneConsent = raw.cloneConsent;
    if (!this.diagnostic && options.incomingMode && options.incomingMode !== this.incomingMode) {
      this.incomingMode = options.incomingMode;
      this.incoming?.setMode(this.incomingMode);
      this.ensureStt('in', this.incomingMode !== 'off');
      if (this.incomingMode === 'off') this.caption('in', { phase: 'partial', source: '' });
      if (this.incomingMode !== 'voice') this.stopCloneCollection();
      else if (this.cloneConsent) this.startClone();
      this.updateDucking();
      if (this.media) this.postTab({ type: 'subtitles', show: this.showSubtitles() });
    }
    if (!this.diagnostic && options.outgoingMode && options.outgoingMode !== this.outgoingMode) {
      this.outgoingMode = options.outgoingMode;
      this.outgoing?.setMode(this.outgoingMode === 'voice' ? 'voice' : 'off');
      this.ensureStt('out', this.outgoingMode === 'voice' && this.canSendOutgoing());
      this.syncPageActivation();
    }
    if (options.cloneConsent !== undefined && Boolean(options.cloneConsent) !== this.cloneConsent) {
      this.cloneConsent = Boolean(options.cloneConsent);
      if (this.cloneConsent) this.startClone();
      else this.stopCloneCollection();
    }
    this.postTab({ type: 'modes', incomingMode: this.incomingMode, outgoingMode: this.outgoingMode, cloneConsent: this.cloneConsent });
    chrome.runtime
      .sendMessage({ type: 'engine-options', options: { incomingMode: this.incomingMode, outgoingMode: this.outgoingMode } })
      .catch(() => {});
    this.report();
  }

  updateSettings(next) {
    const prev = this.settings;
    this.settings = next;
    if (next.uiLanguage !== prev.uiLanguage) {
      setLanguage(next.uiLanguage);
      this.postTab({ type: 'language', uiLanguage: next.uiLanguage });
    }
    this.translationGain?.gain.setTargetAtTime(next.translationVolume, this.ctx.currentTime, 0.05);
    this.monitorGain?.gain.setTargetAtTime(next.monitorVolume, this.ctx.currentTime, 0.05);
    this.updateDucking();
    const switched = translationSetup(next) !== translationSetup(prev);
    const newKey = !isFreeTranslation(next) && next.anthropicKey !== prev.anthropicKey;
    if (isSoniox(prev) && !isSoniox(next) && !this.translator && !missingKeys(next).length && !missingServers(next).length) {
      // Soniox turned off mid-call: the translation service takes over.
      this.translator = this.createTranslator(next);
      if (this.incoming) this.incoming.translator = this.translator;
      if (this.outgoing) this.outgoing.translator = this.translator;
    } else if (this.translator && (switched || newKey) && !missingKeys(next).length && !missingServers(next).length) {
      // Switched between Claude, Ollama and free translation mid-call, another Ollama
      // server or model, or a new Anthropic key.
      this.translator = this.createTranslator(next);
      if (this.incoming) this.incoming.translator = this.translator;
      if (this.outgoing) this.outgoing.translator = this.translator;
    } else {
      this.translator?.update({
        // Behind another provider, Claude keeps its own model (OLLAMA_BACKUP_CLAUDE).
        model: translationProvider(next) === 'claude' ? claudeModelOf(next) : undefined,
        myLanguage: next.myLanguage,
        theirLanguage: next.theirLanguage,
        meetingContext: next.meetingContext,
        keyterms: parseKeyterms(next.keyterms),
        keys: freeKeys(next),
      });
    }
    // A new ElevenLabs key is used from the next connection on (speech takes it right away).
    const speechBefore = this.speech;
    this.speech = speechAccount(next);
    this.usage.freeSpeech = this.speech.local || this.speech.kind === 'openai';
    for (const stt of [this.sttIn, this.sttOut]) if (stt && !(stt instanceof SonioxSession)) stt.apiKey = this.speech;
    const sonioxChanged = isSoniox(next) !== isSoniox(prev) || (isSoniox(next) && next.sonioxKey !== prev.sonioxKey);
    const pairChanged = next.myLanguage !== prev.myLanguage || this.sourceLanguage(next) !== this.sourceLanguage(prev) || next.theirLanguage !== prev.theirLanguage;
    if (pairChanged && this.incoming) {
      // A new language pair mid-call: both sides are heard and translated in it from now on.
      Object.assign(this.incoming, { from: this.sourceLanguage(next), to: next.myLanguage });
      Object.assign(this.outgoing, { from: next.myLanguage, to: next.theirLanguage });
      this.postTab({ type: 'pair', myLanguage: next.myLanguage, theirLanguage: this.sourceLanguage(next) });
    }
    if (this.sttIn && (pairChanged || sonioxChanged || JSON.stringify(speechBefore) !== JSON.stringify(this.speech) || next.localWhisperModel !== prev.localWhisperModel || next.vadSilenceSecs !== prev.vadSilenceSecs || next.keyterms !== prev.keyterms)) {
      // Speech recognition takes these when it connects. Typing in the glossary saves on
      // every pause, so the new connections wait until the typing is over.
      clearTimeout(this.sttRestartTimer);
      this.sttRestartTimer = setTimeout(() => this.restartStt(), pairChanged ? 0 : 1500);
    }
    if (next.myVoiceId && next.myVoiceId !== prev.myVoiceId) {
      this.myVoiceId = next.myVoiceId;
      this.warnings.delete('my-voice');
    }
    if (next.theirVoiceId && next.theirVoiceId !== prev.theirVoiceId) this.theirVoiceId = next.theirVoiceId;
    if (this.speech.kind === 'openai') {
      this.myVoiceId = next.oaiMyVoice || 'alloy';
      if (!this.theirCloneId) this.theirVoiceId = next.oaiTheirVoice || 'nova';
    } else if (this.speech.local) {
      this.myVoiceId = next.localMyVoice || 'local-1';
      if (!this.theirCloneId) this.theirVoiceId = next.localTheirVoice || 'local-2';
    }
    if (next.outputDeviceLabel !== prev.outputDeviceLabel) this.applyOutputDevice();
    if (next.micDeviceLabel !== prev.micDeviceLabel) this.openMic().catch((err) => log('warn', 'microphone switch', err));
    if (next.showOverlay !== prev.showOverlay) this.postTab({ type: 'overlay', show: next.showOverlay });
    if (next.subtitleBar !== prev.subtitleBar || next.mediaSubtitles !== prev.mediaSubtitles) this.postTab({ type: 'subtitles', show: this.showSubtitles(next) });
    this.report();
  }

  startClone() {
    if (this.diagnostic || this.incomingMode !== 'voice' || this.theirCloneId || this.collector) return;
    if (!this.settings.offerTheirClone || this.speech.local || this.speech.kind === 'openai' || this.clone.state === 'creating') return;
    this.collector = new CloneCollector({ targetSeconds: this.settings.cloneSeconds });
    this.tabNode.port.postMessage({ type: 'collect-raw', on: true });
    this.clone = { state: 'collecting', seconds: 0, target: this.settings.cloneSeconds };
    this.postTab({ type: 'clone', clone: this.clone });
  }

  stopCloneCollection() {
    if (!this.collector) return;
    this.collector = null;
    this.tabNode?.port.postMessage({ type: 'collect-raw', on: false });
    this.clone = { state: 'off' };
    this.postTab({ type: 'clone', clone: this.clone });
  }

  collectClone(raw, rate, level) {
    const full = this.collector.push(raw, rate, level);
    const seconds = Math.floor(this.collector.seconds());
    if (seconds !== this.clone.seconds) {
      this.clone = { ...this.clone, seconds };
      this.postTab({ type: 'clone', clone: this.clone });
    }
    if (full) this.finishClone();
  }

  async finishClone() {
    const collector = this.collector;
    this.collector = null;
    this.tabNode.port.postMessage({ type: 'collect-raw', on: false });
    this.clone = { state: 'creating' };
    this.postTab({ type: 'clone', clone: this.clone });
    try {
      const stamp = new Date().toLocaleString(locale());
      const result = await createVoiceClone(this.speech, {
        name: t('clone.name', { stamp }),
        files: [{ blob: collector.toWavBlob(), filename: 'meet-sample.wav' }],
        description: "Instant clone made by Live Interpreter during a call, with the participant's consent.",
      });
      if (this.stopped) {
        if (this.settings.deleteCloneAfter) deleteVoice(this.speech, result.voice_id).catch(() => {});
        return;
      }
      this.theirCloneId = result.voice_id;
      this.clone = { state: 'ready' };
    } catch (err) {
      log('error', 'voice clone', err);
      this.clone = { state: 'failed', error: describeElevenLabsError(err) };
    }
    this.postTab({ type: 'clone', clone: this.clone });
    this.report();
  }

  // Connection test: a short chime into the call (only heard there while Meet is
  // sending my microphone) and, quieter, on my own speakers.
  sendChime() {
    const pcm = testChime();
    const id = `chime-${Date.now()}`;
    this.postTab({ type: 'tts', op: 'chunk', id, data: int16ToBase64(pcm) });
    this.postTab({ type: 'tts', op: 'end', id });
    const quiet = pcm.map((v) => Math.round(v * 0.4));
    this.localPlayer.push(id, quiet);
    this.localPlayer.end(id);
  }

  // Warnings keep their i18n key, so they follow a language change made mid-call.
  warn(id, key, params) {
    this.warnings.set(id, { key, params });
  }

  // Which service hears, translates and speaks, for the panel: so it is plain which one
  // is at work (Soniox and the voice service below it, for one).
  servicesLabel() {
    const s = this.settings;
    const plain = (label) => label.replace(/\s*\(.*\)\s*$/, '');
    const voice = this.speech.local ? t('opt.speech.local') : this.speech.kind === 'openai' ? (s.oaiTtsServer === 'custom' ? t('opt.oaiSpeech.custom') : 'OpenAI') : 'ElevenLabs';
    if (isSoniox(s)) return t('overlay.servicesSoniox', { voice });
    const hear = this.speech.local ? t('opt.speech.local') : this.speech.kind === 'openai' ? (s.oaiSttServer === 'groq' ? 'Groq' : s.oaiSttServer === 'custom' ? t('opt.oaiSpeech.custom') : 'OpenAI') : 'ElevenLabs';
    const provider = PROVIDERS.find((p) => p.id === translationProvider(s));
    return t('overlay.services', { hear, translate: provider ? plain(t(provider.labelKey)) : '', voice });
  }

  status() {
    const latency = this.latencies.length ? Math.round(this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length) : null;
    return {
      tabId: this.tabId,
      diagnostic: this.diagnostic,
      services: this.diagnostic ? '' : this.servicesLabel(),
      incomingMode: this.incomingMode,
      outgoingMode: this.outgoingMode,
      cloneConsent: this.cloneConsent,
      recording: this.recorder?.state === 'recording',
      debugCopies: Boolean(this.debugSink),
      stt: { ...this.stt },
      page: {
        connected: Boolean(this.tabPort),
        muted: this.page.muted,
        senders: this.page.senders,
        ctxState: this.page.ctxState,
        // Meet shows the microphone on, yet the translation track is not on any sender.
        unattached: this.outgoingMode === 'voice' && Boolean(this.unattachedSince) && Date.now() - this.unattachedSince > 8000,
      },
      sendingToCall: this.canSendOutgoing(),
      levels: { tab: Number(this.levels.tab.toFixed(3)), mic: Number(this.levels.mic.toFixed(3)) },
      micLabel: this.micLabel || '',
      clone: this.clone,
      latencyMs: latency,
      stages: Object.fromEntries(Object.entries(this.stages).map(([k, v]) => [k, v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null])),
      usage: this.usage.snapshot(),
      warnings: [...this.warnings.values()].map((w) => t(w.key, w.params)),
      error: this.error,
    };
  }

  report() {
    if (this.stopped) return;
    const status = this.status();
    chrome.runtime.sendMessage({ type: 'engine-status', status }).catch(() => {});
    this.postTab({ type: 'status', status });
    this.levels.tab *= 0.5;
    this.levels.mic *= 0.5;
  }

  fail(err) {
    if (this.stopped || this.error) return;
    this.error = err.message;
    log('error', err);
    this.report();
    chrome.runtime.sendMessage({ type: 'engine-failed', error: err.message, code: err.code }).catch(() => {});
  }

  // Records the Meet tab's picture with everything heard on this side (the other
  // person, the translation, my own voice) and everything sent to them, into the
  // extension's IndexedDB on this computer (see shared/recordings.js).
  startRecording() {
    const ctx = this.ctx;
    this.recordDest = ctx.createMediaStreamDestination();
    // Their own voice goes into the recording whatever the listening level is.
    this.recordOriginalGain = ctx.createGain();
    this.recordOriginalGain.gain.value = 0.6;
    this.tabSource.connect(this.recordOriginalGain).connect(this.recordDest);
    this.translationGain.connect(this.recordDest);
    this.recordMicGain = ctx.createGain();
    this.recordMicGain.gain.value = 0.8;
    this.recordMicGain.connect(this.recordDest);
    this.micSource?.connect(this.recordMicGain);
    const sentGain = ctx.createGain();
    sentGain.connect(this.recordDest);
    this.recordSentPlayer = new PcmScheduler(ctx, sentGain);

    const tracks = [...this.tabStream.getVideoTracks(), ...this.recordDest.stream.getAudioTracks()];
    // MP4 first: it plays in QuickTime on a Mac; WebM where MP4 recording is missing.
    const mimeType = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((t) =>
      MediaRecorder.isTypeSupported(t),
    );
    this.recorder = new MediaRecorder(new MediaStream(tracks), { mimeType, videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000 });
    const rec = { id: `rec-${Date.now()}`, startedAt: Date.now(), mimeType: this.recorder.mimeType || mimeType, seq: 0, bytes: 0, writes: [] };
    this.recording = rec;
    this.recorder.ondataavailable = (event) => {
      if (!event.data.size) return;
      rec.bytes += event.data.size;
      this.debugSink?.recording(rec.seq, event.data);
      rec.writes.push(saveChunk(rec.id, rec.seq++, event.data).catch((err) => log('error', 'recording chunk', err)));
    };
    this.recorder.start(2000);
    saveRecording({ id: rec.id, startedAt: rec.startedAt, endedAt: null, mimeType: rec.mimeType, chunks: 0, bytes: 0 }).catch(() => {});
    log('info', `recording ${rec.id} (${rec.mimeType})`);
  }

  async finishRecording() {
    const recorder = this.recorder;
    if (!recorder || recorder.state === 'inactive') return null;
    await new Promise((resolve) => {
      recorder.addEventListener('stop', resolve, { once: true });
      recorder.stop();
    });
    const rec = this.recording;
    await Promise.all(rec.writes);
    const meta = { id: rec.id, startedAt: rec.startedAt, endedAt: Date.now(), mimeType: rec.mimeType, chunks: rec.seq, bytes: rec.bytes };
    await saveRecording(meta);
    return meta;
  }

  // The transcript is written a few seconds after it changes, and at the end, so a closed
  // tab or a crash loses at most those seconds.
  saveTranscriptSoon() {
    if (this.transcriptTimer) return;
    this.transcriptTimer = setTimeout(() => {
      this.transcriptTimer = 0;
      this.saveTranscriptNow();
    }, 4000);
  }

  saveTranscriptNow(extra = {}) {
    if (!this.transcriptLog?.lines.length) return Promise.resolve();
    return saveTranscript(this.transcriptLog.snapshot(extra)).catch((err) => log('warn', 'transcript not saved', err));
  }

  // The panel's "Transcript": what has been said so far, saved and opened in a tab.
  async openTranscript() {
    if (!this.transcriptLog) return;
    clearTimeout(this.transcriptTimer);
    this.transcriptTimer = 0;
    await this.saveTranscriptNow();
    chrome.runtime.sendMessage({ type: 'open-transcript', id: this.transcriptLog.meta.id }).catch(() => {});
  }

  async stop() {
    if (this.stopped) return;
    this.stopped = true;
    const recording = await this.finishRecording().catch((err) => {
      log('error', 'recording', err);
      return null;
    });
    clearInterval(this.statusTimer);
    clearTimeout(this.muteTimer);
    clearTimeout(this.callGoneTimer);
    clearTimeout(this.sttRestartTimer);
    clearTimeout(this.backupTimer);
    clearTimeout(this.transcriptTimer);
    await this.saveTranscriptNow({ endedAt: Date.now() });
    this.debugSink?.close();
    this.incoming?.flush();
    this.outgoing?.flush();
    this.sttIn?.stop();
    this.sttOut?.stop();
    this.postTab({ type: 'deactivate', final: true });
    try {
      this.tabPort?.disconnect();
    } catch {
      // already gone
    }
    this.tabPort = null;
    this.micSource?.disconnect();
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.tabStream?.getTracks().forEach((t) => t.stop());
    this.localPlayer?.flush();
    this.monitorPlayer?.flush();
    await this.ctx?.close().catch(() => {});
    if (this.theirCloneId && this.settings.deleteCloneAfter) {
      await withTimeout(deleteVoice(this.speech, this.theirCloneId), 4000).catch((err) => log('warn', 'clone delete', err));
    }
    if (recording) chrome.runtime.sendMessage({ type: 'recording-ready', id: recording.id }).catch(() => {});
  }
}
