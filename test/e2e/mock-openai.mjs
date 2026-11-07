// A stand-in for a server with OpenAI's API on 127.0.0.1 (like LM Studio, vLLM or LocalAI):
// GET /v1/models, a streamed POST /v1/chat/completions, and the audio API
// (/v1/audio/transcriptions, /v1/audio/speech), with a key it checks.

import http from 'node:http';
import { translate } from './mock-api.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HEARD = { en: 'Hi, thanks for joining the call today.', tr: 'Cuma günü saat üç bizim için uygun.' };

export async function startMockOpenAI({ models = ['mock-llm'], key = 'mock-key' } = {}) {
  const stats = { chats: [], refused: 0, transcriptions: [], speech: [] };
  const server = http.createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${key}`) {
      stats.refused += 1;
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end('{"error":{"message":"bad key"}}');
      return;
    }
    if (req.method === 'GET' && req.url === '/v1/models') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ object: 'list', data: models.map((id) => ({ id, object: 'model' })) }));
      return;
    }
    if (req.method === 'POST' && req.url === '/v1/chat/completions') {
      const parts = [];
      for await (const chunk of req) parts.push(chunk);
      const body = JSON.parse(Buffer.concat(parts).toString() || '{}');
      const user = body.messages?.at(-1)?.content || '';
      const utterance = (String(user).match(/<utterance>\n([\s\S]*?)\n<\/utterance>/) || [])[1] || '';
      stats.chats.push({ model: body.model, stream: body.stream, utterance });
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      for (const word of translate(utterance).split(/(?<= )/)) {
        res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: word } }] })}\n\n`);
        await sleep(15);
      }
      res.end('data: [DONE]\n\n');
      return;
    }
    if (req.method === 'POST' && req.url === '/v1/audio/transcriptions') {
      const parts = [];
      for await (const chunk of req) parts.push(chunk);
      const raw = Buffer.concat(parts).toString('latin1');
      const field = (name) => (raw.match(new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`)) || [])[1] || '';
      const language = field('language');
      stats.transcriptions.push({ model: field('model'), language, bytes: raw.length });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ text: HEARD[language] || HEARD.en }));
      return;
    }
    if (req.method === 'POST' && req.url === '/v1/audio/speech') {
      const parts = [];
      for await (const chunk of req) parts.push(chunk);
      const body = JSON.parse(Buffer.concat(parts).toString() || '{}');
      stats.speech.push({ model: body.model, voice: body.voice, format: body.response_format, input: body.input });
      const n = 24000 * 0.8;
      const pcm = Buffer.alloc(n * 2);
      for (let i = 0; i < n; i++) pcm.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 330 * i) / 24000) * 0.3 * 32767), i * 2);
      res.writeHead(200, { 'content-type': 'audio/pcm' });
      res.end(pcm);
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}/v1`, key, stats, close: () => server.close() };
}
