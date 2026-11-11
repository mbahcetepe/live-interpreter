# Zoom (web): technical notes

**English** · [Türkçe](ZOOM.tr.md)

Live Interpreter works with **Zoom in the browser**: the web client (`app.zoom.us/wc/…`, or a company's own `name.zoom.us/wc/…`), as Zoom's web app opens it from `app.zoom.us/wc/home`. The desktop Zoom app is not supported: browser extensions only run in the browser. Setup: [SETUP.md](SETUP.md), step 8. Meet and Teams: [MEET.md](MEET.md), [TEAMS.md](TEAMS.md).

> **Status:** two-way translation has been used in a real Zoom call (version 2.5.0, Zoom's web app in a Brave tab, Turkish and English); the translated voice reached the other side, and muting in Zoom (English interface) let nothing through. The "Unverified points" below are still being checked. Run a test call before an important meeting.

## Access to Zoom

Zoom is not in the manifest. The extension asks for access to `https://*.zoom.us/*` the first time a translation is started on a Zoom tab, so nobody who does not use Zoom sees a new permission.

- **`src/popup/popup.js`:** the popup asks for the access from the click on **Start translation**, then offers **Reload the tab**.
- **`src/background/service-worker.js` → `syncSiteScripts`:** once access is granted, the page hook and the bridge are registered for `https://*.zoom.us/wc/*` (`chrome.scripting.registerContentScripts`, ids `zoom-hook` and `zoom-bridge`); they are removed when the access is withdrawn. They take effect from the next page load, hence the reload.

## How it works in Zoom

- **Audio path** (`src/content/page-hook.js`): Zoom's web client sends no WebRTC audio track. It reads the microphone from `getUserMedia`, encodes it itself and sends it over a data channel. So the page gets a track of ours where it asks for the microphone: the microphone passes through it while translation is off, and the translated voice takes its place while it is on. The track keeps the microphone's name and settings, so Zoom's audio settings still show the real device.
- **Frames:** Zoom's web app, and the meeting's start page, are a shell (`/wc/<meeting>/start`) that runs the meeting in a frame of its own (`iframe#webclient`, `/wc/<meeting>/join`), next to helper frames such as `/wc/pwa-empty-page`. The scripts go into every frame; only the frame that holds the call answers the extension and connects to the engine (`src/content/bridge.js` → `takesPart`, `callFrame` in `platforms.js`). The shell steps back when it contains the call's frame.
- **Mute** (`src/shared/platforms.js` → `zoomMuted`): read from the label of Zoom's audio button. "Unmute…" means muted; "Join audio" means no audio is joined yet, which counts as muted. Buttons for everyone ("Mute all", participants) are skipped.
- **Subtitles** sit 96 px from the bottom, above Zoom's controls. Zoom's own caption area is not looked for yet.
- **Transcripts** keep the call's address without its query: Zoom puts the meeting password there.

## Safety rule

When the mute detector is not sure it returns `null`, and the extension looks only at the state of the microphone track. What is read from the page never *opens* the sound; it can only be one more reason to stay silent.

## Unverified points

Marked `UNVERIFIED` in the code.

1. **Audio button** (`platforms.js` → `zoomMuted`, `page-hook.js` → `CANDIDATES.zoom`): the word lists cover Zoom in English and Turkish, and some German, French and Spanish. In another interface language the track state alone decides.
2. **Caption area:** Zoom's own captions are not detected; with them on, both subtitles can overlap.
3. **End of the call:** the translation stops when the tab leaves `zoom.us/wc/`, or 30 seconds after no call connection is left (`CALL_GONE_MS`). Whether Zoom closes its connections on every way of leaving is not yet checked.
4. **Zoom's web app installed as an app** (its own window, from the browser's install button) has not been used; it loads the same pages. A meeting opened straight from a link may run in the top page instead of a frame; the scripts handle both layouts.

## Checklist

Put on headphones and join the same meeting from a second device (a phone will do). Keep the phone away from the computer: its microphone would pick up your voice and send it back.

1. Keep only one copy of the extension (the store copy or the one built from source).
2. Join the meeting from the browser and join its audio.
3. Start the translation; the first time, allow access to `zoom.us`, press **Reload the tab** and start again.
4. **Incoming:** speak on the phone; the computer plays the translation and shows the subtitles.
5. **Outgoing:** speak at the computer; the phone hears the *translated* voice.
6. **Mute:** mute in Zoom and speak; nothing may reach the phone. The panel says the microphone is off.
7. Leave the meeting; the "ON" badge on the toolbar goes within 30 seconds.

If mute is not detected, right-click Zoom's audio button, choose "Inspect" and note its `class`, `aria-label` and `title`; `platforms.js` is fixed from those.

## Tests

`npm run test:e2e` drives a stand-in Zoom app at `https://app.zoom.us/wc/…`: a shell page (`test/e2e/mock-zoom-shell.html`) with the call in a frame (`test/e2e/mock-zoom.html`) that reads the microphone through Web Audio and runs a data-channel-only connection, as Zoom does. It checks that Zoom keeps seeing its microphone by name, that the raw microphone stops reaching it while translating, that the test chime does, that mute is read from the audio button, that only one panel appears and that the microphone comes back after stopping. `test/unit/platforms.test.mjs` covers the Zoom addresses and the mute detector.
