// Makes the promo's voices (public/audio/) from src/script.js with ElevenLabs:
//
//   npm run voices                 ELEVENLABS_API_KEY from the environment or ../.env
//   npm run voices -- --placeholder   Windows' own voice instead (free, for trying the cut)
//
// Lines already made with the same text and voice are not asked for again. The key is
// never printed.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LINES } from './src/script.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'public/audio');
const placeholder = process.argv.includes('--placeholder');

// Roles to ElevenLabs premade voices, by name; the first one the account has is used.
// The narrator is a warm female voice; the people in the scenes are men, so their
// voices and the stock voices their translations use are male.
const ROLES = {
  narrator: ['Sarah', 'Alice', 'Matilda', 'Jessica'],
  host: ['Chris', 'Eric', 'Liam'],
  translatedTr: ['Eric', 'Liam', 'Will'],
  me: ['Daniel', 'Bill', 'Callum'],
  translatedEn: ['Brian', 'Roger', 'Will'],
};
const MODEL = 'eleven_multilingual_v2';

function apiKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
  const file = path.join(here, '../.env');
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      // ELEVENLABS_API_KEY=... or a note like "Eleven labs api: ..."
      const m = line.match(/^\s*ELEVENLABS_API_KEY\s*=\s*["']?([^"'\s]+)/) || line.match(/^\s*eleven\s*labs[^:=]*[:=]\s*["']?(sk_[^"'\s]+)/i);
      if (m) return m[1];
    }
  }
  throw new Error('No ELEVENLABS_API_KEY: put a line ELEVENLABS_API_KEY=... in .env');
}

async function eleven(key, pathname, init = {}) {
  const res = await fetch(`https://api.elevenlabs.io${pathname}`, { ...init, headers: { 'xi-api-key': key, ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`ElevenLabs ${pathname.split('?')[0]}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res;
}

async function pickVoices(key) {
  const { voices } = await (await eleven(key, '/v1/voices')).json();
  const picked = {};
  for (const [role, names] of Object.entries(ROLES)) {
    const voice = names.map((n) => voices.find((v) => v.name.split(' ')[0] === n)).find(Boolean) || voices[0];
    picked[role] = { id: voice.voice_id, name: voice.name };
  }
  return picked;
}

// Windows SAPI, for a free first cut. Turkish lines use a Turkish voice when installed.
// PowerShell 7 (pwsh) sees the newer voices (Tolga for Turkish); Windows PowerShell 5 only
// the old English ones. The text goes through a UTF-8 file so Turkish letters survive.
async function sapi(text, file, turkish) {
  const textFile = `${file}.txt`;
  await writeFile(textFile, text, 'utf8');
  const q = (s) => s.replace(/'/g, "''");
  const ps = `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer;
    $v = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like '${turkish ? 'tr*' : 'en*'}' } | Select-Object -First 1;
    if ($v) { $s.SelectVoice($v.VoiceInfo.Name) }; $s.SetOutputToWaveFile('${q(file)}');
    $s.Speak([IO.File]::ReadAllText('${q(textFile)}', [Text.Encoding]::UTF8)); $s.Dispose()`;
  execFileSync('pwsh', ['-NoProfile', '-Command', ps]);
  await rm(textFile);
}

await mkdir(out, { recursive: true });
const manifestFile = path.join(out, 'manifest.json');
const manifest = existsSync(manifestFile) ? JSON.parse(await readFile(manifestFile, 'utf8')) : {};
const key = placeholder ? null : apiKey();
const voices = placeholder ? null : await pickVoices(key);
if (voices) console.log('voices:', Object.entries(voices).map(([r, v]) => `${r}=${v.name}`).join(', '));

let made = 0;
for (const [id, line] of Object.entries(LINES)) {
  const turkish = /[çğıöşü]/i.test(line.text);
  const voice = placeholder ? `sapi-${turkish ? 'tr' : 'en'}` : voices[line.voice].id;
  const hash = createHash('sha1').update(`${voice}|${MODEL}|${line.text}`).digest('hex').slice(0, 10);
  const file = `${id}-${hash}.${placeholder ? 'wav' : 'mp3'}`;
  if (manifest[id] === file && existsSync(path.join(out, file))) continue;
  if (placeholder) {
    await sapi(line.text, path.join(out, file), turkish);
  } else {
    const res = await eleven(key, `/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: line.text, model_id: MODEL, voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.15 } }),
    });
    await writeFile(path.join(out, file), Buffer.from(await res.arrayBuffer()));
  }
  manifest[id] = file;
  made += 1;
  console.log(`made ${id}`);
}
await writeFile(manifestFile, JSON.stringify(manifest, null, 2));
console.log(`${made} new, ${Object.keys(LINES).length - made} kept`);
