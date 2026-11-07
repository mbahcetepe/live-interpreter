// Cuts a live 16 kHz stream into utterances, for speech recognition services that take a
// whole recording rather than a live stream (OpenAI, Groq Whisper and servers with the
// same API). The same rules as speech-server/segmenter.py: a frame clearly louder than
// the background is speech (the noise floor follows the quiet frames), and an utterance
// ends after `silenceSecs` without it or when it reaches `maxSecs`.

const RATE = 16000;
const FRAME = 480; // 30 ms

export class Segmenter {
  constructor({ silenceSecs = 0.7, maxSecs = 15, prerollSecs = 0.3, minSpeechSecs = 0.3, minLevel = 0.006, ratio = 3 } = {}) {
    this.silenceSecs = silenceSecs;
    this.maxSecs = maxSecs;
    this.prerollFrames = Math.round((prerollSecs * RATE) / FRAME);
    this.minSpeechFrames = Math.round((minSpeechSecs * RATE) / FRAME);
    this.minLevel = minLevel;
    this.ratio = ratio;
    this.noise = 0.003;
    this.pending = new Float32Array(0);
    this.reset();
    this.pre = [];
  }

  reset() {
    this.speech = [];
    this.voiced = 0;
    this.quiet = 0;
  }

  // int16 chunk in; finished utterances (Float32Array, 16 kHz) out.
  push(int16) {
    const data = new Float32Array(this.pending.length + int16.length);
    data.set(this.pending);
    for (let i = 0; i < int16.length; i++) data[this.pending.length + i] = int16[i] / 32768;
    const done = [];
    let at = 0;
    for (; at + FRAME <= data.length; at += FRAME) {
      const utterance = this.frame(data.subarray(at, at + FRAME));
      if (utterance) done.push(utterance);
    }
    this.pending = data.slice(at);
    return done;
  }

  // What has been said so far, at once (the server asked for a commit, or the call ends).
  flush() {
    return this.voiced >= this.minSpeechFrames ? this.finish() : (this.reset(), null);
  }

  frame(frame) {
    let sum = 0;
    for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
    const level = Math.sqrt(sum / frame.length);
    const loud = level > Math.max(this.minLevel, this.noise * this.ratio);
    const copy = frame.slice();
    if (!this.speech.length) {
      if (!loud) {
        this.noise = 0.95 * this.noise + 0.05 * level;
        this.pre.push(copy);
        if (this.pre.length > this.prerollFrames) this.pre.shift();
        return null;
      }
      this.speech = [...this.pre, copy];
      this.pre = [];
      this.voiced = 1;
      this.quiet = 0;
      return null;
    }
    this.speech.push(copy);
    if (loud) {
      this.voiced += 1;
      this.quiet = 0;
    } else {
      this.quiet += 1;
    }
    const frameSecs = FRAME / RATE;
    if (this.quiet * frameSecs >= this.silenceSecs) return this.voiced >= this.minSpeechFrames ? this.finish() : (this.reset(), null);
    if (this.speech.length * frameSecs >= this.maxSecs) return this.finish();
    return null;
  }

  finish() {
    const out = new Float32Array(this.speech.reduce((n, f) => n + f.length, 0));
    let at = 0;
    for (const f of this.speech) {
      out.set(f, at);
      at += f.length;
    }
    this.reset();
    return out;
  }
}
