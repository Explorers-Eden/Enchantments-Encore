#!/usr/bin/env bash
set -euo pipefail

rm -f .crowdin-temp.yml

# Crowdin may export the source locale as en_US.json; Minecraft uses en_us.json
# and the repo source must stay authoritative.
rm -f "assets/${NAMESPACE}/lang/en_US.json"
cp "$RUNNER_TEMP/en_us_backup.json" "assets/${NAMESPACE}/lang/en_us.json"

# Crowdin exports locale names like de_DE.json; Minecraft lang files must be lowercase.
find "assets/${NAMESPACE}/lang" -maxdepth 1 -type f -name "*.json" | while read -r file; do
  dir="$(dirname "$file")"
  base="$(basename "$file")"
  lower="$(echo "$base" | tr '[:upper:]' '[:lower:]')"
  if [ "$base" != "$lower" ]; then
    tmp="$dir/.tmp-$lower"
    mv "$file" "$tmp"
    mv "$tmp" "$dir/$lower"
  fi
done
