#!/bin/sh
# Снимок страницы-образца. Запуск из этой папки:
#   sh shot.sh ../reference-light.html ../screens/light.png 1440 1600
# Готовые снимки в screens/ сняты именно так, с масштабом 2x.
CHROME=${CHROME:-/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell}
W=${3:-1440}
H=${4:-1600}
"$CHROME" --headless --no-sandbox --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=2 --virtual-time-budget=3000 \
  --window-size=$W,$H --screenshot="$2" "file://$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
python3 crop.py "$2"
