// Text helpers for the translation stream.
import { insideMark } from './pronounce.js';

// Chinese and Japanese are written without spaces, and their punctuation (。，、) has no
// space after it either. A Latin full stop needs a space after it ("3.5" is no sentence
// end); a CJK one does not, but it must not be the last character yet, so a closing
// quote that follows in the next chunk stays with its sentence.
const CJK = '\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}ー';
const CLOSERS = `"'”’»)\\]」』`;
const SENTENCE_END = new RegExp(`[.!?…]+[${CLOSERS}]*(?=\\s)|[。！？]+[${CLOSERS}]*(?=[^${CLOSERS}])`, 'gu');
const SOFT_BREAK = /[,;:،]\s|[、，；：]/gu;
const CJK_CHAR = new RegExp(`[${CJK}]`, 'u');

// How long a piece of text sounds, in Latin characters: a Chinese or Japanese character
// carries about as much speech as two, so the same thresholds give clauses of a similar
// length in every language.
export function textWeight(text) {
  let weight = 0;
  for (const ch of String(text)) weight += CJK_CHAR.test(ch) ? 2 : 1;
  return weight;
}

// Cuts a streamed translation into pieces the voice can start speaking right away:
// a sentence, or a clause once it is long enough to sound natural on its own (clauseMin),
// so the first words are heard before the sentence is finished. Text with no break at
// all is cut at a space once it passes hardMax (or anywhere in text without spaces).
// The lengths are text weights (textWeight).
export class SentenceSplitter {
  constructor({ minChars = 12, clauseMin = 24, softMax = 160, hardMax = 110 } = {}) {
    this.minChars = minChars;
    this.clauseMin = clauseMin;
    this.softMax = softMax;
    this.hardMax = Math.min(hardMax, softMax);
    this.buffer = '';
  }

  weightTo(index) {
    return textWeight(this.buffer.slice(0, index));
  }

  push(text) {
    this.buffer += text;
    const pieces = [];
    for (;;) {
      const cut = this.findCut();
      if (cut <= 0) break;
      const piece = this.buffer.slice(0, cut).trim();
      this.buffer = this.buffer.slice(cut).replace(/^\s+/, '');
      if (piece) pieces.push(piece);
    }
    return pieces;
  }

  findCut() {
    SENTENCE_END.lastIndex = 0;
    let match;
    let sentence = 0;
    while ((match = SENTENCE_END.exec(this.buffer))) {
      const end = match.index + match[0].length;
      if (this.weightTo(end) >= this.minChars && !insideMark(this.buffer, end)) {
        sentence = end;
        break;
      }
    }
    // The first clause long enough to speak, unless a sentence ends before it.
    SOFT_BREAK.lastIndex = 0;
    while ((match = SOFT_BREAK.exec(this.buffer))) {
      const end = match.index + 1;
      if (sentence && end > sentence) break;
      const weight = this.weightTo(end);
      if (weight >= this.clauseMin && weight <= this.softMax && !insideMark(this.buffer, end)) return end;
    }
    if (sentence) return sentence;
    if (textWeight(this.buffer) > this.hardMax) {
      // The last index whose text still fits in hardMax.
      let limit = 0;
      let weight = 0;
      for (const ch of this.buffer) {
        weight += CJK_CHAR.test(ch) ? 2 : 1;
        if (weight > this.hardMax) break;
        limit += ch.length;
      }
      let space = this.buffer.lastIndexOf(' ', limit);
      while (space > 0 && this.weightTo(space) >= this.minChars && insideMark(this.buffer, space)) space = this.buffer.lastIndexOf(' ', space - 1);
      if (space > 0 && this.weightTo(space) >= this.minChars) return space;
      // No space to cut at (Chinese, Japanese): cut between two CJK characters.
      for (let i = limit; i > 0; i--) {
        if (CJK_CHAR.test(this.buffer[i - 1]) && CJK_CHAR.test(this.buffer[i]) && this.weightTo(i) >= this.minChars && !insideMark(this.buffer, i)) return i;
      }
    }
    return 0;
  }

  flush() {
    const rest = this.buffer.trim();
    this.buffer = '';
    return rest;
  }

  reset() {
    this.buffer = '';
  }
}

// A word is a run of letters or digits; in Chinese and Japanese, which have no spaces,
// every character counts as one word.
const WORD = new RegExp(`[${CJK}]|(?:(?![${CJK}])[\\p{L}\\p{N}])+`, 'gu');

export function words(text) {
  return (
    String(text)
      .toLocaleLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .match(WORD) || []
  );
}

// Length of the longest common subsequence of two word lists.
export function lcsLength(a, b) {
  const row = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = 0;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j];
      row[j] = a[i - 1] === b[j - 1] ? diagonal + 1 : Math.max(row[j], row[j - 1]);
      diagonal = above;
    }
  }
  return row[b.length];
}

// Remembers what we just played out loud, so that our own voice leaking back in
// (speakers instead of headphones, on either side) is not translated a second time.
// A heard text counts as an echo only when it repeats what we said, in order, and
// arrives while that audio was playing or within a few seconds after it ended.
// A real reply that reuses the same words comes later than that.
export class EchoGuard {
  constructor({ graceMs = 3500, threshold = 0.8, minWords = 3 } = {}) {
    this.graceMs = graceMs;
    this.threshold = threshold;
    this.minWords = minWords;
    this.recent = [];
  }

  remember(text, { start = Date.now(), end = start } = {}) {
    this.recent.push({ words: words(text), start, end });
    if (this.recent.length > 30) this.recent.shift();
  }

  isEcho(text, now = Date.now()) {
    const heard = words(text);
    if (heard.length < this.minWords) return false;
    const live = this.recent.filter((r) => now >= r.start && now <= r.end + this.graceMs);
    if (!live.length) return false;
    const joined = live.flatMap((r) => r.words);
    const score = lcsLength(heard, joined) / heard.length;
    return score >= this.threshold;
  }
}

export function isOnlyPunctuation(text) {
  return !/[\p{L}\p{N}]/u.test(String(text));
}

// ---- early sentences -------------------------------------------------------------------
//
// Speech recognition commits a segment only after the speaker pauses, so someone who
// talks for a minute would be translated a minute late. The partial transcript already
// carries finished sentences; once one is followed by more words and has stayed the same
// across two updates, it is sent ahead. When the segment is committed, only the part
// that was not sent ahead is translated.

const ABBREVIATIONS = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'vs', 'etc', 'inc', 'ltd', 'jr', 'sr', 'no', 'vb', 'bkz', 'sn', 'dk', 'yy', 'cad', 'sok']);

// Index just after the last sentence end that more words follow; 0 when there is none.
export function finishedSentenceEnd(text) {
  // A Latin sentence end needs a space and more words after it; a CJK one (。) only more words.
  const re = new RegExp(`([\\p{L}\\p{N}]*)(?:([.!?…]+[${CLOSERS}]*)\\s+(?=\\S)|([。！？]+[${CLOSERS}]*)\\s*(?=[\\p{L}\\p{N}]))`, 'gu');
  let cut = 0;
  let match;
  while ((match = re.exec(text))) {
    const word = match[1].toLocaleLowerCase();
    const end = match[2] || match[3];
    if (match[2] && end[0] === '.' && (ABBREVIATIONS.has(word) || /^\p{L}$/u.test(word))) continue;
    cut = match.index + match[1].length + end.length;
  }
  return cut;
}

function tokens(text) {
  const out = [];
  const re = new RegExp(WORD.source, 'gu');
  let match;
  while ((match = re.exec(text))) out.push({ word: words(match[0]).join(''), end: match.index + match[0].length });
  return out;
}

// The final transcript often changes a Turkish ending ("uygundur" to "uygun"); such a
// revised word still belongs to the prefix.
const sameStem = (a, b) => Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a));

// What `text` says after the words of `prefix`. Small differences between the partial
// and the final transcript (a changed word or punctuation) are tolerated.
export function remainderAfter(prefix, text) {
  const head = words(prefix);
  if (!head.length) return text.trim();
  const toks = tokens(text);
  const textWords = toks.map((t) => t.word);
  let k = 0;
  if (head.every((w, i) => textWords[i] === w)) {
    k = head.length;
  } else {
    let best = -1;
    for (let n = 1; n <= textWords.length; n++) {
      const score = lcsLength(head, textWords.slice(0, n));
      if (score > best) {
        best = score;
        k = n;
      }
    }
    if (best < Math.ceil(head.length * 0.6)) return text.trim(); // not the same speech after all
    if (k < textWords.length && best < head.length && sameStem(textWords[k], head[head.length - 1])) k += 1;
  }
  if (k >= toks.length) return '';
  let cut = toks[k - 1].end;
  while (cut < text.length && !/[\s\p{L}\p{N}]/u.test(text[cut])) cut += 1; // keep the sentence end with the prefix
  return text.slice(cut).trim();
}

export class EarlySentences {
  constructor({ minChars = 12 } = {}) {
    this.minChars = minChars;
    this.reset();
  }

  reset() {
    this.sent = '';
    this.candidate = '';
  }

  // Text that is ready to translate now, or ''.
  partial(text) {
    const cut = finishedSentenceEnd(text);
    if (!cut) return '';
    const candidate = text.slice(0, cut);
    if (words(candidate).length <= words(this.sent).length) return '';
    // First sighting: wait for the next update to confirm it.
    if (candidate !== this.candidate) {
      this.candidate = candidate;
      return '';
    }
    const fresh = this.sent ? remainderAfter(this.sent, candidate) : candidate.trim();
    if (textWeight(fresh) < this.minChars) return '';
    this.sent = candidate;
    return fresh;
  }

  // The final transcript of the segment, minus what was already sent ahead. A final that
  // has no more words than what was sent is a revision of it ("uygundur" to "uygun"),
  // not new speech, so nothing is left to translate.
  committed(text) {
    const rest = !this.sent ? text.trim() : words(text).length <= words(this.sent).length ? '' : remainderAfter(this.sent, text);
    this.reset();
    return rest;
  }

  // The live line: only the words not sent ahead yet.
  live(text) {
    return this.sent ? remainderAfter(this.sent, text) : text;
  }
}
