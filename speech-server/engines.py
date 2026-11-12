"""Speech recognition and speech engines.

Real ones: Whisper for recognition (faster-whisper on NVIDIA GPUs and CPUs, MLX on Apple
silicon) and Piper for speech. The fake ones answer
fixed sentences and a tone, so the server and the extension can be tested without
models or a GPU (`--engine fake`).
"""

from __future__ import annotations

import importlib.util
import json
import logging
import os
import platform
import re
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace

import numpy as np

log = logging.getLogger('speech-server')

OUT_RATE = 24000

# Whisper makes these up from silence or noise (film subtitle credits, video outros).
HALLUCINATIONS = re.compile(
    r'(altyaz[ıi]|subtitles? by|thanks? for watching|izlediğiniz için teşekkür|abone ol|'
    r'like and subscribe|www\.|\.com\b|amara\.org|'
    r'点赞|订阅|打赏|明镜|字幕由|ご視聴ありがとう|チャンネル登録|^\W*$)',
    re.IGNORECASE,
)

# Whisper often writes Chinese and Japanese with no punctuation at all, and the extension
# needs it to translate finished sentences while the speaker goes on. A punctuated
# sentence in the same language given as the text before the audio makes it punctuate.
PUNCTUATION_PROMPTS = {
    'zh': '以下是普通话的句子，带有标点符号。',
    'ja': '以下は、句読点のある日本語の文です。',
}
PROMPT_TRIM = ' 。，、.,'


@dataclass
class Voice:
    id: str  # local-1, local-2 (the n-th voice of whatever language is spoken) or a voice's own name
    name: str
    language: str  # '' for local-1, local-2
    path: str | None = None


# The Whisper models a speech server can switch to, fastest last.
WHISPER_MODELS = ['large-v3-turbo', 'large-v3', 'distil-large-v3', 'medium', 'small', 'base', 'tiny']


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


def on_apple_silicon() -> bool:
    return sys.platform == 'darwin' and platform.machine() == 'arm64'


def whisper_engine(choice: str = 'auto') -> str:
    """'mlx' on Apple silicon (its GPU), 'faster' (faster-whisper) everywhere else."""
    if choice in ('faster', 'mlx'):
        return choice
    return 'mlx' if on_apple_silicon() and importlib.util.find_spec('mlx_whisper') else 'faster'


def add_cuda_dlls() -> list[str]:
    """On Windows, cuBLAS and cuDNN come as pip packages (nvidia-cublas-cu12,
    nvidia-cudnn-cu12) whose DLLs are not on the search path; CTranslate2 needs them."""
    if os.name != 'nt':
        return []
    found = []
    for name in ('nvidia.cublas', 'nvidia.cudnn', 'nvidia.cuda_runtime'):
        try:
            spec = importlib.util.find_spec(name)
        except ModuleNotFoundError:
            spec = None
        for location in (spec.submodule_search_locations or []) if spec else []:
            folder = Path(location) / 'bin'
            if folder.is_dir():
                os.add_dll_directory(str(folder))
                os.environ['PATH'] = f"{folder}{os.pathsep}{os.environ.get('PATH', '')}"
                found.append(str(folder))
    return found


def resolve_device(device: str = 'auto', compute_type: str = 'auto') -> tuple[str, str]:
    """'auto': the NVIDIA GPU when CTranslate2 sees one, the CPU otherwise."""
    if device in ('auto', 'cuda'):
        add_cuda_dlls()
    if device == 'auto':
        try:
            import ctranslate2

            device = 'cuda' if ctranslate2.get_cuda_device_count() > 0 else 'cpu'
        except Exception:  # noqa: BLE001 - no CUDA at all
            device = 'cpu'
    if compute_type == 'auto':
        compute_type = 'float16' if device == 'cuda' else 'int8'
    return device, compute_type


class WhisperRecognizer:
    """The server's own model, plus one more a session asks for (kept loaded until a third
    one is asked for; a model is downloaded the first time it is used)."""

    def __init__(self, model: str = 'large-v3-turbo', device: str = 'cuda', compute_type: str = 'float16'):
        self.default = model
        self.device = device
        self.compute_type = compute_type
        self.models: dict[str, object] = {}
        self.order: list[str] = []
        self.load_lock = threading.Lock()
        # One transcription at a time on the GPU; both directions of a call share it.
        self.lock = threading.Lock()
        self._get(model)
        # The first transcription sets the GPU up; done now, not on the call's first sentence.
        self.transcribe(np.zeros(16000, np.float32), 'en')

    def available(self) -> list[str]:
        return WHISPER_MODELS if self.default in WHISPER_MODELS else [self.default, *WHISPER_MODELS]

    def loaded(self) -> list[str]:
        return list(self.models)

    def _get(self, name: str | None):
        name = name if name in self.available() else self.default
        with self.load_lock:
            if name not in self.models:
                self.models[name] = self._load(name)
                self.order.append(name)
                while len(self.order) > 2:
                    old = next(n for n in self.order if n != self.default)
                    self.order.remove(old)
                    self.models.pop(old, None)
                    log.info('unloaded whisper %s', old)
            return self.models[name]

    def _load(self, name: str):
        from faster_whisper import WhisperModel

        log.info('loading faster-whisper %s on %s (%s)', name, self.device, self.compute_type)
        return WhisperModel(name, device=self.device, compute_type=self.compute_type)

    def speech_detector(self):
        """A Silero VAD per stream: it tells speech from music and noise (films)."""
        from segmenter import SileroSpeech

        return SileroSpeech()

    def transcribe(self, audio: np.ndarray, language: str | None, keyterms: list[str] | None = None, model: str | None = None) -> str:
        if len(audio) < 1600:
            return ''
        whisper = self._get(model)
        options = dict(
            language=language or None,
            beam_size=1,
            vad_filter=False,
            condition_on_previous_text=False,
            without_timestamps=True,
        )
        if keyterms:
            options['hotwords'] = ', '.join(keyterms)[:200]
        prompt = PUNCTUATION_PROMPTS.get(language or '')
        if prompt:
            options['initial_prompt'] = prompt
        with self.lock:
            segments, info = self._run(whisper, audio, options)
            # Spoken language detected here: the prompt for it is only known now, so the
            # audio is read again with it (only for the languages that have one).
            detected = getattr(info, 'language', None)
            if not language and detected in PUNCTUATION_PROMPTS:
                prompt = PUNCTUATION_PROMPTS[detected]
                segments, _info = self._run(whisper, audio, {**options, 'language': detected, 'initial_prompt': prompt})
            parts = []
            for seg in segments:
                if seg.no_speech_prob > 0.6 and seg.avg_logprob < -1.0:
                    continue
                parts.append(seg.text.strip())
        text = ' '.join(p for p in parts if p).strip()
        if prompt and text.strip(PROMPT_TRIM) == prompt.strip(PROMPT_TRIM):
            return ''  # the prompt made up from silence
        return '' if HALLUCINATIONS.search(text) else text

    @staticmethod
    def _run(whisper, audio: np.ndarray, options: dict):
        try:
            return whisper.transcribe(audio, **options)
        except TypeError:
            # An older faster-whisper without hotwords.
            return whisper.transcribe(audio, **{k: v for k, v in options.items() if k != 'hotwords'})


class MlxWhisperRecognizer(WhisperRecognizer):
    """Whisper on Apple silicon's GPU through MLX (mlx-whisper). Same models, same
    prompts and filters as faster-whisper; no hotwords. MLX work stays on one thread of
    its own: recent MLX versions do not let a thread use another thread's GPU stream."""

    REPOS = {
        'large-v3-turbo': 'mlx-community/whisper-large-v3-turbo',
        'large-v3': 'mlx-community/whisper-large-v3-mlx',
        'distil-large-v3': 'mlx-community/distil-whisper-large-v3',
        'medium': 'mlx-community/whisper-medium-mlx',
        'small': 'mlx-community/whisper-small-mlx',
        'base': 'mlx-community/whisper-base-mlx',
        'tiny': 'mlx-community/whisper-tiny-mlx',
    }

    def __init__(self, model: str = 'large-v3-turbo'):
        self.worker = ThreadPoolExecutor(max_workers=1, thread_name_prefix='mlx')
        super().__init__(model, 'mlx', 'float16')

    def _load(self, name: str):
        # mlx-whisper loads (and downloads) the model on its first transcription and keeps
        # one in memory; switching models loads the other one.
        repo = self.REPOS.get(name, name)
        log.info('using mlx-whisper %s (%s)', name, repo)
        return repo

    def _run(self, repo, audio: np.ndarray, options: dict):
        def work():
            import mlx_whisper

            return mlx_whisper.transcribe(
                audio,
                path_or_hf_repo=repo,
                language=options.get('language'),
                initial_prompt=options.get('initial_prompt'),
                condition_on_previous_text=False,
                verbose=None,
            )

        result = self.worker.submit(work).result()
        segments = [
            SimpleNamespace(text=s.get('text', ''), no_speech_prob=s.get('no_speech_prob', 0.0), avg_logprob=s.get('avg_logprob', 0.0))
            for s in result.get('segments', [])
        ]
        return segments, SimpleNamespace(language=result.get('language'))


class FakeRecognizer:
    default = 'fake'

    def available(self) -> list[str]:
        return ['fake', 'tiny']

    def loaded(self) -> list[str]:
        return ['fake']

    HEARD = {
        'en': 'Hi, thanks for joining the call today.',
        'tr': 'Cuma günü saat üç bizim için uygun.',
    }

    def transcribe(self, audio: np.ndarray, language: str | None, keyterms: list[str] | None = None, model: str | None = None) -> str:
        text = self.HEARD.get(language or 'en', self.HEARD['en'])
        # A partial is the start of the sentence, the final the whole of it.
        seconds = len(audio) / 16000
        words = text.split()
        return text if seconds >= 1.5 else ' '.join(words[: max(1, len(words) // 2)])


# ---- speech ----------------------------------------------------------------------------


def repair_voice_config(model_path: str) -> str:
    """Fixes a voice's .onnx.json that names its phoneme type the way Python prints it.

    es_MX-ald-medium in piper-voices v1.0.0 says "PhonemeType.ESPEAK" where Piper wants
    "espeak", and Piper refuses to load it. Returns the model path for PiperVoice.load.
    """
    config = Path(f'{model_path}.json')
    try:
        data = json.loads(config.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return model_path
    kind = data.get('phoneme_type')
    if isinstance(kind, str) and kind.startswith('PhonemeType.'):
        data['phoneme_type'] = kind.split('.', 1)[1].lower()
        try:
            config.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
            log.info('repaired the phoneme type in %s', config.name)
        except OSError:
            log.warning('could not repair %s', config.name)
    return model_path


class PiperSpeaker:
    """Piper voices from voices.json: {"tr": [{"name": ..., "path": ...}, ...], "en": [...]}"""

    def __init__(self, voices_file: str, use_cuda: bool = False):
        from piper import PiperVoice

        config = json.loads(Path(voices_file).read_text(encoding='utf-8'))
        base = Path(voices_file).parent
        self.by_language: dict[str, list] = {}
        self.cache: dict[str, object] = {}
        self.lock = threading.Lock()
        self._load = lambda path: PiperVoice.load(repair_voice_config(path), use_cuda=use_cuda)
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
        generic = [Voice(f'local-{i + 1}', f'Voice {i + 1}', '') for i in range(max(2, count))]
        named = [Voice(e['name'], e['name'], language) for language, entries in sorted(self.by_language.items()) for e in entries]
        return generic + named

    def _voice(self, voice_id: str, language: str):
        options = self.by_language.get(language)
        if not options:
            # Another language's voice would read it as gibberish.
            raise LookupError(f'no local voice for {language}')
        # A named voice of this language, the n-th one for local-n, the first one otherwise.
        entry = next((e for e in options if e['name'] == voice_id), None)
        if entry is None:
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
        return [Voice('local-1', 'Voice 1', ''), Voice('local-2', 'Voice 2', ''), Voice('en_US-fake', 'en_US-fake', 'en'), Voice('tr_TR-fake', 'tr_TR-fake', 'tr')]

    def synthesize(self, text: str, voice_id: str, language: str, speed: float = 1.0) -> bytes:
        if language not in self.languages():
            raise LookupError(f'no local voice for {language}')
        seconds = min(4.0, 0.06 * len(text) / max(0.7, speed or 1.0))
        t = np.arange(int(seconds * OUT_RATE)) / OUT_RATE
        freq = 300 if voice_id == 'local-1' else 420
        return to_pcm16(0.3 * np.sin(2 * np.pi * freq * t).astype(np.float32))
