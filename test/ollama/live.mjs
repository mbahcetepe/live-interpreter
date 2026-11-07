// Live check of translation on real Ollama servers, through the extension's own
// settings page (Translation, "Test"): the model list, the header rule and the translation.
//
//   npm run build && node test/ollama/live.mjs <server> <model> [<second server> <model>]
//   node test/ollama/live.mjs 100.65.147.84 gemma4:12b 100.77.37.21 gemma4:26b-uncensored
//
// The browser cannot be clicked through its permission prompt here, so a copy of dist/
// that already holds access to the servers is loaded instead.

import { chromium } from 'playwright';
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serverBase, originPattern } from '../../src/shared/servers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [url, model, backupUrl = '', backupModel = ''] = process.argv.slice(2);
if (!url || !model) {
  console.error('usage: node test/ollama/live.mjs <server> <model> [<second server> <model>]');
  process.exit(2);
}

const copy = await mkdtemp(path.join(os.tmpdir(), 'tercuman-ollama-'));
await cp(path.join(root, 'dist'), copy, { recursive: true });
const manifestPath = path.join(copy, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
for (const u of [url, backupUrl].filter(Boolean)) manifest.host_permissions.push(originPattern(serverBase(u)));
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

const profile = await mkdtemp(path.join(os.tmpdir(), 'tercuman-ollama-profile-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: !process.env.HEADED,
  args: [`--disable-extensions-except=${copy}`, `--load-extension=${copy}`],
});
let failed = false;
try {
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/options.html`);
  await page.evaluate(
    async (patch) => {
      const { settings } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...(settings || {}), ...patch } });
    },
    { translationProvider: 'ollama', ollamaUrl: url, ollamaModel: model, ollamaBackupUrl: backupUrl, ollamaBackupModel: backupModel, uiLanguage: 'en' },
  );
  await page.reload();
  // The service worker sets the header rule when the settings change.
  const rules = await worker.evaluate(() => chrome.declarativeNetRequest.getDynamicRules());
  console.log('header rule for:', rules.map((r) => r.condition.requestDomains.join(', ')).join(' | ') || 'none');
  if (!rules.length) failed = true;

  const listed = await page.waitForFunction(() => document.getElementById('ollamaModel').options.length > 1, null, { timeout: 20_000 }).then(() => true, () => false);
  console.log(listed ? 'PASS' : 'FAIL', 'the model list is filled:', await page.evaluate(() => document.getElementById('ollamaModel').options.length), 'models');
  if (!listed) failed = true;
  await page.click('#testTranslation');
  const text = await page.waitForFunction(
    () => {
      const el = document.getElementById('translationResult');
      return el.textContent && !/^Testing|found\.$/.test(el.textContent) ? `${el.className}|${el.textContent}` : null;
    },
    null,
    { timeout: 120_000 },
  );
  const [kind, message] = (await text.jsonValue()).split('|');
  console.log(kind.includes('ok') ? 'PASS' : 'FAIL', message);
  if (!kind.includes('ok')) failed = true;
} finally {
  await context.close();
  await rm(copy, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
