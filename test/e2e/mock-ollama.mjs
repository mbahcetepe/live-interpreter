// A stand-in for an Ollama server on 127.0.0.1 (plain HTTP, which Chromium reaches
// directly, past the test proxy). It answers /api/tags and streams /api/chat the way
// Ollama does, and refuses a request that carries an Origin header, like a real Ollama
// without OLLAMA_ORIGINS: the extension has to remove that header itself.

import http from 'node:http';
import { translate } from './mock-api.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function startMockOllama({ models = ['mock-gemma:12b'] } = {}) {
  const stats = { chats: [], refused: 0 };
  const faults = { down: false };
  const server = http.createServer(async (req, res) => {
    if (faults.down) {
      req.socket.destroy();
      return;
    }
    if (req.headers.origin) {
      stats.refused += 1;
      res.writeHead(403);
      res.end();
      return;
    }
    if (req.method === 'GET' && req.url === '/api/tags') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ models: models.map((name) => ({ name, model: name })) }));
      return;
    }
    const parts = [];
    for await (const chunk of req) parts.push(chunk);
    const body = JSON.parse(Buffer.concat(parts).toString() || '{}');
    if (req.url === '/api/generate') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"done":true}');
      return;
    }
    if (req.url === '/api/chat') {
      const user = body.messages?.at(-1)?.content || '';
      const utterance = (String(user).match(/<utterance>\n([\s\S]*?)\n<\/utterance>/) || [])[1] || '';
      stats.chats.push({ model: body.model, think: body.think, utterance });
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      for (const word of translate(utterance).split(/(?<= )/)) {
        res.write(`${JSON.stringify({ model: body.model, message: { role: 'assistant', content: word }, done: false })}\n`);
        await sleep(15);
      }
      res.end(`${JSON.stringify({ model: body.model, done: true })}\n`);
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, stats, faults, close: () => server.close() };
}
