import base64
import json
import sys
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engines import FakeRecognizer, FakeSpeaker, HALLUCINATIONS, resample  # noqa: E402
from segmenter import RATE, Segmenter  # noqa: E402
from server import create_app  # noqa: E402

KEY = 'test-key'
EXT = {'origin': 'chrome-extension://abcdefghijklmnopabcdefghijklmnop'}


def tone(seconds, level=0.3):
    t = np.arange(int(seconds * RATE)) / RATE
    return (level * np.sin(2 * np.pi * 220 * t) * 32767).astype('<i2')


def silence(seconds):
    return np.zeros(int(seconds * RATE), '<i2')


def chunks(pcm, ms=100):
    step = RATE * ms // 1000
    return [pcm[i : i + step] for i in range(0, len(pcm), step)]


@pytest.fixture
def client():
    return TestClient(create_app(FakeRecognizer(), FakeSpeaker(), KEY))


# ---- segmenter -------------------------------------------------------------------------


def test_an_utterance_ends_after_the_silence():
    seg = Segmenter(silence_secs=0.7)
    events = []
    for c in chunks(np.concatenate([silence(0.5), tone(2.0), silence(1.0)])):
        events += seg.push(c)
    finals = [e for e in events if e.kind == 'final']
    partials = [e for e in events if e.kind == 'partial']
    assert len(finals) == 1
    assert 2.0 <= len(finals[0].audio) / RATE <= 3.2
    assert len(partials) >= 2


def test_quiet_noise_is_not_speech():
    seg = Segmenter()
    rng = np.random.default_rng(1)
    noise = (rng.normal(0, 0.002, RATE * 3) * 32767).astype('<i2')
    events = []
    for c in chunks(noise):
        events += seg.push(c)
    assert events == []


def test_a_click_is_too_short_for_an_utterance():
    seg = Segmenter(silence_secs=0.5)
    events = []
    for c in chunks(np.concatenate([silence(0.3), tone(0.06), silence(1.0)])):
        events += seg.push(c)
    assert [e for e in events if e.kind == 'final'] == []


def test_long_speech_is_cut():
    seg = Segmenter(max_secs=3.0)
    events = []
    for c in chunks(tone(7.0)):
        events += seg.push(c)
    assert len([e for e in events if e.kind == 'final']) == 2


def test_a_forced_commit_finishes_the_utterance():
    seg = Segmenter()
    for c in chunks(tone(1.0)):
        seg.push(c)
    assert [e.kind for e in seg.force_final()] == ['final']
    assert seg.force_final() == []


class FakeDetector:
    """Says 'speech' between two times, whatever the sound is."""

    frame = 512

    def __init__(self, start=None, end=None):
        self.start, self.end, self.t = start, end, 0.0

    def __call__(self, frame):
        now = self.t
        self.t += len(frame) / RATE
        return 0.9 if self.start is not None and self.start <= now < self.end else 0.05


def test_a_film_soundtrack_does_not_hold_the_utterance_open():
    # Loud music all along; the voice only between 1 and 3 s.
    seg = Segmenter(silence_secs=0.7, speech=FakeDetector(1.0, 3.0))
    finals = []
    sent = 0
    for c in chunks(tone(5.5, level=0.4)):
        sent += len(c)
        finals += [sent / RATE for e in seg.push(c) if e.kind == 'final']
    assert len(finals) == 1
    assert 3.6 <= finals[0] <= 4.0


def test_loud_sound_with_no_speech_found_is_handed_over_anyway():
    seg = Segmenter(speech=FakeDetector(), blind_secs=6.0)
    finals = []
    for c in chunks(tone(7.0, level=0.4)):
        finals += [e for e in seg.push(c) if e.kind == 'final']
    assert len(finals) == 1
    assert 5.9 <= len(finals[0].audio) / RATE <= 6.1


def test_quiet_sound_with_no_speech_is_not_handed_over():
    seg = Segmenter(speech=FakeDetector(), blind_secs=2.0)
    events = []
    for c in chunks(tone(5.0, level=0.005)):
        events += seg.push(c)
    assert events == []


def test_made_up_whisper_lines_are_caught():
    assert HALLUCINATIONS.search('Altyazı M.K.')
    assert HALLUCINATIONS.search('Thanks for watching!')
    assert not HALLUCINATIONS.search('Cuma günü saat üç bizim için uygun.')


def test_resampling_to_24k():
    out = resample(np.zeros(22050, np.float32), 22050)
    assert len(out) == 24000


# ---- HTTP ------------------------------------------------------------------------------


def test_the_key_is_required(client):
    assert client.get('/v1/voices', headers=EXT).status_code == 401
    assert client.get('/v1/voices', headers={**EXT, 'xi-api-key': 'wrong'}).status_code == 401
    assert client.get('/v1/voices', headers={**EXT, 'xi-api-key': KEY}).status_code == 200
    assert client.get('/health').status_code == 200


def test_web_pages_are_refused(client):
    r = client.get('/v1/voices', headers={'origin': 'https://evil.example', 'xi-api-key': KEY})
    assert r.status_code == 403


def test_voices_look_like_elevenlabs(client):
    voices = client.get('/v1/voices', headers={**EXT, 'xi-api-key': KEY}).json()['voices']
    assert [v['voice_id'] for v in voices][:2] == ['local-1', 'local-2']
    assert all(v['category'] == 'premade' for v in voices)


def test_speech_is_24k_pcm(client):
    r = client.post(
        '/v1/text-to-speech/local-1/stream?output_format=pcm_24000',
        headers={**EXT, 'xi-api-key': KEY},
        json={'text': 'Merhaba, nasılsınız?', 'language_code': 'tr', 'voice_settings': {'speed': 1.1}},
    )
    assert r.status_code == 200
    assert len(r.content) % 2 == 0 and len(r.content) > 4800
    bad = client.post('/v1/text-to-speech/local-1/stream?output_format=mp3_44100', headers={**EXT, 'xi-api-key': KEY}, json={'text': 'x'})
    assert bad.status_code == 400


def test_a_language_without_a_voice_is_refused_not_misread(client):
    r = client.post('/v1/text-to-speech/local-1/stream?output_format=pcm_24000', headers={**EXT, 'xi-api-key': KEY}, json={'text': '안녕하세요', 'language_code': 'ko'})
    assert r.status_code == 422
    assert client.get('/health').json()['speech_languages'] == ['en', 'tr']


def test_cloning_says_it_is_not_available(client):
    assert client.post('/v1/voices/add', headers={**EXT, 'xi-api-key': KEY}).status_code == 501


# ---- realtime --------------------------------------------------------------------------


def token(client):
    return client.post('/v1/single-use-token/realtime_scribe', headers={**EXT, 'xi-api-key': KEY}).json()['token']


def test_realtime_needs_a_fresh_token(client):
    with client.websocket_connect('/v1/speech-to-text/realtime?token=nope&language_code=tr', headers=EXT) as ws:
        assert json.loads(ws.receive_text())['message_type'] == 'auth_error'


def test_a_token_works_once(client):
    t = token(client)
    with client.websocket_connect(f'/v1/speech-to-text/realtime?token={t}', headers=EXT) as ws:
        assert json.loads(ws.receive_text())['message_type'] == 'session_started'
    with client.websocket_connect(f'/v1/speech-to-text/realtime?token={t}', headers=EXT) as ws:
        assert json.loads(ws.receive_text())['message_type'] == 'auth_error'


def test_speech_comes_back_as_partials_and_a_commit(client):
    t = token(client)
    url = f'/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&token={t}&audio_format=pcm_16000&commit_strategy=vad&vad_silence_threshold_secs=0.5&language_code=tr'
    with client.websocket_connect(url, headers=EXT) as ws:
        assert json.loads(ws.receive_text())['message_type'] == 'session_started'
        for c in chunks(np.concatenate([silence(0.3), tone(2.0), silence(1.0)])):
            ws.send_text(json.dumps({'message_type': 'input_audio_chunk', 'audio_base_64': base64.b64encode(c.tobytes()).decode(), 'commit': False, 'sample_rate': 16000}))
        seen = []
        while True:
            msg = json.loads(ws.receive_text())
            seen.append(msg['message_type'])
            if msg['message_type'] == 'committed_transcript':
                assert msg['text'] == 'Cuma günü saat üç bizim için uygun.'
                break
        assert 'partial_transcript' in seen


def test_the_realtime_socket_refuses_web_pages(client):
    with pytest.raises(Exception):
        with client.websocket_connect(f'/v1/speech-to-text/realtime?token={token(client)}', headers={'origin': 'https://evil.example'}) as ws:
            ws.receive_text()
