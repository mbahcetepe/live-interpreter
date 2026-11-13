# Local speech server

**English** · [Türkçe](README.tr.md)

Runs Live Interpreter's speech recognition and speech on **your own computer** instead of ElevenLabs:

- **Recognition:** Whisper (`large-v3-turbo` by default): [faster-whisper](https://github.com/SYSTRAN/faster-whisper) on an NVIDIA GPU (or the processor), [mlx-whisper](https://github.com/ml-explore/mlx-examples/tree/main/whisper) on Apple silicon's GPU
- **Speech:** [Piper](https://github.com/OHF-Voice/piper1-gpl) (voices for 16 of the extension's 20 languages, fast even on a CPU)

The server speaks the part of the ElevenLabs API the extension already uses, so only the address changes in the extension. No fees, no quotas, and the audio stays on your network.

For translation, **Ollama** on the same computer can be used (extension settings, Translation, "Ollama"). With both, no part of the pipeline goes to an outside service.

## Limits

- **No voice cloning.** Your voices are `local-1`, `local-2` and so on; each reads a sentence with the Piper voice of that sentence's language.
- **A little more delay.** Whisper does not stream. The server cuts the audio at the ends of sentences and transcribes them, sending a draft every 0.8 s while someone speaks. Measured: the final text 1.1–1.3 s after a sentence ends (0.7 s of that is the silence that ends it), speech in under 0.2 s.
- **Noise and films.** Where speech starts and ends is decided by [Silero VAD](https://github.com/snakers4/silero-vad) (shipped with faster-whisper), which tells a voice from music and effects. With film music as loud as the speech, 16 of 16 test sentences were cut correctly; the loudness-based method used before found none. When music drowns the dialogue Silero may not hear it: then 6 s of loud sound is handed to Whisper anyway, and music alone comes back empty. Some sentences can still be missed.
- **Chinese and Japanese.** Whisper often leaves their punctuation out, and the extension needs it to translate finished sentences while the speaker goes on. Since server 2.0.1 Whisper is given a punctuated sentence in that language before the audio; with the language left to detect itself, a piece found to be Chinese or Japanese is read a second time with it, which costs a little GPU time for those two languages only.
- **Made-up lines.** From silence, music or a video's ending Whisper sometimes writes a line nobody said ("Thanks for watching", "请不吝点赞 订阅…", "ご視聴ありがとうございました"). Known ones, in English, Turkish, Chinese and Japanese, are dropped; the extension then keeps the last draft of that piece.
- **Voice quality.** Piper is clear but less natural than ElevenLabs.
- **Languages.** Whisper recognizes 99 languages and detects the language itself when none is given. Piper has voices for 16 of the extension's 20 languages and the installer downloads all of them. Greek, Indonesian, Japanese and Korean have no Piper voice: they get subtitles, and a clear error instead of local speech. Fewer languages: `sudo LANGS="en de fr" ./install-ubuntu.sh`.
- **Licenses.** Recent piper-tts versions are GPL-3.0, and every Piper voice has its own license (see the voice's `.onnx.json` and model card). Fine for your own use; check before building a product on it.

## Install on Ubuntu (NVIDIA GPU)

```bash
git clone https://github.com/mbahcetepe/live-interpreter.git
cd live-interpreter/speech-server
sudo ./install-ubuntu.sh
```

The script:

1. Sets up a Python environment under `/opt/live-interpreter-speech`.
2. Downloads Piper voices for 16 languages (about 1.7 GB; fewer with `LANGS`). They are loaded in the background while the server starts.
3. Makes a random key: `/etc/live-interpreter-speech.env`, `SPEECH_KEY`.
4. Runs the server as the systemd service `live-interpreter-speech` on port 8765.

The first start downloads the Whisper model (about 1.6 GB). At the end the script prints the address and key to enter in the extension. To update, run the same command again after `git pull`; the key is kept. An install made under the old name (`meet-tercuman-speech`) is moved over with its key and downloaded model.

Useful commands:

```bash
systemctl status live-interpreter-speech        # state
journalctl -u live-interpreter-speech -f        # log
sudo systemctl restart live-interpreter-speech  # restart
sudo grep SPEECH_KEY /etc/live-interpreter-speech.env   # show the key
```

Settings live in `/etc/live-interpreter-speech.env`:

| Setting | Default | Notes |
| --- | --- | --- |
| `SPEECH_KEY` | random | The key the extension sends |
| `SPEECH_PORT` | 8765 | Port |
| `WHISPER_MODEL` | large-v3-turbo | `medium` or `small` for more speed. `distil-large-v3` and `*.en` know only English: the extension (2.4.1 and newer) uses them only for English speech and sends other languages to `large-v3-turbo` |
| `WHISPER_ENGINE` | auto | `mlx` on Apple silicon, `faster` (faster-whisper) elsewhere |
| `WHISPER_DEVICE` / `WHISPER_COMPUTE` | cuda / float16 (Ubuntu), auto | `auto` takes the NVIDIA GPU when there is one, else `cpu` / `int8` |
| `PIPER_VOICES` | voices/voices.json | Voices per language |

## Install on Windows

For a Windows computer with an NVIDIA graphics card (Whisper runs on it) or without one (Whisper runs on the processor, slower). Next to LM Studio or Ollama on the same computer, translation and speech both stay on it.

**Setup.exe** (built with `installer/windows/build-setup.ps1`, Inno Setup 6): run it and follow the steps. It is not signed yet, so Windows SmartScreen warns the first time: **More info › Run anyway**. Or the script, in PowerShell inside `speech-server`:

```powershell
powershell -ExecutionPolicy Bypass -File install-windows.ps1
```

Either way, for the signed-in user (no administrator rights):

1. Fetches [uv](https://github.com/astral-sh/uv), Python 3.12 and the packages into `%LOCALAPPDATA%\LiveInterpreterSpeech`. With an NVIDIA card it adds NVIDIA's cuBLAS and cuDNN for CUDA 12 (about 1.3 GB); the card's driver is all that must already be there.
2. Downloads the Piper voices (fewer with `-Langs "en tr"`).
3. Makes a random key and writes the address and key to `connection.txt` (Setup.exe opens it at the end; also in the Start menu).
4. Starts the server, without a window, now and at every sign-in (a shortcut in the Startup folder). The first start downloads the Whisper model (about 1.6 GB).

Without an NVIDIA card the installer chooses the `small` model (about 0.5 GB): on a laptop processor (i7-1255U) it took about 3.3 s per sentence, `large-v3-turbo` about 10 s, `base` about 1 s but with more mistakes in Turkish. A faster computer on the network (an NVIDIA card or a Mac with Apple silicon) does better: put its address in the extension. To change the model, edit `WHISPER_MODEL` in `speech.env` and sign in again (or restart the server).

By default other computers on the network can use it (with the key): Windows asks once whether Python may accept connections; allow it on private networks. Only this computer: tick the box in Setup.exe or add `-LocalOnly`. Log: `logs\server.log`. Update: run it again (the key is kept). Remove: Settings › Apps (Setup.exe), or `install-windows.ps1 -Uninstall`.

The server runs from Python's own `pythonw.exe` (through `launch.py`), not the environment's `Scripts\pythonw.exe`: some antivirus programs (Acronis Cyber Protect, for one) take that small launcher for malware and remove it.

## Install on macOS

On Apple silicon Whisper runs on the GPU through [MLX](https://github.com/ml-explore/mlx) (`mlx-whisper`, the same models); on an Intel Mac on the processor. With 16 GB or more, a translation model in LM Studio or Ollama fits on the same Mac.

**The .pkg** (built on a Mac with `installer/mac/build-pkg.sh`): open it and follow the steps. It is not signed or notarized yet: the first time, right-click it › **Open** (or System Settings › Privacy & Security › **Open Anyway**). Or the script, in Terminal inside `speech-server`:

```bash
./install-mac.sh
```

Either way, for the signed-in user (no sudo): uv, Python 3.12, the packages and the voices go to `~/Library/Application Support/LiveInterpreterSpeech`; the address and key are in `connection.txt` there (the .pkg opens it); launchd starts the server now and at every sign-in (`~/Library/LaunchAgents/com.liveinterpreter.speech.plist`). The first start downloads the Whisper model (about 1.6 GB; on an Intel Mac the installer chooses `small`, about 0.5 GB). Other computers on the network can use it with the key; only this Mac: `./install-mac.sh --local-only`. Log: `logs/server.log`. Update: run it again (the key is kept). Remove: `"~/Library/Application Support/LiveInterpreterSpeech/install-mac.sh" --uninstall`.

## In the extension

1. Settings, **Speech recognition and voices**, **Service**: choose **My own speech server**.
2. Enter the address (for example `100.101.102.103`; port 8765 is added when none is given) and the key.
3. Press **Test** and accept the browser's prompt for that address. The result names the server's version and ends with "live recognition ready". Then choose the **Recognition model** and the voices; **↻** fetches the server's lists again.

## Security

- Requests without the key are refused (401). The live recognition connection opens with a one-time token from the server, valid for 60 seconds.
- Requests from a web page (an http or https origin) are refused (403): only the extension can use the server.
- The connection is not encrypted (http/ws). Expose the server only on Tailscale or your local network, never on the internet.

## Development

To run and test without models or a GPU:

```bash
pip install -r requirements-test.txt
python -m pytest tests                                  # protocol, segmenting, keys, web page refusal
python server.py --engine fake --port 8765 --key test   # stand-in engines: fixed sentences and a tone
```

The extension's end-to-end test (`npm run test:e2e`) starts this server with the stand-in engines itself.
