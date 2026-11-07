import { AbsoluteFill, Audio, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

const BRAND = 'linear-gradient(135deg, #2B3FD6 0%, #0E1B6B 100%)';
const FONT = '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';
const FADE = 10; // frames

function fadeIn(frame, delay = 0, len = FADE) {
  return interpolate(frame, [delay, delay + len], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
}

// The frame a scene shows at a given moment: the beat's frame, or its 'then' frame once
// `at` of the beat has passed.
function frameAt(scene, frame) {
  let current = scene.beats[0]?.frame;
  let since = 0;
  for (const beat of scene.beats) {
    if (frame < beat.from) break;
    const next = beat.then && frame >= beat.from + Math.round(beat.len * beat.at) ? beat.then : beat.frame;
    const changedAt = next === beat.then ? beat.from + Math.round(beat.len * beat.at) : beat.from;
    if (next && next !== current) {
      current = next;
      since = changedAt;
    }
  }
  return { name: current, since };
}

function Caption({ text, frame }) {
  const s = spring({ frame, fps: 30, config: { damping: 200 } });
  return (
    <div
      style={{
        position: 'absolute',
        left: 40,
        top: 32,
        padding: '12px 22px',
        borderRadius: 14,
        background: 'rgba(14, 27, 107, 0.92)',
        color: '#fff',
        fontSize: 30,
        fontWeight: 700,
        letterSpacing: -0.3,
        boxShadow: '0 12px 30px rgba(0,0,0,.35)',
        opacity: s,
        transform: `translateY(${(1 - s) * -16}px)`,
      }}
    >
      {text}
    </div>
  );
}

function Note({ text, frame }) {
  const s = spring({ frame, fps: 30, config: { damping: 200 } });
  return (
    <div
      style={{
        position: 'absolute',
        right: 40,
        top: 36,
        padding: '10px 18px',
        borderRadius: 12,
        background: '#12B5A6',
        color: '#fff',
        fontSize: 24,
        fontWeight: 600,
        opacity: s,
        transform: `scale(${0.9 + s * 0.1})`,
        boxShadow: '0 10px 24px rgba(0,0,0,.3)',
      }}
    >
      {text}
    </div>
  );
}

function FrameScene({ scene }) {
  const frame = useCurrentFrame();
  const { name, since } = frameAt(scene, frame);
  // The frame before the last change, faded out under the new one.
  const before = since > 0 ? frameAt(scene, since - 1).name : null;
  const previous = before && before !== name && frame < since + 10 ? before : null;
  const zoom = interpolate(frame, [0, scene.len], [1, 1.035]);
  const note = [...scene.beats].reverse().find((b) => b.note && frame >= b.from);
  return (
    <AbsoluteFill style={{ background: '#111', opacity: fadeIn(frame) }}>
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        {previous && <Img src={staticFile(`frames/${previous}.png`)} style={{ position: 'absolute', width: '100%' }} />}
        <Img src={staticFile(`frames/${name}.png`)} style={{ position: 'absolute', width: '100%', opacity: since ? fadeIn(frame, since, 8) : 1 }} />
      </AbsoluteFill>
      <Caption text={scene.caption} frame={frame} />
      {note && <Note key={note.note} text={note.note} frame={frame - note.from} />}
    </AbsoluteFill>
  );
}

function FramedScene({ scene }) {
  const frame = useCurrentFrame();
  const s = spring({ frame: frame - 4, fps: 30, config: { damping: 200 } });
  const scale = Math.min(1, 600 / scene.h);
  return (
    <AbsoluteFill style={{ background: BRAND, fontFamily: FONT, color: '#fff', opacity: fadeIn(frame) }}>
      <div style={{ position: 'absolute', left: 80, top: 0, bottom: 0, width: 360, display: 'flex', alignItems: 'center' }}>
        <div style={{ fontSize: 52, fontWeight: 700, lineHeight: 1.1, letterSpacing: -0.5, opacity: s, transform: `translateX(${(1 - s) * -30}px)` }}>{scene.caption}</div>
      </div>
      <Img
        src={staticFile(`frames/${scene.shot}.png`)}
        style={{
          position: 'absolute',
          left: 480 + (720 - scene.w * scale) / 2,
          top: (720 - scene.h * scale) / 2,
          width: scene.w * scale,
          height: scene.h * scale,
          borderRadius: 16,
          boxShadow: '0 30px 70px rgba(0,0,0,.45)',
          opacity: s,
          transform: `translateY(${(1 - s) * 40}px)`,
        }}
      />
    </AbsoluteFill>
  );
}

function TitleScene({ outro }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = spring({ frame, fps, config: { damping: 14, mass: 0.7 } });
  const text = spring({ frame: frame - 8, fps, config: { damping: 200 } });
  const line = spring({ frame: frame - 18, fps, config: { damping: 200 } });
  return (
    <AbsoluteFill style={{ background: BRAND, fontFamily: FONT, color: '#fff', alignItems: 'center', justifyContent: 'center', opacity: outro ? fadeIn(frame) : 1 }}>
      <Img src={staticFile('logo.png')} style={{ width: 180, height: 180, transform: `scale(${logo})` }} />
      <div style={{ fontSize: 84, fontWeight: 700, letterSpacing: -1.5, marginTop: 26, opacity: text, transform: `translateY(${(1 - text) * 20}px)` }}>Live Interpreter</div>
      <div style={{ fontSize: 30, opacity: line * 0.9, marginTop: 10, transform: `translateY(${(1 - line) * 14}px)`, textAlign: 'center' }}>
        {outro ? 'Free and open source' : 'Every call and every video, in your language'}
      </div>
      {outro && (
        <div style={{ fontSize: 24, marginTop: 34, padding: '10px 22px', borderRadius: 12, background: 'rgba(255,255,255,.12)', opacity: line }}>
          github.com/mbahcetepe/live-interpreter
        </div>
      )}
    </AbsoluteFill>
  );
}

export function Promo({ scenes }) {
  return (
    <AbsoluteFill style={{ background: '#0E1B6B', fontFamily: FONT }}>
      {scenes.map((scene) => (
        <Sequence key={scene.id} from={scene.from} durationInFrames={scene.len} name={scene.id}>
          {scene.kind === 'title' && <TitleScene />}
          {scene.kind === 'outro' && <TitleScene outro />}
          {scene.kind === 'frame' && <FrameScene scene={scene} />}
          {scene.kind === 'framed' && <FramedScene scene={scene} />}
          {scene.beats
            .filter((b) => b.audio)
            .map((b) => (
              <Sequence key={b.line} from={b.from} durationInFrames={b.len} name={b.line}>
                <Audio src={staticFile(`audio/${b.audio}`)} />
              </Sequence>
            ))}
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
