<div align="center">

<img src="docs/logo.png" alt="" width="112" height="112">

# Live Interpreter

### Live speech translation for Microsoft Teams on the web, Google Meet, Zoom on the web and any video or radio tab

**English** · [中文](README.zh.md)

In a call both ways: they speak Spanish and you hear English; you speak English and they hear Spanish, in your own voice. On YouTube, X or an online radio: subtitles, or a spoken translation over the original, in any language you follow. Any two of 20 languages; the language of a video can be detected automatically. A browser extension with no backend of its own; translation and speech can run on ElevenLabs and Claude, or entirely on your own servers.

**[Add to Chrome from the Chrome Web Store](https://chromewebstore.google.com/detail/opaicinhommdnfhikkmlgjcalkohnkhl)** · free and open source (MIT)

<table>
  <tr><td><b>Calls</b></td><td>Microsoft Teams in the browser (work/school and personal), Google Meet, Zoom in the browser</td></tr>
  <tr><td><b>Other tabs</b></td><td>YouTube, X, online radio, any web page with sound</td></tr>
  <tr><td><b>Browsers</b></td><td>Chrome, Edge, Brave and other Chromium browsers</td></tr>
  <tr><td><b>Languages</b></td><td>20, any two of them; the first start follows your browser's language; on video tabs the spoken language can be detected automatically</td></tr>
  <tr><td><b>Translation</b></td><td>Claude, OpenAI or a compatible server, OpenRouter, your own Ollama, or free services; each one's models listed in the settings</td></tr>
  <tr><td><b>Speech</b></td><td>ElevenLabs, OpenAI-compatible services (OpenAI, Groq Whisper, LocalAI, Speaches, Kokoro), or your own speech server (faster-whisper and Piper)</td></tr>
  <tr><td><b>Delay</b></td><td>About 1.5–3 s after a sentence ends</td></tr>
  <tr><td><b>Interface</b></td><td>English (default), Turkish, German, Spanish, Chinese</td></tr>
</table>

</div>

> **Status.** Published on the Chrome Web Store. Teams on the web, Google Meet and Zoom on the web have been used in real calls in both directions (English and Turkish); in Teams and Zoom the mute detection and the caption area are still being checked. Technical notes: [MEET.md](MEET.md), [TEAMS.md](TEAMS.md), [ZOOM.md](ZOOM.md). Translation has been used on real videos, Chinese among them, in both directions. Run a test before an important meeting.
>
> The desktop Teams and Zoom apps are not supported: browser extensions only run in the browser. Join a Teams meeting with **"Continue on this browser"**, a Zoom meeting with **"Join from your browser"** (Zoom's web app, installed from the browser, works too).

---

## What it does

**In a Teams, Meet or Zoom call**

- Listens to the call through tab capture and to you through your microphone, transcribes both sides, translates them and speaks the result.
- Your translated voice goes into the call in place of your microphone. The call keeps working as usual, and muting in the call stops everything that would reach it.
- A mode for each direction: spoken translation, subtitles only or off, switchable mid-call from the popup or the panel on the page. In voice mode you hear only the translation; with subtitles only or off you hear them normally.
- Your own voice clone (ElevenLabs), recorded on the settings page. The other person's voice is cloned only after you confirm they agreed, and the clone is deleted when the call ends.
- Optional call recording: the call tab's picture with both sides' audio, saved as MP4 on this computer only.
- Transcripts of every call and video: what was said, who said it, when, and its translation, kept on this computer and saved as text (`.txt`) or subtitles (`.srt`).
- Echo guard, a speaker mode for calls without headphones, automatic reconnects, and the call's microphone followed automatically.
- In Teams the translation stops by itself 30 seconds after the call has no connection left; `Alt+Shift+T` or the popup stops it at once.

**On any other tab (YouTube, X, an online radio)**

- Click the extension on that tab and press **Translate this tab**. The spoken language is detected automatically, or set in the settings. Its sound becomes subtitles low in the page (moved into YouTube's player in full screen), or a spoken translation while the original is turned down to 20%.
- Only that tab is reached, and only after your click; nothing is sent back into it. Moving to another video on the same site keeps translating.

**Everywhere**

- Twenty languages, any two of them, in either direction: English, Turkish, German, French, Spanish, Italian, Portuguese, Dutch, Polish, Russian, Ukrainian, Arabic, Greek, Romanian, Swedish, Indonesian, Hindi, Chinese, Japanese and Korean.
- Subtitles like a film's, with the translation in large type and the original under it, and a panel with both sides, the live delay and a usage counter with an estimated cost.
- A sentence is never lost to one failing service: translation falls back from Ollama to a second Ollama server, then to Claude Haiku (when a Claude key is set) and to free translation; from OpenAI or OpenRouter to Claude Haiku (with a key) and free translation; from Claude to free translation.

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
| **Hosted** | ElevenLabs (Scribe v2 Realtime, Flash v2.5 / v4 Turbo); OpenAI (Whisper, gpt-4o-transcribe, gpt-4o-mini-tts); Groq Whisper (recognition, fast and cheap) | Claude Opus, Sonnet or Haiku 5.5; OpenAI; OpenRouter (hundreds of models, one key) |
| **Recognition and translation in one** | Soniox (`stt-rt-v6`): hears and translates in the same stream, the fastest setup; any of the voices above speaks the translation | |
| **Free services** | | DeepL Free, Mistral, Groq, Chrome's built-in translator |
| **Your own servers** | The speech server in [speech-server/](speech-server/README.md) (faster-whisper and Piper), or any server with OpenAI's audio API (Speaches, LocalAI, Kokoro-FastAPI) | Ollama (for example `gemma4:12b`), or any server with OpenAI's API (LM Studio, vLLM) |

The two columns are chosen separately. With your own servers in both, nothing of the call leaves your computers and nothing is billed.

### Soniox: recognition and translation in one stream

Under **Speech recognition and voices** tick **Hear and translate with Soniox** and paste a [Soniox](https://soniox.com) API key; **Test** opens a stream and reports a refused key or an empty balance. Soniox recognizes the speech and translates it in the same stream, word by word, so the translation starts before the sentence is over: there is no wait for the end of the sentence and no separate translation request. The service chosen below it (ElevenLabs, OpenAI or your own speech server) only speaks the translation; the Translation section is not used. Soniox charges per hour of audio (about $0.12/h at the time of writing, translation included in the same stream); each side of a call is its own stream.

### How fast it is

The translation is spoken clause by clause: as soon as a translated clause is long enough (a comma, semicolon or colon after about 24 characters, or the end of a sentence; in Chinese and Japanese, which have no spaces, their own marks `，、。` count and a character counts as two), its voice is asked for, and the voice streams back, so the first words are heard before the translator has finished the sentence. Reasoning models are asked not to reason (`reasoning_effort: none`, stepping up only as far as a model requires); on OpenRouter reasoning is turned off for every model and the quickest provider is chosen (`provider.sort: latency`). When speech falls more than 20 s behind, the oldest piece not yet playing is skipped (its text stays on screen). The panel shows the delay in its parts, averaged over the last sentences: waiting for the speech to end, the first translated words, and the first sound of the voice.

### Foreign words said the right way

A voice reads everything with its own language's rules, so an English term in Turkish speech ("API", "Apple") or a Turkish name in English speech ("Şükrü") can come out wrong. When the translation is spoken, the translator marks such words with how they sound, as `[[Apple|epıl]]` or `[[Şükrü|Shoo-kroo]]`. The screen and the transcript show only "Apple" and "Şükrü". Your own speech server, whose voices know one language each, reads the pronunciation; ElevenLabs and OpenAI get the word itself, since they handle mixed text, and OpenAI's `gpt-*-tts` voices are also told to say foreign words the way they are said in their own language. Where nothing is marked (free services, Soniox), a built-in list of common terms and brands and short-acronym spelling (SGK: "se ge ke") help the local voices, and a list of your own (**Speech recognition and voices › Pronunciation of foreign words**, one `word = how it sounds` per line) is used for every voice. Measured with `gemma4:12b` on Ollama: the marks came back well formed in both directions; a mark a small model breaks is cleaned up so it never shows on screen.

### Ollama for translation

Choose **Ollama** as the translation service in the settings and enter the server's address (for example `100.101.102.103`; port 11434 is added when none is given): the browser asks once for access to that address, and the list of its models fills itself (embedding-only models are left out). Press **Test** to time one sentence. Measured on a desktop NVIDIA GPU over Tailscale, `gemma4:12b` and `gemma4:26b` translate a sentence in 0.3–0.6 s once the model is loaded. A second server on another computer can stand behind it, then Claude Haiku (if a key is set) and free translation.

Ollama refuses requests whose `Origin` header it does not know, and browsers send one with every POST. The extension removes that header from its own requests to the servers in its settings (a `declarativeNetRequest` rule limited to this extension as the initiator), so **no `OLLAMA_ORIGINS` setting is needed**. A web page's request to the same server still carries its origin and is refused.

### Your own speech server instead of ElevenLabs

On an Ubuntu computer with an NVIDIA GPU:

```bash
git clone https://github.com/mbahcetepe/live-interpreter.git
cd live-interpreter/speech-server && sudo ./install-ubuntu.sh
```

This installs faster-whisper (`large-v3-turbo`) and Piper with voices for 16 of the 20 languages (all but Greek, Indonesian, Japanese and Korean, which Piper has no voice for) as a service on port 8765 and prints the address and key. In the settings, under **Speech recognition and voices**, choose **My own speech server**, enter both and press **Test**; then choose the recognition model (Whisper) and the voices from the server's lists. English-only models (`distil-large-v3`, `*.en`) are marked as such and used only for English speech; speech in any other language goes to `large-v3-turbo`, since an English-only model writes it as an English rendering. Measured over Tailscale: a sentence is recognized about 1.1–1.3 s after it ends (0.7 s of that is the silence that ends it) and spoken in under 0.2 s. Speech is found with Silero VAD, which tells a voice from music and effects, so a film's soundtrack does not hide where sentences end; loud sound with no voice found for 6 s is handed to Whisper anyway. Chinese and Japanese are written with punctuation (server 2.0.1), so their finished sentences are translated while the speaker goes on. No voice cloning in this mode. Details: [speech-server/README.md](speech-server/README.md).

### OpenAI-compatible speech

Under **Speech recognition and voices** choose **OpenAI-compatible**, then for recognition and for the voice a server (OpenAI, Groq for recognition, or another server's address), a key and a model; the lists come from the server. With OpenAI or Groq an empty key takes the same service's key under Translation. **Test** speaks a sentence with the voice server and hears it back with the recognition server.

These services take whole recordings rather than a live stream: the extension cuts the speech into sentences itself and sends each one when it ends, so there are no live drafts and a long sentence is cut at 15 s. Their prices are not in the panel's estimate.

### Free translation

Choose **Free** as the translation service and no key is needed. The extension tries free services from the best quality down and moves on by itself when one runs out of quota, is slow or fails. The same chain stands behind Claude.

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
- Node.js 18 or newer, only to build the extension from source
- For speech: an ElevenLabs API key (voice cloning needs a paid plan), an OpenAI or Groq key, or your own speech server; optionally a Soniox key to hear and translate in one stream
- For translation: an API key for Claude, OpenAI or OpenRouter, or a server of your own (Ollama, LM Studio, vLLM), or nothing (free translation)
- Headphones for calls

---

## Install

**From the Chrome Web Store** (Chrome, Edge, Brave): open the [store page](https://chromewebstore.google.com/detail/opaicinhommdnfhikkmlgjcalkohnkhl) and press **Add to Chrome**. It updates itself. The settings page opens by itself; the step-by-step guide is [SETUP.md](SETUP.md), in Turkish [SETUP.tr.md](SETUP.tr.md).

**From source**, to change the code or run an unreleased version:

```bash
git clone https://github.com/mbahcetepe/live-interpreter.git
cd live-interpreter
npm install
npm run build
```

This works the same in Windows PowerShell, macOS and Linux. Then open `chrome://extensions` (`edge://extensions`, `brave://extensions`), turn on Developer mode, choose **Load unpacked** and pick the `dist` folder. The settings page opens by itself; the step-by-step guide is [SETUP.md](SETUP.md), in Turkish [SETUP.tr.md](SETUP.tr.md).

Keep only one copy of the extension: remove the store copy before loading `dist`, or turn one of them off. Settings and keys do not carry over between the two, since each has its own extension ID. After pulling changes, run `npm install` and `npm run build` again, press reload on the extension and reload the call tab (F5).

`npm run zip` builds and packs `dist` into `live-interpreter-<version>.zip`, the file uploaded to the Chrome Web Store; it uses the `zip` command on macOS and Linux and the built-in `tar` on Windows.

---

## How it works

```text
call tab audio  -> speech recognition (their language) -> translation -> speech -> your headphones and the subtitles
your microphone -> speech recognition (your language)  -> translation -> speech -> the call, in place of your microphone
video tab audio -> speech recognition                  -> translation -> subtitles, or speech over the original

speech recognition and speech: ElevenLabs, an OpenAI-compatible service or the speech server
translation: the chosen service (Claude, OpenAI/compatible, OpenRouter, Ollama -> second Ollama) -> Claude Haiku if a key is set -> free
with Soniox: Soniox hears and translates in one stream -> speech
```

| Part | Where it runs | What it does |
| --- | --- | --- |
| `src/shared/platforms.js` | Everywhere | Everything site specific: call addresses, reading mute from the microphone button, the site's caption area, which tabs are video tabs |
| `src/content/page-hook.js` | The call page | Swaps the microphone track on the page's `RTCRtpSender` for the translation track, mirrors the mute |
| `src/content/bridge.js` | Content script | Connects the page with the engine, shows the panel and the subtitles (put into a video tab only after the click) |
| `src/offscreen/engine.js` | Offscreen document | Tab capture, microphone, speech recognition, translation, speech, voice clone, recording |
| `src/offscreen/stt.js` | Offscreen document | Realtime speech recognition client (ElevenLabs or the speech server): reconnects, keeps audio while reconnecting |
| `src/offscreen/soniox.js` | Offscreen document | Soniox: recognition and translation in one stream |
| `src/offscreen/openai-speech.js`, `segmenter.js` | Offscreen document | OpenAI-compatible recognition and voices; cuts speech into sentences for services that take whole recordings |
| `src/offscreen/tts.js`, `pipeline.js` | Offscreen document | Speech, clause by clause, in order and with the delay kept in check |
| `src/offscreen/fallback-translator.js` | Offscreen document | One translator in front of another |
| `src/offscreen/translator.js` | Offscreen document | Claude, and the instructions and examples every translation service gets |
| `src/offscreen/openai-translator.js`, `ollama-translator.js`, `free-translator.js` | Offscreen document | OpenAI, OpenRouter and compatible servers; Ollama, streamed sentence by sentence; the free services from the best down |
| `src/offscreen/voice-clone.js` | Offscreen document | ElevenLabs voice clones: yours, and theirs with consent |
| `src/shared/pronounce.js` | Everywhere | Foreign words said the right way: the marks, the built-in list and yours |
| `src/shared/transcript.js`, `recordings.js` | Everywhere | Transcripts and call recordings kept on this computer |
| `src/shared/settings.js` | Everywhere | Settings, their defaults, and which Whisper model each language may use |
| `src/shared/servers.js` | Everywhere | Your own servers: addresses, access, the Origin header rule for Ollama |
| `src/popup/`, `src/options/`, `src/recording/` | Extension pages | The toolbar window, the settings page, and the recordings and transcripts page |
| `src/background/service-worker.js` | Service worker | Starts and stops sessions, checks who sends each message, keeps state for the popup |
| `speech-server/` | Your computer (Python) | faster-whisper and Piper behind the part of the ElevenLabs API the extension uses |

---

## Tests

```bash
npm test                 # unit tests
npm run test:e2e         # builds a test build, loads it into Chromium and drives mock calls, servers and a video tab
ONLY=soniox,local npm run test:e2e   # only the suites whose names contain one of these words
npm run test:scenarios   # one mock call through restarts, failures, settings changes and leaving
npm run test:api         # live check of ElevenLabs and Claude (keys in .env)
npm run test:free        # live check of DeepL, Mistral and Groq free plans (keys in .env)
npm run test:soniox      # live check of a Soniox key (a fraction of a cent; key in .env)
node test/ollama/live.mjs 100.101.102.103 gemma4:12b   # live check of an Ollama server through the settings page
cd speech-server && python -m pytest tests           # the speech server: protocol, segmenting, keys, web page refusal
```

- The end-to-end tests need no keys and cost nothing. Besides mock Meet and Zoom calls they cover recording, free translation, a mock Ollama server (which refuses any `Origin` header, like a real one), mock OpenAI translation and speech, a mock Soniox stream, the real speech server with stand-in engines, a call with no ElevenLabs and no Claude at all, and a video tab. With keys in `.env` they also make one round trip through the real ElevenLabs and Claude; `SKIP_REAL=1` leaves that out.
- `test/meet/` holds slower checks with the real services: a real Google Meet call (`live.mjs`), a four-person stand-in call (`group-call.mjs`) and a recorded two-way demo (`mock-call-demo.mjs`).
- They build with `--test` (`npm run build:test`), which leaves the panel's shadow root open for them and gives access to `127.0.0.1` and the mock video site; a normal build has neither.
- Their speech samples are made with the macOS `say` command and ffmpeg, and their certificate with openssl. On Windows, put ready-made `english.wav`, `turkish.wav` and `tone.wav` (48 kHz mono) in `test/e2e/fixtures` and Git's `usr\bin` on the PATH for openssl. The speech server suite needs Python with `speech-server/requirements-test.txt`.
- Keys for the live tests go in a local `.env` file (see `.env.example`). `.env` is ignored by git; never commit it.
- A debug build (`npm run build:debug`) can copy the audio sent to speech recognition and the transcripts to `127.0.0.1` when `localStorage['meet-tercuman-debug'] = '<port>'` is set on the call page and `node test/meet/debug-sink-server.mjs <port>` runs. The normal build ignores the flag.

---

## Security

What the extension does with your data: [privacy policy](PRIVACY.md) ([Türkçe](PRIVACY.tr.md)).

- No backend of its own, no analytics and no remote code: everything ships inside the extension.
- No API key is in the source code. Keys are typed into the settings page, kept in `chrome.storage.local` and sent only to the service they belong to. Your own servers are reached only at the addresses you enter, after the browser has asked you for access to each one; the speech server also needs its own key and refuses requests from web pages.
- A video tab is reached only after you click the extension on it (`activeTab`); the extension asks for no access to all sites.
- The script inside the call page makes no network requests. Audio reaches it through a private `MessagePort`, offered only to the page's own origin and only until the hook answers.
- What the call page reports (muted or not, its microphone) is reduced to known fields of the right type; anything unclear counts as muted. Nothing reaches the call while you are muted, while translation to them is off, or before the call has started.
- The service worker and the engine check who sends each message: a content script may only greet and stop its own session, and mode values are checked against a list.
- The panel and the subtitles use closed shadow roots, so the page's scripts cannot read the transcripts. Only test and debug builds leave them open.
- The other person's voice is cloned only after you tick the consent box, and the clone is deleted after the call unless you change that setting. Recordings and transcripts stay in the extension's storage on your computer until you save or delete them; only the last 50 transcripts are kept.

---

## Costs

The panel counts what a call uses and estimates the cost from list prices (28 October 2026): Scribe v2 Realtime is $0.39 an hour per active direction, Flash v2.5 and v4 Turbo speech is $0.04 per 1,000 characters, and Claude is billed per token (Haiku 5.5 is the cheapest). Subtitles-only mode makes no speech. Free translation, Ollama and your own speech server cost nothing, and the panel counts them as $0. OpenAI and OpenRouter bill per token too, and Soniox per hour of audio, but their prices are not in the estimate.

---

## Versions

The version is shown in the popup and at the top of the settings page; what changed in each one is in [CHANGELOG.md](CHANGELOG.md), and every version has a git tag (`v2.4.3`). The Chrome Web Store copy updates itself; a copy built from source is updated with `git pull` and `npm run build`. The speech server reports its own version and protocol, and the extension says so when the server needs an update.

---

## Credits and license

Called Canlı Tercüman in its Turkish interface. Based on the Google Meet extension by UfukNode. [MIT](LICENSE). The speech server uses faster-whisper (MIT) and piper-tts (GPL-3.0 in its recent versions), installed separately; each Piper voice has its own license.
