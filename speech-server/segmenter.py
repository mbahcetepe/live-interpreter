"""Cuts a live 16 kHz audio stream into utterances by its loudness.

The extension streams 100 ms chunks. Speech starts when a frame is clearly louder than
the background (the noise floor follows the quiet frames), and an utterance ends after
`silence_secs` of quiet, the same way ElevenLabs' `vad` commit strategy behaves. While
someone speaks, a partial is due every `partial_secs` of new audio.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

RATE = 16000


@dataclass
class Event:
    kind: str  # 'partial' or 'final'
    audio: np.ndarray  # float32, mono, 16 kHz


@dataclass
class Segmenter:
    silence_secs: float = 0.7
    partial_secs: float = 0.8
    max_secs: float = 20.0
    frame_ms: int = 30
    preroll_ms: int = 300
    min_speech_ms: int = 200
    min_level: float = 0.006
    ratio: float = 3.0
    noise: float = 0.003
    _pending: np.ndarray = field(default_factory=lambda: np.zeros(0, np.float32))
    _pre: list = field(default_factory=list)
    _speech: list = field(default_factory=list)
    _voiced_frames: int = 0
    _quiet_frames: int = 0
    _since_partial: int = 0

    @property
    def frame(self) -> int:
        return RATE * self.frame_ms // 1000

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
        return [self._finish()] if self._voiced_frames else self._reset()

    def _frame(self, frame: np.ndarray) -> list[Event]:
        level = float(np.sqrt(np.mean(frame * frame)))
        loud = level > max(self.min_level, self.noise * self.ratio)
        if not self._speech:
            if not loud:
                self.noise = 0.95 * self.noise + 0.05 * level
                self._pre.append(frame)
                keep = max(1, self.preroll_ms // self.frame_ms)
                del self._pre[:-keep]
                return []
            self._speech = [*self._pre, frame]
            self._pre = []
            self._voiced_frames = 1
            self._quiet_frames = 0
            self._since_partial = 1
            return []
        self._speech.append(frame)
        self._since_partial += 1
        if loud:
            self._voiced_frames += 1
            self._quiet_frames = 0
        else:
            self._quiet_frames += 1
        frame_secs = self.frame_ms / 1000
        if self._quiet_frames * frame_secs >= self.silence_secs:
            return [self._finish()] if self._voiced_frames * self.frame_ms >= self.min_speech_ms else self._reset()
        if len(self._speech) * frame_secs >= self.max_secs:
            return [self._finish()]
        if self._since_partial * frame_secs >= self.partial_secs:
            self._since_partial = 0
            return [Event('partial', np.concatenate(self._speech))]
        return []

    def _finish(self) -> Event:
        audio = np.concatenate(self._speech) if self._speech else np.zeros(0, np.float32)
        self._reset()
        return Event('final', audio)

    def _reset(self) -> list[Event]:
        self._speech = []
        self._voiced_frames = 0
        self._quiet_frames = 0
        self._since_partial = 0
        return []
