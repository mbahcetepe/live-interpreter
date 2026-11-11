// A stand-in for api.elevenlabs.io, api.anthropic.com and the free translation services
// (DeepL, Mistral, Groq), so the whole translation path can be tested without keys or cost. Chromium is pointed at it as an HTTP
// proxy: CONNECT tunnels for the two API hosts end in a local TLS server (Chromium
// runs with --ignore-certificate-errors), everything else is refused.
//
// It speaks the same wire formats the extension expects: the single-use token, the
// voices list, streamed PCM speech, Claude's SSE stream and the Scribe realtime
// WebSocket, which "recognizes" a fixed sentence once it has heard enough speech.

import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { WebSocketServer } from 'ws';
import { LANGUAGES } from '../../src/shared/languages.js';

export const API_HOSTS = ['api.elevenlabs.io', 'api.anthropic.com', 'api-free.deepl.com', 'api.mistral.ai', 'api.groq.com', 'stt-rt.soniox.com', 'tts-rt.soniox.com'];
const HOSTS = new Set(API_HOSTS);

const HEARD = {
  en: { partial: 'Hi, thanks for joining', committed: 'Hi, thanks for joining the call today.' },
  tr: { partial: 'Cuma günü saat üç', committed: 'Cuma günü saat üç bizim için uygun.' },
};

const TRANSLATED = [
  [/thanks for joining/i, 'Merhaba, bugün görüşmeye katıldığınız için teşekkürler.'],
  [/cuma/i, 'Friday at three works for us.'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const translate = (text) => TRANSLATED.find(([re]) => re.test(text))?.[1] || text;

function readBody(req) {
  return new Promise((resolve) => {
    const parts = [];
    req.on('data', (c) => parts.push(c));
    req.on('end', () => resolve(Buffer.concat(parts)));
  });
}

function json(res, value, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(value));
}

function tone(seconds, freq = 330, rate = 24000) {
  const n = Math.round(seconds * rate);
  const buf = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * 0.3 * 32767), i * 2);
  return buf;
}

async function speech(req, res, url, stats, faults) {
  const body = JSON.parse((await readBody(req)).toString() || '{}');
  stats.tts.push({ voice: url.pathname.split('/')[3], format: url.searchParams.get('output_format'), ...body });
  if (faults.tts) return json(res, { detail: { status: 'quota_exceeded', message: 'This request exceeds your quota.' } }, faults.tts);
  res.writeHead(200, { 'content-type': 'audio/pcm' });
  const audio = tone(0.8);
  const step = Math.floor(audio.length / 4 / 2) * 2 + 1; // odd sizes exercise sample re-alignment
  for (let at = 0; at < audio.length; at += step) {
    res.write(audio.subarray(at, Math.min(audio.length, at + step)));
    await sleep(40);
  }
  res.end();
}

const codeOf = (english) => LANGUAGES.find((l) => l.english === english)?.code;

// `translator(text, from, to)`, when given, answers instead of the fixed table (the live
// Meet test plugs Chrome's own translator in here).
async function claude(req, res, stats, faults, translator) {
  const body = JSON.parse((await readBody(req)).toString() || '{}');
  const user = body.messages?.at(-1)?.content || '';
  const utterance = (String(user).match(/<utterance>\n([\s\S]*?)\n<\/utterance>/) || [])[1] || '';
  const pair = String(user).match(/Utterance to interpret, (\w+) to (\w+):/);
  stats.claude.push({ model: body.model, effort: body.output_config?.effort, fallbacks: body.fallbacks, beta: req.headers['anthropic-beta'] || '', utterance, pair: pair ? `${pair[1]} to ${pair[2]}` : '' });
  if (faults.claude) return json(res, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }, faults.claude);
  const answer = translator && pair ? await translator(utterance, codeOf(pair[1]), codeOf(pair[2])) : translate(utterance);
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  send('message_start', {
    type: 'message_start',
    message: { id: 'msg_mock', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 420, output_tokens: 1 } },
  });
  send('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
  const words = answer.split(/(?<= )/);
  for (let i = 0; i < words.length; i += 2) {
    await sleep(30);
    send('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: words.slice(i, i + 2).join('') } });
  }
  send('content_block_stop', { type: 'content_block_stop', index: 0 });
  send('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 24 } });
  send('message_stop', { type: 'message_stop' });
  res.end();
}

// `faults.stt`, when set to a server message type such as quota_exceeded, is sent the
// next time audio arrives, the way Scribe ends a session for good.
function scribe(ws, req, stats, faults) {
  const url = new URL(req.url, 'wss://api.elevenlabs.io');
  const language = url.searchParams.get('language_code');
  const session = { language, params: Object.fromEntries(url.searchParams), voiced: 0, chunks: 0, commits: 0, open: true };
  stats.stt.push(session);
  ws.on('close', () => (session.open = false));
  if (url.searchParams.get('token') !== 'mock-token') {
    ws.send(JSON.stringify({ message_type: 'auth_error', error: 'bad token' }));
    ws.close();
    return;
  }
  ws.send(JSON.stringify({ message_type: 'session_started', session_id: `mock-${stats.stt.length}`, config: {} }));
  const text = HEARD[language] || HEARD.en;
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.message_type !== 'input_audio_chunk') return;
    if (faults.stt) {
      ws.send(JSON.stringify({ message_type: faults.stt, error: 'Mock: the session ends here' }));
      ws.close();
      return;
    }
    session.chunks += 1;
    const pcm = Buffer.from(msg.audio_base_64, 'base64');
    let peak = 0;
    for (let i = 0; i + 1 < pcm.length; i += 2) peak = Math.max(peak, Math.abs(pcm.readInt16LE(i)));
    if (peak < 300) return; // silence (or a muted microphone) is never recognized
    session.voiced += 1;
    if (session.voiced === 12) ws.send(JSON.stringify({ message_type: 'partial_transcript', text: text.partial }));
    if (session.voiced >= 22) {
      session.voiced = 0;
      session.commits += 1;
      ws.send(JSON.stringify({ message_type: 'committed_transcript', text: text.committed }));
    }
  });
}

// Soniox real time: the key comes as the second subprotocol, the config as the first
// message, then binary 16 kHz audio. Words come back as tokens; the translation follows in
// pieces, and <end> closes a segment. `faults.soniox` (e.g. 402) answers with that error.
function soniox(ws, req, stats, faults) {
  const protocols = String(req.headers['sec-websocket-protocol'] || '').split(',').map((x) => x.trim());
  const session = { key: protocols[1] || '', config: null, voiced: 0, segments: 0, open: true };
  stats.soniox.push(session);
  ws.on('close', () => (session.open = false));
  const error = (code, type, message) => {
    ws.send(JSON.stringify({ tokens: [], error_code: code, error_type: type, error_message: message }));
    ws.close();
  };
  ws.on('message', (raw, isBinary) => {
    if (!isBinary) {
      const text = raw.toString();
      if (!text) return ws.close();
      const msg = JSON.parse(text);
      if (msg.type) return; // keepalive, finalize
      session.config = msg;
      if (session.key !== 'mock-soniox') return error(401, 'invalid_api_key', 'Invalid API key.');
      if (faults.soniox) return error(faults.soniox, 'organization_balance_exhausted', 'Organization balance exhausted.');
      return;
    }
    if (!session.config) return;
    const pcm = Buffer.from(raw);
    let peak = 0;
    for (let i = 0; i + 1 < pcm.length; i += 2) peak = Math.max(peak, Math.abs(pcm.readInt16LE(i)));
    if (peak < 300) return;
    session.voiced += 1;
    const target = session.config.translation?.target_language;
    const heard = target === 'tr' ? HEARD.en : HEARD.tr;
    const translated = translate(heard.committed);
    const cut = translated.indexOf(',') > 0 ? translated.indexOf(',') + 1 : Math.ceil(translated.length / 2);
    const send = (tokens) => ws.send(JSON.stringify({ tokens, final_audio_proc_ms: session.voiced * 100, total_audio_proc_ms: session.voiced * 100 }));
    if (session.voiced === 6) send([{ text: heard.partial, is_final: false }]);
    if (session.voiced === 12) send([{ text: heard.partial, is_final: true }, { text: translated.slice(0, cut), translation_status: 'translation', is_final: true }]);
    if (session.voiced >= 22) {
      session.voiced = 0;
      session.segments += 1;
      send([
        { text: heard.committed.slice(heard.partial.length), is_final: true },
        { text: '<end>', is_final: true },
        { text: translated.slice(cut), translation_status: 'translation', is_final: true },
      ]);
    }
  });
}

// The free services answer in their own formats; `faults` makes one fail on purpose, and a
// `translator` (see claude) answers DeepL's requests instead of the fixed table.
async function free(req, res, url, host, stats, faults, translator) {
  if (req.method === 'GET') {
    if (url.pathname === '/v2/usage') return json(res, { character_count: 0, character_limit: 500000 });
    if (url.pathname.endsWith('/models')) return json(res, { object: 'list', data: [] });
  }
  const body = JSON.parse((await readBody(req)).toString() || '{}');
  if (host === 'api-free.deepl.com' && url.pathname === '/v2/translate') {
    stats.free.push({ service: 'deepl', text: body.text?.[0], target: body.target_lang, context: body.context || '' });
    if (faults.deepl) return json(res, { message: 'Quota for this billing period has been exceeded' }, faults.deepl);
    const text = body.text?.[0] || '';
    const answer = translator ? await translator(text, String(body.source_lang).toLowerCase(), String(body.target_lang).slice(0, 2).toLowerCase()) : translate(text);
    return json(res, { translations: [{ detected_source_language: body.source_lang, text: answer }] });
  }
  if (url.pathname.endsWith('/chat/completions')) {
    const service = host === 'api.mistral.ai' ? 'mistral' : 'groq';
    const user = body.messages?.at(-1)?.content || '';
    const utterance = (String(user).match(/<utterance>\n([\s\S]*?)\n<\/utterance>/) || [])[1] || '';
    stats.free.push({ service, model: body.model, text: utterance });
    if (faults[service]) return json(res, { message: 'Rate limit exceeded' }, faults[service]);
    await sleep(60);
    return json(res, { id: 'chat-mock', object: 'chat.completion', model: body.model, choices: [{ index: 0, message: { role: 'assistant', content: translate(utterance) }, finish_reason: 'stop' }] });
  }
  return json(res, { error: 'not mocked' }, 404);
}

async function route(req, res, stats, faults, options = {}) {
  const host = (req.headers.host || '').split(':')[0];
  const url = new URL(req.url, `https://${host}`);
  stats.requests.push(`${req.method} ${host}${url.pathname}`);
  if (host === 'api.elevenlabs.io') {
    if (req.method === 'POST' && url.pathname === '/v1/single-use-token/realtime_scribe') return json(res, { token: 'mock-token' });
    if (req.method === 'GET' && url.pathname === '/v1/voices') {
      return json(res, {
        voices: [
          { voice_id: 'mock-voice-a', name: 'Mock A', category: 'premade' },
          { voice_id: 'mock-voice-b', name: 'Mock B', category: 'premade' },
        ],
      });
    }
    if (req.method === 'POST' && /^\/v1\/text-to-speech\/[^/]+\/stream$/.test(url.pathname)) return speech(req, res, url, stats, faults);
    if (req.method === 'POST' && url.pathname === '/v1/voices/add') return json(res, { voice_id: 'mock-clone', requires_verification: false });
    if (req.method === 'DELETE' && url.pathname.startsWith('/v1/voices/')) return json(res, { status: 'ok' });
  }
  if (host === 'api.anthropic.com') {
    if (req.method === 'GET' && url.pathname.startsWith('/v1/models/')) {
      return json(res, { type: 'model', id: url.pathname.split('/').pop(), display_name: 'Mock', created_at: '2026-01-01T00:00:00Z' });
    }
    if (req.method === 'POST' && url.pathname === '/v1/messages') return claude(req, res, stats, faults, options.translator);
  }
  if (host === 'api-free.deepl.com' || host === 'api.mistral.ai' || host === 'api.groq.com') return free(req, res, url, host, stats, faults, options.translator);
  json(res, { error: 'not mocked' }, 404);
}

// Soniox's voices: each stream's config, then its text; answers a short tone in
// base64 pieces, then audio_end and terminated. Stream errors use the stream's id.
function sonioxSpeech(ws, req, stats, faults) {
  const key = String(req.headers['sec-websocket-protocol'] || '').split(',').map((x) => x.trim())[1] || '';
  const configs = new Map();
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.keep_alive) return;
    if (msg.model) configs.set(msg.stream_id, msg);
    if (!msg.text_end) return;
    const config = configs.get(msg.stream_id) || {};
    stats.sonioxTts.push({ ...config, text: msg.text, key });
    const send = (m) => ws.readyState === 1 && ws.send(JSON.stringify({ stream_id: msg.stream_id, ...m }));
    if (key !== 'mock-soniox') return send({ error_code: 401, error_type: 'unauthenticated', error_message: 'Invalid API key.', terminated: true });
    const audio = tone(0.6);
    const step = Math.floor(audio.length / 3 / 2) * 2 + 1;
    (async () => {
      for (let at = 0; at < audio.length; at += step) {
        await sleep(20);
        send({ audio: audio.subarray(at, at + step).toString('base64') });
      }
      send({ audio_end: true });
      send({ terminated: true });
    })();
  });
}

// `passthrough` hosts are tunnelled to the real service instead (for example the real
// ElevenLabs while Claude stays mocked).
// `mockOnly` turns it around for the live Meet test: only those hosts are mocked and
// every other CONNECT (Meet, Google, ElevenLabs) is tunnelled to the real internet.
export async function startMockApi({ cert, key, passthrough = [], mockOnly = null, translator = null }) {
  const real = new Set(passthrough);
  const options = { translator };
  const stats = { requests: [], stt: [], tts: [], claude: [], free: [], soniox: [], sonioxTts: [] };
  const faults = { deepl: 0, mistral: 0, groq: 0, tts: 0, claude: 0, stt: null, soniox: 0 };
  const api = https.createServer({ cert, key }, (req, res) => {
    route(req, res, stats, faults, options).catch((err) => {
      res.writeHead(500);
      res.end(String(err));
    });
  });
  // Two WebSocket services on one server: each upgrade goes to the one for its path.
  const wss = new WebSocketServer({ noServer: true });
  wss.on('connection', (ws, req) => scribe(ws, req, stats, faults));
  const sonioxWss = new WebSocketServer({ noServer: true, handleProtocols: (protocols) => (protocols.has('soniox-api-key') ? 'soniox-api-key' : false) });
  sonioxWss.on('connection', (ws, req) => soniox(ws, req, stats, faults));
  const sonioxTtsWss = new WebSocketServer({ noServer: true, handleProtocols: (protocols) => (protocols.has('soniox-api-key') ? 'soniox-api-key' : false) });
  sonioxTtsWss.on('connection', (ws, req) => sonioxSpeech(ws, req, stats, faults));
  api.on('upgrade', (req, socket, head) => {
    const path = new URL(req.url, 'https://x').pathname;
    const target = path === '/v1/speech-to-text/realtime' ? wss : path === '/transcribe-websocket' ? sonioxWss : path === '/tts-websocket' ? sonioxTtsWss : null;
    if (!target) return socket.destroy();
    target.handleUpgrade(req, socket, head, (ws) => target.emit('connection', ws, req));
  });
  const proxy = http.createServer((_req, res) => {
    res.writeHead(400);
    res.end();
  });
  // Browsers reset idle tunnels all the time; that is not a test failure.
  api.on('tlsClientError', () => {});
  proxy.on('clientError', (_err, socket) => socket.destroy());
  proxy.on('connect', (req, socket, head) => {
    socket.on('error', () => {});
    const [host, port = '443'] = req.url.split(':');
    if (real.has(host) || (mockOnly && !mockOnly.includes(host))) {
      const upstream = net.connect(Number(port), host, () => {
        socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head?.length) upstream.write(head);
        upstream.pipe(socket);
        socket.pipe(upstream);
      });
      upstream.on('error', () => socket.destroy());
      socket.on('close', () => upstream.destroy());
      return;
    }
    if (!HOSTS.has(host)) {
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head?.length) socket.unshift(head);
    api.emit('connection', socket);
  });
  await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  return {
    port: proxy.address().port,
    stats,
    faults,
    // Cuts every open speech recognition connection, as a network drop would.
    dropStt: () => {
      for (const ws of wss.clients) ws.terminate();
    },
    close: () => {
      wss.close();
      proxy.close();
      api.close();
    },
  };
}
