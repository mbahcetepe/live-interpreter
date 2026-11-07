#!/usr/bin/env bash
# Installs the Canlı Tercüman (Live Interpreter) speech server on Ubuntu with an NVIDIA GPU and runs it as a
# systemd service on port 8765.
#
#   cd speech-server && sudo ./install-ubuntu.sh
#
# Afterwards the key the extension needs is in /etc/live-interpreter-speech.env (SPEECH_KEY).
# Run it again to update; the key is kept. An install made under the old name
# (meet-tercuman-speech) is moved over: its key and its downloaded model are kept.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo: sudo ./install-ubuntu.sh" >&2
  exit 1
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP=/opt/live-interpreter-speech
ENV_FILE=/etc/live-interpreter-speech.env
USER_NAME=live-interpreter
SERVICE=live-interpreter-speech
OLD_APP=/opt/meet-tercuman-speech
OLD_ENV=/etc/meet-tercuman-speech.env
OLD_SERVICE=meet-tercuman-speech
PIPER_BASE=https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0

echo "== packages"
apt-get update -qq
apt-get install -y -qq python3 python3-venv python3-pip curl >/dev/null

echo "== user and folders"
id -u "$USER_NAME" >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin "$USER_NAME"
mkdir -p "$APP/voices" "$APP/cache"
if [[ -f /etc/systemd/system/$OLD_SERVICE.service ]]; then
  echo "== moving the install made under the old name"
  systemctl disable --now "$OLD_SERVICE.service" || true
  rm -f "/etc/systemd/system/$OLD_SERVICE.service"
  systemctl daemon-reload
  if [[ -f "$OLD_ENV" && ! -f "$ENV_FILE" ]]; then sed "s#$OLD_APP#$APP#g" "$OLD_ENV" >"$ENV_FILE"; fi
  if [[ -d "$OLD_APP/cache" ]]; then cp -a "$OLD_APP/cache/." "$APP/cache/"; fi
  echo "  key and model kept; the old folder $OLD_APP can be deleted"
fi
cp "$HERE"/server.py "$HERE"/engines.py "$HERE"/segmenter.py "$HERE"/requirements.txt "$APP"/

echo "== Python environment (this takes a few minutes the first time)"
python3 -m venv "$APP/venv"
"$APP/venv/bin/pip" install -q --upgrade pip
"$APP/venv/bin/pip" install -q -r "$APP/requirements.txt"

echo "== Piper voices"
# One or two medium-quality voices for every supported language Piper has. Greek,
# Indonesian, Japanese and Korean have no Piper voice: those languages get subtitles
# but no local speech. Fewer languages: sudo LANGS="en de fr" ./install-ubuntu.sh
declare -A VOICES=(
  [en]="en/en_US/lessac/medium/en_US-lessac-medium en/en_US/ryan/medium/en_US-ryan-medium"
  [tr]="tr/tr_TR/dfki/medium/tr_TR-dfki-medium tr/tr_TR/fahrettin/medium/tr_TR-fahrettin-medium"
  [de]="de/de_DE/thorsten/medium/de_DE-thorsten-medium"
  [fr]="fr/fr_FR/siwis/medium/fr_FR-siwis-medium fr/fr_FR/tom/medium/fr_FR-tom-medium"
  [es]="es/es_ES/davefx/medium/es_ES-davefx-medium es/es_MX/ald/medium/es_MX-ald-medium"
  [it]="it/it_IT/paola/medium/it_IT-paola-medium"
  [pt]="pt/pt_BR/faber/medium/pt_BR-faber-medium pt/pt_BR/cadu/medium/pt_BR-cadu-medium"
  [nl]="nl/nl_BE/nathalie/medium/nl_BE-nathalie-medium nl/nl_BE/rdh/medium/nl_BE-rdh-medium"
  [pl]="pl/pl_PL/gosia/medium/pl_PL-gosia-medium pl/pl_PL/darkman/medium/pl_PL-darkman-medium"
  [ru]="ru/ru_RU/irina/medium/ru_RU-irina-medium ru/ru_RU/denis/medium/ru_RU-denis-medium"
  [uk]="uk/uk_UA/ukrainian_tts/medium/uk_UA-ukrainian_tts-medium"
  [ar]="ar/ar_JO/kareem/medium/ar_JO-kareem-medium"
  [ro]="ro/ro_RO/mihai/medium/ro_RO-mihai-medium"
  [sv]="sv/sv_SE/lisa/medium/sv_SE-lisa-medium sv/sv_SE/nst/medium/sv_SE-nst-medium"
  [hi]="hi/hi_IN/priyamvada/medium/hi_IN-priyamvada-medium hi/hi_IN/pratham/medium/hi_IN-pratham-medium"
  [zh]="zh/zh_CN/huayan/medium/zh_CN-huayan-medium"
)
LANGS=${LANGS:-"en tr de fr es it pt nl pl ru uk ar ro sv hi zh"}
json="{"
first=1
for lang in $LANGS; do
  [[ -n "${VOICES[$lang]:-}" ]] || { echo "  $lang: no Piper voice, skipped"; continue; }
  entries=""
  names=""
  for rel in ${VOICES[$lang]}; do
    name=$(basename "$rel")
    ok=1
    for ext in onnx onnx.json; do
      if [[ ! -s "$APP/voices/$name.$ext" ]]; then
        curl -fsSL "$PIPER_BASE/$rel.$ext" -o "$APP/voices/$name.$ext" || { echo "  could not download $name.$ext" >&2; rm -f "$APP/voices/$name.$ext"; ok=0; }
      fi
    done
    [[ $ok == 1 ]] || continue
    names+=" $name"
    entries+="${entries:+, }{ \"name\": \"$name\", \"path\": \"$name.onnx\" }"
  done
  [[ -n "$entries" ]] || continue
  echo "  $lang:$names"
  json+="$([[ $first == 1 ]] || echo ,) \"$lang\": [ $entries ]"
  first=0
done
json+=" }"
echo "$json" >"$APP/voices/voices.json"
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
fi
chmod 640 "$ENV_FILE"
chgrp "$USER_NAME" "$ENV_FILE"

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

cat >"/etc/systemd/system/$SERVICE.service" <<EOF
[Unit]
Description=Canlı Tercüman (Live Interpreter) local speech server (faster-whisper + Piper)
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
systemctl enable --now "$SERVICE.service"
systemctl restart "$SERVICE.service"

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
echo "The server did not come up. See: journalctl -u $SERVICE -n 50" >&2
exit 1
