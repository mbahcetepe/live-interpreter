# Google Meet: technical notes

**English** · [Türkçe](MEET.tr.md)

Live Interpreter started as a Google Meet extension, and Meet is the site its audio path was built on. Teams and Zoom have notes of their own: [TEAMS.md](TEAMS.md), [ZOOM.md](ZOOM.md). Setup: [SETUP.md](SETUP.md), step 7.

> **Status:** two-way translation has been used in real Meet calls (Turkish and English); the translations reached the other side. Run a test call before an important meeting.

## Address

`https://meet.google.com/` — in the manifest's content script matches and host permissions, so nothing is asked for at first use.

## How it works in Meet

- **Audio path** (`src/content/page-hook.js`): Meet sends the microphone as a WebRTC track. While a translation runs, the track on the call's `RTCRtpSender` is swapped for one that carries the translated voice; Meet still sees its own microphone track. Stopping puts the microphone back.
- **Mute** (`src/shared/platforms.js` → `meetMuted`): Meet's microphone button carries `data-is-muted`. Its tooltip names the shortcut (`Ctrl+D` / `Cmd+D`); otherwise the word for microphone in the label tells it apart from the camera button.
- **Captions** (`captionSelectors`): Meet's caption region is found by its `aria-label` (English and Turkish), and the extension's subtitles move above it.
- **Subtitles** sit 104 px from the bottom, above Meet's controls.
- **End of the call:** leaving the call changes the address, and the translation stops at once (`src/background/service-worker.js`). If the address stays (the goodbye screen), it stops 30 seconds after no call connection is left (`CALL_GONE_MS` in `src/offscreen/engine.js`).

## Safety rule

When the mute detector is not sure it returns `null`, and the extension looks only at the state of the microphone track. What is read from the page never *opens* the sound; it can only be one more reason to stay silent.

## Checklist

Put on headphones and join the same meeting from a second device (a phone will do).

1. Keep only one copy of the extension (the store copy or the one built from source).
2. Join the Meet call and reload the tab once if the extension was loaded after the tab was opened.
3. **Incoming:** speak on the phone; the computer plays the translation and shows the subtitles.
4. **Outgoing:** speak at the computer; the phone hears the *translated* voice.
5. **Mute:** mute in Meet (`Ctrl+D`) and speak; nothing may reach the phone.
6. Turn on Meet's captions; the extension's subtitles move above them.
7. Leave the call; the "ON" badge on the toolbar goes.

## Tests

The end-to-end tests (`npm run test:e2e`) and the scenarios (`npm run test:scenarios`) drive a stand-in Meet page, `test/e2e/mock-meet.html`: a real WebRTC call between two peer connections, with the far end's audio measured. `test/meet/` holds checks against a real Meet call (`live.mjs`).
