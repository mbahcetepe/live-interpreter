import { platformForUrl } from '../shared/platforms.js';
import { SHADOW_MODE } from './shadow.js';

// What they say, translated, shown like film subtitles low in the Meet window: above
// Meet's own controls, and above Meet's captions when those are on. It never takes a
// click, so Meet stays usable underneath. The panel keeps the full history.

const CSS = `
:host { all: initial; }
.bar {
  position: fixed; left: 50%; bottom: 104px; transform: translateX(-50%); z-index: 2147482999;
  width: max-content; max-width: min(960px, 86vw); pointer-events: none;
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  font-family: "Google Sans", Roboto, "Segoe UI", system-ui, sans-serif;
  opacity: 1; transition: opacity 0.4s ease;
}
.bar.hidden { opacity: 0; }
.line {
  background: rgba(14, 16, 20, 0.82); color: #fff; border-radius: 10px; padding: 7px 16px 8px;
  text-align: center; box-shadow: 0 2px 14px rgba(0, 0, 0, 0.35);
}
.line .tr { font-size: 24px; line-height: 1.3; font-weight: 500; }
.line .src { font-size: 13px; line-height: 1.35; color: #bdc1c6; margin-top: 2px; }
@media (max-width: 760px) {
  .line .tr { font-size: 18px; }
}
`;

// Only the sentence being said: the earlier ones are in the panel's transcript, and an
// older line above the new one gets in the way of the picture.
const KEEP = 1;
const FADE_MS = 8000;
const PLATFORM = platformForUrl(location.href);
const ABOVE_CONTROLS = PLATFORM?.subtitleBottom ?? 104;
// On other sites (a video tab): a generic caption region, and YouTube's own captions.
const CAPTIONS = (PLATFORM?.captionSelectors ?? ['[role="region"][aria-label*="aption" i]', '.ytp-caption-window-bottom .captions-text']).join(', ');

export class SubtitleBar {
  // panelBox: where the panel is (its shadow root is closed, so it has to be asked).
  constructor({ panelBox = () => null } = {}) {
    this.panelBox = panelBox;
    this.host = document.createElement('div');
    this.host.id = 'meet-tercuman-subtitles';
    const root = this.host.attachShadow({ mode: SHADOW_MODE });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(CSS);
    root.adoptedStyleSheets = [sheet];
    this.bar = document.createElement('div');
    this.bar.className = 'bar hidden';
    root.append(this.bar);
    document.body.append(this.host);
    this.lines = [];
    this.enabled = true;
    this.fadeTimer = 0;
    // In full screen only the full-screen element is shown (YouTube's player, for
    // example), so the subtitles move into it and back out afterwards. A bare <video>
    // cannot hold them; they stay where they are then.
    this.onFullscreen = () => {
      const full = document.fullscreenElement;
      const into = full && !(full instanceof HTMLVideoElement) && !(full instanceof HTMLIFrameElement) ? full : document.body;
      if (this.host.parentNode !== into) into.append(this.host);
      this.place();
    };
    document.addEventListener('fullscreenchange', this.onFullscreen);
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.clear();
  }

  // Captions from the engine; only the translation of what they said is shown.
  caption(msg) {
    if (!this.enabled || msg.dir === 'out' || !msg.translation) return;
    if (msg.phase !== 'translating' && msg.phase !== 'translated') return;
    let line = this.lines.find((l) => l.id === msg.id);
    if (!line) {
      const tr = document.createElement('div');
      tr.className = 'tr';
      const src = document.createElement('div');
      src.className = 'src';
      const el = document.createElement('div');
      el.className = 'line';
      el.append(tr, src);
      line = { id: msg.id, el, tr, src };
      this.lines.push(line);
      this.bar.append(el);
      while (this.lines.length > KEEP) this.lines.shift().el.remove();
    }
    line.tr.textContent = msg.translation;
    line.src.textContent = msg.source || '';
    this.place();
    this.bar.classList.remove('hidden');
    clearTimeout(this.fadeTimer);
    this.fadeTimer = setTimeout(() => this.bar.classList.add('hidden'), FADE_MS);
  }

  // The site's own captions (Meet's or Teams') sit in the same place; when they are showing, go above them. When
  // the panel is where the centred subtitles would be, use the wider free side next to it.
  place() {
    let bottom = ABOVE_CONTROLS;
    const captions = document.querySelector(CAPTIONS);
    const box = captions?.getBoundingClientRect();
    if (box && box.height > 0 && box.top > 0) bottom = Math.max(bottom, Math.round(window.innerHeight - box.top + 10));
    let left = 16;
    let right = window.innerWidth - 16;
    const panel = this.panelBox();
    // Measured at full width, as the subtitles would stand centred with nothing in the way.
    this.bar.style.maxWidth = `${Math.min(960, right - left)}px`;
    const { width, height } = this.bar.getBoundingClientRect();
    const middle = window.innerWidth / 2;
    const bandBottom = window.innerHeight - bottom;
    const bandTop = bandBottom - Math.max(90, height);
    const inTheWay = panel?.width && panel.left < middle + width / 2 + 16 && panel.right > middle - width / 2 - 16;
    if (inTheWay && panel.top < bandBottom && panel.bottom > bandTop) {
      if (right - panel.right >= panel.left - left) left = panel.right + 16;
      else right = panel.left - 16;
    }
    this.bar.style.left = `${Math.round((left + right) / 2)}px`;
    this.bar.style.maxWidth = `${Math.max(240, Math.min(960, right - left))}px`;
    this.bar.style.bottom = `${bottom}px`;
  }

  clear() {
    clearTimeout(this.fadeTimer);
    for (const line of this.lines) line.el.remove();
    this.lines = [];
    this.bar.classList.add('hidden');
  }

  destroy() {
    clearTimeout(this.fadeTimer);
    document.removeEventListener('fullscreenchange', this.onFullscreen);
    this.host.remove();
  }
}
