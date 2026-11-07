// Captures the promo video's frames (public/frames/*.png): the test build running on
// neutral stand-in pages against the e2e mocks, like the store screenshots. No keys,
// no network.
//
//   npm run capture      (builds the test build first)
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, send, fixtures, waitFor, readCaptions, done, sleep } from '../test/e2e/harness.mjs';
import { startMockApi } from '../test/e2e/mock-api.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'public/frames');
const tmp = path.join(here, 'out/tmp');
const W = 1280;
const H = 720;
const FONT = `font-family: "Segoe UI", system-ui, -apple-system, Arial, sans-serif;`;

// A WAV with silence before and after, so the two sides of the call take turns.
async function padWav(src, dest, before, after) {
  const buf = await readFile(src);
  let pos = 12;
  let fmt = null;
  let data = null;
  while (pos < buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    if (id === 'fmt ') fmt = buf.subarray(pos + 8, pos + 8 + size);
    if (id === 'data') data = buf.subarray(pos + 8, pos + 8 + size);
    pos += 8 + size + (size % 2);
  }
  const rate = fmt.readUInt32LE(4);
  const align = fmt.readUInt16LE(12);
  const pad = (s) => Buffer.alloc(Math.round(rate * s) * align);
  const body = Buffer.concat([pad(before), data, pad(after)]);
  const head = Buffer.alloc(12 + 8 + fmt.length + 8);
  head.write('RIFF', 0);
  head.writeUInt32LE(head.length - 8 + body.length, 4);
  head.write('WAVE', 8);
  head.write('fmt ', 12);
  head.writeUInt32LE(fmt.length, 16);
  fmt.copy(head, 20);
  head.write('data', 20 + fmt.length);
  head.writeUInt32LE(body.length, 24 + fmt.length);
  await writeFile(dest, Buffer.concat([head, body]));
}

const VIDEO_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Webinar: Remote work, done well</title>
<style>body{margin:0;background:#0f0f12;color:#e8e8ea;${FONT}} .wrap{width:960px;margin:22px auto}
.player{position:relative;aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:radial-gradient(circle at 30% 35%,#3b4a7a 0,#1a2140 45%,#0b0e1c 100%)}
.player .speaker{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);width:150px;height:150px;border-radius:50%;background:linear-gradient(160deg,#8aa0d8,#4a5d9a);box-shadow:0 0 0 10px rgba(255,255,255,.06)}
.player .bar{position:absolute;left:0;right:0;bottom:0;height:6px;background:rgba(255,255,255,.15)}.player .bar i{display:block;width:38%;height:100%;background:#e14b4b}
h1{font-size:20px;margin:14px 0 4px}.meta{color:#9a9aa3;font-size:14px}</style></head>
<body><div class="wrap"><div id="player" class="player"><div class="speaker"></div><div class="bar"><i></i></div></div>
<h1>Webinar: Remote work, done well</h1><div class="meta">Live · 24 min</div></div>
<audio id="a" src="/talk.wav" autoplay loop></audio></body></html>`;

const CALL_STYLE = `
  body { margin: 0; background: #1b1d22; font-family: "Segoe UI", system-ui, sans-serif; }
  body > h1, body > p, #micBtn { display: none !important; }
  .grid { position: fixed; inset: 116px 24px 96px 424px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .tile { border-radius: 14px; background: #2a2d35; display: flex; align-items: center; justify-content: center; position: relative; }
  .tile .av { width: 120px; height: 120px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 48px; color: #fff; font-weight: 600; }
  .tile .name { position: absolute; left: 16px; top: 14px; color: #fff; font-size: 15px; background: rgba(0,0,0,.35); padding: 4px 10px; border-radius: 6px; }
  .tile.talking { box-shadow: inset 0 0 0 3px #4f7cff; }
  .controls { position: fixed; left: 424px; right: 0; bottom: 22px; display: flex; justify-content: center; gap: 14px; }
  .controls span { width: 52px; height: 52px; border-radius: 50%; background: #3a3d46; display: inline-block; }
  .controls span.end { background: #d64545; width: 76px; border-radius: 26px; }
`;
function dressCall(style) {
  document.title = 'Weekly project sync';
  const css = document.createElement('style');
  css.textContent = style;
  document.head.append(css);
  const grid = document.createElement('div');
  grid.className = 'grid';
  grid.innerHTML = `<div class="tile" id="alex"><div class="av" style="background:#c0563f">A</div><div class="name">Alex (London)</div></div>
    <div class="tile" id="me"><div class="av" style="background:#3f7ac0">M</div><div class="name">You (Istanbul)</div></div>`;
  const controls = document.createElement('div');
  controls.className = 'controls';
  controls.innerHTML = '<span></span><span></span><span></span><span class="end"></span>';
  document.body.append(grid, controls);
}
const talking = (who) => {
  for (const id of ['alex', 'me']) document.getElementById(id)?.classList.toggle('talking', id === who);
};

async function openPanel(page) {
  const open = page.locator('#meet-tercuman-overlay .icon.open');
  if (await open.isVisible().catch(() => false)) await open.click();
  await sleep(500);
}

const shot = (page, name) => page.screenshot({ path: path.join(out, `${name}.png`) });

async function pageShot(context, url, width, height, name, { prepare, init, arg } = {}) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height });
  if (init) await page.addInitScript(init, arg);
  await page.goto(url);
  await page.waitForLoadState('networkidle').catch(() => {});
  await sleep(500);
  if (prepare) await prepare(page);
  await shot(page, name);
  await page.close();
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await mkdir(tmp, { recursive: true });
const micWav = path.join(tmp, 'mic.wav');
const remoteWav = path.join(tmp, 'remote.wav');
await padWav(path.join(fixtures, 'turkish.wav'), micWav, 6, 14);
await padWav(path.join(fixtures, 'english.wav'), remoteWav, 0.5, 18);

const mock = await startMockApi({
  cert: readFileSync(path.join(fixtures, 'mock-cert.pem')),
  key: readFileSync(path.join(fixtures, 'mock-key.pem')),
});
const env = await launch({ micWav, remoteWav, proxyPort: mock.port });
const { context, control, worker, meet, tabId } = env;
const ext = `chrome-extension://${new URL(control.url()).host}`;
try {
  await control.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({
      settings: { ...(settings || {}), elevenLabsKey: 'mock-el', anthropicKey: 'mock-an', claudeModel: 'claude-opus-5-5', translationProvider: 'claude', speechProvider: 'elevenlabs', subtitleBar: true, uiLanguage: 'en', translationFallback: false, myVoiceId: 'mock-voice-a' },
    });
  });

  // A video tab: before and with subtitles.
  await context.route('https://media.test/**', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/talk.wav') return route.fulfill({ path: path.join(fixtures, 'english.wav'), contentType: 'audio/wav' });
    return route.fulfill({ contentType: 'text/html', body: VIDEO_PAGE });
  });
  const video = await context.newPage();
  await video.setViewportSize({ width: W, height: H });
  await video.goto('https://media.test/watch?v=webinar');
  await video.evaluate(() => document.getElementById('a').play().catch(() => {}));
  await video.bringToFront();
  await shot(video, 'video-0');
  const videoTab = await worker.evaluate(async () => (await chrome.tabs.query({ url: 'https://media.test/*' }))[0].id);
  const started = await send(control, { type: 'start', tabId: videoTab, options: { mode: 'media', incomingMode: 'text' } });
  if (!started?.ok) throw new Error(`video translation did not start: ${started?.error}`);
  const subtitles = () => video.evaluate(() => document.getElementById('meet-tercuman-subtitles')?.shadowRoot?.textContent || '');
  if (!(await waitFor(async () => (await subtitles()).includes('teşekkürler'), 30000, 150))) throw new Error('no subtitles');
  await sleep(300);
  await shot(video, 'video-1');
  await send(control, { type: 'stop' });
  await video.close();

  // The popup, as if opened on the call tab.
  await meet.setViewportSize({ width: W, height: H });
  await meet.evaluate(dressCall, CALL_STYLE);
  const callTab = await worker.evaluate((id) => chrome.tabs.get(id), tabId);
  await pageShot(context, `${ext}/popup.html`, 380, 540, 'popup', {
    init: (t) => {
      const query = chrome.tabs.query.bind(chrome.tabs);
      chrome.tabs.query = (q) => (q && q.active ? Promise.resolve([t]) : query(q));
    },
    arg: callTab,
  });

  // A call: the panel empty, after they spoke, after I spoke.
  await meet.bringToFront();
  const call = await send(control, { type: 'start', tabId, options: { incomingMode: 'voice', outgoingMode: 'voice' } });
  if (!call?.ok) throw new Error(`call translation did not start: ${call?.error}`);
  await openPanel(meet);
  await shot(meet, 'call-0');
  if (!(await waitFor(async () => done((await readCaptions(meet)).incoming), 30000, 150))) throw new Error('no incoming caption');
  await meet.evaluate(talking, 'alex');
  await sleep(300);
  await shot(meet, 'call-1');
  if (!(await waitFor(async () => done((await readCaptions(meet)).outgoing), 30000, 150))) throw new Error('no outgoing caption');
  await meet.evaluate(talking, 'me');
  // The mock recognizer counts the long test sentence twice; a real one says it once.
  await meet.evaluate(() => {
    const seen = new Set();
    for (const item of document.getElementById('meet-tercuman-overlay').shadowRoot.querySelectorAll('.list .item')) {
      if (seen.has(item.textContent)) item.remove();
      seen.add(item.textContent);
    }
  });
  await sleep(300);
  await shot(meet, 'call-2');
  await send(control, { type: 'stop' });
  await sleep(1500);

  await pageShot(context, `${ext}/recording.html`, 760, 600, 'transcripts', {
    prepare: async (page) => {
      await page.locator('#transcripts li button').first().click();
      await sleep(400);
    },
  });
  await pageShot(context, `${ext}/options.html`, 760, 600, 'settings');
} finally {
  await env.context.close();
  await rm(env.userDataDir, { recursive: true, force: true });
  mock.close();
}
console.log(`wrote ${path.relative(here, out)}`);
process.exit(0);
