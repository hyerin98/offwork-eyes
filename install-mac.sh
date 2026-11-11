#!/bin/bash
# OffWork Eyes macOS installer.
#
#   curl -fsSL https://raw.githubusercontent.com/hyerin98/offwork-eyes/main/install-mac.sh | bash
#
# Files downloaded with curl don't get the quarantine flag that makes macOS
# report unsigned apps as "damaged", so the app opens without extra steps.
set -euo pipefail

REPO="hyerin98/offwork-eyes"
APP="OffWork Eyes.app"
BIN="OffWork Eyes.app/Contents/MacOS/OffWork Eyes"

echo "OffWork Eyes 설치를 시작합니다."

# Apple Silicon or Intel (sysctl answers correctly even under Rosetta)
ARCH=x64
if [ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = "1" ]; then ARCH=arm64; fi

URLS=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
  | grep -o '"browser_download_url": *"[^"]*\.zip"' \
  | sed -E 's/.*"(https[^"]+)"/\1/' || true)

# a zip for this CPU (about half the size), else the universal one (older releases)
URL=$(printf '%s\n' "$URLS" | grep -e "-mac-$ARCH\.zip$" | head -n 1 || true)
if [ -z "$URL" ]; then
  URL=$(printf '%s\n' "$URLS" | grep -e "-mac\.zip$" -e "-mac-universal\.zip$" | head -n 1 || true)
fi

if [ -z "$URL" ]; then
  echo "다운로드 주소를 찾지 못했습니다. 잠시 후 다시 시도해 주세요." >&2
  exit 1
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "내려받는 중: ${URL##*/}"
curl -fL --progress-bar "$URL" -o "$TMP/app.zip"
ditto -x -k "$TMP/app.zip" "$TMP/unzipped"

if [ ! -d "$TMP/unzipped/$APP" ]; then
  echo "압축 파일에서 앱을 찾지 못했습니다." >&2
  exit 1
fi

# Admin accounts can write /Applications; standard accounts get ~/Applications.
DEST="/Applications"
if [ ! -w "$DEST" ]; then
  DEST="$HOME/Applications"
  mkdir -p "$DEST"
fi

# Quit the running widget and wait until it is really gone before replacing it.
# Otherwise "open" below only brings the old, still-running copy to the front.
pkill -f "$BIN" 2>/dev/null || true
for _ in $(seq 1 50); do
  pgrep -f "$BIN" >/dev/null 2>&1 || break
  sleep 0.1
done
pkill -9 -f "$BIN" 2>/dev/null || true

rm -rf "$DEST/$APP"
ditto "$TMP/unzipped/$APP" "$DEST/$APP"
xattr -cr "$DEST/$APP" 2>/dev/null || true

open "$DEST/$APP"
echo "설치가 끝났습니다: $DEST/$APP"
echo "화면 위쪽 메뉴 막대의 눈 아이콘에서 설정과 종료를 할 수 있습니다."
