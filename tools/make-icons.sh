#!/bin/sh
# Regenerates the smaller PWA icons from icons/icon-512.png (the master).
# Uses macOS's built-in `sips`, so still no dependencies to install.
# To change the artwork, replace icons/icon-512.png (square, full-bleed —
# iOS rounds the corners itself) and re-run this.
set -e
cd "$(dirname "$0")/.."
sips -z 192 192 icons/icon-512.png --out icons/icon-192.png >/dev/null
sips -z 180 180 icons/icon-512.png --out icons/icon-180.png >/dev/null
echo "Wrote icons/icon-192.png and icons/icon-180.png"
