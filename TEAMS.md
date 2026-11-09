# Microsoft Teams (web): technical notes

**English** · [Türkçe](TEAMS.tr.md)

Live Interpreter works with **Microsoft Teams in the browser** as well as Google Meet. The desktop Teams app is not supported: browser extensions only run in the browser. Setup: [SETUP.md](SETUP.md).

> **Status:** two-way translation has been used in real work-account Teams calls in Brave; the translations reached the other side. The "Unverified points" below are still being checked. Run a test call before an important meeting.
>
> In Teams calls too, translation can run on Ollama and speech recognition and speech on your own speech server: [SETUP.md](SETUP.md), steps 4 and 5. Video and radio tabs: step 8.

## Supported addresses

| Address | For |
| --- | --- |
| `https://teams.microsoft.com/` | Teams with a work or school account |
| `https://teams.cloud.microsoft/` | Teams' newer address |
| `https://teams.live.com/` | Personal (free) Teams |
| `https://meet.google.com/` | Google Meet |

If Teams offers to start the app when you open a meeting link, choose "Continue on this browser".

## What was done for Teams

- **`src/shared/platforms.js`:** everything site specific in one place: addresses, reading mute from the microphone button, the site's own caption area and how high the subtitle bar sits.
- **`src/manifest.json`:** the Teams addresses are in the content script matches and the host permissions.
- **`src/content/page-hook.js`:** the audio path (swapping the `RTCRtpSender` track) works the same on every WebRTC site; mute detection is chosen per platform. Teams keeps its page's main thread busy, so the translated speech is buffered 0.25 s in the page; when speech breaks up mid-sentence the buffer grows by itself up to 0.6 s.
- **`src/offscreen/fallback-translator.js`:** when the main translation fails on a sentence, the backup translates it.
- **`src/content/subtitle-bar.js`:** in Teams the subtitles sit lower, and Teams' live caption area is looked for.
- **`test/unit/platforms.test.mjs`:** address matching (look-alike domains included), manifest coverage and the mute detectors.

## Safety rule

When the mute detector is not sure, it returns `null` and the extension looks only at the state of the microphone track. What is read from the page never *opens* the sound; it can only be one more reason to stay silent.

Its limit: if Teams muted you without touching the track **and** the button were not recognized, your translated voice could keep reaching the call while Teams shows you muted. So the mute step of the checklist below must not be skipped.

## End of the call

In Meet, leaving the call changes the address and the translation stops at once. In Teams you stay on the same site after a meeting, so the translation stops **30 seconds** after no WebRTC connection is left (`src/offscreen/engine.js`, `CALL_GONE_MS`). The popup or `Alt+Shift+T` stops it at once.

## Unverified points

All are marked `UNVERIFIED` in the code.

1. **Microphone button** (`platforms.js` → `teamsMuted`, `page-hook.js` → `CANDIDATES.teams`): the button's label or tooltip is assumed to contain the `Ctrl+Shift+M` shortcut and to say what a click does ("Unmute" / "Mute"). The word list covers Teams in English and Turkish; for another Teams interface language it needs that language's words. Until then the track state alone decides (see the safety rule).
2. **Live caption area** (`platforms.js` → `captionSelectors`): the `data-tid` values are a guess. If wrong, the only effect is that both subtitles overlap while Teams' captions are on.
3. **End of the call:** Teams is assumed to close its peer connections when you leave.

## Checklist

Put on headphones and join the same meeting from a second device (a phone will do).

1. Keep only one copy of the extension: the Chrome Web Store copy, or the one built from source (`npm run build`, then reload the copy loaded from `dist`).
2. Join the Teams meeting in the browser and reload the tab once (F5).
3. **Incoming:** speak on the phone; the computer should play the translation and show the subtitles.
4. **Outgoing:** speak at the computer; the phone should hear the *translated* voice.
5. **Mute (the most important):** mute in Teams (`Ctrl+Shift+M`) and speak; nothing may reach the phone.
6. Turn on Teams' captions; the extension's subtitles should move above them.
7. Leave the meeting; the "ON" badge on the toolbar should go within 30 seconds.

If a step fails, right-click the microphone button in Teams, choose "Inspect" and note the button's `id`, `data-tid`, `aria-label` and `title`; `platforms.js` is fixed from those.

## End-to-end tests

`npm run test:e2e` and `npm run test:scenarios` still drive a stand-in Meet page. A stand-in Teams page (modelled on `test/e2e/mock-meet.html`) is the next step.
