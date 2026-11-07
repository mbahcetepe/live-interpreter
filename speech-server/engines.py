"""Speech recognition and speech engines.

Real ones: faster-whisper for recognition and Piper for speech. The fake ones answer
fixed sentences and a tone, so the server and the extension can be tested without
models or a GPU (`--engine fake`).
"""

from __future__ import annotations

import json
import logging
import re
import threading
from dataclasses import dataclass
from pathlib import Path

import numpy as np

log = logging.getLogger('speech-server')

OUT_RATE = 24000

# Whisper makes these up from silence or noise (film subtitle credits, video outros).
HALLUCINATIONS = re.compile(
    r'(altyaz[ıi]|subtitles? by|thanks? for watching|izlediğiniz için teşekkür|abone ol|'
    r'like and subscribe|www\.|\.com\b|amara\.org|^\W*$)',
    re.IGNORECASE,
)


@dataclass
class Voice:
    id: str  # what the extension asks for: local-1, local-2, ...
    name: str
    language: str
    path: str | None = None


def resample(audio: np.ndarray, rate: int, target: int = OUT_RATE) -> np.ndarray:
    if rate == target or not len(audio):
        return audio
    from math import gcd

    from scipy.signal import resample_poly

    g = gcd(rate, target)
    return resample_poly(audio, target // g, rate // g).astype(np.float32)


def to_pcm16(audio: np.ndarray) -> bytes:
    return (np.clip(audio, -1.0, 1.0) * 32767).astype('<i2').tobytes()


# ---- recognition -----------------------------------------------------------------------


class WhisperRecognizer:
    def __init__(self, model: str = 'large-v3-turbo', device: str = 'cuda', compute_type: str = 'float16'):
        from faster_whisper import WhisperModel

        log.info('loading faster-whisper %s on %s (%s)', model, device, compute_type)
        self.model = WhisperModel(model, device=device, compute_type=compute_type)
        # One transcription at a time on the GPU; both directions of a call share it.
        self.lock = threading.Lock()
        # The first transcription sets the GPU up; done now, not on the call's first sentence.
        self.transcribe(np.zeros(16000, np.float32), 'en')

    def speech_detector(self):
        """A Silero VAD per stream: it tells speech from music and noise (films)."""
        from segmenter import SileroSpeech

        return SileroSpeech()

    def transcribe(self, audio: np.ndarray, language: str | None, keyterms: list[str] | None = None) -> str:
        if len(audio) < 1600:
            return ''
        options = dict(
            language=language or None,
            beam_size=1,
            vad_filter=False,
            condition_on_previous_text=False,
            without_timestamps=True,
        )
        if keyterms:
            options['hotwords'] = ', '.join(keyterms)[:200]
        with self.lock:
            try:
                segments, _info = self.model.transcribe(audio, **options)
            except TypeError:
                options.pop('hotwords', None)
                segments, _info = self.model.transcribe(audio, **options)
            parts = []
            for seg in segments:
                if seg.no_speech_prob > 0.6 and seg.avg_logprob < -1.0:
                    continue
                parts.append(seg.text.strip())
        text = ' '.join(p for p in parts if p).strip()
        return '' if HALLUCINATIONS.search(text) else text


class FakeRecognizer:
    HEARD = {
        'en': 'Hi, thanks for joining the call today.',
        'tr': 'Cuma günü saat üç bizim için uygun.',
    }

    def transcribe(self, audio: np.ndarray, language: str | None, keyterms: list[str] | None = None) -> str:
        text = self.HEARD.get(language or 'en', self.HEARD['en'])
        # A partial is the start of the sentence, the final the whole of it.
        seconds = len(audio) / 16000
        words = text.split()
        return text if seconds >= 1.5 else ' '.join(words[: max(1, len(words) // 2)])


# ---- speech ----------------------------------------------------------------------------


class PiperSpeaker:
    """Piper voices from voices.json: {"tr": [{"name": ..., "path": ...}, ...], "en": [...]}"""

    def __init__(self, voices_file: str, use_cuda: bool = False):
        from piper import PiperVoice

        config = json.loads(Path(voices_file).read_text(encoding='utf-8'))
        base = Path(voices_file).parent
        self.by_language: dict[str, list] = {}
        self.cache: dict[str, object] = {}
        self.lock = threading.Lock()
        self._load = lambda path: PiperVoice.load(path, use_cuda=use_cuda)
        for language, entries in config.items():
            for entry in entries:
                path = str((base / entry['path']).resolve())
                self.by_language.setdefault(language, []).append({'name': entry.get('name', Path(path).stem), 'path': path})
        if not self.by_language:
            raise ValueError(f'no voices in {voices_file}')
        log.info('piper voices: %s', {k: [v['name'] for v in vs] for k, vs in self.by_language.items()})
        # Loading a voice takes seconds. They are all loaded in the background as the server
        # starts, so it answers at once and the first sentence of a call does not wait.
        threading.Thread(target=self._warm_all, daemon=True).start()

    def _warm_all(self):
        for language, entries in self.by_language.items():
            for i in range(len(entries)):
                try:
                    self.synthesize('.', f'local-{i + 1}', language)
                except Exception:  # noqa: BLE001 - a voice that fails here fails visibly later
                    log.exception('could not load a %s voice', language)
        log.info('all voices loaded')

    def languages(self) -> list[str]:
        return sorted(self.by_language)

    def voices(self) -> list[Voice]:
        count = max(len(v) for v in self.by_language.values())
        return [Voice(f'local-{i + 1}', f'Yerel ses {i + 1}', '') for i in range(max(2, count))]

    def _voice(self, voice_id: str, language: str):
        options = self.by_language.get(language)
        if not options:
            # Another language's voice would read it as gibberish.
            raise LookupError(f'no local voice for {language}')
        index = int(voice_id.rsplit('-', 1)[-1]) - 1 if re.fullmatch(r'local-\d+', voice_id or '') else 0
        entry = options[index % len(options)]
        with self.lock:
            if entry['path'] not in self.cache:
                self.cache[entry['path']] = self._load(entry['path'])
            return self.cache[entry['path']]

    def synthesize(self, text: str, voice_id: str, language: str, speed: float = 1.0) -> bytes:
        voice = self._voice(voice_id, language)
        length_scale = 1.0 / max(0.7, min(1.5, speed or 1.0))
        chunks: list[np.ndarray] = []
        rate = 22050
        try:  # piper-tts 1.3 and newer
            from piper import SynthesisConfig

            for chunk in voice.synthesize(text, syn_config=SynthesisConfig(length_scale=length_scale)):
                rate = chunk.sample_rate
                floats = getattr(chunk, 'audio_float_array', None)
                if floats is not None:
                    chunks.append(np.asarray(floats, dtype=np.float32).reshape(-1))
                else:
                    chunks.append(np.frombuffer(chunk.audio_int16_bytes, dtype='<i2').astype(np.float32) / 32768.0)
        except ImportError:  # piper-tts 1.2
            rate = voice.config.sample_rate
            for raw in voice.synthesize_stream_raw(text, length_scale=length_scale):
                chunks.append(np.frombuffer(raw, dtype='<i2').astype(np.float32) / 32768.0)
        audio = np.concatenate(chunks) if chunks else np.zeros(0, np.float32)
        return to_pcm16(resample(audio, rate))


class FakeSpeaker:
    def languages(self) -> list[str]:
        return ['en', 'tr']

    def voices(self) -> list[Voice]:
        return [Voice('local-1', 'Yerel ses 1', ''), Voice('local-2', 'Yerel ses 2', '')]

    def synthesize(self, text: str, voice_id: str, language: str, speed: float = 1.0) -> bytes:
        if language not in self.languages():
            raise LookupError(f'no local voice for {language}')
        seconds = min(4.0, 0.06 * len(text) / max(0.7, speed or 1.0))
        t = np.arange(int(seconds * OUT_RATE)) / OUT_RATE
        freq = 300 if voice_id == 'local-1' else 420
        return to_pcm16(0.3 * np.sin(2 * np.pi * freq * t).astype(np.float32))
