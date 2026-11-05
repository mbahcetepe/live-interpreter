// The page hook runs in the call site's own JavaScript world, so whatever it reports
// could have been written by the site's scripts too. The engine takes only the fields it
// knows, of the right type and size; anything unclear counts as muted.

const bool = (v, fallback = false) => (typeof v === 'boolean' ? v : fallback);
const count = (v, max) => (Number.isInteger(v) && v >= 0 ? Math.min(v, max) : 0);
const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const seconds = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(v, 600) : 0);

export function sanitizePageState(state) {
  const s = state && typeof state === 'object' ? state : {};
  const d = s.debug && typeof s.debug === 'object' ? s.debug : {};
  return {
    muted: bool(s.muted, true),
    senders: count(s.senders, 16),
    inCall: bool(s.inCall),
    micLabel: text(s.micLabel, 200),
    ctxState: text(s.ctxState, 20),
    backlog: seconds(s.backlog),
    playing: bool(s.playing),
    debug: {
      dom: typeof d.dom === 'boolean' ? d.dom : null,
      sending: bool(d.sending),
      rawState: text(d.rawState, 20),
      audioSenders: count(d.audioSenders, 16),
      underruns: count(d.underruns, 1e6),
    },
  };
}
