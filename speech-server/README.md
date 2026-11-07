# Local speech server

**English** · [Türkçe](README.tr.md)

Runs Live Interpreter's speech recognition and speech on **your own computer** instead of ElevenLabs:

- **Recognition:** [faster-whisper](https://github.com/SYSTRAN/faster-whisper) (`large-v3-turbo` by default, on an NVIDIA GPU)
- **Speech:** [Piper](https://github.com/OHF-Voice/piper1-gpl) (voices for 16 of the extension's 20 languages, fast even on a CPU)

The server speaks the part of the ElevenLabs API the extension already uses, so only the address changes in the extension. No fees, no quotas, and the audio stays on your network.

For translation, **Ollama** on the same computer can be used (extension settings, 6. Translation, "Ollama"). With both, no part of the pipeline goes to an outside service.

## Limits

- **No voice cloning.** Your voices are `local-1`, `local-2` and so on; each reads a sentence with the Piper voice of that sentence's language.
- **A little more delay.** Whisper does not stream. The server cuts the audio at the ends of sentences and transcribes them, sending a draft every 0.8 s while someone speaks. Measured: the final text 1.1–1.3 s after a sentence ends (0.7 s of that is the silence that ends it), speech in under 0.2 s.
- **Noise and films.** Where speech starts and ends is decided by [Silero VAD](https://github.com/snakers4/silero-vad) (shipped with faster-whisper), which tells a voice from music and effects. With film music as loud as the speech, 16 of 16 test sentences were cut correctly; the loudness-based method used before found none. When music drowns the dialogue Silero may not hear it: then 6 s of loud sound is handed to Whisper anyway, and music alone comes back empty. Some sentences can still be missed.
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
| `WHISPER_MODEL` | large-v3-turbo | `medium` or `small` for more speed |
| `WHISPER_DEVICE` / `WHISPER_COMPUTE` | cuda / float16 | `cpu` / `int8` without a GPU |
| `PIPER_VOICES` | voices/voices.json | Voices per language |

## In the extension

1. Settings, **1. API keys**, **Speech recognition and voices**: choose **My own speech server**.
2. Enter the address (for example `100.65.147.84`; port 8765 is added when none is given) and the key.
3. Press **Test and allow** and accept the browser's prompt for that address. The result should list the voices, the time to make a sample and "live recognition ready".

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
