// Makes the Chrome Web Store images in store/images/:
//
//   npm run store:images
//
// - icon-128.png: the store icon (a copy of the extension's icon).
// - promo-small.png (440x280), promo-marquee.png (1400x560): the logo on the brand gradient.
// - screenshot-*.png (1280x800): the test build running on stand-in pages against the
//   e2e mocks, so no keys and no network are needed. The pages are neutral on purpose:
//   the listing must not show Teams' or Meet's own design.
//
// Needs the test build (the npm script makes it) and Playwright's Chromium.
import { chromium } from 'playwright';
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, send, fixtures, waitFor, readCaptions, done, sleep } from '../test/e2e/harness.mjs';
import { startMockApi } from '../test/e2e/mock-api.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'store/images');
const W = 1280;
const H = 800;

const BRAND = 'linear-gradient(135deg, #2B3FD6 0%, #0E1B6B 100%)';
const FONT = `font-family: "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif;`;

async function dataUri(file) {
  return `data:image/png;base64,${(await readFile(file)).toString('base64')}`;
}

// A page drawn from HTML, captured at its exact size.
async function render(browser, html, width, height, file) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;${FONT}}</style></head><body>${html}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(out, file) });
  await page.close();
}

// A screenshot of an extension page, framed on the brand background with a caption.
function framed(caption, sub, shot, shotWidth, shotHeight) {
  return `<div style="width:${W}px;height:${H}px;background:${BRAND};display:flex;align-items:center;gap:56px;padding:0 64px;box-sizing:border-box;color:#fff">
    <div style="flex:0 0 330px">
      <div style="font-size:40px;font-weight:700;line-height:1.15">${caption}</div>
      <div style="font-size:20px;line-height:1.45;margin-top:18px;opacity:.85">${sub}</div>
    </div>
    <img src="${shot}" style="width:${shotWidth}px;height:${shotHeight}px;border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.45);background:#fff">
  </div>`;
}

async function promos(browser) {
  const logo = await dataUri(path.join(root, 'src/icons/icon128.png'));
  const tile = (w, h, size, title, line) => `<div style="width:${w}px;height:${h}px;background:${BRAND};color:#fff;display:flex;align-items:center;justify-content:center;gap:${size * 0.3}px">
      <img src="${logo}" style="width:${size}px;height:${size}px">
      <div><div style="font-size:${size * 0.42}px;font-weight:700;letter-spacing:-.5px;white-space:nowrap">Live Interpreter</div>
      <div style="font-size:${size * 0.19}px;opacity:.88;margin-top:${size * 0.06}px;max-width:${w * 0.5}px;line-height:1.3">${line}</div></div>
    </div>`;
  await render(browser, tile(440, 280, 80, 'Live Interpreter', 'Live speech translation for calls and videos'), 440, 280, 'promo-small.png');
  await render(browser, tile(1400, 560, 220, 'Live Interpreter', 'Hear every call and video in your language, both ways, as it is spoken'), 1400, 560, 'promo-marquee.png');
}

// A neutral video page: a player-like box with the talk's audio behind it.
const VIDEO_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Remote work, done well</title>
<style>body{margin:0;background:#0f0f12;color:#e8e8ea;${FONT}} .wrap{max-width:1040px;margin:28px auto}
.player{position:relative;aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:radial-gradient(circle at 30% 35%,#3b4a7a 0,#1a2140 45%,#0b0e1c 100%)}
.player .speaker{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);width:150px;height:150px;border-radius:50%;background:linear-gradient(160deg,#8aa0d8,#4a5d9a);box-shadow:0 0 0 10px rgba(255,255,255,.06)}
.player .bar{position:absolute;left:0;right:0;bottom:0;height:6px;background:rgba(255,255,255,.15)}.player .bar i{display:block;width:38%;height:100%;background:#e14b4b}
h1{font-size:22px;margin:16px 0 6px}.meta{color:#9a9aa3;font-size:14px}</style></head>
<body><div class="wrap"><div id="player" class="player"><div class="speaker"></div><div class="bar"><i></i></div></div>
<h1>Remote work, done well</h1><div class="meta">Conference talk · 24 min</div></div>
<audio id="a" src="/talk.wav" autoplay loop></audio></body></html>`;

// Dresses the mock call page as a neutral two-person call; its audio plumbing stays.
const CALL_STYLE = `
  body { margin: 0; background: #1b1d22; font-family: "Segoe UI", system-ui, sans-serif; }
  body > h1, body > p, #micBtn { display: none !important; }
  .grid { position: fixed; inset: 24px 24px 96px 424px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .tile { border-radius: 14px; background: #2a2d35; display: flex; align-items: center; justify-content: center; position: relative; }
  .tile .av { width: 132px; height: 132px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 52px; color: #fff; font-weight: 600; }
  .tile .name { position: absolute; left: 16px; bottom: 14px; color: #fff; font-size: 15px; background: rgba(0,0,0,.35); padding: 4px 10px; border-radius: 6px; }
  .tile.talking { box-shadow: inset 0 0 0 3px #4f7cff; }
  .controls { position: fixed; left: 0; right: 0; bottom: 22px; display: flex; justify-content: center; gap: 14px; }
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
  grid.innerHTML = `<div class="tile talking"><div class="av" style="background:#c0563f">A</div><div class="name">Alex (London)</div></div>
    <div class="tile"><div class="av" style="background:#3f7ac0">M</div><div class="name">You</div></div>`;
  const controls = document.createElement('div');
  controls.className = 'controls';
  controls.innerHTML = '<span></span><span></span><span></span><span class="end"></span>';
  document.body.append(grid, controls);
}

async function openPanel(page) {
  const open = page.locator('#meet-tercuman-overlay .icon.open');
  if (await open.isVisible().catch(() => false)) await open.click();
  await sleep(600);
}

async function shoot(page, file) {
  await page.setViewportSize({ width: W, height: H });
  await sleep(400);
  await page.screenshot({ path: path.join(out, file) });
}

async function extensionShot(context, url, width, height, prepare, init, arg) {
  const page = await context.newPage();
  if (init) await page.addInitScript(init, arg);
  await page.setViewportSize({ width, height });
  await page.goto(url);
  await page.waitForLoadState('networkidle').catch(() => {});
  await sleep(500);
  if (prepare) await prepare(page);
  const buf = await page.screenshot();
  await page.close();
  return `data:image/png;base64,${buf.toString('base64')}`;
}

async function screenshots(browser) {
  const mock = await startMockApi({
    cert: readFileSync(path.join(fixtures, 'mock-cert.pem')),
    key: readFileSync(path.join(fixtures, 'mock-key.pem')),
  });
  const env = await launch({ micWav: path.join(fixtures, 'turkish.wav'), remoteWav: path.join(fixtures, 'english.wav'), proxyPort: mock.port });
  const { context, control, worker, meet, tabId } = env;
  const extUrl = `chrome-extension://${new URL(control.url()).host}`;
  try {
    await control.evaluate(async () => {
      const { settings } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({
        settings: { ...(settings || {}), elevenLabsKey: 'mock-el', anthropicKey: 'mock-an', claudeModel: 'claude-opus-5-5', translationProvider: 'claude', speechProvider: 'elevenlabs', subtitleBar: true, uiLanguage: 'en', translationFallback: false, myVoiceId: 'mock-voice-a' },
      });
    });

    // 1. A video tab with subtitles.
    await context.route('https://media.test/**', (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/talk.wav') return route.fulfill({ path: path.join(fixtures, 'english.wav'), contentType: 'audio/wav' });
      return route.fulfill({ contentType: 'text/html', body: VIDEO_PAGE });
    });
    const video = await context.newPage();
    await video.setViewportSize({ width: W, height: H });
    await video.goto('https://media.test/watch?v=talk');
    await video.evaluate(() => document.getElementById('a').play().catch(() => {}));
    await video.bringToFront();
    const videoTab = await worker.evaluate(async () => (await chrome.tabs.query({ url: 'https://media.test/*' }))[0].id);
    const started = await send(control, { type: 'start', tabId: videoTab, options: { mode: 'media', incomingMode: 'text' } });
    if (!started?.ok) throw new Error(`video translation did not start: ${started?.error}`);
    const subtitles = () => video.evaluate(() => document.getElementById('meet-tercuman-subtitles')?.shadowRoot?.textContent || '');
    if (!(await waitFor(async () => (await subtitles()).includes('Merhaba'), 30000, 300))) throw new Error('no subtitles');
    await openPanel(video);
    await waitFor(async () => (await subtitles()).includes('Merhaba'), 15000, 200);
    await shoot(video, 'screenshot-1-video.png');
    await send(control, { type: 'stop' });
    await video.close();

    // 2. A call, translated both ways. The popup is shot first, as if opened on the call tab.
    await meet.evaluate(dressCall, CALL_STYLE);
    const callTab = await worker.evaluate((id) => chrome.tabs.get(id), tabId);
    const popup = await extensionShot(context, `${extUrl}/popup.html`, 380, 540, null, (t) => {
      const query = chrome.tabs.query.bind(chrome.tabs);
      chrome.tabs.query = (q) => (q && q.active ? Promise.resolve([t]) : query(q));
    }, callTab);
    await meet.bringToFront();
    const call = await send(control, { type: 'start', tabId, options: { incomingMode: 'voice', outgoingMode: 'voice' } });
    if (!call?.ok) throw new Error(`call translation did not start: ${call?.error}`);
    await waitFor(async () => {
      const c = await readCaptions(meet);
      return done(c.incoming) && done(c.outgoing);
    }, 40000, 300);
    await openPanel(meet);
    await shoot(meet, 'screenshot-2-call.png');
    await send(control, { type: 'stop' });
    await sleep(1500);

    // 4. The transcripts, 5. the settings.
    const transcripts = await extensionShot(context, `${extUrl}/recording.html`, 760, 600, async (page) => {
      await page.locator('#transcripts li button').first().click();
      await sleep(400);
      await page.locator('#transcriptsBox').scrollIntoViewIfNeeded();
    });
    const settings = await extensionShot(context, `${extUrl}/options.html`, 760, 600);

    await render(browser, framed('One click to start', 'Choose how you hear them and how they hear you, then start. The same button translates a video tab.', popup, 380, 540), W, H, 'screenshot-3-popup.png');
    await render(browser, framed('Every word, kept', 'A transcript of each call and video, with its translation. Save it as text or as subtitles.', transcripts, 760, 600), W, H, 'screenshot-4-transcripts.png');
    await render(browser, framed('Your services, your keys', 'Claude, OpenAI, OpenRouter, Ollama, DeepL and more, or your own servers. Nothing goes to us.', settings, 760, 600), W, H, 'screenshot-5-settings.png');
  } finally {
    await env.context.close();
    await rm(env.userDataDir, { recursive: true, force: true });
    mock.close();
  }
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await copyFile(path.join(root, 'src/icons/icon128.png'), path.join(out, 'icon-128.png'));
const browser = await chromium.launch({ channel: 'chromium' });
try {
  await promos(browser);
  await screenshots(browser);
} finally {
  await browser.close();
}
console.log(`wrote ${path.relative(root, out)}`);
process.exit(0);
