# Changelog

Versions follow [semantic versioning](https://semver.org): MAJOR for changes that need something done (new settings, a server update), MINOR for new features, PATCH for fixes. The version lives in `package.json`; the build writes it into the extension's manifest, and the popup and the settings page show it. The speech server has its own version and a protocol number (`/health`); the extension warns when the server is older than it needs.

## Unreleased

### New

- **Soniox speaks too.** Soniox is a speech service like the others (Speech recognition and voices › Service): its own voices (about 230, each speaking every language) over one WebSocket kept open, the first sound of a piece about 0.35–0.5 s after it is asked for. With another translator Soniox listens (without translating) and speaks.
- **The panel names the services at work**: which one hears, translates and speaks.

### Removed

- **Free translation** (DeepL Free, Mistral, Groq and Chrome's built-in translator) is gone, as a choice and as the backup behind the other services. Chrome's translator is missing in Brave and other Chromium browsers, and the free plans were too limited for whole calls. A setup that had it chosen now shows Claude. Behind Ollama, OpenAI and OpenRouter, Claude Haiku (with a key) remains the backup; Claude alone has none. The extension no longer asks for access to DeepL and Mistral.

### Changed

- **Soniox is chosen like any other service**, under Translation (it hears and translates in one stream) or under Speech recognition and voices; the separate tick box is gone, and a setup that had it ticked now shows Soniox under Translation. While Soniox translates, the settings page says that it also does the listening and that the speech service only speaks; that service's speech recognition settings are hidden.

## 2.5.0 (2026-11-11)

### New

- **Zoom in the browser** (the web client, `app.zoom.us/wc/…`): both directions, like Teams and Meet; used in a real call in a browser tab. Zoom sends no WebRTC audio track (it encodes the microphone itself and sends it over a data channel), so the page gets a track of ours where it asks for the microphone: the microphone passes through it while translation is off, and the translated speech takes its place while it is on. Muting is read from Zoom's audio button.
- Access to Zoom is asked for on the first start there, not at install, so nobody else sees a new permission; the tab is reloaded once after that.
- Zoom's web app runs the meeting in a frame inside its own page; the extension works in that frame.

### Changed

- Transcripts keep a call's address without its query part (Zoom puts the meeting password there).

## 2.4.3 (2026-11-11)

### Fixed

- **Chinese and Japanese speech is translated sentence by sentence while the speaker goes on.** The speech recognition often writes Chinese with Latin punctuation and no space after it (`是什么?其实`), which was not seen as a sentence end, so nothing was sent ahead and each piece waited for a pause.
- With your own speech server, sentences were sometimes translated and spoken twice. When the server's live text paused for a few seconds, or started part-way through a long piece, the extension closed the piece itself, and the server's later text of the same piece was translated again. The speech server always ends its pieces, so the extension now leaves that to it.

### Speech server 2.0.1

- Chinese and Japanese are recognized with punctuation: Whisper often left it out altogether. A punctuated sentence in that language is given to it before the audio; with the language set to detect automatically, a piece found to be Chinese or Japanese is read again with it. Update the server (`sudo ./install-ubuntu.sh`) to get this.
- Lines Whisper makes up from Chinese and Japanese videos ("请不吝点赞 订阅…", "ご視聴ありがとうございました") are dropped.

## 2.4.2 (2026-11-10)

### Fixed

- **Chinese and Japanese translations are spoken clause by clause too.** Their punctuation (。，、；：) has no space after it, so it was not seen as a break, and the whole utterance was spoken only at the end. A Chinese or Japanese character now counts as two Latin ones for the clause lengths, and long text with no punctuation is cut between characters.
- Chinese and Japanese speech: finished sentences are sent ahead while the speaker keeps talking, and the echo guard recognizes our own voice coming back. Both counted words by spaces, so a whole Chinese sentence was one "word".

### Changed

- More words in the built-in pronunciation list for the local Turkish voices: TSMC, Omniverse, Cosmos, hacker (hackers, hackerlar), hacking; "pdf" in any case; "zeka" read as "zekâ".

### Documentation

- Install from the Chrome Web Store, or build from source; the guides cover every setting, the connection test and the English-only speech models.
- The marketing and store material (`promo/`, `store/`, the store image script) is no longer part of the repository.
- Example server addresses are now generic (`100.101.102.103`).

## 2.4.1 (2026-11-09)

### Fixed

- **Your own speech came out as nonsense in calls with the local speech server set to `distil-large-v3`.** That model knows only English: given Turkish speech it wrote an English rendering of it ("How old are you?", with repeated words), which was then "translated" again. English-only models (`distil-*`, `*.en`) are now used only for English speech; other languages go to `large-v3-turbo`, even when the English-only model is the server's own default. The settings mark these models as English only.
- The translator is told more plainly that nobody in the call is talking to it, and is shown two examples of a question being translated rather than answered.

## 2.4.0 (2026-11-08)

### New

- **Foreign words said the right way.** When the translation is spoken, the translator marks words to be said in another language (English terms, acronyms and brands in Turkish speech; Turkish names in English speech) with how they sound, `[[Apple|epıl]]`. The screen and the transcript show the word as written; the local speech server reads the pronunciation; ElevenLabs and OpenAI get the word, and OpenAI's `gpt-*-tts` voices are told to say foreign words in their own language.
- For the local voices where nothing is marked (free services, Soniox): a built-in list of common terms and brands, and short Turkish acronyms (SGK, THY) read letter by letter.
- **Your own pronunciations** (Settings › Speech recognition and voices › Pronunciation of foreign words): one `word = how it sounds` per line, used for every voice. The whole feature can be turned off there.

## 2.3.0 (2026-11-08)

### New

- **Soniox** (optional): speech recognition and translation in one stream. The translation arrives word by word while the speaker is still talking, with no separate translation request; the chosen voice service only speaks it. One Soniox stream per side of a call; the settings' **Test** reports a refused key or an empty balance.
- **Voice only on video tabs**: with voice translation, untick **Also show subtitles** in the extension window to hear the translation with nothing written over the video.
- The panel shows the delay in its parts: waiting for the speech to end, the first translated words, the first sound of the voice.

### Faster

- The translation is spoken clause by clause (from about 24 characters at a comma, semicolon or colon), not sentence by sentence.
- Reasoning models are asked not to reason (`none`, then `minimal`, then `low`, as far as a model requires; remembered per model). On OpenRouter reasoning is turned off for every model and the quickest provider is chosen.
- When the voice falls more than 20 s behind, the oldest piece not yet playing is skipped; its text stays on screen.

### Tests

- `ONLY=soniox,local npm run test:e2e` runs only the named suites; `node test/api/soniox.mjs` checks a real Soniox key (a fraction of a cent).

## 2.2.1 (2026-11-07)

- Ready for the Chrome Web Store: shorter package descriptions (the store allows 132 characters), a privacy policy (`PRIVACY.md`), the listing texts and form answers (`store/`) and `npm run store:images` for the store images.
- The transcripts list says "1 sentence", not "1 sentences".

## 2.2.0 (2026-11-07)

### New

- **Transcripts** of every call (Teams, Meet) and every video or radio tab: each sentence with its time, who said it and its translation. They are kept on this computer (the last 50) and saved as text (`.txt`) or subtitles (`.srt`).
- The panel's **Transcript** button opens the transcript so far; the popup's **Recordings and transcripts** button lists them all. A setting under Microphone and sound turns them off.

## 2.1.0 (2026-11-07)

### New

- **OpenAI-compatible speech services**: speech recognition and voices through OpenAI's audio API, from OpenAI (`whisper-1`, `gpt-4o-transcribe`, `gpt-4o-mini-tts`), Groq Whisper (recognition) or a server of your own (Speaches, LocalAI, Kokoro-FastAPI). Server, key, model and voices are chosen separately for recognition and speech; an empty key takes the same service's key under Translation. Test speaks a sentence and hears it back.
- These services take whole recordings, so the extension cuts the speech into sentences itself (by loudness, the same rules as the speech server before Silero) and sends each one when it ends; there are no live drafts.

### Changed

- The subtitles show only the sentence being said; the earlier one no longer stays above it.

## 2.0.0 (2026-11-07)

The project is now **Live Interpreter** (Canlı Tercüman in Turkish), for Microsoft Teams on the web, Google Meet and any video or radio tab.

### New

- **Video and radio tabs** (YouTube, X, online radio): subtitles or spoken translation, with the spoken language detected automatically.
- **Translation services**: Claude, OpenAI or any server with the same API (LM Studio, vLLM), OpenRouter, your own Ollama server, and free services. The settings page fetches each one's list of models; a failing service hands the sentence to the next one.
- **Your own speech server** (`speech-server/`): faster-whisper and Piper instead of ElevenLabs, with voices for 16 languages. Its recognition model and voices can be chosen in the settings.
- **Interface in five languages**: English (default), Turkish, German, Spanish and Chinese.
- Version shown in the popup and the settings page; `CHANGELOG.md`; `npm run zip` works on Windows too.

### Changed

- The settings page shows only what the chosen services need; prices and repeated hints are gone.
- The speech server finds speech with Silero VAD, so films with music and effects are cut at the ends of sentences.
- New icon and logo.
- The speech server's service is now `live-interpreter-speech`; the installer moves an install made under the old name, key and model kept.

### Security

- The page bridge, the message senders and the panel were hardened (see the README, Security).

### Update from 1.x

1. `git pull`, `npm install`, `npm run build`, then press reload on the extension and reload the call tab.
2. On a computer with your own speech server: `git pull`, then `cd speech-server && sudo ./install-ubuntu.sh`.
3. Settings are kept. The translation service is taken from the old "Translation model" setting.

## 1.0.0

First version, for Google Meet, by UfukNode; Teams on the web added as a fork.
