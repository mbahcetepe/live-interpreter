"""A check of an installed server with its real engines (not part of pytest).

  <venv python> tests/smoke_real.py --config <speech.env>

Asks the running server for its health, has Piper say an English and a Turkish sentence,
gives that audio to Whisper the way the server would (same engine, model and device) and
checks the words that come back. Prints the time Whisper took for each sentence.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import server  # noqa: E402
from engines import MlxWhisperRecognizer, PiperSpeaker, WhisperRecognizer, resample, resolve_device, whisper_engine  # noqa: E402

SENTENCES = {
    'en': ('Good morning, thank you for joining the meeting today.', ['morning', 'meeting']),
    'tr': ('Günaydın, bugün toplantıya katıldığınız için teşekkürler.', ['toplantı', 'teşekkür']),
}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', required=True)
    args = parser.parse_args()
    server.read_config(args.config)
    port = os.environ.get('SPEECH_PORT', '8765')
    with urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=10) as response:
        health = json.load(response)
    print('health:', json.dumps(health))
    assert health['ok'] and health['version'] == server.VERSION, health

    speaker = PiperSpeaker(os.environ['PIPER_VOICES'])
    model = os.environ.get('WHISPER_MODEL', 'large-v3-turbo')
    if whisper_engine(os.environ.get('WHISPER_ENGINE', 'auto')) == 'mlx':
        recognizer = MlxWhisperRecognizer(model)
    else:
        recognizer = WhisperRecognizer(model, *resolve_device(os.environ.get('WHISPER_DEVICE', 'auto'), os.environ.get('WHISPER_COMPUTE', 'auto')))
    print('recognizer:', type(recognizer).__name__, recognizer.device)

    failed = 0
    for language, (sentence, words) in SENTENCES.items():
        pcm = speaker.synthesize(sentence, 'local-1', language)
        audio = resample(np.frombuffer(pcm, dtype='<i2').astype(np.float32) / 32768.0, 24000, 16000)
        started = time.perf_counter()
        text = recognizer.transcribe(audio, language)
        took = time.perf_counter() - started
        ok = all(w in text.lower() for w in words)
        failed += not ok
        print(f"{'PASS' if ok else 'FAIL'} {language}: {took:.2f} s for {len(audio) / 16000:.1f} s of speech: {text!r}")
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
