import { Composition, registerRoot, staticFile } from 'remotion';
import { getAudioDurationInSeconds } from '@remotion/media-utils';
import { Promo } from './Promo.jsx';
import { SCENES, FPS, GAP } from './script.js';

// Lays the scenes out in time from the voices' real lengths (public/audio/manifest.json,
// written by voices.mjs).
async function timeline() {
  const manifest = await (await fetch(staticFile('audio/manifest.json'))).json();
  const lengths = {};
  for (const [id, file] of Object.entries(manifest)) lengths[id] = await getAudioDurationInSeconds(staticFile(`audio/${file}`));
  const f = (s) => Math.round(s * FPS);
  let t = 0;
  const scenes = SCENES.map((scene) => {
    const start = t;
    const beats = scene.beats.map((beat) => {
      const from = t;
      if (beat.line) {
        if (!(beat.line in lengths)) throw new Error(`no voice for "${beat.line}": run npm run voices`);
        const len = f(lengths[beat.line]);
        t += len + f(GAP);
        return { ...beat, from, len, audio: manifest[beat.line], bedAudio: beat.bed ? manifest[beat.bed] : undefined };
      }
      const len = f(beat.pause);
      t += len;
      return { ...beat, from, len };
    });
    return { ...scene, from: start, len: t - start, beats: beats.map((b) => ({ ...b, from: b.from - start })) };
  });
  return { scenes, total: t };
}

function Root() {
  return (
    <Composition
      id="Promo"
      component={Promo}
      width={1280}
      height={720}
      fps={FPS}
      durationInFrames={300}
      defaultProps={{ scenes: [] }}
      calculateMetadata={async () => {
        const { scenes, total } = await timeline();
        return { durationInFrames: total, props: { scenes } };
      }}
    />
  );
}

registerRoot(Root);
