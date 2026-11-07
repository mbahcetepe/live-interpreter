import { AbsoluteFill, Audio, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing } from 'remotion';
import { OVERLAP } from './script.js';

const BRAND = 'linear-gradient(135deg, #2B3FD6 0%, #0E1B6B 100%)';
const ACCENT = '#12B5A6';
const FONT = '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';
const W = 1280;
const H = 720;

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };
const ease = (frame, from, len) => interpolate(frame, [from, from + len], [0, 1], { ...clamp, easing: Easing.bezier(0.4, 0, 0.2, 1) });

// The beat playing at a frame (the last one that has started).
function beatAt(scene, frame) {
  let current = scene.beats[0];
  for (const beat of scene.beats) if (frame >= beat.from) current = beat;
  return current;
}

// The frame shown at a moment, and when it last changed (for the cross-fade).
function shownAt(scene, frame) {
  let name = scene.beats[0]?.frame;
  let since = 0;
  for (const beat of scene.beats) {
    if (frame < beat.from) break;
    const switchAt = beat.then ? beat.from + Math.round(beat.len * beat.at) : Infinity;
    const next = frame >= switchAt ? beat.then : beat.frame;
    if (next && next !== name) {
      name = next;
      since = frame >= switchAt ? switchAt : beat.from;
    }
  }
  return { name, since };
}

// The camera: eases from the previous beat's focus to this one's.
function cameraAt(scene, frame) {
  const rest = [W / 2, H / 2, 1];
  let prev = rest;
  let target = rest;
  let from = 0;
  for (const beat of scene.beats) {
    if (frame < beat.from) break;
    const f = beat.focus || rest;
    if (f !== target) {
      prev = target;
      target = f;
      from = beat.from;
    }
  }
  const p = ease(frame, from, 24);
  const [x, y, z] = prev.map((v, i) => v + (target[i] - v) * p);
  // Keep the frame filling the window: the centre cannot come closer to an edge than half the view.
  const cx = Math.min(Math.max(x, W / (2 * z)), W - W / (2 * z));
  const cy = Math.min(Math.max(y, H / (2 * z)), H - H / (2 * z));
  return `translate(${W / 2 - cx * z}px, ${H / 2 - cy * z}px) scale(${z})`;
}

function Strip({ caption, note, noteFrom, frame }) {
  const c = spring({ frame: frame - 6, fps: 30, config: { damping: 200 } });
  const n = note ? spring({ frame: frame - noteFrom, fps: 30, config: { damping: 18, mass: 0.6 } }) : 0;
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 64, display: 'flex', alignItems: 'center', padding: '0 52px', color: '#fff' }}>
      <div style={{ width: 5, height: 30, borderRadius: 3, background: ACCENT, marginRight: 14, transform: `scaleY(${c})` }} />
      <div style={{ fontSize: 27, fontWeight: 700, letterSpacing: -0.3, opacity: c, transform: `translateX(${(1 - c) * -18}px)` }}>{caption}</div>
      <div style={{ flex: 1 }} />
      {note && (
        <div
          key={note}
          style={{ fontSize: 19, fontWeight: 600, padding: '7px 16px', borderRadius: 999, background: 'rgba(255,255,255,.14)', border: `1.5px solid ${ACCENT}`, opacity: n, transform: `translateY(${(1 - n) * 10}px)` }}
        >
          {note}
        </div>
      )}
    </div>
  );
}

// A browser window around the page: three dots, the tab's title, the extension's icon.
function Window({ tab, children }) {
  const bar = 32;
  const scale = (H - 64 - 18 - bar) / H;
  const w = Math.round(W * scale);
  const h = Math.round(H * scale);
  return (
    <div style={{ position: 'absolute', left: (W - w) / 2, top: 64, width: w, height: h + bar, borderRadius: 12, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,.45)', background: '#1f2126' }}>
      <div style={{ height: bar, display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', background: '#2b2e35' }}>
        {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
          <span key={c} style={{ width: 11, height: 11, borderRadius: 6, background: c, display: 'inline-block' }} />
        ))}
        <div style={{ flex: 1, margin: '0 18px', height: 20, borderRadius: 10, background: '#1f2126', color: '#b9bcc4', fontSize: 12.5, display: 'flex', alignItems: 'center', padding: '0 12px' }}>{tab}</div>
        <Img src={staticFile('icon.png')} style={{ width: 18, height: 18 }} />
      </div>
      <div style={{ position: 'relative', width: w, height: h, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, transform: `scale(${scale})`, transformOrigin: '0 0' }}>{children}</div>
      </div>
    </div>
  );
}

function FrameScene({ scene, offset = 0 }) {
  const frame = useCurrentFrame() - offset;
  const { name, since } = shownAt(scene, frame);
  const before = since > 0 ? shownAt(scene, since - 1).name : null;
  const beat = beatAt(scene, frame);
  const noteBeat = [...scene.beats].reverse().find((b) => frame >= b.from && b.note);
  const note = noteBeat && beat.note ? noteBeat.note : null;
  return (
    <AbsoluteFill style={{ background: BRAND, fontFamily: FONT }}>
      <Strip caption={scene.caption} note={note} noteFrom={noteBeat?.from ?? 0} frame={frame} />
      <Window tab={scene.tab}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, transform: cameraAt(scene, frame), transformOrigin: '0 0' }}>
          {before && before !== name && frame < since + 12 && <Img src={staticFile(`frames/${before}.png`)} style={{ position: 'absolute', width: W, height: H }} />}
          <Img src={staticFile(`frames/${name}.png`)} style={{ position: 'absolute', width: W, height: H, opacity: since ? ease(frame, since, 10) : 1 }} />
        </div>
      </Window>
    </AbsoluteFill>
  );
}

function FramedScene({ scene, offset = 0 }) {
  const frame = useCurrentFrame() - offset;
  const s = spring({ frame: frame - 6, fps: 30, config: { damping: 200 } });
  const t = spring({ frame: frame - 2, fps: 30, config: { damping: 200 } });
  const scale = Math.min(1, 600 / scene.h);
  const drift = interpolate(frame, [0, scene.len], [0, -10]);
  return (
    <AbsoluteFill style={{ background: BRAND, fontFamily: FONT, color: '#fff' }}>
      <div style={{ position: 'absolute', left: 84, top: 0, bottom: 0, width: 360, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ width: 54, height: 5, borderRadius: 3, background: ACCENT, marginBottom: 22, transform: `scaleX(${t})`, transformOrigin: 'left' }} />
        <div style={{ fontSize: 50, fontWeight: 700, lineHeight: 1.1, letterSpacing: -0.6, opacity: t, transform: `translateX(${(1 - t) * -26}px)` }}>{scene.caption}</div>
      </div>
      <Img
        src={staticFile(`frames/${scene.shot}.png`)}
        style={{
          position: 'absolute',
          left: 480 + (720 - scene.w * scale) / 2,
          top: (H - scene.h * scale) / 2 + drift,
          width: scene.w * scale,
          height: scene.h * scale,
          borderRadius: 16,
          boxShadow: '0 30px 70px rgba(0,0,0,.45)',
          opacity: s,
          transform: `translateY(${(1 - s) * 46}px) scale(${0.96 + s * 0.04})`,
        }}
      />
    </AbsoluteFill>
  );
}

const PILLARS = ['Any video.', 'Any call.', 'Every word.'];

function TitleScene({ outro, len, offset = 0 }) {
  const frame = useCurrentFrame() - offset;
  const { fps } = useVideoConfig();
  const logo = spring({ frame, fps, config: { damping: 14, mass: 0.7 } });
  const name = spring({ frame: frame - 8, fps, config: { damping: 200 } });
  const glow = interpolate(frame, [0, len], [0.9, 1.1]);
  return (
    <AbsoluteFill style={{ background: BRAND, fontFamily: FONT, color: '#fff', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', width: 900, height: 900, borderRadius: '50%', background: 'radial-gradient(circle, rgba(18,181,166,.22) 0%, rgba(18,181,166,0) 60%)', transform: `scale(${glow})` }} />
      <Img src={staticFile('logo.png')} style={{ width: 150, height: 150, transform: `scale(${logo})` }} />
      <div style={{ fontSize: 80, fontWeight: 700, letterSpacing: -1.5, marginTop: 22, opacity: name, transform: `translateY(${(1 - name) * 20}px)` }}>Live Interpreter</div>
      <div style={{ display: 'flex', gap: 22, marginTop: 14, fontSize: 32, fontWeight: 600 }}>
        {PILLARS.map((p, i) => {
          const s = spring({ frame: frame - 26 - i * 12, fps, config: { damping: 200 } });
          return (
            <span key={p} style={{ opacity: s, transform: `translateY(${(1 - s) * 16}px)`, color: i === 2 ? '#7FE3D9' : '#fff' }}>
              {p}
            </span>
          );
        })}
      </div>
      {outro && (
        <div style={{ marginTop: 34, display: 'flex', gap: 14, alignItems: 'center', opacity: spring({ frame: frame - 60, fps, config: { damping: 200 } }) }}>
          <span style={{ fontSize: 22, padding: '9px 18px', borderRadius: 999, background: ACCENT, fontWeight: 600 }}>Free and open source</span>
          <span style={{ fontSize: 22, padding: '9px 18px', borderRadius: 999, background: 'rgba(255,255,255,.13)' }}>github.com/mbahcetepe/live-interpreter</span>
        </div>
      )}
    </AbsoluteFill>
  );
}

export function Promo({ scenes }) {
  return (
    <AbsoluteFill style={{ background: '#0E1B6B', fontFamily: FONT }}>
      {scenes.map((scene, i) => {
        // Each scene comes in over the end of the one before.
        const lead = i === 0 ? 0 : OVERLAP;
        return (
          <Sequence key={scene.id} from={scene.from - lead} durationInFrames={scene.len + lead + (i === scenes.length - 1 ? 0 : OVERLAP)} name={scene.id}>
            <Fade lead={lead}>
              {scene.kind === 'title' && <TitleScene len={scene.len} offset={lead} />}
              {scene.kind === 'outro' && <TitleScene outro len={scene.len} offset={lead} />}
              {scene.kind === 'frame' && <FrameScene scene={scene} offset={lead} />}
              {scene.kind === 'framed' && <FramedScene scene={scene} offset={lead} />}
            </Fade>
          </Sequence>
        );
      })}
      {scenes.map((scene) =>
        scene.beats
          .filter((b) => b.audio)
          .map((b) => (
            <Sequence key={`${scene.id}-${b.line}-${b.from}`} from={scene.from + b.from} durationInFrames={b.len} name={`voice: ${b.line}`}>
              <Audio src={staticFile(`audio/${b.audio}`)} />
              {b.bedAudio && <Audio src={staticFile(`audio/${b.bedAudio}`)} volume={b.bedVolume ?? 0.2} />}
            </Sequence>
          )),
      )}
    </AbsoluteFill>
  );
}

function Fade({ lead, children }) {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ opacity: lead ? ease(frame, 0, lead) : 1 }}>{children}</AbsoluteFill>;
}

