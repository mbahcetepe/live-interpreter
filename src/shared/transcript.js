// The transcript of one translation session: what was said on each side and how it was
// translated, with the time from the start. The engine fills it from the same events
// that drive the subtitles; the recordings page turns it into a text file or subtitles.

export class TranscriptLog {
  // meta: { id, startedAt, title, url, kind ('call' | 'media'), myLanguage, theirLanguage }
  constructor(meta) {
    this.meta = meta;
    this.lines = [];
    this.byId = new Map();
  }

  // A caption event (engine.caption); true when the transcript changed.
  add(dir, event, now = Date.now()) {
    if (!event?.id) return false;
    if (event.phase === 'committed') {
      if (this.byId.has(event.id)) return false;
      const line = { id: event.id, at: Math.max(0, now - this.meta.startedAt), dir, source: event.source || '', translation: '' };
      this.byId.set(event.id, line);
      this.lines.push(line);
      return true;
    }
    if (event.phase === 'translating' || event.phase === 'translated') {
      const line = this.byId.get(event.id);
      if (!line || !event.translation) return false;
      line.translation = event.translation;
      return true;
    }
    return false;
  }

  snapshot(extra = {}) {
    return { ...this.meta, ...extra, lines: this.lines.map(({ id, ...line }) => line) };
  }
}

const pad = (n, width = 2) => String(n).padStart(width, '0');

function clock(ms) {
  const s = Math.floor(ms / 1000);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}

function srtTime(ms) {
  return `${clock(ms)},${pad(Math.floor(ms % 1000), 3)}`;
}

// labels: { title, them, me, speaker, date } in the interface language.
export function transcriptToText(transcript, labels) {
  const head = [`${labels.title}: ${transcript.title || transcript.url || ''}`.trim(), `${labels.date}: ${labels.formatDate(transcript.startedAt)}`];
  if (transcript.url) head.push(transcript.url);
  const who = (dir) => (transcript.kind === 'media' ? labels.speaker : dir === 'in' ? labels.them : labels.me);
  const body = transcript.lines.map((line) => {
    const lines = [`[${clock(line.at)}] ${who(line.dir)}: ${line.source}`];
    if (line.translation && line.translation !== line.source) lines.push(`    → ${line.translation}`);
    return lines.join('\n');
  });
  return `${head.join('\n')}\n\n${body.join('\n')}\n`;
}

// Subtitles for a player: the translation, with the original under it. Each one stays
// until the next begins, for at least two seconds and at most eight.
export function transcriptToSrt(transcript) {
  const lines = transcript.lines.filter((l) => l.translation || l.source);
  return `${lines
    .map((line, i) => {
      const next = lines[i + 1]?.at ?? Infinity;
      const end = Math.min(next, line.at + Math.min(8000, Math.max(2000, (line.translation || line.source).length * 70)));
      const text = line.translation && line.translation !== line.source ? `${line.translation}\n${line.source}` : line.translation || line.source;
      return `${i + 1}\n${srtTime(line.at)} --> ${srtTime(Math.max(end, line.at + 500))}\n${text}\n`;
    })
    .join('\n')}`;
}
