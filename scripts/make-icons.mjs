// Renders the extension's icons (src/icons/*.png) and the project logo (docs/logo.png)
// from the SVGs below with Playwright's Chromium:
//
//   node scripts/make-icons.mjs            write the icons
//   node scripts/make-icons.mjs --preview  also write a sheet of every size on light and dark
//
// The mark: a speech bubble with a sound wave in it and a "live" dot. The small sizes
// (16, 32) leave out what would blur, and 16 px is drawn on the pixel grid.
import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'src/icons');
const preview = process.argv.includes('--preview');

const defs = `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2B3FD6"/>
      <stop offset="1" stop-color="#0E1B6B"/>
    </linearGradient>
    <radialGradient id="shine" cx="0.25" cy="0.15" r="0.9">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.22"/>
      <stop offset="0.6" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="wave" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#2B3FD6"/>
      <stop offset="1" stop-color="#12B5A6"/>
    </linearGradient>
  </defs>`;

// 48 px and up: bubble, a wave that grows from one side to the other, the live dot.
const full = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">${defs}
  <rect width="128" height="128" rx="30" fill="url(#bg)"/>
  <rect width="128" height="128" rx="30" fill="url(#shine)"/>
  <path d="M30 30h68a14 14 0 0 1 14 14v34a14 14 0 0 1-14 14H58l-20 16v-16h-8a14 14 0 0 1-14-14V44a14 14 0 0 1 14-14z" fill="#FFFFFF"/>
  <g fill="url(#wave)">
    <rect x="31" y="56" width="8" height="12" rx="4"/>
    <rect x="45" y="49" width="8" height="26" rx="4"/>
    <rect x="59" y="42" width="8" height="40" rx="4"/>
    <rect x="73" y="49" width="8" height="26" rx="4"/>
    <rect x="87" y="53" width="8" height="18" rx="4"/>
  </g>
  <circle cx="104" cy="28" r="13" fill="#0E1B6B"/>
  <circle cx="104" cy="28" r="8.5" fill="#FF5A5F"/>
</svg>`;

// 16 and 32 px: the bubble and three thick bars, nothing finer than a pixel or two.
const small = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${defs}
  <rect width="32" height="32" rx="7.5" fill="url(#bg)"/>
  <path d="M7 6h18a4 4 0 0 1 4 4v9a4 4 0 0 1-4 4h-9l-6 5v-5H7a4 4 0 0 1-4-4v-9a4 4 0 0 1 4-4z" fill="#FFFFFF"/>
  <g fill="#2B3FD6">
    <rect x="8.5" y="12" width="3" height="5" rx="1.5"/>
    <rect x="14.5" y="9.5" width="3" height="10" rx="1.5"/>
    <rect x="20.5" y="11" width="3" height="7" rx="1.5"/>
  </g>
</svg>`;

// 16 px: drawn on the pixel grid itself, so every edge is sharp.
const tiny = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">${defs}
  <rect width="16" height="16" rx="3.5" fill="url(#bg)"/>
  <path d="M3 2h10a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H8l-3 3v-3H3a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="#FFFFFF"/>
  <g fill="#2B3FD6">
    <rect x="4" y="5" width="2" height="3"/>
    <rect x="7" y="4" width="2" height="5"/>
    <rect x="10" y="5" width="2" height="3"/>
  </g>
</svg>`;

const sizes = [
  { size: 16, svg: tiny },
  { size: 32, svg: small },
  { size: 48, svg: full },
  { size: 128, svg: full },
];

await mkdir(out, { recursive: true });
await mkdir(path.join(root, 'docs'), { recursive: true });
const browser = await chromium.launch();
const render = async (svg, size, file) => {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
};
for (const { size, svg } of sizes) await render(svg, size, path.join(out, `icon${size}.png`));
// The logo for the README and the store listing.
await render(full, 512, path.join(root, 'docs/logo.png'));

if (preview) {
  const data = async (file) => `data:image/png;base64,${(await readFile(path.join(out, file))).toString('base64')}`;
  const images = await Promise.all(sizes.map(async ({ size }) => ({ size, src: await data(`icon${size}.png`) })));
  const zoom = (size) => images.find((i) => i.size === size).src;
  const cell = (bg) =>
    `<div style="background:${bg};padding:18px;display:flex;gap:22px;align-items:center">` +
    images.map(({ size, src }) => `<img src="${src}" width="${size}" height="${size}">`).join('') +
    `<img src="${zoom(16)}" width="64" height="64" style="image-rendering:pixelated">` +
    `<img src="${zoom(32)}" width="64" height="64" style="image-rendering:pixelated"></div>`;
  const page = await browser.newPage({ viewport: { width: 560, height: 360 } });
  await page.setContent(`<html><body style="margin:0">${cell('#ffffff')}${cell('#f1f3f4')}${cell('#202124')}</body></html>`);
  await page.screenshot({ path: path.join(root, 'icon-preview.png'), fullPage: true });
  await page.close();
}await browser.close();
console.log('icons written to src/icons, logo to docs/logo.png');
