#!/usr/bin/env bash
set -euo pipefail

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

git add "assets/${NAMESPACE}/lang"
git restore --staged "assets/${NAMESPACE}/lang/en_us.json" 2>/dev/null || true

if git diff --cached --quiet; then
  echo "No translation changes to commit"
else
  git commit -m "Update ${NAME} translations from Crowdin"
  git pull --rebase origin "${GITHUB_REF_NAME}"
  git push origin "HEAD:${GITHUB_REF_NAME}"
fi
