#!/usr/bin/env bash

set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <patch|minor|major>" >&2
  exit 1
fi

npm version "$1" || false
VERSION=$(jq -r '.version' package.json)
git commit --amend --no-edit --no-verify -m "chore(release): v$VERSION" || false
git tag -f "v$VERSION" || false
