#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f "ui/package.json" ]]; then
  echo "Missing ui/package.json"
  exit 1
fi

if [[ ! -f "src-tauri/tauri.conf.json" ]]; then
  echo "Missing src-tauri/tauri.conf.json"
  exit 1
fi

mode="${1:-build-ui}"

if [[ "$mode" == "build-ui" ]]; then
  npm --prefix ui run build
fi

if [[ ! -d "ui/dist" || ! -f "ui/dist/index.html" ]]; then
  echo "Missing ui/dist build output."
  echo "Hint: ensure frontendDist points to ../ui/dist and UI build passes."
  exit 1
fi

echo "preflight ok: ui/dist is ready"
