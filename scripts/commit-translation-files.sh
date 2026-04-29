#!/usr/bin/env bash
set -euo pipefail

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

git add assets/enchantencore/lang
git restore --staged assets/enchantencore/lang/en_us.json || true

if git diff --cached --quiet; then
  echo "No translation changes to commit"
else
  git commit -m "Update Enchantments Encore translations from Crowdin"
  git push origin HEAD:${GITHUB_REF_NAME}
fi
