"""Local speech server for Meet Tercüman: speech recognition and speech on your own
computer, in place of ElevenLabs.

It speaks the part of the ElevenLabs API the extension uses, so the extension only
changes the address it talks to:

  POST /v1/single-use-token/realtime_scribe     a one-time token for the WebSocket
  WS   /v1/speech-to-text/realtime              live recognition (Scribe v2 Realtime protocol)
  GET  /v1/voices                               local-1, local-2, ...
  POST /v1/text-to-speech/{voice}/stream        24 kHz 16-bit PCM
  GET  /health                                  engines and languages

Requests need the server's key in the `xi-api-key` header (the WebSocket takes the
one-time token instead). Only the extension may call it: a request from a web page
(an http or https Origin) is refused.

  python server.py --key SECRET                            # faster-whisper + Piper
  python server.py --engine fake --port 8765 --key test    # no models (tests)
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import logging
import os
import secrets
import time

import numpy as np
import uvicorn
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, Response, StreamingResponse

from engines import FakeRecognizer, FakeSpeaker
from segmenter import Segmenter

log = logging.getLogger('speech-server')

TOKEN_TTL = 60


def allowed_origin(origin: str | None) -> bool:
    return not origin or origin.startswith('chrome-extension://')


def create_app(recognizer, speaker, key: str = '') -> FastAPI:
    app = FastAPI(title='Meet Tercüman speech server', docs_url=None, redoc_url=None)
    tokens: dict[str, float] = {}

    def refuse(status: int, message: str) -> JSONResponse:
        return JSONResponse({'detail': {'status': 'refused', 'message': message}}, status_code=status)

    @app.middleware('http')
    async def guard(request: Request, call_next):
        if not allowed_origin(request.headers.get('origin')):
            return refuse(403, 'web pages may not use this server')
        if request.url.path != '/health' and key and not secrets.compare_digest(request.headers.get('xi-api-key', ''), key):
            return refuse(401, 'wrong or missing key')
        return await call_next(request)

    @app.get('/health')
    async def health():
        return {'ok': True, 'recognizer': type(recognizer).__name__, 'speaker': type(speaker).__name__, 'voices': [v.id for v in speaker.voices()]}

    @app.post('/v1/single-use-token/realtime_scribe')
    async def token():
        now = time.monotonic()
        for t, at in list(tokens.items()):
            if now - at > TOKEN_TTL:
                tokens.pop(t, None)
        value = secrets.token_urlsafe(24)
        tokens[value] = now
        return {'token': value}

    @app.get('/v1/voices')
    async def voices():
        return {'voices': [{'voice_id': v.id, 'name': v.name, 'category': 'premade', 'labels': {}} for v in speaker.voices()]}

    @app.post('/v1/voices/add')
    async def no_clone():
        return refuse(501, 'voice cloning is not available on the local speech server')

    @app.delete('/v1/voices/{voice_id}')
    async def no_delete(voice_id: str):
        return {'status': 'ok'}

    @app.post('/v1/text-to-speech/{voice_id}/stream')
    async def speech(voice_id: str, request: Request):
        fmt = request.query_params.get('output_format', 'pcm_24000')
        if fmt != 'pcm_24000':
            return refuse(400, f'only pcm_24000 is served, not {fmt}')
        body = await request.json()
        text = str(body.get('text') or '').strip()
        language = str(body.get('language_code') or 'en')
        speed = float((body.get('voice_settings') or {}).get('speed') or 1.0)
        if not text:
            return Response(b'', media_type='audio/pcm')
        pcm = await asyncio.to_thread(speaker.synthesize, text, voice_id, language, speed)

        async def stream():
            step = 4800  # 0.1 s
            for at in range(0, len(pcm), step):
                yield pcm[at : at + step]

        return StreamingResponse(stream(), media_type='audio/pcm')

    @app.websocket('/v1/speech-to-text/realtime')
    async def realtime(ws: WebSocket):
        params = ws.query_params
        if not allowed_origin(ws.headers.get('origin')):
            await ws.close(code=1008)
            return
        await ws.accept()
        issued = tokens.pop(params.get('token', ''), None)
        if issued is None or time.monotonic() - issued > TOKEN_TTL:
            await ws.send_text(json.dumps({'message_type': 'auth_error', 'error': 'invalid or expired token'}))
            await ws.close()
            return
        language = params.get('language_code') or None
        silence = float(params.get('vad_silence_threshold_secs') or 0.7)
        keyterms = params.getlist('keyterms')
        await RealtimeSession(ws, recognizer, language, silence, keyterms).run()

    return app


class RealtimeSession:
    """One direction of a call: audio in, partial and committed transcripts out."""

    def __init__(self, ws: WebSocket, recognizer, language, silence, keyterms):
        self.ws = ws
        self.recognizer = recognizer
        self.language = language
        self.keyterms = keyterms
        self.segmenter = Segmenter(silence_secs=silence)
        self.finals: asyncio.Queue = asyncio.Queue()
        self.partial_busy = False
        # A partial that comes back after its utterance was finished is dropped.
        self.utterance = 0

    async def send(self, kind: str, text: str = '', **extra):
        await self.ws.send_text(json.dumps({'message_type': kind, 'text': text, **extra}, ensure_ascii=False))

    async def run(self):
        await self.send('session_started', session_id=secrets.token_hex(6), config={'language_code': self.language})
        worker = asyncio.create_task(self.commit_worker())
        try:
            while True:
                msg = json.loads(await self.ws.receive_text())
                if msg.get('message_type') != 'input_audio_chunk':
                    continue
                pcm = np.frombuffer(base64.b64decode(msg.get('audio_base_64') or ''), dtype='<i2')
                events = self.segmenter.push(pcm)
                if msg.get('commit'):
                    events += self.segmenter.force_final()
                for event in events:
                    if event.kind == 'final':
                        self.utterance += 1
                        self.finals.put_nowait(event.audio)
                    elif not self.partial_busy and self.finals.empty():
                        self.partial_busy = True
                        asyncio.create_task(self.partial(event.audio, self.utterance))
        except (WebSocketDisconnect, RuntimeError):
            pass
        finally:
            worker.cancel()

    async def partial(self, audio, utterance):
        try:
            text = await asyncio.to_thread(self.recognizer.transcribe, audio, self.language, self.keyterms)
            if text and utterance == self.utterance:
                await self.send('partial_transcript', text)
        except Exception:  # noqa: BLE001 - a failed partial only costs a preview
            log.exception('partial transcription failed')
        finally:
            self.partial_busy = False

    async def commit_worker(self):
        while True:
            audio = await self.finals.get()
            try:
                text = await asyncio.to_thread(self.recognizer.transcribe, audio, self.language, self.keyterms)
            except Exception:  # noqa: BLE001
                log.exception('transcription failed')
                await self.send('transcriber_error', error='transcription failed')
                continue
            await self.send('committed_transcript', text)


def main():
    parser = argparse.ArgumentParser(description='Meet Tercüman local speech server')
    parser.add_argument('--host', default=os.environ.get('SPEECH_HOST', '0.0.0.0'))
    parser.add_argument('--port', type=int, default=int(os.environ.get('SPEECH_PORT', '8765')))
    parser.add_argument('--key', default=os.environ.get('SPEECH_KEY', ''), help='the key the extension sends (xi-api-key)')
    parser.add_argument('--engine', choices=['real', 'fake'], default=os.environ.get('SPEECH_ENGINE', 'real'))
    parser.add_argument('--whisper-model', default=os.environ.get('WHISPER_MODEL', 'large-v3-turbo'))
    parser.add_argument('--device', default=os.environ.get('WHISPER_DEVICE', 'cuda'))
    parser.add_argument('--compute-type', default=os.environ.get('WHISPER_COMPUTE', 'float16'))
    parser.add_argument('--voices', default=os.environ.get('PIPER_VOICES', os.path.join(os.path.dirname(__file__), 'voices', 'voices.json')))
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    if not args.key:
        log.warning('no --key set: anyone who can reach this port can use the server')
    if args.engine == 'fake':
        recognizer, speaker = FakeRecognizer(), FakeSpeaker()
    else:
        from engines import PiperSpeaker, WhisperRecognizer

        recognizer = WhisperRecognizer(args.whisper_model, args.device, args.compute_type)
        speaker = PiperSpeaker(args.voices)
    uvicorn.run(create_app(recognizer, speaker, args.key), host=args.host, port=args.port, log_level='warning')


if __name__ == '__main__':
    main()
