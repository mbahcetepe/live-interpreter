"""Windows and macOS: the settings file, the engine choice, the device, MLX Whisper."""

import os
import sys
import types
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import engines  # noqa: E402
import server  # noqa: E402
from engines import PUNCTUATION_PROMPTS, MlxWhisperRecognizer, resolve_device, whisper_engine  # noqa: E402


def test_the_settings_file_fills_what_the_environment_does_not_set(tmp_path, monkeypatch):
    config = tmp_path / 'speech.env'
    config.write_text('# comment\nSPEECH_KEY=abc=def\nSPEECH_PORT=9000\n\nWHISPER_MODEL = small\n', encoding='utf-8')
    monkeypatch.delenv('SPEECH_KEY', raising=False)
    monkeypatch.delenv('WHISPER_MODEL', raising=False)
    monkeypatch.setenv('SPEECH_PORT', '8765')
    server.read_config(str(config))
    assert os.environ['SPEECH_KEY'] == 'abc=def'
    assert os.environ['WHISPER_MODEL'] == 'small'
    assert os.environ['SPEECH_PORT'] == '8765'


def test_the_engine_is_mlx_only_on_apple_silicon_with_mlx_whisper(monkeypatch):
    assert whisper_engine('faster') == 'faster'
    assert whisper_engine('mlx') == 'mlx'
    monkeypatch.setattr(engines, 'on_apple_silicon', lambda: False)
    assert whisper_engine('auto') == 'faster'
    monkeypatch.setattr(engines, 'on_apple_silicon', lambda: True)
    monkeypatch.setattr(engines.importlib.util, 'find_spec', lambda name: object() if name == 'mlx_whisper' else None)
    assert whisper_engine('auto') == 'mlx'
    monkeypatch.setattr(engines.importlib.util, 'find_spec', lambda name: None)
    assert whisper_engine('auto') == 'faster'


def test_without_an_nvidia_gpu_whisper_runs_on_the_cpu_in_int8(monkeypatch):
    fake = types.ModuleType('ctranslate2')
    fake.get_cuda_device_count = lambda: 0
    monkeypatch.setitem(sys.modules, 'ctranslate2', fake)
    assert resolve_device('auto', 'auto') == ('cpu', 'int8')
    fake.get_cuda_device_count = lambda: 1
    assert resolve_device('auto', 'auto') == ('cuda', 'float16')
    assert resolve_device('cpu', 'float32') == ('cpu', 'float32')


class FakeMlx:
    """Answers like mlx_whisper.transcribe and records the thread and options."""

    def __init__(self, text, spoken):
        self.text, self.spoken, self.calls = text, spoken, []

    def transcribe(self, audio, **options):
        import threading

        self.calls.append({**options, 'thread': threading.current_thread().name, 'samples': len(audio)})
        return {'text': self.text, 'language': options.get('language') or self.spoken, 'segments': [{'text': self.text, 'no_speech_prob': 0.01, 'avg_logprob': -0.2}]}


def mlx_with(monkeypatch, text, spoken='en'):
    fake = FakeMlx(text, spoken)
    module = types.ModuleType('mlx_whisper')
    module.transcribe = fake.transcribe
    monkeypatch.setitem(sys.modules, 'mlx_whisper', module)
    return MlxWhisperRecognizer('large-v3-turbo'), fake


def test_mlx_whisper_uses_the_mlx_community_model_on_one_thread_of_its_own(monkeypatch):
    rec, fake = mlx_with(monkeypatch, 'Hello there.')
    assert rec.transcribe(np.zeros(16000, np.float32), 'en') == 'Hello there.'
    # The warm-up at start and the call above both ran on the MLX thread.
    assert len(fake.calls) == 2
    assert all(c['thread'].startswith('mlx') for c in fake.calls)
    assert fake.calls[-1]['path_or_hf_repo'] == 'mlx-community/whisper-large-v3-turbo'
    assert fake.calls[-1]['language'] == 'en' and fake.calls[-1]['condition_on_previous_text'] is False
    assert rec.device == 'mlx'


def test_mlx_whisper_gets_the_chinese_prompt_and_a_chosen_model(monkeypatch):
    rec, fake = mlx_with(monkeypatch, '你好，我们开始吧。', spoken='zh')
    assert rec.transcribe(np.zeros(16000, np.float32), None, model='small') == '你好，我们开始吧。'
    assert [c.get('initial_prompt') for c in fake.calls[-2:]] == [None, PUNCTUATION_PROMPTS['zh']]
    assert fake.calls[-1]['path_or_hf_repo'] == 'mlx-community/whisper-small-mlx'
    assert set(rec.loaded()) == {'large-v3-turbo', 'small'}


def test_mlx_whisper_drops_made_up_lines(monkeypatch):
    rec, _fake = mlx_with(monkeypatch, 'Thanks for watching!')
    assert rec.transcribe(np.zeros(16000, np.float32), 'en') == ''
