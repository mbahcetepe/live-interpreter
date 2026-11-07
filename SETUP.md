<div align="center">

# Live Interpreter setup

**English** · [Türkçe](SETUP.tr.md)

From install to your first translated Teams call or YouTube video, step by step.

</div>

---

## What you need

| Requirement | Notes |
| --- | --- |
| **Chrome 116+, Edge or Brave** | You also join Teams meetings in this browser. The desktop Teams app is not supported |
| **Node.js 18+** | To build the extension ([nodejs.org](https://nodejs.org)) |
| **One of these for speech** | An ElevenLabs account (your own voice clone needs Starter or higher, [plans](https://elevenlabs.io/pricing)) **or** your own speech server ([speech-server](speech-server/README.md)) |
| **One of these for translation** | An Anthropic API key (Claude) **or** your own Ollama server **or** nothing (free translation) |
| **Headphones** | In calls, so the translation you hear does not leak into your microphone and back to them |

The extension has no server of its own. Your keys stay in your browser and go only to the services you choose.

---

## 1. Download and build

In PowerShell (Terminal on macOS/Linux):

```bash
git clone https://github.com/mbahcetepe/live-interpreter.git
cd live-interpreter
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

## 3. Speech: ElevenLabs or your own speech server

In the settings, under **1. API keys**, choose one under **Speech recognition and voices**.

**ElevenLabs:**

1. [elevenlabs.io](https://elevenlabs.io) → [Developers › API Keys](https://elevenlabs.io/app/developers/api-keys) → **Create Key**.
2. Set **Text to Speech** and **Speech to Text** to **Access** and **Voices** to **Write**, then create the key.
3. Copy the key (it is shown only once) and paste it into **ElevenLabs API key**.

**Your own speech server** (free, the audio stays on your network):

1. On an Ubuntu computer with an NVIDIA GPU:
   ```bash
   git clone https://github.com/mbahcetepe/live-interpreter.git
   cd live-interpreter/speech-server && sudo ./install-ubuntu.sh
   ```
   It prints an **address** and a **key** at the end ([details](speech-server/README.md)).
2. In the settings choose **My own speech server**, enter the address and key, press **Test and allow** and accept the browser's prompt for that address. The result should end with "live recognition ready".
3. There is no voice cloning in this mode. Its voices show as `local-1`, `local-2` and so on, and each speaks the language of the sentence. Piper has voices for 16 of the 20 languages; Greek, Indonesian, Japanese and Korean get subtitles but no local speech.

## 4. Translation: Claude, Ollama or free

In the settings, under **6. Translation**, choose the **Translation model**.

- **Claude:** get a key at [Claude Console › API keys](https://platform.claude.com/settings/keys) and paste it into **Anthropic API key**. The account needs credit. **Claude Haiku 5.5** has the shortest delay.
- **Ollama (your own server, free):** choose **Ollama**. Enter the server's address (for example `100.65.147.84`; port 11434 is added when none is given) and a model (for example `gemma4:12b`), press **Test and allow** and accept the browser's prompt. No `OLLAMA_ORIGINS` setting is needed on the server. A **second server** on another computer can be added. If Ollama does not answer, the second server, then Claude (Haiku, if a key is set) and then free translation take over.
- **Free:** choose **Free**. Brave may not have Chrome's built-in translator; add a [DeepL API Free](https://www.deepl.com/pro-api) key.

If Claude or Ollama fails on a sentence, the backup translates it; the sentence is not lost.

Click **Test keys**; green text means you are set.

The computer you use must be on the same network as your own servers (Tailscale, for example). With both the speech server and Ollama, nothing of the call leaves your computers and nothing is billed.

## 5. Microphone, languages, voice

- Click **Allow microphone** and accept the browser's prompt. Pick the microphone you use in Teams, or leave "Same as the call".
- **Languages:** choose your language and theirs; the first start takes your browser's language as yours. **Language of video and radio tabs** is **Detect automatically** unless you set one.
- **My voice (optional):** with ElevenLabs, read for 1–2 minutes to make your own voice clone, or pick a ready-made voice. With your own speech server, pick `local-1` or `local-2`.
- **Audio:** a **0.5 s** "silence that ends a phrase" starts the translation sooner. Without headphones turn on **Speaker mode**.

---

## 6. In a Teams call

1. Open the meeting link. If Teams offers to open the app, choose **Continue on this browser**.
2. Put on headphones and join.
3. If the extension was loaded or reloaded after the Teams tab was opened, reload the tab once (**F5**).
4. On the Teams tab click the extension icon, choose the modes and press **Start translation** (shortcut: `Alt+Shift+T`).

Supported addresses: `teams.microsoft.com`, `teams.cloud.microsoft` (work/school), `teams.live.com` (personal) and Google Meet.

| When they speak | What happens | ElevenLabs credits |
| --- | --- | --- |
| **Voice** | You hear them in your language | Uses the most |
| **Subtitles only** | You hear their own voice and read the translation | Far less |
| **Off** | No translation | None |

| When you speak | What happens | ElevenLabs credits |
| --- | --- | --- |
| **Voice** | They hear you in their language, in the chosen voice | Uses credits |
| **Off** | They hear your real voice | None |

With your own speech server there are no credits; everything in these tables is free.

A small **Live Interpreter** button shows at the bottom left of the page; click it for both sides' sentences, the delay and the cost.

**When you mute in Teams** (`Ctrl+Shift+M`) nothing may reach the call. Check this in your first call.

When the meeting ends the translation stops by itself 30 seconds after the last connection closes. Use the popup or `Alt+Shift+T` to stop it at once.

## 7. On a video or radio tab (YouTube, X, online radio)

1. Open the video or the radio and start it.
2. On that tab click the extension icon. The window shows "This tab's sound".
3. Choose **Subtitles only** or **Voice translation** and press **Translate this tab** (shortcut: `Alt+Shift+T`).

- The translation shows as subtitles low in the page. In YouTube's full screen they move into the player.
- With voice translation the original is turned down to 20% while the translation speaks and comes back up between sentences.
- The extension reaches only the tab you clicked on and sends nothing into it. Moving to another video on the same site keeps translating.
- The translation comes 1.5–3 s behind the speech. With fast, continuous speech, voice translation shortens what it says to keep up.
- **Films and noisy sound:** your own speech server finds speech with a voice detector (Silero VAD) that tells a voice from music and effects. When the music drowns the dialogue, some sentences can still be missed.

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
| The popup asks you to open a call or a page | Open it on a Teams, Meet or video tab. The browser's own pages (`chrome://...`) cannot be translated |
| "The extension has no microphone permission" | Settings → **Allow microphone** |
| They cannot hear me | Is your Teams microphone on? Read the warning in the panel; try **Send test sound** |
| They hear odd sounds or their own words back | Your translation leaks from the speakers into the mic: use headphones or turn on **Speaker mode** |
| "Ollama server at ... could not be reached" | Is the server on, and is this computer on Tailscale? Press **Test and allow** in the settings |
| "The local speech server refused the key" | Enter `SPEECH_KEY` from `/etc/live-interpreter-speech.env` on the server |
| "The backup translation is not ready yet" | Brave has no Chrome translator: add a DeepL Free key or a second Ollama server |
| The delay is long | Choose Ollama or **Claude Haiku 5.5**, set the silence to **0.5 s**, speak in short sentences |
| No translation in a film | Update your speech server (`git pull` and `sudo ./install-ubuntu.sh`); the voice detector came in a later version. Expect subtitles only where someone speaks |
| The translation stopped by itself | The panel says why (an ElevenLabs quota ran out, for example). Fix it and start again |

## Updating

```bash
git pull
npm install
npm run build
```

Then press reload on the extension and reload the open tab (F5). Your settings and voice stay. To update your own speech server, run `git pull` on the Ubuntu computer and `sudo ./install-ubuntu.sh` again in `speech-server`; the key is kept.

Teams-specific technical notes and the points still being checked: [TEAMS.md](TEAMS.md).
