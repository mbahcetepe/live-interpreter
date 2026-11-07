// The promo's words: the narrator, and the demo lines spoken in the scenes. The demo
// lines are the e2e mocks' sentences, so what is heard matches what the frames show.
// No lists of service names: the Chrome Web Store treats them as keyword spam.
//
// voice: a role, mapped to an ElevenLabs voice in voices.mjs.

export const LINES = {
  intro: { voice: 'narrator', text: 'Meet Live Interpreter. Any video, any call, in your own language, as it is spoken.' },
  video: { voice: 'narrator', text: 'Watching a video on YouTube, or on any other site? Click once, and Live Interpreter translates it live.' },
  host: { voice: 'host', text: 'Hi, thanks for joining the call today.' },
  subs: { voice: 'narrator', text: 'Read it as subtitles in your language…' },
  voiceover: { voice: 'narrator', text: '…or hear the translation spoken over the original.' },
  heardTr: { voice: 'translatedTr', text: 'Merhaba, bugün görüşmeye katıldığınız için teşekkürler.' },
  streams: { voice: 'narrator', text: 'Talks, interviews, live streams and online radio work the same way.' },
  call: { voice: 'narrator', text: 'In Teams and Google Meet calls, it works both ways. You hear them in your language…' },
  back: { voice: 'narrator', text: '…and they hear you in theirs.' },
  meTr: { voice: 'me', text: 'Cuma günü saat üç bizim için uygun.' },
  heardEn: { voice: 'translatedEn', text: 'Friday at three works for us.' },
  transcripts: { voice: 'narrator', text: 'Every video and every call leaves a transcript, with its translation, ready to save as text or subtitles.' },
  popup: { voice: 'narrator', text: 'It all starts with one click, on the tab you are on.' },
  settings: { voice: 'narrator', text: 'Use your own keys for the services you choose, or run everything on your own servers. Nothing is sent to us.' },
  outro: { voice: 'narrator', text: 'Live Interpreter. Any video, any call, in your language. Free and open source.' },
};

// Scenes in order. Each beat plays one line (or waits) while showing a frame.
//   caption: the scene's title, on the strip above the window; tab: the window's title
//   note: a short label that appears with the beat
//   focus: [x, y, zoom] in the 1280x720 frame, where the camera moves for the beat
//   bed: another line played under this one, quietly (the original under a voice-over)
//   then/at: switch to another frame partway through the beat
const SUBTITLES = [640, 560, 1.45];
const PANEL_VIDEO = [206, 512, 1.4];
const PANEL_CALL = [200, 476, 1.35];

export const SCENES = [
  { id: 'title', kind: 'title', beats: [{ line: 'intro' }, { pause: 0.4 }] },
  {
    id: 'video',
    kind: 'frame',
    caption: 'Any video, on any site',
    tab: 'Webinar: Remote work, done well',
    beats: [
      { line: 'video', frame: 'video-0' },
      { line: 'host', frame: 'video-0', then: 'video-1', at: 0.85 },
      { line: 'subs', frame: 'video-1', focus: SUBTITLES, note: 'Subtitles' },
      { line: 'voiceover', frame: 'video-2', focus: PANEL_VIDEO, note: 'Spoken translation' },
      { line: 'heardTr', frame: 'video-2', focus: PANEL_VIDEO, bed: 'host', bedVolume: 0.18, note: 'Original turned down' },
      { line: 'streams', frame: 'video-2' },
    ],
  },
  {
    id: 'call',
    kind: 'frame',
    caption: 'Teams and Meet calls, both ways',
    tab: 'Weekly project sync',
    beats: [
      { line: 'call', frame: 'call-0' },
      { line: 'heardTr', frame: 'call-1', focus: PANEL_CALL, note: 'You hear Alex in Turkish' },
      { line: 'back', frame: 'call-1' },
      { line: 'meTr', frame: 'call-1', note: 'You speak Turkish' },
      { line: 'heardEn', frame: 'call-2', focus: PANEL_CALL, note: 'Alex hears English' },
      { pause: 0.5, frame: 'call-2', focus: PANEL_CALL },
    ],
  },
  { id: 'transcripts', kind: 'framed', caption: 'A transcript of every video and call', shot: 'transcripts', w: 760, h: 600, beats: [{ line: 'transcripts' }, { pause: 0.6 }] },
  { id: 'popup', kind: 'framed', caption: 'One click to start', shot: 'popup', w: 380, h: 540, beats: [{ line: 'popup' }, { pause: 0.6 }] },
  { id: 'settings', kind: 'framed', caption: 'Your services, your keys', shot: 'settings', w: 760, h: 600, beats: [{ line: 'settings' }, { pause: 0.6 }] },
  { id: 'outro', kind: 'outro', beats: [{ line: 'outro' }, { pause: 2.5 }] },
];

export const FPS = 30;
export const GAP = 0.3; // seconds between beats
export const OVERLAP = 12; // frames two scenes cross-fade
