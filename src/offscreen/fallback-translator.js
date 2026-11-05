// Claude first, free translation when Claude fails. A sentence Claude cannot translate
// (overloaded, rate limited, out of credit, unreachable) is translated by the free chain
// in free-translator.js instead of being lost from the call.
//
// Only a failure before Claude sends any text falls back: once part of a translation has
// been spoken, a second translation of the whole sentence would repeat it. After a
// failure Claude rests for a while (or for the rest of the call when the key or the
// model is unusable), so the following sentences go straight to the free chain.

export class FallbackTranslator {
  constructor({ primary, backup, restFor = () => 0, log, now } = {}) {
    this.primary = primary;
    this.backup = backup;
    this.restFor = restFor;
    this.log = log || (() => {});
    this.now = now || (() => Date.now());
    this.primaryRestUntil = 0;
  }

  update(options) {
    // Another model gets a fresh chance (the old one may have been unavailable).
    if (options?.model && options.model !== this.primary.model) this.primaryRestUntil = 0;
    this.primary.update(options);
    this.backup.update(options);
  }

  // Claude's key and model must work; the free chain only adds a note when it could not
  // stand in, so the call still starts.
  async verify() {
    const [, ready] = await Promise.all([this.primary.verify(), this.backupReady()]);
    return ready ? [] : [{ id: 'backup', key: 'warn.noBackup' }];
  }

  // Chrome's language packs may still be downloading when the call starts.
  backupReady() {
    return this.backup.verify().then(
      () => true,
      () => false,
    );
  }

  async *translate(job) {
    if (this.primaryRestUntil > this.now()) {
      yield* this.backup.translate(job);
      return;
    }
    let spoke = false;
    try {
      for await (const piece of this.primary.translate(job)) {
        spoke = true;
        yield piece;
      }
      return;
    } catch (err) {
      if (spoke || job.signal?.aborted || isAbort(err)) throw err;
      const rest = this.restFor(err);
      if (rest > 0) this.primaryRestUntil = this.now() + rest;
      this.log('warn', `Claude failed (${err?.message || err}), using free translation${rest > 0 ? ` for ${rest === Infinity ? 'the rest of the call' : `${Math.round(rest / 1000)} s`}` : ''}`);
      try {
        yield* this.backup.translate(job);
      } catch (backupErr) {
        if (job.signal?.aborted || isAbort(backupErr)) throw backupErr;
        // Claude's own error says more about what to fix than "free translation failed".
        throw err;
      }
    }
  }
}

function isAbort(err) {
  return err?.name === 'AbortError' || err?.constructor?.name === 'APIUserAbortError';
}
