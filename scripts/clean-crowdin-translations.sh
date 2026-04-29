#!/usr/bin/env bash
set -euo pipefail

# The temporary Crowdin config must never be committed.
rm -f .crowdin-temp.yml

# Crowdin may export the source language as en_US.json. Minecraft uses en_us.json,
# and the source file from the repo must stay authoritative.
rm -f assets/enchantencore/lang/en_US.json
cp /tmp/enchantencore-en_us.json assets/enchantencore/lang/en_us.json

# Crowdin exports locale names like de_DE.json, but Minecraft lang files are lowercase.
find assets/enchantencore/lang -maxdepth 1 -type f -name "*.json" | while read -r file; do
  dir="$(dirname "$file")"
  base="$(basename "$file")"
  lower="$(echo "$base" | tr '[:upper:]' '[:lower:]')"
  if [ "$base" != "$lower" ]; then
    tmp="$dir/.tmp-$lower"
    mv "$file" "$tmp"
    mv "$tmp" "$dir/$lower"
  fi
done
