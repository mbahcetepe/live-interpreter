// A stand-in for a server with OpenAI's API on 127.0.0.1 (like LM Studio or vLLM):
// GET /v1/models and a streamed POST /v1/chat/completions, with a key it checks.

import http from 'node:http';
import { translate } from './mock-api.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function startMockOpenAI({ models = ['mock-llm'], key = 'mock-key' } = {}) {
  const stats = { chats: [], refused: 0 };
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
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}/v1`, key, stats, close: () => server.close() };
}
