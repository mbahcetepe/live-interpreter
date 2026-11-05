// The video call sites the extension works on, and what differs between them.
//
// Everything that knows about a particular site lives here: which addresses it uses,
// how its microphone button says whether you are muted, where its own captions are and
// how much room its controls take at the bottom of the window. The audio path itself
// (the RTCRtpSender swap in page-hook.js) is the same for every site that uses WebRTC.

export const PLATFORMS = [
  {
    id: 'meet',
    name: 'Google Meet',
    prefixes: ['https://meet.google.com/'],
    // Meet's controls run along the bottom of the window.
    subtitleBottom: 104,
    captionSelectors: ['[role="region"][aria-label*="aption" i]', '[role="region"][aria-label*="ltyaz" i]'],
  },
  {
    id: 'teams',
    name: 'Microsoft Teams',
    // Work or school accounts, the newer cloud.microsoft address, and personal Teams.
    prefixes: ['https://teams.microsoft.com/', 'https://teams.cloud.microsoft/', 'https://teams.live.com/'],
    // Teams keeps its meeting controls in the top bar, so the subtitles can sit lower.
    subtitleBottom: 48,
    // UNVERIFIED: Teams' live caption container. Check in a real call and adjust.
    captionSelectors: [
      '[data-tid="closed-caption-v2-window-wrapper"]',
      '[data-tid="closed-captions-renderer"]',
      '[role="region"][aria-label*="aption" i]',
      '[role="region"][aria-label*="ltyaz" i]',
    ],
  },
];

export function platformForUrl(url) {
  if (typeof url !== 'string') return null;
  return PLATFORMS.find((p) => p.prefixes.some((prefix) => url.startsWith(prefix))) || null;
}

export const isSupportedUrl = (url) => platformForUrl(url) !== null;

// chrome.tabs.query patterns for every supported site.
export const URL_PATTERNS = PLATFORMS.flatMap((p) => p.prefixes.map((prefix) => `${prefix}*`));

// ---- reading the mute state from a microphone button ---------------------------------
//
// Each detector gets the candidate buttons as plain records:
//   { label: aria-label + title + data-tooltip, isMuted: data-is-muted ('true'/'false'/null),
//     tag: id + data-tid + data-inp }
// and answers true (muted), false (sending) or null (cannot tell). null is always safe:
// page-hook.js then decides from the microphone track alone, and the DOM can only ever
// add a reason to stay silent, never send audio the track would not.

// Meet's microphone button carries data-is-muted. Its tooltip names the shortcut
// (ctrl/cmd + d); otherwise the word for microphone tells it apart from the camera.
const MIC_WORD = /micr|mikr|микр|μικρ|ميكروفون|माइक|マイク|麦克风|麥克風|마이크/i;

export function meetMuted(buttons) {
  let fallback = null;
  for (const b of buttons) {
    if (b.isMuted !== 'true' && b.isMuted !== 'false') continue;
    if (/\+\s*d\b/i.test(b.label)) return b.isMuted === 'true';
    if (fallback === null && MIC_WORD.test(b.label)) fallback = b.isMuted === 'true';
  }
  return fallback;
}

// Teams' microphone button: its label or tooltip names the shortcut Ctrl+Shift+M
// (Cmd+Shift+M on a Mac), and the label says what a click would do. "Unmute" means you
// are muted now. UNVERIFIED against every Teams language: anything unclear gives null.
const TEAMS_SHORTCUT = /(ctrl|cmd|⌘|control)\s*\+\s*(shift|⇧)\s*\+\s*m\b/i;
const OFFERS_UNMUTE = /\bunmute\b|sesini aç|sesi aç|mikrofonu aç|turn on mic|stummschaltung aufheben|réactiver|activar (el )?sonido/i;
const OFFERS_MUTE = /\bmute\b|sesini kapat|sessize al|mikrofonu kapat|turn off mic|stummschalten|désactiver le micro|silenciar/i;

export function teamsMuted(buttons) {
  for (const b of buttons) {
    const isMic = TEAMS_SHORTCUT.test(b.label) || /microphone-button|toggle-mute/i.test(b.tag || '');
    if (!isMic) continue;
    if (OFFERS_UNMUTE.test(b.label)) return true;
    if (OFFERS_MUTE.test(b.label)) return false;
  }
  return null;
}

export const MUTE_DETECTORS = { meet: meetMuted, teams: teamsMuted };
