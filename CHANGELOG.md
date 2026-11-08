# Changelog

Versions follow [semantic versioning](https://semver.org): MAJOR for changes that need something done (new settings, a server update), MINOR for new features, PATCH for fixes. The version lives in `package.json`; the build writes it into the extension's manifest, and the popup and the settings page show it. The speech server has its own version and a protocol number (`/health`); the extension warns when the server is older than it needs.

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
