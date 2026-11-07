<div align="center">

# Meet Tercüman

### Live speech translation for Microsoft Teams on the web, Google Meet and any video or radio tab

In a call both ways: they speak English and you hear Turkish; you speak Turkish and they hear English, in your own voice. On YouTube, X or an online radio: subtitles, or a spoken translation over the original. A browser extension with no backend of its own; translation and speech can run on ElevenLabs and Claude, or entirely on your own servers.

<table>
  <tr><td><b>Calls</b></td><td>Microsoft Teams in the browser (work/school and personal), Google Meet</td></tr>
  <tr><td><b>Other tabs</b></td><td>YouTube, X, online radio, any web page with sound</td></tr>
  <tr><td><b>Browsers</b></td><td>Chrome, Edge, Brave and other Chromium browsers</td></tr>
  <tr><td><b>Languages</b></td><td>20, any two of them; English and Turkish by default</td></tr>
  <tr><td><b>Translation</b></td><td>Claude, your own Ollama server, or free services</td></tr>
  <tr><td><b>Speech</b></td><td>ElevenLabs, or your own speech server (faster-whisper and Piper)</td></tr>
  <tr><td><b>Delay</b></td><td>About 1.5–3 s after a sentence ends</td></tr>
  <tr><td><b>Interface</b></td><td>English or Turkish</td></tr>
</table>

</div>

> **Status.** Teams support is new: both directions worked in a real Teams call in Brave, while the mute detection and the Teams caption area are still being checked ([TEAMS.md](TEAMS.md)). Video tabs, Ollama and the speech server have been tested with the real servers but not yet on real YouTube. Run a test before an important meeting.
>
> The desktop Teams app is not supported: browser extensions only run in the browser. Join the meeting with **"Continue on this browser"**.

---

## What it does

**In a Teams or Meet call**

- Listens to the call through tab capture and to you through your microphone, transcribes both sides, translates them and speaks the result.
- Your translated voice goes into the call in place of your microphone. Teams keeps working as usual, and muting in Teams stops everything that would reach the call.
- A mode for each direction: spoken translation, subtitles only or off, switchable mid-call from the popup or the panel on the page. In voice mode you hear only the translation; with subtitles only or off you hear them normally.
- Your own voice clone (ElevenLabs), recorded on the settings page. The other person's voice is cloned only after you confirm they agreed, and the clone is deleted when the call ends.
- Optional call recording: the call tab's picture with both sides' audio, saved as MP4 on this computer only.
- Echo guard, a speaker mode for calls without headphones, automatic reconnects, and the call's microphone followed automatically.
- In Teams the translation stops by itself 30 seconds after the call has no connection left; `Alt+Shift+T` or the popup stops it at once.

**On any other tab (YouTube, X, an online radio)**

- Click the extension on that tab and press **Translate this tab**. Its sound becomes subtitles low in the page (moved into YouTube's player in full screen), or a spoken translation while the original is turned down to 20%.
- Only that tab is reached, and only after your click; nothing is sent back into it. Moving to another video on the same site keeps translating.

**Everywhere**

- Twenty languages: English, Turkish, German, French, Spanish, Italian, Portuguese, Dutch, Polish, Russian, Ukrainian, Arabic, Greek, Romanian, Swedish, Indonesian, Hindi, Chinese, Japanese and Korean.
- Subtitles like a film's, with the translation in large type and the original under it, and a panel with both sides, the live delay and a usage counter with an estimated cost.
- A sentence is never lost to one failing service: translation falls back from Ollama to a second Ollama server, to Claude and to free translation; from Claude to free translation.

> **Read this first.**
> - This is consecutive interpretation: the translation starts after a sentence ends. Speech recognition waits 0.7 s of silence (0.5 s can be set), translation takes 0.3–2 s, the voice 0.2–0.5 s. In a long turn, finished sentences are translated while the speaker keeps going.
> - For the shortest delay translate on Ollama or with **Claude Haiku 5.5**, choose a **0.5 s** silence, and speak in short sentences.
> - **Use headphones.** Without them the translation you hear leaks into your microphone and is sent back to them. If you have none, turn on **Speaker mode** in the settings.
> - Two participants on the same computer garble each other's audio. Test with a second device (a phone) or a second person.
> - The call's audio and text go to the services you choose (ElevenLabs, Anthropic, DeepL, Mistral, Groq). For a work meeting, tell the participants and check your company's rules, or keep everything on your own servers. Cloning someone's voice needs their consent.

---

## Choose your services

| | Speech recognition and voices | Translation |
| --- | --- | --- |
| **Hosted** | ElevenLabs (Scribe v2 Realtime, Flash v2.5 / v4 Turbo) | Claude Opus, Sonnet or Haiku 5.5 |
| **Free services** | | DeepL Free, Mistral, Groq, Chrome's built-in translator |
| **Your own servers** | The speech server in [speech-server/](speech-server/README.md): faster-whisper and Piper | Ollama (for example `gemma4:12b`) |

The two columns are chosen separately. With your own servers in both, nothing of the call leaves your computers and nothing is billed.

### Ollama for translation

Choose **Ollama** as the translation model in the settings, enter the server's address (for example `100.65.147.84`; port 11434 is added when none is given) and a model, and press **Test and allow**: the browser asks once for access to that address. Measured on a desktop NVIDIA GPU over Tailscale, `gemma4:12b` and `gemma4:26b` translate a sentence in 0.3–0.6 s once the model is loaded. A second server on another computer can stand behind it, then Claude Haiku (if a key is set) and free translation.

Ollama refuses requests whose `Origin` header it does not know, and browsers send one with every POST. The extension removes that header from its own requests to the servers in its settings (a `declarativeNetRequest` rule limited to this extension as the initiator), so **no `OLLAMA_ORIGINS` setting is needed**. A web page's request to the same server still carries its origin and is refused.

### Your own speech server instead of ElevenLabs

On an Ubuntu computer with an NVIDIA GPU:

```bash
git clone https://github.com/mbahcetepe/meet-tercuman.git
cd meet-tercuman/speech-server && sudo ./install-ubuntu.sh
```

This installs faster-whisper (`large-v3-turbo`) and Piper with Turkish and English voices as a service on port 8765 and prints the address and key. In the settings, under **1. API keys**, set **Speech recognition and voices** to **My own speech server**, enter both and press **Test and allow**. Measured over Tailscale: a sentence is recognized about 1.1–1.3 s after it ends (0.7 s of that is the silence that ends it) and spoken in under 0.2 s. Speech is found with Silero VAD, which tells a voice from music and effects, so a film's soundtrack does not hide where sentences end; loud sound with no voice found for 6 s is handed to Whisper anyway. No voice cloning in this mode. Details: [speech-server/README.md](speech-server/README.md).

### Free translation

Choose **Free** as the translation model and no Anthropic key is needed. The extension tries free services from the best quality down and moves on by itself when one runs out of quota, is slow or fails. The same chain stands behind Claude.

| Order | Service | Free allowance | Needs |
| --- | --- | --- | --- |
| 1 | DeepL API Free | 500,000 characters a month | Your free DeepL key |
| 2 | Mistral (`mistral-medium-latest`) | Free plan with rate limits | Your free Mistral key; turn off training on your data in Mistral's privacy settings |
| 3 | Groq `openai/gpt-oss-120b` | Daily limits | Your free Groq key |
| 4 | Groq `qwen/qwen3.8-27b` | Its own daily limits | The same Groq key |
| 5 | Chrome's built-in translator | No limit, runs on your computer | Chrome 138 or newer on desktop; Brave and some other Chromium browsers may not have it |

In Brave, add a free DeepL key, since Chrome's built-in translator may be missing there.

---

## Requirements

- Chrome 116 or newer, Edge or Brave
- Node.js 18 or newer, to build the extension
- For speech: an ElevenLabs API key (voice cloning needs a paid plan), or your own speech server
- For translation: an Anthropic API key, or your own Ollama server, or nothing (free translation)
- Headphones for calls

---

## Install

```bash
git clone https://github.com/mbahcetepe/meet-tercuman.git
cd meet-tercuman
npm install
npm run build
```

This works the same in Windows PowerShell, macOS and Linux. Then open `chrome://extensions` (`edge://extensions`, `brave://extensions`), turn on Developer mode, choose **Load unpacked** and pick the `dist` folder. The settings page opens by itself; the step-by-step guide is [SETUP.md](SETUP.md), in Turkish [SETUP.tr.md](SETUP.tr.md).

Keep only one copy of the extension loaded. After pulling changes, run `npm install` and `npm run build` again, press reload on the extension and reload the call tab (F5).

`npm run zip` packs `dist` into `meet-tercuman.zip`; it needs the `zip` command (macOS, Linux or WSL).

---

## How it works

```text
call tab audio  -> speech recognition (their language) -> translation -> speech -> your headphones and the subtitles
your microphone -> speech recognition (your language)  -> translation -> speech -> the call, in place of your microphone
video tab audio -> speech recognition                  -> translation -> subtitles, or speech over the original

speech recognition and speech: ElevenLabs or the speech server
translation: Ollama -> second Ollama -> Claude -> free, or Claude -> free, or free only
```

| Part | Where it runs | What it does |
| --- | --- | --- |
| `src/shared/platforms.js` | Everywhere | Everything site specific: call addresses, reading mute from the microphone button, the site's caption area, which tabs are video tabs |
| `src/content/page-hook.js` | The call page | Swaps the microphone track on the page's `RTCRtpSender` for the translation track, mirrors the mute |
| `src/content/bridge.js` | Content script | Connects the page with the engine, shows the panel and the subtitles (put into a video tab only after the click) |
| `src/offscreen/engine.js` | Offscreen document | Tab capture, microphone, speech recognition, translation, speech, voice clone, recording |
| `src/offscreen/stt.js` | Offscreen document | Realtime speech recognition client (ElevenLabs or the speech server): reconnects, keeps audio while reconnecting |
| `src/offscreen/fallback-translator.js` | Offscreen document | One translator in front of another |
| `src/offscreen/ollama-translator.js` | Offscreen document | Translation on an Ollama server, streamed sentence by sentence |
| `src/offscreen/translator.js`, `free-translator.js` | Offscreen document | Claude, and the free services from the best down |
| `src/shared/servers.js` | Everywhere | Your own servers: addresses, access, the Origin header rule for Ollama |
| `src/background/service-worker.js` | Service worker | Starts and stops sessions, checks who sends each message, keeps state for the popup |
| `speech-server/` | Your computer (Python) | faster-whisper and Piper behind the part of the ElevenLabs API the extension uses |

---

## Tests

```bash
npm test                 # unit tests
npm run test:e2e         # builds a test build, loads it into Chromium and drives mock calls, servers and a video tab
npm run test:scenarios   # one mock call through restarts, failures, settings changes and leaving
npm run test:api         # live check of ElevenLabs and Claude (keys in .env)
npm run test:free        # live check of DeepL, Mistral and Groq free plans (keys in .env)
node test/ollama/live.mjs 100.65.147.84 gemma4:12b   # live check of an Ollama server through the settings page
cd speech-server && python -m pytest tests           # the speech server: protocol, segmenting, keys, web page refusal
```

- The end-to-end tests need no keys and cost nothing. Besides mock Meet calls they cover a mock Ollama server (which refuses any `Origin` header, like a real one), the real speech server with stand-in engines, a call with no ElevenLabs and no Claude at all, and a video tab.
- They build with `--test` (`npm run build:test`), which leaves the panel's shadow root open for them and gives access to `127.0.0.1` and the mock video site; a normal build has neither.
- Their speech samples are made with the macOS `say` command and ffmpeg, and their certificate with openssl. On Windows, put ready-made `english.wav`, `turkish.wav` and `tone.wav` (48 kHz mono) in `test/e2e/fixtures` and Git's `usr\bin` on the PATH for openssl. The speech server suite needs Python with `speech-server/requirements-test.txt`.
- Keys for the live tests go in a local `.env` file (see `.env.example`). `.env` is ignored by git; never commit it.
- A debug build (`npm run build:debug`) can copy the audio sent to speech recognition and the transcripts to `127.0.0.1` when `localStorage['meet-tercuman-debug'] = '<port>'` is set on the call page and `node test/meet/debug-sink-server.mjs <port>` runs. The normal build ignores the flag.

---

## Security

- No backend of its own, no analytics and no remote code: everything ships inside the extension.
- No API key is in the source code. Keys are typed into the settings page, kept in `chrome.storage.local` and sent only to the service they belong to. Your own servers are reached only at the addresses you enter, after the browser has asked you for access to each one; the speech server also needs its own key and refuses requests from web pages.
- A video tab is reached only after you click the extension on it (`activeTab`); the extension asks for no access to all sites.
- The script inside the call page makes no network requests. Audio reaches it through a private `MessagePort`, offered only to the page's own origin and only until the hook answers.
- What the call page reports (muted or not, its microphone) is reduced to known fields of the right type; anything unclear counts as muted. Nothing reaches the call while you are muted, while translation to them is off, or before the call has started.
- The service worker and the engine check who sends each message: a content script may only greet and stop its own session, and mode values are checked against a list.
- The panel and the subtitles use closed shadow roots, so the page's scripts cannot read the transcripts. Only test and debug builds leave them open.
- The other person's voice is cloned only after you tick the consent box, and the clone is deleted after the call unless you change that setting. Recordings stay in the extension's storage on your computer until you save or delete them.

---

## Costs

The panel counts what a call uses and estimates the cost from list prices (28 October 2026): Scribe v2 Realtime is $0.39 an hour per active direction, Flash v2.5 and v4 Turbo speech is $0.04 per 1,000 characters, and Claude is billed per token (Haiku 5.5 is the cheapest). Subtitles-only mode makes no speech. Free translation, Ollama and your own speech server cost nothing, and the panel counts them as $0.

---

## Credits and license

Based on the Google Meet extension by UfukNode. [MIT](LICENSE). The speech server uses faster-whisper (MIT) and piper-tts (GPL-3.0 in its recent versions), installed separately; each Piper voice has its own license.
