[Türkçe adımlar](submission.tr.md)

# Chrome Web Store submission

Everything the developer dashboard (https://chrome.google.com/webstore/devconsole) asks for, ready to paste. The dashboard is in English, so these answers are too.

## Package

```
npm run build
npm run zip        # live-interpreter-<version>.zip, manifest.json at its root
```

Upload the zip under **Package**. Use the normal build (`dist/`), never `dist-test/` or a debug build: those add test hosts and leave the panel's shadow roots open.

## Store listing tab

| Field | Value |
| --- | --- |
| Description | `store/listing.md`, one per language |
| Category | Communication |
| Language | English (default), plus Turkish, German, Spanish, Chinese (Simplified) |
| Store icon | `store/images/icon-128.png` (128×128) |
| Screenshots | `store/images/screenshot-*.png` (1280×800, up to 5) |
| Small promo tile | `store/images/promo-small.png` (440×280) |
| Marquee promo tile | `store/images/promo-marquee.png` (1400×560, optional) |
| Official URL | none (needs a verified domain) |
| Homepage URL | https://github.com/mbahcetepe/live-interpreter |
| Support URL | https://github.com/mbahcetepe/live-interpreter/issues |

`npm run store:images` makes the images (see the end of this page).

## Privacy practices tab

### Single purpose

```
Live Interpreter translates speech in real time: in Microsoft Teams and Google Meet calls on the web (both directions), and in a video or radio tab the user chooses (subtitles or spoken translation).
```

### Permission justifications

**tabCapture**
```
Captures the audio of the call tab (what the other participants say) or of the video tab the user chose, so it can be recognized and translated. Capture starts only when the user starts a translation and stops when they stop it.
```

**offscreen**
```
The audio pipeline (capture, speech recognition, translation, playing the translated voice) runs in an offscreen document, because a service worker cannot play or process audio.
```

**storage**
```
Stores the user's settings, the API keys and server addresses they enter, and the state of the running session, locally in the browser.
```

**activeTab**
```
On a video or radio tab, the extension acts only on the tab where the user clicked its button or pressed its shortcut, instead of asking for access to every site.
```

**scripting**
```
After the user starts a translation on a video or radio tab (activeTab), injects the script that shows the subtitles and the panel on that tab. On Teams and Meet the same scripts come from the manifest.
```

**declarativeNetRequestWithHostAccess**
```
A user's own Ollama server rejects requests that carry an extension Origin header. The extension adds one rule that removes that header, only for the server address the user entered and only after they granted access to it.
```

**Host permissions** (meet.google.com, teams.microsoft.com, teams.cloud.microsoft, teams.live.com, and the API hosts)
```
Teams and Meet pages: the content scripts route the call's audio through the translation (the user's translated voice goes to the call instead of their microphone) and show the panel and subtitles. API hosts (api.elevenlabs.io, api.anthropic.com, api.openai.com, api.groq.com, openrouter.ai, api.deepl.com, api-free.deepl.com, api.mistral.ai): the speech recognition, translation and speech services the user can choose, called with the user's own keys.
```

**Optional host permissions** (http://*/*, https://*/*)
```
Requested at runtime, one address at a time, only when the user enters the address of their own server (an Ollama, OpenAI-compatible or speech server, often on their own computer or network) and presses Test. Nothing is requested at install.
```

### Remote code

```
No, I am not using remote code.
```
All code is in the package. The extension calls web APIs (JSON and audio) but never loads or runs code from them.

### Data usage

Tick these (the extension handles them, sends them only to services the user picked, to do what the user asked):

- **Authentication information**: the API keys the user enters, sent only to the service each belongs to.
- **Personal communications**: the speech of the call and its text, sent to the chosen speech and translation services.
- **Website content**: the audio of the call or video tab being translated.

Leave the rest unticked (personally identifiable information, health, financial, location, web history, user activity).

Tick all three certifications:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL**
```
https://github.com/mbahcetepe/live-interpreter/blob/main/PRIVACY.md
```

## Distribution tab

- Visibility: **Public** (or **Unlisted** for a first round: only people with the link can install it).
- Regions: all.

## Test instructions (for the reviewer)

The review needs at least one speech service and one translation service. Without them a translation does not start and the popup says what is missing.

```
1. Open the extension's settings (popup, Settings).
2. Under Translation choose Claude or OpenAI and paste the key given below. Under Speech choose ElevenLabs or OpenAI and paste the key given below. Press Test in each section.
3. Open any YouTube video and play it. Click the extension's icon; the popup shows "This tab's sound". Choose "Subtitles only" and press "Translate this tab". Subtitles in the language chosen under Languages appear low on the video within a few seconds.
4. In a Microsoft Teams (teams.microsoft.com) or Google Meet call, click the icon on the call tab and press "Start translation". A panel at the bottom left shows both sides' sentences and translations.
5. "Recordings and transcripts" in the popup lists the transcripts.
```

Give the reviewer keys of their own in the dashboard's test-instructions field, with a small spending limit, and revoke them after the review. Do not put keys in this repository.

## Images

`npm run store:images` writes `store/images/`:

- `icon-128.png`: the store icon, a copy of the extension's icon.
- `promo-small.png` (440×280) and `promo-marquee.png` (1400×560): the logo on the brand gradient.
- `screenshot-1-video.png` … `screenshot-5-settings.png` (1280×800): the extension running on stand-in pages against the test mocks, no keys or network needed. They show a neutral page, not Teams or Meet, to keep other companies' designs out of the listing.

It builds the test build first and needs Playwright's Chromium (`npx playwright install chromium`).
