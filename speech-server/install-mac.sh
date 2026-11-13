#!/bin/bash
# Installs the Live Interpreter speech server on macOS, for the current user (no sudo),
# and starts it at every sign-in (launchd).
#
#   cd speech-server && ./install-mac.sh               # install or update
#   ./install-mac.sh --local-only                      # only this Mac
#   ./install-mac.sh --uninstall
#
# On Apple silicon Whisper runs on the GPU through MLX; on an Intel Mac on the processor
# (faster-whisper). Everything goes under ~/Library/Application Support/LiveInterpreterSpeech;
# the key the extension needs is in connection.txt there. Run it again to update: the key
# is kept. Fewer voices: LANGS="en tr de" ./install-mac.sh. The .pkg (installer/mac) runs
# this script.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$HOME/Library/Application Support/LiveInterpreterSpeech"
CODE="$APP/app"
VENV="$APP/venv"
CONFIG="$APP/speech.env"
LOG="$APP/logs/server.log"
CONNECTION="$APP/connection.txt"
LABEL=com.liveinterpreter.speech
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LANGS=${LANGS:-"en tr de fr es it pt nl pl ru uk ar ro sv hi zh"}
LOCAL_ONLY=0
FROM_PKG=0
UNINSTALL=0
for arg in "$@"; do
  case "$arg" in
    --local-only) LOCAL_ONLY=1 ;;
    --from-pkg) FROM_PKG=1 ;;
    --uninstall) UNINSTALL=1 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

step() { printf '== %s\n' "$*"; }
stop_server() { launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true; }

if [[ $EUID -eq 0 ]]; then
  echo "Run it as yourself, not with sudo: ./install-mac.sh" >&2
  exit 1
fi

if [[ $UNINSTALL == 1 ]]; then
  step "stopping the server"
  stop_server
  rm -f "$PLIST"
  step "removing $APP"
  rm -rf "$APP"
  echo "The speech server is removed."
  exit 0
fi

step "folders"
mkdir -p "$CODE" "$APP/voices" "$APP/cache" "$APP/logs" "$HOME/Library/LaunchAgents"
stop_server
cp "$HERE"/server.py "$HERE"/engines.py "$HERE"/segmenter.py "$HERE"/fetch_voices.py "$HERE"/requirements.txt "$CODE"/
cp "$HERE"/install-mac.sh "$APP"/install-mac.sh

step "uv (Python and packages)"
UV="$APP/uv/uv"
if [[ ! -x "$UV" ]]; then
  case "$(uname -m)" in
    arm64) target=aarch64-apple-darwin ;;
    *) target=x86_64-apple-darwin ;;
  esac
  mkdir -p "$APP/uv"
  curl -fsSL "https://github.com/astral-sh/uv/releases/latest/download/uv-$target.tar.gz" | tar -xz -C "$APP/uv" --strip-components 1
fi
export UV_PYTHON_INSTALL_DIR="$APP/python" UV_CACHE_DIR="$APP/uv-cache" UV_LINK_MODE=copy

step "Python environment (a few minutes the first time)"
[[ -x "$VENV/bin/python" ]] || "$UV" venv --python 3.12 "$VENV"
"$UV" pip install --python "$VENV/bin/python" -r "$CODE/requirements.txt"
"$UV" cache clean >/dev/null 2>&1 || true

step "Piper voices"
"$VENV/bin/python" "$CODE/fetch_voices.py" --dir "$APP/voices" --langs "$LANGS"

step "settings"
LISTEN=0.0.0.0
[[ $LOCAL_ONLY == 1 ]] && LISTEN=127.0.0.1
if [[ ! -f "$CONFIG" ]]; then
  # Apple silicon runs large-v3-turbo on its GPU (MLX); an Intel Mac has only the processor.
  MODEL=large-v3-turbo
  [[ "$(uname -m)" == arm64 ]] || MODEL=small
  KEY=$("$VENV/bin/python" -c 'import secrets; print(secrets.token_urlsafe(24))')
  cat >"$CONFIG" <<EOF
SPEECH_KEY=$KEY
SPEECH_HOST=$LISTEN
SPEECH_PORT=8765
WHISPER_MODEL=$MODEL
WHISPER_ENGINE=auto
PIPER_VOICES=$APP/voices/voices.json
HF_HOME=$APP/cache
EOF
else
  sed -i '' "s/^SPEECH_HOST=.*/SPEECH_HOST=$LISTEN/" "$CONFIG"
fi
chmod 600 "$CONFIG"
PORT=$(grep '^SPEECH_PORT=' "$CONFIG" | cut -d= -f2-)
KEY=$(grep '^SPEECH_KEY=' "$CONFIG" | cut -d= -f2-)

step "start at sign-in"
cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$VENV/bin/python</string>
    <string>$CODE/server.py</string>
    <string>--config</string><string>$CONFIG</string>
    <string>--log</string><string>$LOG</string>
  </array>
  <key>WorkingDirectory</key><string>$CODE</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>ProcessType</key><string>Interactive</string>
</dict>
</plist>
EOF
# Right after a bootout launchd can still be busy with the old job.
launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null || { sleep 3; launchctl bootstrap "gui/$(id -u)" "$PLIST"; }

{
  echo "Live Interpreter speech server"
  echo
  echo "In the extension: Settings > Speech recognition and voices > Service: \"My own speech server\"."
  echo
  echo "  Address on this Mac: localhost:$PORT"
  if [[ $LOCAL_ONLY == 0 ]]; then
    for ip in $(ifconfig | awk '/inet / && $2 !~ /^127\./ && $2 !~ /^169\.254\./ {print $2}' | sort -t. -k1,1n); do
      echo "  Address from another computer: $ip:$PORT"
    done
  fi
  echo "  Key: $KEY"
  echo
  echo "Settings: $CONFIG"
  echo "Log: $LOG"
  echo "It starts by itself at every sign-in. Remove it: \"$APP/install-mac.sh\" --uninstall"
} >"$CONNECTION"

if [[ $FROM_PKG == 1 ]]; then
  # The installer window should not wait for the model download; the server goes on alone.
  cat "$CONNECTION"
  exit 0
fi

step "waiting for the server (the first start downloads the Whisper model: large-v3-turbo about 1.6 GB, small about 0.5 GB)"
for _ in $(seq 1 450); do
  if health=$(curl -fs "http://127.0.0.1:$PORT/health"); then
    echo
    echo "$health"
    echo
    cat "$CONNECTION"
    exit 0
  fi
  sleep 2
  printf '.'
done
echo
echo "The server has not answered yet; it may still be downloading the Whisper model. See $LOG" >&2
cat "$CONNECTION"
exit 1
