#!/bin/bash
# Builds dist-installers/LiveInterpreterSpeech-<version>.pkg on a Mac (pkgbuild and
# productbuild come with the Xcode command line tools). Not signed or notarized: the first
# open needs right-click › Open (or System Settings › Privacy & Security › Open Anyway).
#
#   installer/mac/build-pkg.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
SERVER="$ROOT/speech-server"
VERSION=$(sed -n "s/^VERSION = '\(.*\)'/\1/p" "$SERVER/server.py")
[[ -n "$VERSION" ]] || { echo "no VERSION in server.py" >&2; exit 1; }
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

PAYLOAD="$WORK/root/Library/Application Support/LiveInterpreterSpeech/source"
mkdir -p "$PAYLOAD"
cp "$SERVER"/server.py "$SERVER"/engines.py "$SERVER"/segmenter.py "$SERVER"/fetch_voices.py "$SERVER"/requirements.txt "$PAYLOAD"/
cp "$SERVER"/install-mac.sh "$PAYLOAD"/
chmod 755 "$PAYLOAD/install-mac.sh"
cp -R "$HERE/scripts" "$WORK/scripts"
chmod 755 "$WORK/scripts/postinstall"

pkgbuild --root "$WORK/root" --scripts "$WORK/scripts" --identifier com.liveinterpreter.speech \
  --version "$VERSION" --install-location / "$WORK/speech.pkg"
mkdir -p "$ROOT/dist-installers"
OUT="$ROOT/dist-installers/LiveInterpreterSpeech-$VERSION.pkg"
productbuild --distribution "$HERE/distribution.xml" --resources "$HERE/resources" --package-path "$WORK" "$OUT"
echo "Built $OUT"
