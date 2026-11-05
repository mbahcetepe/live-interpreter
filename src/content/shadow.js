// The panel and the subtitles carry both sides' transcripts and translations. Their shadow
// roots are closed, so the call site's own scripts cannot read them. Test and debug builds
// (`npm run build:test`, `npm run build:debug`) leave them open for the automated tests.
const OPEN = typeof __OPEN_SHADOW__ !== 'undefined' && __OPEN_SHADOW__;

export const SHADOW_MODE = OPEN ? 'open' : 'closed';
