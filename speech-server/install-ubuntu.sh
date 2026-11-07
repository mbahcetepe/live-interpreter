#!/usr/bin/env bash
# Installs the Meet Tercüman speech server on Ubuntu with an NVIDIA GPU and runs it as a
# systemd service on port 8765.
#
#   cd speech-server && sudo ./install-ubuntu.sh
#
# Afterwards the key the extension needs is in /etc/meet-tercuman-speech.env (SPEECH_KEY).
# Run it again to update; the key is kept.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo: sudo ./install-ubuntu.sh" >&2
  exit 1
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP=/opt/meet-tercuman-speech
ENV_FILE=/etc/meet-tercuman-speech.env
USER_NAME=meet-tercuman
PIPER_BASE=https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0

echo "== packages"
apt-get update -qq
apt-get install -y -qq python3 python3-venv python3-pip curl >/dev/null

echo "== user and folders"
id -u "$USER_NAME" >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin "$USER_NAME"
mkdir -p "$APP/voices" "$APP/cache"
cp "$HERE"/server.py "$HERE"/engines.py "$HERE"/segmenter.py "$HERE"/requirements.txt "$APP"/

echo "== Python environment (this takes a few minutes the first time)"
python3 -m venv "$APP/venv"
"$APP/venv/bin/pip" install -q --upgrade pip
"$APP/venv/bin/pip" install -q -r "$APP/requirements.txt"

echo "== Piper voices"
fetch_voice() { # language path/name
  local lang=$1 rel=$2 name
  name=$(basename "$rel")
  for ext in onnx onnx.json; do
    if [[ ! -s "$APP/voices/$name.$ext" ]]; then
      curl -fsSL "$PIPER_BASE/$rel.$ext" -o "$APP/voices/$name.$ext" || { echo "could not download $name.$ext" >&2; return 1; }
    fi
  done
  echo "  $lang: $name"
}
fetch_voice tr tr/tr_TR/dfki/medium/tr_TR-dfki-medium
fetch_voice tr tr/tr_TR/fahrettin/medium/tr_TR-fahrettin-medium
fetch_voice en en/en_US/lessac/medium/en_US-lessac-medium
fetch_voice en en/en_US/ryan/medium/en_US-ryan-medium
cat >"$APP/voices/voices.json" <<'JSON'
{
  "tr": [
    { "name": "dfki", "path": "tr_TR-dfki-medium.onnx" },
    { "name": "fahrettin", "path": "tr_TR-fahrettin-medium.onnx" }
  ],
  "en": [
    { "name": "lessac", "path": "en_US-lessac-medium.onnx" },
    { "name": "ryan", "path": "en_US-ryan-medium.onnx" }
  ]
}
JSON

echo "== settings"
if [[ ! -f "$ENV_FILE" ]]; then
  KEY=$(python3 -c 'import secrets; print(secrets.token_urlsafe(24))')
  cat >"$ENV_FILE" <<EOF
SPEECH_KEY=$KEY
SPEECH_HOST=0.0.0.0
SPEECH_PORT=8765
WHISPER_MODEL=large-v3-turbo
WHISPER_DEVICE=cuda
WHISPER_COMPUTE=float16
PIPER_VOICES=$APP/voices/voices.json
HF_HOME=$APP/cache
EOF
  chmod 640 "$ENV_FILE"
  chgrp "$USER_NAME" "$ENV_FILE"
fi

# CTranslate2 finds cuBLAS and cuDNN from the pip packages through LD_LIBRARY_PATH.
LIBS=$("$APP/venv/bin/python" - <<'PY'
import importlib.util, os
paths = []
for name in ("nvidia.cublas.lib", "nvidia.cudnn.lib"):
    spec = importlib.util.find_spec(name)
    if spec and spec.submodule_search_locations:
        paths.extend(spec.submodule_search_locations)
print(":".join(paths))
PY
)
chown -R "$USER_NAME:$USER_NAME" "$APP"

cat >/etc/systemd/system/meet-tercuman-speech.service <<EOF
[Unit]
Description=Meet Tercüman local speech server (faster-whisper + Piper)
After=network-online.target
Wants=network-online.target

[Service]
User=$USER_NAME
EnvironmentFile=$ENV_FILE
Environment=LD_LIBRARY_PATH=$LIBS
WorkingDirectory=$APP
ExecStart=$APP/venv/bin/python $APP/server.py
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now meet-tercuman-speech.service
systemctl restart meet-tercuman-speech.service

echo "== waiting for the server (the first start downloads the Whisper model, about 1.6 GB)"
for _ in $(seq 1 180); do
  if curl -fs "http://127.0.0.1:8765/health" >/dev/null; then
    echo
    curl -s "http://127.0.0.1:8765/health"; echo
    echo "Ready. In the extension settings choose \"My own speech server\" and enter:"
    echo "  address: $(hostname -I | tr ' ' '\n' | grep '^100\.' | head -1 || hostname -I | awk '{print $1}'):8765"
    echo "  key:     $(grep '^SPEECH_KEY=' "$ENV_FILE" | cut -d= -f2-)"
    exit 0
  fi
  sleep 2
  printf '.'
done
echo
echo "The server did not come up. See: journalctl -u meet-tercuman-speech -n 50" >&2
exit 1
