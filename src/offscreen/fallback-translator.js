// Claude first, free translation when Claude fails. A sentence Claude cannot translate
// (overloaded, rate limited, out of credit, unreachable) is translated by the free chain
// in free-translator.js instead of being lost from the call.
//
// Only a failure before Claude sends any text falls back: once part of a translation has
// been spoken, a second translation of the whole sentence would repeat it. After a
// failure Claude rests for a while (or for the rest of the call when the key or the
// model is unusable), so the following sentences go straight to the free chain.

//
// The same pair also puts the person's own Ollama server in front (ollama-translator.js):
// Ollama, then a second Ollama server, then Claude, then free translation.
export class FallbackTranslator {
  // requirePrimary: the call does not start without the primary (Claude: a bad key must
  // show at once). An Ollama server that is down only rests, and the backup starts.
  constructor({ primary, backup, restFor = () => 0, log, now, name = 'Claude', requirePrimary = true } = {}) {
    this.primary = primary;
    this.backup = backup;
    this.restFor = restFor;
    this.log = log || (() => {});
    this.now = now || (() => Date.now());
    this.name = name;
    this.requirePrimary = requirePrimary;
    this.primaryRestUntil = 0;
  }

  update(options) {
    // Another model gets a fresh chance (the old one may have been unavailable).
    const before = this.primary.model;
    this.primary.update(options);
    if (this.primary.model !== before) this.primaryRestUntil = 0;
    this.backup.update(options);
  }

  // The primary must work (unless it may rest); the backup only adds a note when it
  // could not stand in, so the call still starts.
  async verify() {
    if (this.requirePrimary) {
      const [notes, ready] = await Promise.all([this.primary.verify(), this.backupReady()]);
      return [...(notes || []), ...(ready ? [] : [{ id: 'backup', key: 'warn.noBackup' }])];
    }
    const [primary, backup] = await Promise.allSettled([this.primary.verify(), this.backup.verify()]);
    if (primary.status === 'fulfilled') {
      const backupNotes = backup.status === 'fulfilled' ? backup.value || [] : [{ id: 'backup', key: 'warn.noBackup' }];
      return [...(primary.value || []), ...backupNotes];
    }
    // The primary is down: it rests and the backup carries the call, if it can.
    if (backup.status === 'rejected') throw primary.reason;
    const rest = this.restFor(primary.reason);
    this.primaryRestUntil = this.now() + (rest > 0 ? rest : 15_000);
    const message = primary.reason?.message || String(primary.reason);
    this.log('warn', `${this.name} is not available (${message}), starting with the backup`);
    return [...(backup.value || []), { id: `down-${this.name}`, key: 'warn.serverDown', params: { name: this.name, message } }];
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
      this.log('warn', `${this.name} failed (${err?.message || err}), using the backup${rest > 0 ? ` for ${rest === Infinity ? 'the rest of the call' : `${Math.round(rest / 1000)} s`}` : ''}`);
      try {
        yield* this.backup.translate(job);
      } catch (backupErr) {
        if (job.signal?.aborted || isAbort(backupErr)) throw backupErr;
        // The primary's own error says more about what to fix than the backup's.
        throw err;
      }
    }
  }
}

function isAbort(err) {
  return err?.name === 'AbortError' || err?.constructor?.name === 'APIUserAbortError';
}
