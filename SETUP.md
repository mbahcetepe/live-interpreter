<div align="center">

# Meet Tercüman setup

**English** · [Türkçe](SETUP.tr.md)

From install to your first translated Microsoft Teams call, step by step.

</div>

---

## What you need

| Requirement | Notes |
| --- | --- |
| **Chrome 116+, Edge or Brave** | You join the Teams meeting in this browser. The desktop Teams app is not supported |
| **Node.js 18+** | To build the extension ([nodejs.org](https://nodejs.org)) |
| **An ElevenLabs account** | For speech recognition and voices. Your own voice clone needs Starter or higher ([plans](https://elevenlabs.io/pricing)) |
| **An Anthropic API key** | For translation with Claude. Not needed if you choose free translation |
| **Headphones** | So the translation you hear does not leak into your microphone and back to them |

The extension has no server; your keys stay in your browser.

---

## 1. Download and build

In PowerShell (Terminal on macOS/Linux):

```bash
git clone https://github.com/mbahcetepe/meet-tercuman.git
cd meet-tercuman
npm install
npm run build
```

It ends with `Built dist/`. The extension is the `dist` folder; do not delete or move it.

## 2. Load it into the browser

1. Open `chrome://extensions` (`edge://extensions` in Edge, `brave://extensions` in Brave).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose the `dist` folder.
4. **Keep only one copy loaded.** If an older version is installed, **Remove** it. With two copies the page hooks collide and the popup keeps asking you to reload the tab (F5).

The settings page opens by itself. Pin the extension (puzzle piece → pin).

## 3. ElevenLabs key

1. [elevenlabs.io](https://elevenlabs.io) → [Developers › API Keys](https://elevenlabs.io/app/developers/api-keys) → **Create Key**.
2. Set **Text to Speech** and **Speech to Text** to **Access** and **Voices** to **Write**, then create the key.
3. Copy the key (it is shown only once) and paste it into **ElevenLabs API key** in the settings.

## 4. Translation: Claude or free

- **Claude (recommended):** get a key at [Claude Console › API keys](https://platform.claude.com/settings/keys) and paste it into **Anthropic API key**. The account needs credit. For the shortest delay choose **Claude Haiku 5.5** as the translation model.
- **Free:** choose **Free** as the translation model. Brave may not have Chrome's built-in translator; add a [DeepL API Free](https://www.deepl.com/pro-api) key.
- With Claude selected, a sentence Claude fails on is translated by the free chain, so a DeepL key helps there too.

Click **Test keys**; green text means you are set.

## 5. Microphone, languages, voice

- Click **Allow microphone** and accept the browser's prompt. Pick the microphone you use in Teams, or leave "Same as the call".
- **Languages:** choose your language and theirs.
- **My voice (optional):** read for 1–2 minutes to make your own voice clone, or pick a ready-made voice.
- **Audio:** a **0.5 s** "silence that ends a phrase" starts the translation sooner. Without headphones turn on **Speaker mode**.

## 6. Join the Teams meeting in the browser

1. Open the meeting link. If Teams offers to open the app, choose **Continue on this browser**.
2. Put on headphones and join.
3. If the extension was loaded or reloaded after the Teams tab was opened, reload the tab once (**F5**).

Supported addresses: `teams.microsoft.com`, `teams.cloud.microsoft` (work/school) and `teams.live.com` (personal). Google Meet works too.

## 7. Start translating

On the Teams tab click the extension icon, choose the modes and press **Start translation** (shortcut: `Alt+Shift+T`).

| When they speak | What happens | ElevenLabs credits |
| --- | --- | --- |
| **Voice** | You hear them in your language | Uses the most |
| **Subtitles only** | You hear their own voice and read the translation | Far less |
| **Off** | No translation | None |

| When you speak | What happens | ElevenLabs credits |
| --- | --- | --- |
| **Voice** | They hear you in their language, in the chosen voice | Uses credits |
| **Off** | They hear your real voice | None |

A small **Meet Tercüman** button shows at the bottom left of the page; click it for both sides' sentences, the delay and the cost.

**When you mute in Teams** (`Ctrl+Shift+M`) nothing may reach the call. Check this in your first call.

When the meeting ends the translation stops by itself 30 seconds after the last connection closes. Use the popup or `Alt+Shift+T` to stop it at once.

---

## Try it before an important meeting

1. Start a Teams meeting in the browser on your computer, put on headphones and start the translation.
2. Join the same meeting from your phone, with its volume down or its own headphones.
3. Speak their language into the phone: you hear the translation on the computer.
4. Speak your language into the computer: the phone hears the translated voice, not yours.
5. Mute in Teams and speak: nothing reaches the phone.

Two participants on one computer garble each other's audio; use a second device.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Manifest file is missing or unreadable" | Wrong folder: choose `dist` |
| "Reload the call tab once (F5)" and F5 does not help | More than one copy of the extension is loaded. Keep only the one from `dist`, then F5 |
| "This tab is not a Google Meet or Microsoft Teams (web) page" | Open the popup on the Teams tab; the desktop app is not supported |
| "The extension has no microphone permission" | Settings → **Allow microphone** |
| They cannot hear me | Is your Teams microphone on? Read the warning in the panel; try **Send test sound** |
| They hear odd sounds or their own words back | Your translation leaks from the speakers into the mic: use headphones or turn on **Speaker mode** |
| The delay is long | Choose **Claude Haiku 5.5**, set the silence to **0.5 s**, speak in short sentences |
| The translation stopped by itself | The panel says why (an ElevenLabs quota ran out, for example). Fix it and start again |

## Updating

```bash
git pull
npm install
npm run build
```

Then press reload on the extension and reload the Teams tab (F5). Your settings and voice stay.

Teams-specific technical notes and the points still being checked: [TEAMS.md](TEAMS.md).
