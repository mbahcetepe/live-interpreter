import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FallbackTranslator } from '../../src/offscreen/fallback-translator.js';

function fake({ pieces = [], failWith = null, failAfter = Infinity, verifyFails = false } = {}) {
  return {
    calls: 0,
    updates: [],
    model: 'm1',
    update(options) {
      this.updates.push(options);
      if (options?.model) this.model = options.model;
    },
    async verify() {
      if (verifyFails) throw new Error('not ready');
    },
    async *translate() {
      this.calls += 1;
      let i = 0;
      for (const piece of pieces) {
        if (i++ >= failAfter) throw failWith;
        yield piece;
      }
      if (failWith && failAfter === Infinity) throw failWith;
    },
  };
}

async function collect(iterable) {
  const out = [];
  for await (const piece of iterable) out.push(piece);
  return out;
}

const job = { text: 'Hello.', from: 'en', to: 'tr', history: [] };

test('a working Claude is used and the backup is never asked', async () => {
  const primary = fake({ pieces: ['Merhaba.'] });
  const backup = fake({ pieces: ['Selam.'] });
  const t = new FallbackTranslator({ primary, backup });
  assert.deepEqual(await collect(t.translate(job)), ['Merhaba.']);
  assert.equal(backup.calls, 0);
});

test('a Claude failure before any text falls back to free translation', async () => {
  const primary = fake({ failWith: Object.assign(new Error('overloaded'), { status: 529 }) });
  const backup = fake({ pieces: ['Selam.'] });
  const t = new FallbackTranslator({ primary, backup });
  assert.deepEqual(await collect(t.translate(job)), ['Selam.']);
  assert.equal(backup.calls, 1);
});

test('a failure after Claude has spoken is not translated twice', async () => {
  const err = new Error('connection lost');
  const primary = fake({ pieces: ['Bir.', 'İki.'], failWith: err, failAfter: 1 });
  const backup = fake({ pieces: ['Selam.'] });
  const t = new FallbackTranslator({ primary, backup });
  const out = [];
  await assert.rejects(async () => {
    for await (const piece of t.translate(job)) out.push(piece);
  }, err);
  assert.deepEqual(out, ['Bir.']);
  assert.equal(backup.calls, 0);
});

test('an abort is passed on, not covered by the backup', async () => {
  const abort = new DOMException('stopped', 'AbortError');
  const t = new FallbackTranslator({ primary: fake({ failWith: abort }), backup: fake({ pieces: ['Selam.'] }) });
  await assert.rejects(collect(t.translate(job)), (err) => err.name === 'AbortError');
});

test('after a failure Claude rests and the next sentences go straight to the backup', async () => {
  let now = 1000;
  const primary = fake({ failWith: new Error('rate limited') });
  const backup = fake({ pieces: ['Selam.'] });
  const t = new FallbackTranslator({ primary, backup, restFor: () => 30_000, now: () => now });
  await collect(t.translate(job));
  await collect(t.translate(job));
  assert.equal(primary.calls, 1);
  assert.equal(backup.calls, 2);
  now += 30_001;
  await collect(t.translate(job));
  assert.equal(primary.calls, 2);
});

test('when the backup fails too, Claude\'s error is the one reported', async () => {
  const claudeErr = new Error('Anthropic hesabında kredi yok');
  const t = new FallbackTranslator({ primary: fake({ failWith: claudeErr }), backup: fake({ failWith: new Error('no service') }) });
  await assert.rejects(collect(t.translate(job)), claudeErr);
});

test('a new model gets a fresh chance after Claude was put to rest', async () => {
  const primary = fake({ failWith: new Error('model not found') });
  const backup = fake({ pieces: ['Selam.'] });
  const t = new FallbackTranslator({ primary, backup, restFor: () => Infinity });
  await collect(t.translate(job));
  t.update({ model: 'm2' });
  await collect(t.translate(job));
  assert.equal(primary.calls, 2);
  assert.equal(backup.updates.length, 1);
});

test('verify needs Claude to work and only notes a backup that is not ready', async () => {
  const ok = new FallbackTranslator({ primary: fake(), backup: fake() });
  assert.deepEqual(await ok.verify(), []);
  const noBackup = new FallbackTranslator({ primary: fake(), backup: fake({ verifyFails: true }) });
  assert.deepEqual(await noBackup.verify(), [{ id: 'backup', key: 'warn.noBackup' }]);
  const badKey = new FallbackTranslator({ primary: fake({ verifyFails: true }), backup: fake() });
  await assert.rejects(badKey.verify());
});

test('a service that is out for the rest of the call is reported once', async () => {
  const off = [];
  const authErr = Object.assign(new Error('bad key'), { status: 401 });
  const t = new FallbackTranslator({ primary: fake({ failWith: authErr }), backup: fake({ pieces: ['Selam.'] }), restFor: () => Infinity, name: 'Claude', onOff: (name, err) => off.push([name, err.message]) });
  await collect(t.translate(job));
  await collect(t.translate(job));
  assert.deepEqual(off, [['Claude', 'bad key']]);
});

test('a backup Claude with a bad key does not hold up the call', async () => {
  const off = [];
  const claude = fake({ verifyFails: true });
  const t = new FallbackTranslator({ primary: claude, backup: fake(), restFor: () => Infinity, requirePrimary: false, onOff: (name) => off.push(name) });
  const notes = await t.verify();
  assert.equal(notes[0].key, 'warn.serverDown');
  assert.deepEqual(off, ['Claude']);
});
