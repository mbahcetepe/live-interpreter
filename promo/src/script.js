// The promo's words: the narrator, and the demo lines spoken in the scenes. The demo
// lines are the e2e mocks' sentences, so what is heard matches what the frames show.
//
// voice: a role, mapped to an ElevenLabs voice in voices.mjs.

export const LINES = {
  intro: { voice: 'narrator', text: 'Meet Live Interpreter. Hear every call and every video in your own language, as it is spoken.' },
  video: { voice: 'narrator', text: 'Watching a talk in another language? Click once, and read it in yours.' },
  host: { voice: 'host', text: 'Hi, thanks for joining the call today.' },
  call: { voice: 'narrator', text: 'In Teams and Google Meet calls, it works both ways. You hear them in your language…' },
  heardTr: { voice: 'translatedTr', text: 'Merhaba, bugün görüşmeye katıldığınız için teşekkürler.' },
  back: { voice: 'narrator', text: '…and they hear you in theirs.' },
  meTr: { voice: 'me', text: 'Cuma günü saat üç bizim için uygun.' },
  heardEn: { voice: 'translatedEn', text: 'Friday at three works for us.' },
  popup: { voice: 'narrator', text: 'Start with one click.' },
  transcripts: { voice: 'narrator', text: 'Every word is kept as a transcript, with its translation.' },
  settings: { voice: 'narrator', text: 'Use your own keys for the services you choose, or run everything on your own servers. Nothing is sent to us.' },
  outro: { voice: 'narrator', text: 'Live Interpreter. Free and open source.' },
};

// Scenes in order. Each beat plays one line (or waits) while showing a frame.
// caption: a short title over the frame.
export const SCENES = [
  { id: 'title', kind: 'title', beats: [{ line: 'intro' }] },
  {
    id: 'video',
    kind: 'frame',
    caption: 'Any video or radio tab',
    beats: [
      { line: 'video', frame: 'video-0' },
      { line: 'host', frame: 'video-0', then: 'video-1', at: 0.8 },
      { pause: 1.2, frame: 'video-1' },
    ],
  },
  {
    id: 'call',
    kind: 'frame',
    caption: 'Teams and Meet calls, both ways',
    beats: [
      { line: 'call', frame: 'call-0' },
      { line: 'heardTr', frame: 'call-1', note: 'You hear Alex in Turkish' },
      { line: 'back', frame: 'call-1' },
      { line: 'meTr', frame: 'call-1', note: 'You speak Turkish' },
      { line: 'heardEn', frame: 'call-2', note: 'Alex hears English' },
      { pause: 0.6, frame: 'call-2' },
    ],
  },
  { id: 'popup', kind: 'framed', caption: 'One click to start', shot: 'popup', w: 380, h: 540, beats: [{ line: 'popup' }, { pause: 0.8 }] },
  { id: 'transcripts', kind: 'framed', caption: 'Every word, kept', shot: 'transcripts', w: 760, h: 600, beats: [{ line: 'transcripts' }, { pause: 0.6 }] },
  { id: 'settings', kind: 'framed', caption: 'Your services, your keys', shot: 'settings', w: 760, h: 600, beats: [{ line: 'settings' }, { pause: 0.6 }] },
  { id: 'outro', kind: 'outro', beats: [{ line: 'outro' }, { pause: 2.5 }] },
];

export const FPS = 30;
export const GAP = 0.25; // seconds between beats
