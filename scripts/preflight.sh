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

find_text() {
  local pattern="$1"
  local file="$2"
  if command -v rg >/dev/null 2>&1; then
    rg -n "$pattern" "$file" >/dev/null
  else
    grep -E -n "$pattern" "$file" >/dev/null
  fi
}

if [[ "$mode" == "build-ui" ]]; then
  npm --prefix ui run build
fi

if [[ ! -d "ui/dist" || ! -f "ui/dist/index.html" ]]; then
  echo "Missing ui/dist build output."
  echo "Hint: ensure frontendDist points to ../ui/dist and UI build passes."
  exit 1
fi

if ! find_text "\"devtools\"[[:space:]]*:[[:space:]]*false" src-tauri/tauri.conf.json; then
  echo "Release hardening check failed: src-tauri/tauri.conf.json must set devtools=false."
  exit 1
fi

if ! find_text "addEventListener\\('contextmenu'" ui/src/App.tsx; then
  echo "Release hardening check failed: ui/src/App.tsx must block context menu in production."
  exit 1
fi

if ! find_text "F12|shiftKey.*\\(key === 'i' \\|\\| key === 'j' \\|\\| key === 'c'\\)" ui/src/App.tsx; then
  echo "Release hardening check failed: ui/src/App.tsx must block DevTools hotkeys in production."
  exit 1
fi

echo "preflight ok: ui/dist is ready"
