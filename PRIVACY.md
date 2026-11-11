[Türkçe](PRIVACY.tr.md)

# Live Interpreter privacy policy

Last updated: 8 November 2026

Live Interpreter (Canlı Tercüman in Turkish) is a browser extension that translates speech in Microsoft Teams, Google Meet and Zoom calls on the web, and in video or radio tabs. This page says what it does with your data.

**In short:** the extension has no server of its own and collects nothing for its developer. Speech and text go only to the speech and translation services you choose in the settings, with your own keys, to do the translation. Everything it keeps stays in your browser on your computer.

## What the extension handles

| Data | When | Where it goes |
| --- | --- | --- |
| The call tab's sound (what the others say) and your microphone | While a translation runs on a Teams, Meet or Zoom tab | To the speech recognition service you chose |
| A video or radio tab's sound | Only after you click Translate this tab on that tab | To the speech recognition service you chose |
| The recognized text | While a translation runs | To the translation service you chose; the translation goes to the speech service you chose to be spoken |
| Voice samples for a voice clone | Only when you record your voice in the settings, or after you confirm the other person agreed to have their voice cloned | To ElevenLabs, to make the clone. The other person's clone is deleted when the call ends unless you change that setting |
| API keys and server addresses you enter | When you save the settings | Kept in the extension's storage; each key is sent only to the service it belongs to |
| Settings | When you change them | Kept in the extension's storage |
| Call recordings (optional, off unless you start one) | During a call you chose to record | Kept on your computer until you save or delete them |
| Transcripts (on by default, can be turned off) | During each translation | Kept on your computer; the last 50 are kept, older ones are deleted |

## The services you can choose

The extension sends audio or text only to the services selected in its settings, and only while a translation runs or when you press a Test button. Each one handles the data under its own privacy policy:

- Speech recognition and translation in one stream: Soniox.
- Speech: ElevenLabs, Google (Gemini), Soniox, OpenAI, Groq, or a speech server you run yourself (for example the one in this project, Speaches, LocalAI or Kokoro).
- Translation: Anthropic (Claude), OpenAI or a server with the same API, OpenRouter, Google (Gemini), an Ollama server you run yourself, or Soniox.

With your own speech server and your own Ollama server, the audio and text never leave the computers you control.

## What the extension does not do

- It has no server of its own and sends nothing to its developer: no analytics, no crash reports, no tracking, no ads.
- It does not sell or share your data, and does not use it for anything other than the translation you started.
- It does not read the pages you visit. On Teams, Meet and Zoom pages it only routes the call's audio and shows its panel and subtitles; on any other tab it does nothing until you start a translation there. Access to Zoom (`zoom.us`) is asked for only when you first start a translation there, and can be withdrawn in the browser's extension settings.
- It does not run code downloaded from the internet.

## Your control

- Stop a translation at any time from the panel, the toolbar button or `Alt+Shift+T`.
- Delete recordings and transcripts on the Recordings and transcripts page, and turn transcripts off in the settings.
- Removing the extension deletes its settings, keys, recordings and transcripts from the browser.

Tell the people in a call when you translate or record it; in some places the law requires their consent.

## Changes and contact

Changes to this policy are published on this page, with the date above. Questions: open an issue at https://github.com/mbahcetepe/live-interpreter/issues.
