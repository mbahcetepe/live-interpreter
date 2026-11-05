<div align="center">

# Meet Tercüman

### Live two-way speech translation for Microsoft Teams on the web

Any two of 20 languages, both ways. They speak English and you hear Turkish; you speak Turkish and they hear English, in your own voice. A Chrome extension with no backend: the keys stay in your browser.

<table>
  <tr><td><b>Calls</b></td><td>Microsoft Teams in the browser (work/school and personal), Google Meet</td></tr>
  <tr><td><b>Browsers</b></td><td>Chrome, Edge, Brave and other Chromium browsers</td></tr>
  <tr><td><b>Languages</b></td><td>20, any two of them; English and Turkish by default</td></tr>
  <tr><td><b>Modes</b></td><td>Voice, subtitles only or off, for each direction</td></tr>
  <tr><td><b>Delay</b></td><td>About 2–3 s after each sentence ends</td></tr>
  <tr><td><b>Backend</b></td><td>None</td></tr>
  <tr><td><b>Interface</b></td><td>English or Turkish</td></tr>
</table>

</div>

> **Status:** Teams support is new. Both directions have been tried in a real Teams call in Brave; the mute detection and the Teams caption area are still being checked (see [TEAMS.md](TEAMS.md)). Run a test call before an important meeting.
>
> The desktop Teams app is not supported: browser extensions only run in the browser. Join the meeting with **"Continue on this browser"**.

---

## Features

- Twenty languages, any two of them in either direction: English, Turkish, German, French, Spanish, Italian, Portuguese, Dutch, Polish, Russian, Ukrainian, Arabic, Greek, Romanian, Swedish, Indonesian, Hindi, Chinese, Japanese and Korean.
- Listens to the call through tab capture and to you through your microphone, transcribes both sides with ElevenLabs Scribe v2 Realtime, translates with Claude (or for free, see below) and speaks the result with ElevenLabs text to speech.
- Your translated voice goes into the call in place of your microphone. Teams keeps working as usual, and muting in Teams stops everything that would reach the call.
- If Claude fails on a sentence (overloaded, rate limited, out of credit, unreachable), the free translation chain translates it instead, so the sentence is not lost.
- A mode for each direction: spoken translation, subtitles only (no speech credits used) or off, switchable mid-call from the popup or the panel on the page.
- In voice mode you hear only the translation; their own voice is muted. In subtitles-only mode and with translation off you hear them normally.
- Subtitles low in the call window, with the translation in large type and the original under it.
- Your own voice clone, recorded on the settings page. The other person's voice is cloned only after you confirm they agreed, and the clone is deleted when the call ends.
- A panel with both sides' subtitles, the mode switches, the live delay and a usage counter with an estimated cost.
- Optional call recording: the call tab's picture with both sides' audio, saved as MP4 on this computer only.
- Echo guard, a speaker mode for calls without headphones, automatic reconnects, and the call's microphone followed automatically.
- In Teams the translation stops by itself 30 seconds after the call has no connection left; `Alt+Shift+T` or the popup stops it at once.

> **Read this first.**
> - This is consecutive interpretation: the translation starts after a sentence ends. Speech recognition waits 0.7 s of silence, Claude needs about 1–2 s, the voice about 0.3–0.5 s. In a long turn, finished sentences are translated while the speaker keeps going.
> - For the shortest delay choose **Claude Haiku 5.5** and a **0.5 s** silence in the settings, and speak in short sentences.
> - **Use headphones.** Without them the translation you hear leaks into your microphone and is sent back to them. If you have none, turn on **Speaker mode** in the settings.
> - Two participants on the same computer garble each other's audio. Test with a second device (a phone) or a second person.
> - Cloning someone's voice needs their consent, under ElevenLabs' terms and data protection law.

---

## How it works

```text
call tab audio  -> Scribe (their language) -> Claude or free -> ElevenLabs -> your headphones and the subtitle bar
your microphone -> Scribe (your language)  -> Claude or free -> ElevenLabs -> the call, in place of your mic
```

| Part | Where it runs | What it does |
| --- | --- | --- |
| `src/shared/platforms.js` | Everywhere | Everything site specific: addresses, reading mute from the microphone button, the site's caption area |
| `src/content/page-hook.js` | The call page | Swaps the microphone track on the page's `RTCRtpSender` for the translation track, mirrors the mute |
| `src/content/bridge.js` | Content script | Connects the page with the engine, shows the panel and the subtitle bar |
| `src/offscreen/engine.js` | Offscreen document | Tab capture, microphone, speech recognition, translation, speech, voice clone, recording |
| `src/offscreen/stt.js` | Offscreen document | Scribe v2 Realtime client: reconnects, keeps audio while reconnecting |
| `src/offscreen/fallback-translator.js` | Offscreen document | Claude first, free translation when Claude fails |
| `src/offscreen/free-translator.js` | Offscreen document | Free translation: tries free services from the best down |
| `src/background/service-worker.js` | Service worker | Starts and stops sessions, keeps state for the popup |

---

## Free translation

Choose **Free** as the translation model in the settings and no Anthropic key is needed. The extension tries free services from the best quality down and moves on by itself when one runs out of quota, is slow or fails. With Claude selected, the same chain is the backup.

| Order | Service | Free allowance | Needs |
| --- | --- | --- | --- |
| 1 | DeepL API Free | 500,000 characters a month | Your free DeepL key |
| 2 | Mistral (`mistral-medium-latest`) | Free plan with rate limits | Your free Mistral key; turn off training on your data in Mistral's privacy settings |
| 3 | Groq `openai/gpt-oss-120b` | Daily limits | Your free Groq key |
| 4 | Groq `qwen/qwen3.8-27b` | Its own daily limits | The same Groq key |
| 5 | Chrome's built-in translator | No limit, runs on your computer | Chrome 138 or newer on desktop (Brave and some other Chromium browsers may not have it) |

- In Brave, add a free DeepL key: Chrome's built-in translator may be missing there.
- Speech recognition and speech always use ElevenLabs, so an ElevenLabs key is always needed.

---

## Requirements

- Chrome 116 or newer, Edge or Brave
- Node.js 18 or newer, to build the extension
- An ElevenLabs API key (voice cloning needs a paid plan), and an Anthropic API key unless you choose free translation
- Headphones

---

## Install

```bash
git clone https://github.com/mbahcetepe/meet-tercuman.git
cd meet-tercuman
npm install
npm run build
```

This works the same in Windows PowerShell, macOS and Linux. Then open `chrome://extensions` (`edge://extensions`, `brave://extensions`), turn on Developer mode, choose **Load unpacked** and pick the `dist` folder. The settings page opens by itself; the step-by-step guide is [SETUP.md](SETUP.md), in Turkish [SETUP.tr.md](SETUP.tr.md).

Keep only one copy of the extension loaded. After pulling changes, run `npm run build` again, press reload on the extension and reload the Teams tab (F5).

`npm run zip` packs `dist` into `meet-tercuman.zip`; it needs the `zip` command (macOS, Linux or WSL).

---

## Tests

```bash
npm test                 # unit tests: audio, sentences, echo guard, ordering, speech recognition, fallback, platforms
npm run test:e2e         # builds, loads the extension into Chromium and drives a mock Meet call
npm run test:scenarios   # the same mock call through restarts, failures, settings changes and leaving
npm run test:api         # live check of every API (keys in .env)
npm run test:free        # live check of DeepL, Mistral and Groq free plans (keys in .env)
```

- Keys for the live tests go in a local `.env` file (see `.env.example`). `.env` is ignored by git; never commit it.
- The end-to-end tests build with `--test` (`npm run build:test`), which leaves the panel's shadow root open for them; a normal build closes it. They still drive a stand-in Meet page; a stand-in Teams page is not there yet.
- The end-to-end and API tests make their speech samples with the macOS `say` command and ffmpeg, and their certificate with openssl. On Windows, put ready-made `english.wav`, `turkish.wav` and `tone.wav` (48 kHz mono) in `test/e2e/fixtures` and Git's `usr\bin` on the PATH for openssl.
- A debug build (`npm run build:debug`) can copy the audio sent to speech recognition and the transcripts to `127.0.0.1` when `localStorage['meet-tercuman-debug'] = '<port>'` is set on the call page and `node test/meet/debug-sink-server.mjs <port>` runs. The normal build ignores the flag.

---

## Security

- No backend, no analytics and no remote code: everything ships inside the extension.
- No API key is in the source code. Keys are typed into the settings page, kept in `chrome.storage.local` and sent only to the service they belong to: `api.elevenlabs.io`, `api.anthropic.com`, and DeepL, Mistral or Groq when you add their keys.
- The script inside the call page makes no network requests. Audio reaches it through a private `MessagePort`, offered only to the page's own origin and only until the hook answers.
- What the call page reports (muted or not, its microphone) is reduced to known fields of the right type; anything unclear counts as muted.
- The service worker and the engine check who sends each message: a content script may only greet and stop its own session, mode values are checked against a list.
- The panel and the subtitles use closed shadow roots, so the call site's scripts cannot read the transcripts. Only test and debug builds leave them open.
- Nothing reaches the call while you are muted, while translation to them is off, or before the call has started.
- The other person's voice is cloned only after you tick the consent box, and the clone is deleted after the call unless you change that setting.
- Recordings stay in the extension's storage on your computer until you save or delete them.

---

## Costs

The panel counts what a call uses and estimates the cost from list prices: Scribe v2 Realtime is $0.39 an hour per active direction, Flash v2.5 and v4 Turbo speech is $0.04 per 1,000 characters, and Claude is billed per token (Haiku 5.5 is the cheapest). Subtitles-only mode makes no speech, and free translation costs nothing.

---

## Credits and license

Based on the Google Meet extension by UfukNode. [MIT](LICENSE)
