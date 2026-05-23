#!/usr/bin/env bash
set -euo pipefail

cp "assets/${NAMESPACE}/lang/en_us.json" "$RUNNER_TEMP/en_us_backup.json"
