#!/usr/bin/env bash
set -euo pipefail
repo=$(git rev-parse --show-toplevel)
git -C "$repo" config core.hooksPath .githooks
chmod +x "$repo/.githooks/pre-commit"
printf 'Installed repository hooks from .githooks/.\n'
