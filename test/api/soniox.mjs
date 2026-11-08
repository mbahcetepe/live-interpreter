// A real Soniox check: streams the e2e English test sentence to Soniox with translation
// into Turkish and prints what comes back (words, translation, timings). Costs a fraction
// of a cent. The key comes from SONIOX_API_KEY or ../../.env and is never printed.
//
//   node test/api/soniox.mjs
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SonioxSession, sonioxConfig } from '../../src/offscreen/soniox.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function key() {
  if (process.env.SONIOX_API_KEY) return process.env.SONIOX_API_KEY.trim();
  const file = path.join(root, '.env');
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*SONIOX_API_KEY\s*=\s*["']?([^"'\s]+)/) || line.match(/^\s*soniox[^:=]*[:=]\s*["']?([^"'\s]+)/i);
      if (m) return m[1];
    }
  }
  throw new Error('No Soniox key: put SONIOX_API_KEY=... in .env');
}

// 16 kHz mono 16-bit samples from a WAV file (any rate, first channel).
function wav16k(file) {
  const buf = readFileSync(file);
  let pos = 12;
  let fmt;
  let data;
  while (pos < buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    if (id === 'fmt ') fmt = buf.subarray(pos + 8, pos + 8 + size);
    if (id === 'data') data = buf.subarray(pos + 8, pos + 8 + size);
    pos += 8 + size + (size % 2);
  }
  const channels = fmt.readUInt16LE(2);
  const rate = fmt.readUInt32LE(4);
  const frames = data.length / (2 * channels);
  const out = new Int16Array(Math.floor((frames * 16000) / rate));
  for (let i = 0; i < out.length; i++) out[i] = data.readInt16LE(Math.min(frames - 1, Math.floor((i * rate) / 16000)) * 2 * channels);
  return out;
}

const samples = wav16k(path.join(root, 'test/e2e/fixtures/english.wav'));
const started = Date.now();
const at = () => `${((Date.now() - started) / 1000).toFixed(2)}s`;
let firstTranslation = null;
let segments = 0;
let fatal = null;

const session = new SonioxSession({
  name: 'soniox-test',
  apiKey: key(),
  config: sonioxConfig({ target: 'tr', source: 'en' }),
  onOriginal: (text) => process.stdout.write(`\r${at()} heard: ${text.slice(-70).padEnd(70)}`),
  onSegmentStart: () => console.log(`\n${at()} segment start`),
  onTranslation: (piece) => {
    if (firstTranslation == null) firstTranslation = at();
    console.log(`\n${at()} translation: ${JSON.stringify(piece)}`);
  },
  onSegmentEnd: (seg) => {
    segments += 1;
    console.log(`\n${at()} segment end: ${JSON.stringify(seg)}`);
  },
  onStatus: (s) => console.log(`\n${at()} status: ${s}`),
  onFatal: (err) => {
    fatal = err;
    console.log(`\n${at()} FATAL: ${err.status} ${err.type} ${err.message}`);
  },
  log: (level, msg) => console.log(`\n[${level}] ${msg}`),
});
session.start();
await new Promise((r) => setTimeout(r, 1500));
// Real time: 100 ms chunks, then 3 s of silence so the endpoint fires.
const chunk = 1600;
const audioEnd = Math.min(samples.length, 16000 * 10);
for (let i = 0; i < audioEnd + 16000 * 3 && !fatal; i += chunk) {
  session.sendAudio(i < audioEnd ? samples.slice(i, i + chunk) : new Int16Array(chunk));
  await new Promise((r) => setTimeout(r, 100));
}
await new Promise((r) => setTimeout(r, 2000));
session.stop();
console.log(`\nfirst translated word at ${firstTranslation}; ${segments} segment(s); ${fatal ? 'FAILED' : 'ok'}`);
process.exit(fatal || !segments ? 1 : 0);
