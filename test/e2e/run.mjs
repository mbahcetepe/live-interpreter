// End-to-end test: loads dist/ into Chromium, serves a mock Meet call at
// https://meet.google.com/ and drives the real extension.
//
//   node test/e2e/run.mjs           connection test (no API keys needed)
//   with keys in .env               also a full translation round trip
//
// The fake microphone plays a WAV file and the mock call plays another one as the
// counterpart. Test audio is made with macOS `say` and ffmpeg the first time.

import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { startMockApi } from './mock-api.mjs';
import { startMockOllama } from './mock-ollama.mjs';
import { startMockOpenAI } from './mock-openai.mjs';
import {
  root, dist, fixtures, outDir, check, sleep, loadEnv, makeFixtures, launch, send, sessionState, maxLevel, waitFor, readCaptions, done, summary,
} from './harness.mjs';

async function connectionTest() {
  console.log('\n== Connection test (no API keys) ==');
  const env = await launch({ micWav: path.join(fixtures, 'tone.wav'), remoteWav: path.join(fixtures, 'english.wav') });
  const { control, meet, tabId } = env;
  try {
    check('page hook is installed in the Meet page', await meet.evaluate(() => window.__meetTercumanHook === true));
    const before = await maxLevel(meet, 1200);
    check('the far end hears the microphone before translation starts', before > 0.01, `level ${before.toFixed(3)}`);

    const start = await send(control, { type: 'start', tabId, options: { mode: 'diagnostic' } });
    check('a connection test session starts', start?.ok === true, start?.error);
    const connected = await waitFor(async () => (await sessionState(control))?.engine?.page?.connected, 8000);
    check('the engine reaches the Meet tab', Boolean(connected));
    const swapped = await waitFor(async () => (await sessionState(control))?.engine?.page?.senders > 0, 5000);
    check('the microphone sender now carries the extension track', Boolean(swapped));
    check('Meet still sees its own microphone track on the sender', await meet.evaluate(() => window.__test.senderShowsMic()));
    await sleep(400);
    const quiet = await maxLevel(meet, 800);
    check('the raw microphone no longer reaches the far end', quiet < 0.005, `level ${quiet.toFixed(4)}`);

    await send(control, { type: 'chime' });
    const chime = await maxLevel(meet, 900);
    check('a test chime reaches the far end', chime > 0.01, `level ${chime.toFixed(3)}`);

    const overlay = await meet.evaluate(() => Boolean(document.getElementById('meet-tercuman-overlay')));
    check('the panel is shown on the page', overlay);

    const engine = await waitFor(async () => {
      const e = (await sessionState(control))?.engine;
      return e && e.levels.tab > 0.005 && e.levels.mic > 0.005 ? e : null;
    }, 6000);
    const last = (await sessionState(control))?.engine;
    check('the engine hears the Meet tab (tab capture)', Boolean(engine), `tab ${last?.levels?.tab}`);
    check('the engine hears the microphone', Boolean(engine), `mic ${last?.levels?.mic}`);

    await meet.evaluate(() => window.__test.mute(true));
    const muted = await waitFor(async () => (await sessionState(control))?.engine?.page?.muted, 4000);
    check('muting in Meet is detected', Boolean(muted));
    await send(control, { type: 'chime' });
    const mutedChime = await maxLevel(meet, 900);
    check('nothing reaches the far end while muted', mutedChime < 0.005, `level ${mutedChime.toFixed(4)}`);
    await meet.evaluate(() => window.__test.mute(false));
    await waitFor(async () => (await sessionState(control))?.engine?.page?.muted === false, 4000);
    await send(control, { type: 'chime' });
    const unmutedChime = await maxLevel(meet, 900);
    check('sound reaches the far end again after unmuting', unmutedChime > 0.01, `level ${unmutedChime.toFixed(3)}`);

    const stop = await send(control, { type: 'stop' });
    check('the session stops', stop?.ok === true);
    await sleep(800);
    const after = await maxLevel(meet, 1200);
    check('the far end hears the real microphone again after stopping', after > 0.01, `level ${after.toFixed(3)}`);
    check('the panel is removed after stopping', !(await meet.evaluate(() => Boolean(document.getElementById('meet-tercuman-overlay')))));

    const withoutKeys = await send(control, { type: 'start', tabId, options: {} });
    check('translation refuses to start without API keys', withoutKeys?.ok === false && /API key|anahtar/i.test(withoutKeys?.error || ''), withoutKeys?.error);
    check('no script errors on the Meet page', env.pageErrors.length === 0, env.pageErrors.join(' | '));
  } finally {
    await env.context.close();
    await rm(env.userDataDir, { recursive: true, force: true });
  }
}

// Zoom's web client sends no WebRTC audio track: the page gets our track from getUserMedia.
async function zoomTest() {
  console.log('\n== Zoom web client (no API keys) ==');
  const env = await launch({ site: 'zoom', micWav: path.join(fixtures, 'tone.wav'), remoteWav: path.join(fixtures, 'english.wav') });
  const { control, meet: zoom, tabId } = env;
  try {
    check('page hook is installed in the Zoom page', await zoom.evaluate(() => window.__meetTercumanHook === true));
    const label = await zoom.evaluate(() => window.__test.micLabel());
    check('Zoom sees its microphone by its own name', Boolean(label) && !/destination/i.test(label), label);
    const before = await maxLevel(zoom, 1200);
    check('Zoom hears the microphone before translation starts', before > 0.01, `level ${before.toFixed(3)}`);

    const start = await send(control, { type: 'start', tabId, options: { mode: 'diagnostic' } });
    check('a connection test session starts on Zoom', start?.ok === true, start?.error);
    const connected = await waitFor(async () => (await sessionState(control))?.engine?.page?.connected, 8000);
    check('the engine reaches the Zoom tab', Boolean(connected));
    check('the call runs in a frame of the app shell, as in Zoom\'s app', zoom !== env.tab.mainFrame());
    const panels = await waitFor(async () => {
      const counts = await Promise.all(env.tab.frames().map((f) => f.evaluate(() => Boolean(document.getElementById('meet-tercuman-overlay'))).catch(() => false)));
      return counts.filter(Boolean).length;
    }, 4000);
    const inCall = await zoom.evaluate(() => Boolean(document.getElementById('meet-tercuman-overlay')));
    check('one panel, in the call\'s frame', panels === 1 && inCall, `panels ${panels}, in call frame ${inCall}`);
    const attached = await waitFor(async () => (await sessionState(control))?.engine?.page?.senders > 0, 5000);
    check('the microphone Zoom reads now carries the extension audio', Boolean(attached));
    await sleep(400);
    const quiet = await maxLevel(zoom, 800);
    check('the raw microphone no longer reaches Zoom', quiet < 0.005, `level ${quiet.toFixed(4)}`);
    await send(control, { type: 'chime' });
    const chime = await maxLevel(zoom, 900);
    check('a test chime reaches Zoom', chime > 0.01, `level ${chime.toFixed(3)}`);

    const engine = await waitFor(async () => {
      const e = (await sessionState(control))?.engine;
      return e && e.levels.tab > 0.005 && e.levels.mic > 0.005 ? e : null;
    }, 6000);
    check('the engine hears the Zoom tab and the microphone', Boolean(engine), JSON.stringify((await sessionState(control))?.engine?.levels));

    await zoom.evaluate(() => window.__test.mute(true));
    const muted = await waitFor(async () => (await sessionState(control))?.engine?.page?.muted, 4000);
    check('muting in Zoom is detected from its audio button', Boolean(muted));
    await send(control, { type: 'chime' });
    const mutedChime = await maxLevel(zoom, 900);
    check('nothing reaches Zoom while muted', mutedChime < 0.005, `level ${mutedChime.toFixed(4)}`);
    await zoom.evaluate(() => window.__test.mute(false));
    await waitFor(async () => (await sessionState(control))?.engine?.page?.muted === false, 4000);
    await send(control, { type: 'chime' });
    const unmuted = await maxLevel(zoom, 900);
    check('sound reaches Zoom again after unmuting', unmuted > 0.01, `level ${unmuted.toFixed(3)}`);

    const stop = await send(control, { type: 'stop' });
    check('the Zoom session stops', stop?.ok === true);
    await sleep(800);
    const after = await maxLevel(zoom, 1200);
    check('Zoom hears the real microphone again after stopping', after > 0.01, `level ${after.toFixed(3)}`);
    check('no script errors on the Zoom page', env.pageErrors.length === 0, env.pageErrors.join(' | '));
  } finally {
    await env.context.close();
    await rm(env.userDataDir, { recursive: true, force: true });
  }
}

async function recordingTest() {
  console.log('\n== Call recording (no API keys) ==');
  const env = await launch({ micWav: path.join(fixtures, 'tone.wav'), remoteWav: path.join(fixtures, 'english.wav') });
  const { context, control, meet, tabId } = env;
  try {
    const start = await send(control, { type: 'start', tabId, options: { mode: 'diagnostic', record: true } });
    check('a session with recording starts', start?.ok === true, start?.error);
    const recording = await waitFor(async () => (await sessionState(control))?.engine?.recording, 6000);
    check('the engine reports that it is recording', Boolean(recording));
    check('the panel shows the recording badge', await waitFor(() => meet.evaluate(() => {
      const r = document.getElementById('meet-tercuman-overlay')?.shadowRoot;
      return r && !r.querySelector('.rec')?.hidden;
    }), 4000));
    await sleep(1500);
    await send(control, { type: 'chime' });
    await sleep(2500);
    const opened = context.waitForEvent('page', { predicate: (p) => p.url().includes('/recording.html'), timeout: 15000 });
    await send(control, { type: 'stop' });
    const page = await opened.catch(() => null);
    check('the recording page opens when the call stops', Boolean(page));
    if (page) {
      await page.waitForLoadState('domcontentloaded');
      const media = await waitFor(() => page.evaluate(() => {
        const v = document.getElementById('player');
        return v && v.readyState >= 1 ? { w: v.videoWidth, h: v.videoHeight, info: document.getElementById('info').textContent, file: document.getElementById('download').download } : null;
      }), 10000);
      check('the recording has a picture', media?.w > 0 && media?.h > 0, JSON.stringify(media));
      check('the recording can be saved as a file', /^live-interpreter-.*\.(mp4|webm)$/.test(media?.file || ''), media?.file);
      const audio = await page.evaluate(async () => {
        const v = document.getElementById('player');
        const blob = await (await fetch(v.src)).blob();
        const ctx = new AudioContext();
        const decoded = await ctx.decodeAudioData(await blob.arrayBuffer()).catch(() => null);
        if (!decoded) return { seconds: 0, peak: 0, size: blob.size };
        const data = decoded.getChannelData(0);
        let peak = 0;
        for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
        return { seconds: decoded.duration, peak, size: blob.size, type: blob.type };
      });
      check('the recording holds the sound of the call', audio.seconds > 2 && audio.peak > 0.01, JSON.stringify(audio));
    }
  } finally {
    await env.context.close();
    await rm(env.userDataDir, { recursive: true, force: true });
  }
}

// The panel's line naming the services at work ("Hears: … · translates: … · speaks: …").
const servicesLine = (meet) =>
  meet.evaluate(() => [...(document.getElementById('meet-tercuman-overlay')?.shadowRoot?.querySelectorAll('.usage') || [])].map((el) => el.textContent).find((x) => /^Hears/.test(x)) || '');

async function mockTranslationTest() {
  console.log('\n== Translation round trip against a local mock API (no keys, no cost) ==');
  const mock = await startMockApi({
    cert: readFileSync(path.join(fixtures, 'mock-cert.pem')),
    key: readFileSync(path.join(fixtures, 'mock-key.pem')),
  });
  const env = await launch({ micWav: path.join(fixtures, 'turkish.wav'), remoteWav: path.join(fixtures, 'english.wav'), proxyPort: mock.port });
  const { control, meet, tabId } = env;
  const { stats } = mock;
  try {
    await control.evaluate(async () => {
      const { settings } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...(settings || {}), elevenLabsKey: 'mock-el', anthropicKey: 'mock-an', claudeModel: 'claude-opus-5-5' } });
    });
    const start = await send(control, { type: 'start', tabId, options: { incomingMode: 'voice', outgoingMode: 'voice' } });
    check('a translation session starts', start?.ok === true, start?.error);
    if (!start?.ok) return;

    const incoming = await waitFor(async () => done((await readCaptions(meet)).incoming), 30000, 300);
    check('the counterpart is transcribed and shown in Turkish', incoming?.translation === 'Merhaba, bugün görüşmeye katıldığınız için teşekkürler.', JSON.stringify(incoming));
    const named = await waitFor(() => servicesLine(meet), 4000);
    check('the panel names the services at work', named === 'Hears: ElevenLabs · translates: Claude · speaks: ElevenLabs', named);
    // A script in Meet's page cannot tick the consent box or ask for debug copies.
    const scripted = await meet.evaluate(async () => {
      localStorage.setItem('meet-tercuman-debug', '47913');
      const row = document.getElementById('meet-tercuman-overlay')?.shadowRoot?.querySelector('.clone');
      const box = row?.querySelector('input');
      box?.click();
      row?.click();
      row?.querySelector('span')?.click();
      await new Promise((r) => setTimeout(r, 800));
      localStorage.removeItem('meet-tercuman-debug');
      return { found: Boolean(box), checked: box?.checked };
    });
    // The same, when the page first stops the click from reaching the panel's own listeners.
    const afterScript = (await sessionState(control))?.engine;
    check('a page script cannot give clone consent', scripted.found && scripted.checked === false && afterScript?.cloneConsent === false, JSON.stringify(scripted));
    for (const target of ['input', 'label']) {
      const shown = await meet.evaluate(async (which) => {
        const stop = (event) => event.stopPropagation();
        document.addEventListener('click', stop, true);
        const row = document.getElementById('meet-tercuman-overlay')?.shadowRoot?.querySelector('.clone');
        (which === 'input' ? row?.querySelector('input') : row)?.click();
        document.removeEventListener('click', stop, true);
        await new Promise((r) => setTimeout(r, 2500));
        return row?.querySelector('input')?.checked;
      }, target);
      const engine = (await sessionState(control))?.engine;
      check(`nor when it stops a click on the ${target} before the panel sees it`, engine?.cloneConsent === false && shown === false, `shown ${shown}, engine ${engine?.cloneConsent}`);
    }
    // The panel starts as a small button and opens with your own click.
    const panelState = () =>
      meet.evaluate(() => {
        const panel = document.getElementById('meet-tercuman-overlay')?.shadowRoot?.querySelector('.panel');
        return { small: panel?.classList.contains('min'), width: Math.round(panel?.getBoundingClientRect().width || 0) };
      });
    const first = await panelState();
    check('the panel starts as a small button', first.small === true && first.width > 0 && first.width < 260, JSON.stringify(first));
    await meet.locator('#meet-tercuman-overlay .headline').click();
    const opened = await waitFor(async () => (await panelState()).small === false, 2000, 100);
    check('a click on the button opens the panel', Boolean(opened), JSON.stringify(await panelState()));
    // A real click (trusted input from the browser) still gives and withdraws consent.
    await meet.locator('#meet-tercuman-overlay .clone input').click();
    const granted = await waitFor(async () => (await sessionState(control))?.engine?.cloneConsent === true, 3000, 200);
    await meet.locator('#meet-tercuman-overlay .clone input').click();
    const withdrawn = await waitFor(async () => (await sessionState(control))?.engine?.cloneConsent === false, 3000, 200);
    check('your own click on the box still gives and withdraws consent', Boolean(granted) && Boolean(withdrawn), `${granted} / ${withdrawn}`);
    await meet.locator('#meet-tercuman-overlay .icon:not(.open):not(.stop)').click();
    const closed = await waitFor(async () => (await panelState()).small === true, 2000, 100);
    check('the minimize button makes it small again', Boolean(closed));
    check('a normal build ignores a page request for debug copies', afterScript?.debugCopies === false, String(afterScript?.debugCopies));
    const bar = await waitFor(() => meet.evaluate(() => document.getElementById('meet-tercuman-subtitles')?.shadowRoot?.textContent || ''), 5000, 200);
    check('the translation also shows as subtitles low in the Meet window', (bar || '').includes('Merhaba, bugün görüşmeye katıldığınız için teşekkürler.'), (bar || '').slice(0, 120));
    const outgoing = await waitFor(async () => done((await readCaptions(meet)).outgoing), 30000, 300);
    check('my Turkish is transcribed and shown in English', outgoing?.translation === 'Friday at three works for us.', JSON.stringify(outgoing));
    const heard = await maxLevel(meet, 4000);
    check('the far end receives my translated voice', heard > 0.01, `level ${heard.toFixed(3)}`);

    const sttLanguages = stats.stt.map((s) => s.language).sort();
    check('one Scribe session per direction, in the right languages', sttLanguages.includes('en') && sttLanguages.includes('tr'), sttLanguages.join(','));
    const ask = stats.claude[0] || {};
    check('Claude requests use Opus 5.5 at low effort with the default fallback', ask.model === 'claude-opus-5-5' && ask.effort === 'low' && ask.fallbacks === 'default' && ask.beta.includes('server-side-fallback-2026-07-01'), JSON.stringify(ask));
    const ttsIn = stats.tts.filter((t) => t.language_code === 'tr');
    const ttsOut = stats.tts.filter((t) => t.language_code === 'en');
    check('speech is requested as 24 kHz PCM in both languages', ttsIn.length > 0 && ttsOut.length > 0 && stats.tts.every((t) => t.format === 'pcm_24000'), `tr ${ttsIn.length}, en ${ttsOut.length}`);
    check('my translation uses my voice and theirs a different one', ttsOut[0]?.voice !== ttsIn[0]?.voice, `${ttsOut[0]?.voice} / ${ttsIn[0]?.voice}`);

    const status = (await sessionState(control))?.engine;
    check('latency is measured', status?.latencyMs != null, `${status?.latencyMs} ms`);
    check('usage is counted', status?.usage?.ttsChars > 0 && status?.usage?.claudeTokens > 0 && status?.usage?.sttMinutes > 0, JSON.stringify(status?.usage));
    check('the engine reported no error', !status?.error, status?.error || '');

    // Subtitles only: translations keep coming, speech requests stop.
    await send(control, { type: 'options', options: { incomingMode: 'text' } });
    await sleep(500);
    const ttsInBefore = stats.tts.filter((t) => t.language_code === 'tr').length;
    const claudeBefore = stats.claude.filter((c) => /thanks/i.test(c.utterance)).length;
    await sleep(8000);
    const ttsInAfter = stats.tts.filter((t) => t.language_code === 'tr').length;
    const claudeAfter = stats.claude.filter((c) => /thanks/i.test(c.utterance)).length;
    check('subtitle mode keeps translating the counterpart', claudeAfter > claudeBefore, `${claudeBefore} -> ${claudeAfter}`);
    check('subtitle mode asks for no speech at all', ttsInAfter === ttsInBefore, `${ttsInBefore} -> ${ttsInAfter}`);
    const saved = await control.evaluate(async () => (await chrome.storage.local.get('settings')).settings.incomingMode);
    check('the chosen mode is remembered for next time', saved === 'text', saved);

    // Muted in Meet: none of my speech is translated or sent.
    await meet.evaluate(() => window.__test.mute(true));
    await sleep(1500);
    const outBefore = stats.tts.filter((t) => t.language_code === 'en').length;
    await sleep(7000);
    const outAfter = stats.tts.filter((t) => t.language_code === 'en').length;
    const mutedLevel = await maxLevel(meet, 1000);
    check('while muted my speech is not translated', outAfter === outBefore, `${outBefore} -> ${outAfter}`);
    check('while muted nothing reaches the far end', mutedLevel < 0.005, `level ${mutedLevel.toFixed(4)}`);
    await meet.evaluate(() => window.__test.mute(false));

    // Translation to them off: they hear my real microphone again.
    await send(control, { type: 'options', options: { outgoingMode: 'off' } });
    await sleep(1500);
    const real = await maxLevel(meet, 3000);
    check('with my translation off the far end hears my real voice', real > 0.01, `level ${real.toFixed(3)}`);
    check('Meet still sees its own microphone track', await meet.evaluate(() => window.__test.senderShowsMic()));

    await send(control, { type: 'stop' });
    check('no script errors on the Meet page', env.pageErrors.length === 0, env.pageErrors.join(' | '));
  } finally {
    await env.context.close();
    await rm(env.userDataDir, { recursive: true, force: true });
    mock.close();
  }
}

// The transcripts the engine kept, read from the extension's own database.
function readTranscripts(control) {
  return control.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('meet-tercuman');
        open.onerror = () => resolve([]);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('transcripts')) return resolve([]);
          const req = db.transaction('transcripts').objectStore('transcripts').getAll();
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve([]);
        };
      }),
  );
}

// Translation on a stand-in Ollama server (plain HTTP on 127.0.0.1, refusing any Origin
// header), with Claude behind it.
async function ollamaTranslationTest() {
  console.log('\n== Translation on a local mock Ollama server (Claude behind it) ==');
  const mock = await startMockApi({
    cert: readFileSync(path.join(fixtures, 'mock-cert.pem')),
    key: readFileSync(path.join(fixtures, 'mock-key.pem')),
  });
  const ollama = await startMockOllama();
  const env = await launch({ micWav: path.join(fixtures, 'turkish.wav'), remoteWav: path.join(fixtures, 'english.wav'), proxyPort: mock.port });
  const { control, meet, tabId } = env;
  const setSettings = (patch) =>
    control.evaluate(async (p) => {
      const { settings } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...(settings || {}), ...p } });
    }, patch);
  try {
    await setSettings({ elevenLabsKey: 'mock-el', anthropicKey: 'mock-an', translationProvider: 'ollama', claudeModel: 'claude-haiku-5-5', ollamaUrl: '', ollamaModel: 'mock-gemma:12b' });
    const bare = await send(control, { type: 'start', tabId, options: { incomingMode: 'voice', outgoingMode: 'voice' } });
    check('Ollama without a server address does not start and says so', bare?.ok === false && /address|adres/i.test(bare?.error || ''), bare?.error);

    await setSettings({ ollamaUrl: ollama.url });
    // The service worker puts the header rule in place when the settings change.
    const rule = await waitFor(() => env.worker.evaluate(async () => (await chrome.declarativeNetRequest.getDynamicRules()).some((r) => r.condition.requestDomains?.includes('127.0.0.1'))), 5000, 200);
    check('a header rule is set for the Ollama server', rule);
    const start = await send(control, { type: 'start', tabId, options: { incomingMode: 'voice', outgoingMode: 'voice' } });
    check('translation on Ollama starts', start?.ok === true, start?.error);
    if (!start?.ok) return;

    const incoming = await waitFor(async () => done((await readCaptions(meet)).incoming), 30000, 300);
    check('the counterpart is translated into Turkish by Ollama', incoming?.translation === 'Merhaba, bugün görüşmeye katıldığınız için teşekkürler.' && ollama.stats.chats.length > 0, JSON.stringify(incoming));
    const outgoing = await waitFor(async () => done((await readCaptions(meet)).outgoing), 30000, 300);
    check('my Turkish is translated into English by Ollama', outgoing?.translation === 'Friday at three works for us.', JSON.stringify(outgoing));
    check('Ollama is asked with the chosen model and without thinking', ollama.stats.chats.every((c) => c.model === 'mock-gemma:12b' && c.think === false), JSON.stringify(ollama.stats.chats[0]));
    check('no request reached Ollama with an Origin header', ollama.stats.refused === 0, `${ollama.stats.refused} refused`);
    check('Claude was not needed while Ollama worked', mock.stats.claude.length === 0, `${mock.stats.claude.length}`);

    // The server goes away: the next sentences are translated by the backup (Claude).
    ollama.faults.down = true;
    const backup = await waitFor(() => mock.stats.claude.length > 0, 40000, 300);
    check('when the Ollama server is gone, Claude translates', backup, `${mock.stats.claude.length} claude`);
    const status = (await sessionState(control))?.engine;
    check('the call goes on without an error', !status?.error, status?.error || '');

    await send(control, { type: 'stop' });
    check('no script errors on the Meet page', env.pageErrors.length === 0, env.pageErrors.join(' | '));
  } finally {
    await env.context.close();
    await rm(env.userDataDir, { recursive: true, force: true });
    mock.close();
    ollama.close();
  }
}

// A video page (not a call): its sound becomes subtitles, or speech over a quieter original.
async function mediaTest() {
  console.log('\n== A video tab (not a call): subtitles and voice over ==');
  const mock = await startMockApi({
    cert: readFileSync(path.join(fixtures, 'mock-cert.pem')),
    key: readFileSync(path.join(fixtures, 'mock-key.pem')),
  });
  const env = await launch({ micWav: path.join(fixtures, 'turkish.wav'), remoteWav: path.join(fixtures, 'english.wav'), proxyPort: mock.port });
  const { context, control, worker } = env;
  const setSettings = (patch) =>
    control.evaluate(async (p) => {
      const { settings } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...(settings || {}), ...p } });
    }, patch);
  try {
    await setSettings({ elevenLabsKey: 'mock-el', anthropicKey: 'mock-an', claudeModel: 'claude-opus-5-5', speechProvider: 'elevenlabs', subtitleBar: true, uiLanguage: 'en' });
    await context.route('https://media.test/**', (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/talk.wav') return route.fulfill({ path: path.join(fixtures, 'english.wav'), contentType: 'audio/wav' });
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>A talk</title><body><div id="player"><audio id="a" src="/talk.wav" autoplay loop></audio></div></body>' });
    });
    const video = await context.newPage();
    const pageErrors = [];
    video.on('pageerror', (err) => pageErrors.push(err.message));
    await video.goto('https://media.test/watch?v=1');
    await video.evaluate(() => document.getElementById('a').play().catch(() => {}));
    await video.bringToFront();
    const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ url: 'https://media.test/*' }))[0].id);

    const start = await send(control, { type: 'start', tabId, options: { mode: 'media', incomingMode: 'text' } });
    check('a video tab can be translated', start?.ok === true, start?.error);
    if (!start?.ok) return;
    const subtitles = () => video.evaluate(() => document.getElementById('meet-tercuman-subtitles')?.shadowRoot?.textContent || '');
    const shown = await waitFor(async () => (await subtitles()).includes('Merhaba, bugün görüşmeye katıldığınız için teşekkürler.'), 30000, 300);
    check('its sound shows as Turkish subtitles on the page', shown, (await subtitles()).slice(0, 120));
    const status = (await sessionState(control))?.engine;
    check('no microphone is opened and nothing of mine is translated', status?.stt?.out === 'off' && status?.outgoingMode === 'off', JSON.stringify(status?.stt));
    check('subtitles alone ask for no speech', mock.stats.tts.length === 0, `${mock.stats.tts.length} requests`);

    const spokenBefore = mock.stats.tts.length;
    await send(control, { type: 'options', options: { incomingMode: 'voice' } });
    const spoken = await waitFor(() => mock.stats.tts.length > spokenBefore, 30000, 300);
    check('voice translation speaks over it', spoken, `${mock.stats.tts.length - spokenBefore} requests`);

    // The panel's Transcript button saves what was said so far and opens it in a tab.
    const txButton = video.locator('#meet-tercuman-overlay button[title="Save the transcript so far and open it"]');
    if (!(await txButton.isVisible().catch(() => false))) await video.locator('#meet-tercuman-overlay .icon.open').click();
    const txPage = context.waitForEvent('page', { predicate: (p) => p.url().includes('/recording.html?transcript='), timeout: 15000 }).catch(() => null);
    await txButton.click();
    const txTab = await txPage;
    const txText = txTab ? await waitFor(async () => (await txTab.locator('#transcriptView').textContent().catch(() => '')) || '', 10000, 300) : '';
    check('the Transcript button opens the transcript so far', /transcript: A talk/.test(txText) && txText.includes('→ Merhaba, bugün görüşmeye katıldığınız için teşekkürler.'), txText.slice(0, 160));
    await txTab?.close();
    await video.bringToFront();

    // A video site moves to the next video without leaving the tab.
    await video.evaluate(() => history.pushState({}, '', '/watch?v=2'));
    await sleep(1500);
    check('moving to another video on the same site keeps translating', (await sessionState(control))?.status === 'running');

    await send(control, { type: 'stop' });
    const kept = await waitFor(async () => (await readTranscripts(control)).find((t) => t.kind === 'media' && t.endedAt), 10000, 300);
    check('the video leaves a transcript with its title and translations', kept?.title === 'A talk' && kept.lines.some((l) => l.translation === 'Merhaba, bugün görüşmeye katıldığınız için teşekkürler.'), JSON.stringify({ title: kept?.title, lines: kept?.lines?.length }));
    const again = await send(control, { type: 'start', tabId, options: { mode: 'media', incomingMode: 'text' } });
    const hosts = await waitFor(() => video.evaluate(() => document.querySelectorAll('#meet-tercuman-subtitles').length), 10000, 300);
    check('starting again does not put the subtitles in twice', again?.ok === true && hosts === 1, `ok ${again?.ok}, ${hosts} subtitle bars`);
    await send(control, { type: 'stop' });
    check('no script errors on the video page', pageErrors.length === 0, pageErrors.join(' | '));
  } finally {
    await env.context.close();
    await rm(env.userDataDir, { recursive: true, force: true });
    mock.close();
  }
}

// Translation on a server with OpenAI's API of one's own (like LM Studio), on 127.0.0.1.
async function openaiTranslationTest() {
  console.log('\n== Translation on a local OpenAI-compatible server (no Claude key) ==');
  const mock = await startMockApi({
    cert: readFileSync(path.join(fixtures, 'mock-cert.pem')),
    key: readFileSync(path.join(fixtures, 'mock-key.pem')),
  });
  const server = await startMockOpenAI();
  const env = await launch({ micWav: path.join(fixtures, 'turkish.wav'), remoteWav: path.join(fixtures, 'english.wav'), proxyPort: mock.port });
  const { control, meet, tabId } = env;
  const setSettings = (patch) =>
    control.evaluate(async (p) => {
      const { settings } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...(settings || {}), ...p } });
    }, patch);
  try {
    await setSettings({ elevenLabsKey: 'mock-el', anthropicKey: '', translationProvider: 'openai', openaiUrl: server.url, openaiKey: server.key, openaiModel: '' });
    const bare = await send(control, { type: 'start', tabId, options: { incomingMode: 'voice', outgoingMode: 'voice' } });
    check('without a model chosen it does not start and says so', bare?.ok === false && /model/i.test(bare?.error || ''), bare?.error);
    await setSettings({ openaiModel: 'mock-llm' });
    const start = await send(control, { type: 'start', tabId, options: { incomingMode: 'voice', outgoingMode: 'voice' } });
    check('translation on an OpenAI-compatible server starts', start?.ok === true, start?.error);
    if (!start?.ok) return;
    const incoming = await waitFor(async () => done((await readCaptions(meet)).incoming), 30000, 300);
    check('the counterpart is translated by that server', incoming?.translation === 'Merhaba, bugün görüşmeye katıldığınız için teşekkürler.', JSON.stringify(incoming));
    const outgoing = await waitFor(async () => done((await readCaptions(meet)).outgoing), 30000, 300);
    check('my Turkish is translated by that server', outgoing?.translation === 'Friday at three works for us.', JSON.stringify(outgoing));
    check('the chosen model is asked, streamed, with the key', server.stats.chats.length > 0 && server.stats.chats.every((c) => c.model === 'mock-llm' && c.stream === true) && server.stats.refused === 0, JSON.stringify(server.stats.chats[0]));
    check('no Claude request was made', mock.stats.claude.length === 0, String(mock.stats.claude.length));
    await send(control, { type: 'stop' });
    check('no script errors on the Meet page', env.pageErrors.length === 0, env.pageErrors.join(' | '));
  } finally {
    await env.context.close();
    await rm(env.userDataDir, { recursive: true, force: true });
    mock.close();
    server.close();
  }
}

// Google Gemini through the mock API: the key in a header, thinking turned down step by
// step, Claude Haiku behind it.
async function geminiTranslationTest() {
  console.log('\n== Translation with Google Gemini (mock, Claude behind it) ==');
  const mock = await startMockApi({
    cert: readFileSync(path.join(fixtures, 'mock-cert.pem')),
    key: readFileSync(path.join(fixtures, 'mock-key.pem')),
  });
  const env = await launch({ micWav: path.join(fixtures, 'turkish.wav'), remoteWav: path.join(fixtures, 'english.wav'), proxyPort: mock.port });
  const { control, meet, tabId } = env;
  const setSettings = (patch) =>
    control.evaluate(async (p) => {
      const { settings } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...(settings || {}), ...p } });
    }, patch);
  try {
    await setSettings({ elevenLabsKey: 'mock-el', anthropicKey: 'mock-an', translationProvider: 'gemini', geminiKey: '', geminiModel: 'gemini-3.5-flash-lite' });
    const bare = await send(control, { type: 'start', tabId, options: { incomingMode: 'voice', outgoingMode: 'voice' } });
    check('Gemini without a key does not start and names the missing key', bare?.ok === false && /Gemini/.test(bare?.error || ''), bare?.error);
    await setSettings({ geminiKey: 'wrong-key' });
    const wrong = await send(control, { type: 'start', tabId, options: { incomingMode: 'voice', outgoingMode: 'voice' } });
    const wrongState = (await sessionState(control))?.engine;
    check('a wrong Gemini key is reported as a key error', /Gemini/.test(`${wrong?.error || ''} ${wrongState?.error || ''} ${JSON.stringify(wrongState?.warnings || '')}`) && /key|anahtar/i.test(`${wrong?.error || ''} ${wrongState?.error || ''} ${JSON.stringify(wrongState?.warnings || '')}`), `${wrong?.error || ''} ${wrongState?.error || ''} ${JSON.stringify(wrongState?.warnings || '')}`);
    await send(control, { type: 'stop' });
    await setSettings({ geminiKey: 'mock-gemini' });
    const start = await send(control, { type: 'start', tabId, options: { incomingMode: 'voice', outgoingMode: 'voice' } });
    check('translation with Gemini starts', start?.ok === true, start?.error);
    if (!start?.ok) return;
    const incoming = await waitFor(async () => done((await readCaptions(meet)).incoming), 30000, 300);
    check('the counterpart is translated into Turkish by Gemini', incoming?.translation === 'Merhaba, bugün görüşmeye katıldığınız için teşekkürler.', JSON.stringify(incoming));
    const outgoing = await waitFor(async () => done((await readCaptions(meet)).outgoing), 30000, 300);
    check('my Turkish is translated into English by Gemini', outgoing?.translation === 'Friday at three works for us.', JSON.stringify(outgoing));
    const asked = mock.stats.gemini;
    check('a refused thinking budget of 0 is followed by MINIMAL, which is then kept', asked[0]?.thinking?.thinkingBudget === 0 && asked.slice(1).every((g) => g.thinking?.thinkingLevel === 'MINIMAL') && asked.filter((g) => g.thinking?.thinkingBudget === 0).length === 1, JSON.stringify(asked.map((g) => g.thinking)));
    check('Gemini gets the system prompt and the chosen model', asked.every((g) => g.system && g.model === 'gemini-3.5-flash-lite'), JSON.stringify(asked[0]));
    check('Claude was not needed while Gemini worked', mock.stats.claude.length === 0, String(mock.stats.claude.length));
    const services = await servicesLine(meet);
    check('the panel names Gemini as the translator', /Google Gemini|Gemini/.test(services), services);

    // Gemini overloaded: Claude Haiku translates the next sentences.
    mock.faults.gemini = 503;
    await send(control, { type: 'stop' });
    const again = await send(control, { type: 'start', tabId, options: { incomingMode: 'voice', outgoingMode: 'voice' } });
    check('the call starts again', again?.ok === true, again?.error);
    const backup = await waitFor(() => mock.stats.claude.length > 0, 40000, 300);
    check('when Gemini fails, Claude translates', backup, `${mock.stats.claude.length} claude`);
    await send(control, { type: 'stop' });
    check('no script errors on the Meet page', env.pageErrors.length === 0, env.pageErrors.join(' | '));
  } finally {
    await env.context.close();
    await rm(env.userDataDir, { recursive: true, force: true });
    mock.close();
  }
}

// Everything on one server with OpenAI's API (like LocalAI): recognition, translation and speech.
async function openaiSpeechTest() {
  console.log('\n== Speech and translation on one OpenAI-compatible server (no ElevenLabs, no Claude) ==');
  const mock = await startMockApi({
    cert: readFileSync(path.join(fixtures, 'mock-cert.pem')),
    key: readFileSync(path.join(fixtures, 'mock-key.pem')),
  });
  const server = await startMockOpenAI();
  const env = await launch({ micWav: path.join(fixtures, 'turkish.wav'), remoteWav: path.join(fixtures, 'english.wav'), proxyPort: mock.port });
  const { control, meet, tabId } = env;
  const setSettings = (patch) =>
    control.evaluate(async (p) => {
      const { settings } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...(settings || {}), ...p } });
    }, patch);
  try {
    await setSettings({
      elevenLabsKey: '', anthropicKey: '',
      translationProvider: 'openai', openaiUrl: server.url, openaiKey: server.key, openaiModel: 'mock-llm',
      speechProvider: 'openai', oaiSttServer: 'custom', oaiSttUrl: server.url, oaiSttKey: server.key, oaiSttModel: 'whisper-mock',
      oaiTtsServer: 'custom', oaiTtsUrl: server.url, oaiTtsKey: server.key, oaiTtsModel: 'tts-mock', oaiMyVoice: 'echo', oaiTheirVoice: 'nova',
    });
    const start = await send(control, { type: 'start', tabId, options: { incomingMode: 'voice', outgoingMode: 'voice' } });
    check('a call starts with speech on an OpenAI-compatible server', start?.ok === true, start?.error);
    if (!start?.ok) return;
    const incoming = await waitFor(async () => done((await readCaptions(meet)).incoming), 40000, 300);
    check('their speech is recognized by that server and translated', incoming?.translation === 'Merhaba, bugün görüşmeye katıldığınız için teşekkürler.', JSON.stringify(incoming));
    const outgoing = await waitFor(async () => done((await readCaptions(meet)).outgoing), 40000, 300);
    check('my speech is recognized by that server and translated', outgoing?.translation === 'Friday at three works for us.', JSON.stringify(outgoing));
    const heard = await maxLevel(meet, 5000);
    check('the far end receives my translated voice from that server', heard > 0.01, `level ${heard.toFixed(3)}`);
    const t0 = server.stats.transcriptions;
    check('recordings go up with the chosen model, in both languages', t0.length > 0 && t0.every((x) => x.model === 'whisper-mock') && t0.some((x) => x.language === 'en') && t0.some((x) => x.language === 'tr'), JSON.stringify(t0.slice(0, 2)));
    const sp = server.stats.speech;
    check('speech is asked for as raw PCM in the chosen voices', sp.length > 0 && sp.every((x) => x.model === 'tts-mock' && x.format === 'pcm') && sp.some((x) => x.voice === 'echo') && sp.some((x) => x.voice === 'nova'), JSON.stringify(sp.slice(0, 2)));
    check('nothing went to ElevenLabs or Claude', !mock.stats.requests.some((x) => /elevenlabs|anthropic/.test(x)), mock.stats.requests.slice(0, 4).join(', '));
    await send(control, { type: 'stop' });
    check('no script errors on the Meet page', env.pageErrors.length === 0, env.pageErrors.join(' | '));
  } finally {
    await env.context.close();
    await rm(env.userDataDir, { recursive: true, force: true });
    mock.close();
    server.close();
  }
}

// Everything on the person's own servers: the real speech server (speech-server/, with
// its stand-in engines) for recognition and speech, and a stand-in Ollama for translation.
// Soniox hears and translates both sides in one stream; the voice still comes from
// ElevenLabs (mocked). No translation service and no Anthropic key are involved.
async function sonioxTest() {
  console.log('\n== Soniox: recognition and translation in one stream (mock, no Claude) ==');
  const mock = await startMockApi({
    cert: readFileSync(path.join(fixtures, 'mock-cert.pem')),
    key: readFileSync(path.join(fixtures, 'mock-key.pem')),
  });
  const env = await launch({ micWav: path.join(fixtures, 'turkish.wav'), remoteWav: path.join(fixtures, 'english.wav'), proxyPort: mock.port });
  const { control, meet, tabId } = env;
  const setSettings = (patch) =>
    control.evaluate(async (p) => {
      const { settings } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...(settings || {}), ...p } });
    }, patch);
  try {
    await setSettings({ sonioxKey: '', elevenLabsKey: 'mock-el', speechProvider: 'elevenlabs', translationProvider: 'soniox', anthropicKey: '' });
    const bare = await send(control, { type: 'start', tabId, options: { incomingMode: 'voice', outgoingMode: 'voice' } });
    check('Soniox without a key does not start and names it', bare?.ok === false && /soniox/i.test(bare?.error || ''), bare?.error);

    await setSettings({ sonioxKey: 'mock-soniox' });
    const start = await send(control, { type: 'start', tabId, options: { incomingMode: 'voice', outgoingMode: 'voice' } });
    check('Soniox starts with no Anthropic key', start?.ok === true, start?.error);
    if (!start?.ok) return;
    const incoming = await waitFor(async () => done((await readCaptions(meet)).incoming), 30000, 300);
    check('the counterpart is heard and translated into Turkish by Soniox', incoming?.translation === 'Merhaba, bugün görüşmeye katıldığınız için teşekkürler.', JSON.stringify(incoming));
    const named = await waitFor(() => servicesLine(meet), 4000);
    check('the panel says Soniox hears and translates', /^Hears and translates: Soniox · speaks: /.test(named), named);
    const outgoing = await waitFor(async () => done((await readCaptions(meet)).outgoing), 30000, 300);
    check('my Turkish is translated into English by Soniox', outgoing?.translation === 'Friday at three works for us.', JSON.stringify(outgoing));
    const targets = mock.stats.soniox.map((x) => x.config?.translation?.target_language).sort();
    check('one Soniox stream per side, each translating into the other language', targets.join(',') === 'en,tr' && mock.stats.soniox.every((x) => x.config?.audio_format === 'pcm_s16le'), targets.join(','));
    check('no translation service was asked', mock.stats.claude.length === 0 && mock.stats.free.length === 0, `${mock.stats.claude.length} claude, ${mock.stats.free.length} free`);
    const spoken = await waitFor(() => mock.stats.tts.some((r) => /Merhaba/.test(r.text || '')), 15000, 300);
    check('the translation is spoken, starting with its first clause', spoken && mock.stats.tts.find((r) => /Merhaba/.test(r.text || ''))?.text.length < 60, JSON.stringify(mock.stats.tts.slice(0, 3).map((r) => r.text)));
    const heard = await meet.evaluate(() => document.getElementById('meet-tercuman-overlay')?.shadowRoot?.textContent || '');
    check('the panel shows what was said with its translation', heard.includes('Hi, thanks for joining the call today.'), heard.slice(0, 200));
    await send(control, { type: 'stop' });
    const kept = await waitFor(async () => (await readTranscripts(control)).find((t) => t.endedAt && t.lines?.length), 10000, 300);
    check('the transcript keeps the whole sentence and its translation', kept?.lines?.some((l) => l.source === 'Hi, thanks for joining the call today.' && l.translation === 'Merhaba, bugün görüşmeye katıldığınız için teşekkürler.'), JSON.stringify(kept?.lines?.slice(0, 2)));

    // Soniox speaks the translation too: no ElevenLabs request, its own voices.
    await setSettings({ speechProvider: 'soniox', elevenLabsKey: '' });
    const ttsBefore = mock.stats.tts.length;
    const voiced = await send(control, { type: 'start', tabId, options: { incomingMode: 'voice', outgoingMode: 'voice' } });
    check('Soniox hears, translates and speaks with no ElevenLabs key', voiced?.ok === true, voiced?.error);
    const sonioxSpoke = await waitFor(() => mock.stats.sonioxTts.find((r) => /Merhaba/.test(r.text || '')), 30000, 300);
    check('the translation is spoken by a Soniox voice, in Turkish, 24 kHz PCM', sonioxSpoke?.language === 'tr' && sonioxSpoke?.voice === 'Emma' && sonioxSpoke?.audio_format === 'pcm_s16le' && sonioxSpoke?.sample_rate === 24000, JSON.stringify(sonioxSpoke));
    const mine = await waitFor(() => mock.stats.sonioxTts.find((r) => /Friday/.test(r.text || '')), 30000, 300);
    check('my translation is spoken in English with my Soniox voice', mine?.language === 'en' && mine?.voice === 'Daniel', JSON.stringify(mine));
    check('ElevenLabs was not asked to speak', mock.stats.tts.length === ttsBefore, `${mock.stats.tts.length - ttsBefore} requests`);
    const speaks = await waitFor(() => servicesLine(meet), 4000);
    check('the panel says Soniox speaks too', speaks === 'Hears and translates: Soniox · speaks: Soniox', speaks);
    await send(control, { type: 'stop' });
    await sleep(500);

    // Soniox as the speech service with Claude translating: Soniox only listens and speaks.
    await setSettings({ translationProvider: 'claude', anthropicKey: 'mock-an', claudeModel: 'claude-haiku-5-5' });
    const streamsBefore = mock.stats.soniox.length;
    const claudeBefore = mock.stats.claude.length;
    const spokenBefore = mock.stats.sonioxTts.length;
    const listening = await send(control, { type: 'start', tabId, options: { incomingMode: 'voice', outgoingMode: 'off' } });
    check('Soniox listens and speaks while Claude translates', listening?.ok === true, listening?.error);
    const claudeSpoke = await waitFor(() => mock.stats.sonioxTts.slice(spokenBefore).find((r) => /Merhaba/.test(r.text || '')), 30000, 300);
    const listenStreams = mock.stats.soniox.slice(streamsBefore);
    check('the Soniox stream only listens (no translation asked of it)', listenStreams.length > 0 && listenStreams.every((x) => x.config && !x.config.translation && x.config.language_hints?.includes('en')), JSON.stringify(listenStreams.map((x) => x.config?.translation || null)));
    check('Claude translates what Soniox heard, and Soniox speaks it', mock.stats.claude.length > claudeBefore && Boolean(claudeSpoke), `${mock.stats.claude.length - claudeBefore} claude, ${JSON.stringify(claudeSpoke?.text)}`);
    const roles = await waitFor(() => servicesLine(meet), 4000);
    check('the panel names each service', roles === 'Hears: Soniox · translates: Claude · speaks: Soniox', roles);
    await send(control, { type: 'stop' });
    await setSettings({ speechProvider: 'elevenlabs', elevenLabsKey: 'mock-el', translationProvider: 'soniox' });
    await sleep(500);

    // An empty balance ends the session with a clear reason.
    mock.faults.soniox = 402;
    const again = await send(control, { type: 'start', tabId, options: { incomingMode: 'voice', outgoingMode: 'off' } });
    const ended = await waitFor(async () => {
      const state = await sessionState(control);
      return state?.status !== 'running' && /soniox/i.test(state?.error || state?.engine?.error || '') ? state : null;
    }, 15000, 300);
    check('an empty Soniox balance stops the translation and says so', again?.ok === true && Boolean(ended), JSON.stringify(await sessionState(control))?.slice(0, 240));
    await send(control, { type: 'stop' }).catch(() => {});
    check('no script errors on the Meet page', env.pageErrors.length === 0, env.pageErrors.join(' | '));
  } finally {
    await env.context.close();
    await rm(env.userDataDir, { recursive: true, force: true });
    mock.close();
  }
}

async function startSpeechServer() {
  const port = 18000 + Math.floor(Math.random() * 2000);
  const python = process.platform === 'win32' ? 'python' : 'python3';
  const child = spawn(python, [path.join(root, 'speech-server', 'server.py'), '--engine', 'fake', '--host', '127.0.0.1', '--port', String(port), '--key', 'e2e-key'], { stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}`;
  const up = await waitFor(() => fetch(`${url}/health`).then((r) => r.ok, () => false), 20000, 250);
  if (!up) {
    child.kill();
    throw new Error('the speech server did not start (is Python with fastapi and uvicorn installed?)');
  }
  return { url, close: () => child.kill() };
}

async function localServersTest() {
  console.log('\n== Everything local: the speech server and a mock Ollama (no ElevenLabs, no Claude) ==');
  const mock = await startMockApi({
    cert: readFileSync(path.join(fixtures, 'mock-cert.pem')),
    key: readFileSync(path.join(fixtures, 'mock-key.pem')),
  });
  const ollama = await startMockOllama();
  let speech;
  try {
    speech = await startSpeechServer();
  } catch (err) {
    check('the local speech server starts', false, err.message);
    mock.close();
    ollama.close();
    return;
  }
  const env = await launch({ micWav: path.join(fixtures, 'turkish.wav'), remoteWav: path.join(fixtures, 'english.wav'), proxyPort: mock.port });
  const { control, meet, tabId } = env;
  const setSettings = (patch) =>
    control.evaluate(async (p) => {
      const { settings } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...(settings || {}), ...p } });
    }, patch);
  try {
    await setSettings({
      elevenLabsKey: '', anthropicKey: '', groqKey: '',
      claudeModel: 'ollama', ollamaUrl: ollama.url, ollamaModel: 'mock-gemma:12b',
      speechProvider: 'local', localSpeechUrl: speech.url, localSpeechKey: 'wrong-key', myVoiceId: '', theirVoiceId: '',
    });
    const refused = await send(control, { type: 'start', tabId, options: { incomingMode: 'voice', outgoingMode: 'voice' } });
    check('a wrong speech server key stops the start with a clear reason', refused?.ok === false && /key|anahtar/i.test(refused?.error || ''), refused?.error);

    await setSettings({ localSpeechKey: 'e2e-key' });
    const start = await send(control, { type: 'start', tabId, options: { incomingMode: 'voice', outgoingMode: 'voice' } });
    check('translation starts with no ElevenLabs and no Anthropic key', start?.ok === true, start?.error);
    if (!start?.ok) return;

    const incoming = await waitFor(async () => done((await readCaptions(meet)).incoming), 40000, 300);
    check('the local server hears the counterpart and Ollama translates it', incoming?.translation === 'Merhaba, bugün görüşmeye katıldığınız için teşekkürler.', JSON.stringify(incoming));
    const outgoing = await waitFor(async () => done((await readCaptions(meet)).outgoing), 40000, 300);
    check('the local server hears me and Ollama translates it', outgoing?.translation === 'Friday at three works for us.', JSON.stringify(outgoing));
    const heard = await maxLevel(meet, 5000);
    check('the far end receives my translated voice from the local server', heard > 0.01, `level ${heard.toFixed(3)}`);
    const status = (await sessionState(control))?.engine;
    check('the engine reported no error', !status?.error, status?.error || '');
    check('nothing went to ElevenLabs or Claude', !mock.stats.requests.some((r) => /elevenlabs|anthropic/.test(r)), mock.stats.requests.slice(0, 5).join(', '));
    check('the call costs nothing', status?.usage?.usd === 0, JSON.stringify(status?.usage));

    await send(control, { type: 'stop' });
    check('no script errors on the Meet page', env.pageErrors.length === 0, env.pageErrors.join(' | '));
  } finally {
    await env.context.close();
    await rm(env.userDataDir, { recursive: true, force: true });
    mock.close();
    ollama.close();
    speech.close();
  }
}

// Real ElevenLabs (speech recognition and speech) through the extension, with Claude
// mocked unless an Anthropic key is in .env too.
async function realElevenLabsTest(keys) {
  console.log(`\n== Real ElevenLabs in the extension (${keys.an ? 'real Claude' : 'Claude mocked'}) ==`);
  const mock = await startMockApi({
    cert: readFileSync(path.join(fixtures, 'mock-cert.pem')),
    key: readFileSync(path.join(fixtures, 'mock-key.pem')),
    passthrough: keys.an ? ['api.elevenlabs.io', 'api.anthropic.com'] : ['api.elevenlabs.io'],
  });
  const env = await launch({ micWav: path.join(fixtures, 'turkish.wav'), remoteWav: path.join(fixtures, 'english.wav'), proxyPort: mock.port });
  const { control, meet, tabId } = env;
  const { stats } = mock;
  try {
    await control.evaluate(async (k) => {
      const { settings } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...(settings || {}), elevenLabsKey: k.el, anthropicKey: k.an || 'mock-an', claudeModel: 'claude-opus-5-5' } });
    }, keys);
    const startedAt = Date.now();
    const start = await send(control, { type: 'start', tabId, options: { incomingMode: 'voice', outgoingMode: 'voice' } });
    check('a session with the real ElevenLabs key starts', start?.ok === true, start?.error);
    if (!start?.ok) return;

    const incoming = await waitFor(async () => done((await readCaptions(meet)).incoming), 30000, 300);
    check('real speech recognition hears the counterpart and the panel shows the translation', Boolean(incoming), JSON.stringify(incoming));
    console.log(`      first translated caption ${((Date.now() - startedAt) / 1000).toFixed(1)} s after start`);

    const outgoing = await waitFor(async () => done((await readCaptions(meet)).outgoing), 30000, 300);
    check('real speech recognition hears my Turkish', Boolean(outgoing), JSON.stringify(outgoing));
    const heard = await maxLevel(meet, 6000);
    check('real ElevenLabs speech reaches the far end', heard > 0.01, `level ${heard.toFixed(3)}`);

    await sleep(4000);
    if (!keys.an) {
      const english = stats.claude.map((c) => c.utterance).filter((u) => !/[çğışöü]/i.test(u));
      const sentences = (t) => (t.match(/[.!?](\s|$)/g) || []).length;
      console.log(`      utterances sent to translation: ${JSON.stringify(english.slice(0, 4))}`);
      check('long speech is translated sentence by sentence, not after the speaker stops', english.length >= 2 && english.some((u) => sentences(u) <= 2), `${english.length} pieces`);
    }
    const status = (await sessionState(control))?.engine;
    console.log(`      latency ${status?.latencyMs} ms, usage ${JSON.stringify(status?.usage)}`);
    check('latency is measured with the real services', status?.latencyMs != null, `${status?.latencyMs} ms`);
    check('the engine reported no error', !status?.error, status?.error || '');

    await mkdir(outDir, { recursive: true });
    const webm = Buffer.from(await meet.evaluate(() => window.__test.recording()), 'base64');
    await writeFile(path.join(outDir, 'far-end-real-elevenlabs.webm'), webm);
    console.log(`      far end audio saved to ${path.relative(root, path.join(outDir, 'far-end-real-elevenlabs.webm'))}`);
    await send(control, { type: 'stop' });
    check('no script errors on the Meet page', env.pageErrors.length === 0, env.pageErrors.join(' | '));
  } finally {
    await env.context.close();
    await rm(env.userDataDir, { recursive: true, force: true });
    mock.close();
  }
}

async function translationTest(keys) {
  console.log('\n== Translation round trip (uses the API keys in .env) ==');
  const env = await launch({ micWav: path.join(fixtures, 'turkish.wav'), remoteWav: path.join(fixtures, 'english.wav') });
  const { control, meet, tabId } = env;
  try {
    await control.evaluate(async (k) => {
      const { settings } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...(settings || {}), elevenLabsKey: k.el, anthropicKey: k.an, claudeModel: k.model } });
    }, { el: keys.el, an: keys.an, model: keys.model });

    const start = await send(control, { type: 'start', tabId, options: { incomingMode: 'voice', outgoingMode: 'voice' } });
    check('a translation session starts', start?.ok === true, start?.error);
    if (!start?.ok) return;

    const readCaptions = () =>
      meet.evaluate(() => {
        const root = document.getElementById('meet-tercuman-overlay')?.shadowRoot;
        if (!root) return { incoming: [], outgoing: [] };
        const pick = (sel) => [...root.querySelectorAll(`${sel} .item`)].map((el) => ({
          translation: el.querySelector('.tr')?.textContent || '',
          source: el.querySelector('.src')?.textContent || '',
        }));
        return { incoming: pick('.incoming'), outgoing: pick('.outgoing') };
      });

    const incoming = await waitFor(async () => {
      const c = await readCaptions();
      return c.incoming.find((x) => x.translation && x.translation !== '…') ? c : null;
    }, 45000, 500);
    const captions = await readCaptions();
    check('the counterpart is transcribed and translated into Turkish', Boolean(incoming), JSON.stringify(captions.incoming.slice(-2)));

    const outgoing = await waitFor(async () => {
      const c = await readCaptions();
      return c.outgoing.find((x) => x.translation && x.translation !== '…') ? c : null;
    }, 45000, 500);
    check('my Turkish is transcribed and translated into English', Boolean(outgoing), JSON.stringify((await readCaptions()).outgoing.slice(-2)));

    const heard = await maxLevel(meet, 6000);
    check('the far end receives the translated English voice', heard > 0.02, `level ${heard.toFixed(3)}`);

    const status = (await sessionState(control))?.engine;
    console.log(`      latency ${status?.latencyMs} ms, usage ${JSON.stringify(status?.usage)}`);
    check('latency is measured', status?.latencyMs != null, `${status?.latencyMs} ms`);
    check('the engine reported no error', !status?.error, status?.error || '');

    await mkdir(outDir, { recursive: true });
    const webm = Buffer.from(await meet.evaluate(() => window.__test.recording()), 'base64');
    await writeFile(path.join(outDir, 'far-end-received.webm'), webm);
    console.log(`      far end audio saved to ${path.relative(root, path.join(outDir, 'far-end-received.webm'))}`);

    const toText = await send(control, { type: 'options', options: { incomingMode: 'text' } });
    check('switching to subtitles works mid-call', toText?.ok === true);
    await send(control, { type: 'stop' });
  } finally {
    await env.context.close();
    await rm(env.userDataDir, { recursive: true, force: true });
  }
}

if (!existsSync(path.join(dist, 'manifest.json'))) {
  console.error('dist-test/ is missing: run npm run build:test first');
  process.exit(1);
}
await mkdir(fixtures, { recursive: true });
makeFixtures();
// ONLY=local,media runs only the suites whose names contain one of these words.
const only = (process.env.ONLY || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
const suites = { connectionTest, zoomTest, recordingTest, mockTranslationTest, geminiTranslationTest, ollamaTranslationTest, openaiTranslationTest, openaiSpeechTest, sonioxTest, localServersTest, mediaTest };
for (const [name, run] of Object.entries(suites)) {
  if (!only.length || only.some((w) => name.toLowerCase().includes(w))) await run();
}
const env = loadEnv();
// SKIP_REAL=1 runs only the keyless suites (no credits used).
if (env.ELEVENLABS_API_KEY && !process.env.SKIP_REAL && !only.length) {
  await realElevenLabsTest({ el: env.ELEVENLABS_API_KEY, an: env.ANTHROPIC_API_KEY || '' });
} else {
  console.log('\n(Real ElevenLabs check skipped: put ELEVENLABS_API_KEY in .env to run it.)');
}
if (env.ELEVENLABS_API_KEY && env.ANTHROPIC_API_KEY && !process.env.SKIP_REAL && !only.length) {
  await translationTest({ el: env.ELEVENLABS_API_KEY, an: env.ANTHROPIC_API_KEY, model: env.CLAUDE_MODEL || 'claude-opus-5-5' });
}
process.exit(summary());
