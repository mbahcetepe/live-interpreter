// Who may send which message to the service worker. Web pages cannot message the
// extension at all (there is no externally_connectable), but a content script runs
// inside the call page's tab, so a compromised page process could speak as one. Such a
// sender may only say hello and stop its own session; everything else comes from the
// extension's own pages (the popup) or from the engine (the offscreen document).

export const INCOMING_MODES = ['voice', 'text', 'off'];
export const OUTGOING_MODES = ['voice', 'off'];

const FROM_POPUP = new Set(['start', 'options', 'chime']);
const FROM_ENGINE = new Set(['engine-status', 'engine-options', 'engine-failed', 'call-ended', 'recording-ready', 'open-transcript']);

// The address tells the extension's own pages (even one opened in a tab, like the
// settings page) from a content script, which reports the web page's address.
export function senderKind(sender, { extensionId, offscreenUrl }) {
  if (!sender || sender.id !== extensionId) return 'foreign';
  const url = typeof sender.url === 'string' ? sender.url.split('#')[0].split('?')[0] : '';
  if (url && url === offscreenUrl) return 'engine';
  if (url.startsWith(`chrome-extension://${extensionId}/`)) return 'extension';
  return sender.tab ? 'tab' : 'foreign';
}

// sessionTabId: the tab the running session belongs to, or null.
export function isAllowed(type, sender, { extensionId, offscreenUrl, sessionTabId = null }) {
  const kind = senderKind(sender, { extensionId, offscreenUrl });
  if (kind === 'foreign') return false;
  if (type === 'tab-hello') return kind === 'tab';
  if (type === 'stop') return kind === 'extension' || (kind === 'tab' && sessionTabId != null && sender.tab.id === sessionTabId);
  if (FROM_POPUP.has(type)) return kind === 'extension';
  if (FROM_ENGINE.has(type)) return kind === 'engine';
  return false;
}

// Only the two mode fields, and only values the extension knows.
export function cleanModes(options) {
  const out = {};
  if (INCOMING_MODES.includes(options?.incomingMode)) out.incomingMode = options.incomingMode;
  if (OUTGOING_MODES.includes(options?.outgoingMode)) out.outgoingMode = options.outgoingMode;
  return out;
}
