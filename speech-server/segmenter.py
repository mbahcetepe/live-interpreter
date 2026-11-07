"""Cuts a live 16 kHz audio stream into utterances.

The extension streams 100 ms chunks. An utterance ends after `silence_secs` without
speech, the way ElevenLabs' `vad` commit strategy behaves, and while someone speaks a
partial is due every `partial_secs` of new audio.

What counts as speech comes from a speech detector when there is one (Silero VAD,
`SileroSpeech` below): it tells a voice from music, effects and crowd noise, so a film
whose soundtrack never goes quiet is still cut at the ends of its sentences. Without
one (the stand-in engines, the tests) loudness decides: a frame clearly louder than
the background (the noise floor follows the quiet frames) is speech.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Optional

import numpy as np

RATE = 16000


@dataclass
class Event:
    kind: str  # 'partial' or 'final'
    audio: np.ndarray  # float32, mono, 16 kHz


class SileroSpeech:
    """Speech probability for each 512-sample frame, from the Silero VAD model that
    faster-whisper ships. Keeps its own state, so one is needed per stream."""

    frame = 512
    context_size = 64

    def __init__(self):
        from faster_whisper.vad import get_vad_model

        self.session = get_vad_model().session
        self.h = np.zeros((1, 1, 128), dtype=np.float32)
        self.c = np.zeros((1, 1, 128), dtype=np.float32)
        self.context = np.zeros(self.context_size, dtype=np.float32)

    def __call__(self, frame: np.ndarray) -> float:
        x = np.concatenate([self.context, frame.astype(np.float32)])[None, :]
        out, self.h, self.c = self.session.run(None, {'input': x, 'h': self.h, 'c': self.c})
        self.context = frame[-self.context_size :].astype(np.float32)
        return float(np.asarray(out).reshape(-1)[0])


@dataclass
class Segmenter:
    silence_secs: float = 0.7
    partial_secs: float = 0.8
    max_secs: float = 20.0
    preroll_secs: float = 0.3
    min_speech_secs: float = 0.3
    # speech(frame) -> probability; None means loudness decides.
    speech: Optional[Callable[[np.ndarray], float]] = None
    # Tuned on speech over music and noise: the soundtrack between sentences reaches 0.4.
    start_prob: float = 0.6
    keep_prob: float = 0.5
    # Loud sound for this long with no speech found (dialogue buried under a film's
    # music) is handed to the recognizer anyway; it finds a voice in music better, and
    # drops what has none.
    blind_secs: float = 6.0
    loud_level: float = 0.02
    # loudness: frames of 30 ms
    min_level: float = 0.006
    ratio: float = 3.0
    noise: float = 0.003
    _pending: np.ndarray = field(default_factory=lambda: np.zeros(0, np.float32))
    _pre: list = field(default_factory=list)
    _speech: list = field(default_factory=list)
    _voiced: int = 0
    _quiet: int = 0
    _since_partial: int = 0
    _blind: list = field(default_factory=list)

    @property
    def frame(self) -> int:
        return getattr(self.speech, 'frame', 512) if self.speech else RATE * 30 // 1000

    @property
    def frame_secs(self) -> float:
        return self.frame / RATE

    @property
    def in_speech(self) -> bool:
        return bool(self._speech)

    def push(self, pcm16: np.ndarray) -> list[Event]:
        audio = pcm16.astype(np.float32) / 32768.0
        data = np.concatenate([self._pending, audio])
        events: list[Event] = []
        n = self.frame
        whole = len(data) // n * n
        for start in range(0, whole, n):
            events.extend(self._frame(data[start : start + n]))
        self._pending = data[whole:]
        return events

    def force_final(self) -> list[Event]:
        return [self._finish()] if self._voiced else self._reset()

    def _is_speech(self, frame: np.ndarray, starting: bool) -> bool:
        if self.speech is not None:
            return self.speech(frame) >= (self.start_prob if starting else self.keep_prob)
        level = float(np.sqrt(np.mean(frame * frame)))
        loud = level > max(self.min_level, self.noise * self.ratio)
        if starting and not loud:
            self.noise = 0.95 * self.noise + 0.05 * level
        return loud

    def _frame(self, frame: np.ndarray) -> list[Event]:
        voiced = self._is_speech(frame, starting=not self._speech)
        if not self._speech:
            if not voiced and self.speech is not None:
                blind = self._listen_blind(frame)
                if blind:
                    return blind
            if not voiced:
                self._pre.append(frame)
                keep = max(1, round(self.preroll_secs / self.frame_secs))
                del self._pre[:-keep]
                return []
            self._speech = [*self._pre, frame]
            self._pre = []
            self._voiced = 1
            self._quiet = 0
            self._since_partial = 1
            return []
        self._speech.append(frame)
        self._since_partial += 1
        if voiced:
            self._voiced += 1
            self._quiet = 0
        else:
            self._quiet += 1
        if self._quiet * self.frame_secs >= self.silence_secs:
            return [self._finish()] if self._voiced * self.frame_secs >= self.min_speech_secs else self._reset()
        if len(self._speech) * self.frame_secs >= self.max_secs:
            return [self._finish()]
        if self._since_partial * self.frame_secs >= self.partial_secs:
            self._since_partial = 0
            return [Event('partial', np.concatenate(self._speech))]
        return []

    def _listen_blind(self, frame: np.ndarray) -> list[Event]:
        if float(np.sqrt(np.mean(frame * frame))) < self.loud_level:
            self._blind = []
            return []
        self._blind.append(frame)
        if len(self._blind) * self.frame_secs < self.blind_secs:
            return []
        audio = np.concatenate(self._blind)
        self._blind = []
        return [Event('final', audio)]

    def _finish(self) -> Event:
        audio = np.concatenate(self._speech) if self._speech else np.zeros(0, np.float32)
        self._reset()
        return Event('final', audio)

    def _reset(self) -> list[Event]:
        self._blind = []
        self._speech = []
        self._voiced = 0
        self._quiet = 0
        self._since_partial = 0
        return []
