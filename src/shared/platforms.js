// The video call sites the extension works on, and what differs between them.
//
// Everything that knows about a particular site lives here: which addresses it uses,
// how its microphone button says whether you are muted, where its own captions are and
// how much room its controls take at the bottom of the window. The audio path is the
// RTCRtpSender swap in page-hook.js for sites that send the microphone as a WebRTC track
// (Meet, Teams); Zoom's web client encodes it itself and sends it over a data channel,
// so there the microphone is replaced where the page asks for it (getUserMedia).

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
  {
    id: 'zoom',
    name: 'Zoom',
    // The web client (app.zoom.us/wc/..., or a company's own name.zoom.us/wc/...).
    // Not in the manifest: the extension asks for access to Zoom only when it is used
    // there, so nobody else sees a new permission.
    optional: true,
    origins: ['https://*.zoom.us/*'],
    scriptMatches: ['https://*.zoom.us/wc/*'],
    matches: (url) => /^https:\/\/([a-z0-9-]+\.)*zoom\.us\/wc\//i.test(url),
    // Zoom's installed app (and its own page) is a shell that runs the meeting in a frame
    // of its own (/wc/<meeting>/join), next to frames such as /wc/pwa-empty-page. The
    // extension works in the frame that holds the meeting: the scripts go into every
    // frame, and only the meeting's frame takes part (bridge.js).
    allFrames: true,
    callFrame: (url) => /^https:\/\/([a-z0-9-]+\.)*zoom\.us\/wc\/\d+\//i.test(url),
    // The microphone is replaced where Zoom asks for it, not on a WebRTC sender.
    audioPath: 'microphone',
    subtitleBottom: 96,
    captionSelectors: [],
  },
];

export function platformForUrl(url) {
  if (typeof url !== 'string') return null;
  return PLATFORMS.find((p) => (p.matches ? p.matches(url) : p.prefixes.some((prefix) => url.startsWith(prefix)))) || null;
}

// Sites whose access is asked for when first used (Zoom) rather than in the manifest.
export const OPTIONAL_PLATFORMS = PLATFORMS.filter((p) => p.optional);

export const isSupportedUrl = (url) => platformForUrl(url) !== null;

// Any other web page (a video, a radio stream): its sound can be translated into
// subtitles or speech, with nothing sent back into it.
export const isMediaUrl = (url) => /^https?:\/\//.test(url || '') && !isSupportedUrl(url);

// chrome.tabs.query patterns for every supported site.
export const URL_PATTERNS = PLATFORMS.filter((p) => !p.optional).flatMap((p) => p.prefixes.map((prefix) => `${prefix}*`));

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

// Zoom's web client: the audio button's label says what a click would do ("Unmute my
// microphone" while muted) or, before the audio is joined, offers to join it (nothing is
// sent then). UNVERIFIED against every Zoom language: anything unclear gives null.
const ZOOM_JOIN = /join audio|sese katıl|ses(e)? bağlan|audio beitreten|rejoindre l'audio|unirse al audio/i;
const ZOOM_UNMUTE = /\bunmute\b|sesi aç|sesini aç|mikrofonu aç|stummschaltung aufheben|réactiver|reactivar|activar (el )?(audio|micrófono)/i;
const ZOOM_MUTE = /\bmute\b|sesi kapat|sesini kapat|sessize al|mikrofonu kapat|stummschalten|couper|silenciar/i;
const ZOOM_NOT_MINE = /\ball\b|participant|herkes|tüm|katılımcı/i;

export function zoomMuted(buttons) {
  for (const b of buttons) {
    if (ZOOM_NOT_MINE.test(b.label)) continue;
    const isAudio = /join-audio|audio-option|microphone/i.test(b.tag || '') || MIC_WORD.test(b.label) || /audio|\bmute|\bses/i.test(b.label);
    if (!isAudio) continue;
    if (ZOOM_JOIN.test(b.label)) return true;
    if (ZOOM_UNMUTE.test(b.label)) return true;
    if (ZOOM_MUTE.test(b.label)) return false;
  }
  return null;
}

export const MUTE_DETECTORS = { meet: meetMuted, teams: teamsMuted, zoom: zoomMuted };
