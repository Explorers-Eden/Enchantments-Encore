#!/usr/bin/env bash
set -euo pipefail

PRERELEASE_FLAG=""
if [ "${IS_PRERELEASE}" = "true" ]; then
  PRERELEASE_FLAG="--prerelease"
fi

if gh release view "$TAG_NAME" >/dev/null 2>&1; then
  gh release edit "$TAG_NAME" \
    --title "$RELEASE_NAME" \
    --notes-file "$CHANGELOG_PATH" \
    $PRERELEASE_FLAG
else
  gh release create "$TAG_NAME" \
    --title "$RELEASE_NAME" \
    --notes-file "$CHANGELOG_PATH" \
    $PRERELEASE_FLAG
fi

gh release upload "$TAG_NAME" "$ZIP_NAME" "$JAR_NAME" --clobber
