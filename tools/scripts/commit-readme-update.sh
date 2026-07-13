#!/usr/bin/env bash
set -euo pipefail

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

git add README.md

if git diff --cached --quiet; then
  echo "No README changes to commit"
  exit 0
fi

git commit -m "Sync README with Modrinth description"
git pull --rebase origin "${GITHUB_REF_NAME}"
git push origin "HEAD:${GITHUB_REF_NAME}"
