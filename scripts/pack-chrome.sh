#!/usr/bin/env bash
# Builds dist/AlteX-chrome/ (only the files the extension needs) and a zip of it
# for the Chrome Web Store developer dashboard.
set -euo pipefail
cd "$(dirname "$0")/.."
version=$(node -p "require('./manifest.json').version")
out=dist/AlteX-chrome
rm -rf "$out" "dist/AlteX-chrome-$version.zip"
mkdir -p "$out"
cp -r manifest.json css js fonts icons "$out"/
(cd "$out" && zip -qr -X "../AlteX-chrome-$version.zip" .)
echo "$out"
echo "dist/AlteX-chrome-$version.zip"
