import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PcmScheduler } from '../../src/shared/scheduler.js';

// Just enough of an AudioContext to see when each buffer is started.
function fakeContext() {
  const ctx = {
    currentTime: 0,
    sampleRate: 24000,
    starts: [],
    createBuffer(channels, length, rate) {
      return { duration: length / rate, copyToChannel() {} };
    },
    createBufferSource() {
      return {
        connect() {},
        disconnect() {},
        stop() {},
        start(at) {
          ctx.starts.push(at);
        },
      };
    },
  };
  return ctx;
}

const chunk = (seconds) => new Int16Array(Math.round(seconds * 24000));

test('a gap inside an utterance makes the buffer longer, up to the limit', () => {
  const ctx = fakeContext();
  const player = new PcmScheduler(ctx, {}, { prebufferSec: 0.25, maxPrebufferSec: 0.4 });
  player.push('a', chunk(0.2));
  assert.equal(player.prebufferSec, 0.25);
  ctx.currentTime = 2; // the next chunk of the same utterance came late
  player.push('a', chunk(0.2));
  assert.equal(player.underruns, 1);
  assert.ok(Math.abs(player.prebufferSec - 0.35) < 1e-9);
  ctx.currentTime = 4;
  player.push('a', chunk(0.2));
  assert.equal(player.prebufferSec, 0.4);
  assert.ok(ctx.starts.at(-1) >= 4.4 - 1e-6);
  player.flush();
});

test('a new utterance after a pause is not a gap', () => {
  const ctx = fakeContext();
  const player = new PcmScheduler(ctx, {}, { prebufferSec: 0.25, maxPrebufferSec: 0.6 });
  player.push('a', chunk(0.2));
  player.end('a');
  ctx.currentTime = 5;
  player.push('b', chunk(0.2));
  assert.equal(player.underruns, 0);
  assert.equal(player.prebufferSec, 0.25);
  player.flush();
});

test('without a limit the buffer stays as it was set', () => {
  const ctx = fakeContext();
  const player = new PcmScheduler(ctx, {});
  player.push('a', chunk(0.1));
  ctx.currentTime = 3;
  player.push('a', chunk(0.1));
  assert.equal(player.prebufferSec, 0.12);
  player.flush();
});
