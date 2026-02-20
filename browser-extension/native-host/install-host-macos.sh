#!/usr/bin/env bash
set -euo pipefail

EXTENSION_ID="${1:-}"
FIREFOX_ID="${2:-flamingo-downloader@lc5900}"
ENDPOINT="${3:-http://127.0.0.1:16789/add}"
TOKEN="${4:-}"

if [[ -z "${EXTENSION_ID}" ]]; then
  echo "Usage: $0 <chromium-extension-id> [firefox-extension-id] [endpoint] [token]" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_SCRIPT="${ROOT_DIR}/flamingo_native_host.py"
chmod +x "${HOST_SCRIPT}"

HOST_PATH="/usr/bin/env"
HOST_ARGS="python3 ${HOST_SCRIPT}"

build_manifest() {
  local template="$1"
  local output="$2"
  local browser_type="$3"
  local ext_id="$4"
  sed \
    -e "s|__HOST_PATH__|${HOST_PATH}|g" \
    -e "s|\"type\": \"stdio\"|\"type\": \"stdio\",\n  \"args\": [\"python3\", \"${HOST_SCRIPT}\"]|" \
    -e "s|__EXTENSION_ID__|${ext_id}|g" \
    -e "s|__FIREFOX_EXTENSION_ID__|${ext_id}|g" \
    "$template" > "$output"
  echo "installed ${browser_type} manifest -> ${output}"
}

install_chromium_manifest() {
  local dir="$1"
  mkdir -p "$dir"
  build_manifest \
    "${ROOT_DIR}/com.lc5900.flamingo.bridge.chrome.json.template" \
    "${dir}/com.lc5900.flamingo.bridge.json" \
    "$dir" \
    "${EXTENSION_ID}"
}

install_firefox_manifest() {
  local dir="$1"
  mkdir -p "$dir"
  build_manifest \
    "${ROOT_DIR}/com.lc5900.flamingo.bridge.firefox.json.template" \
    "${dir}/com.lc5900.flamingo.bridge.json" \
    "$dir" \
    "${FIREFOX_ID}"
}

install_chromium_manifest "${HOME}/Library/Application Support/Google/Chrome/NativeMessagingHosts"
install_chromium_manifest "${HOME}/Library/Application Support/Chromium/NativeMessagingHosts"
install_chromium_manifest "${HOME}/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
install_firefox_manifest "${HOME}/Library/Application Support/Mozilla/NativeMessagingHosts"

CFG_DIR="${HOME}/Library/Application Support/Flamingo Downloader"
mkdir -p "${CFG_DIR}"
cat > "${CFG_DIR}/native-host.json" <<JSON
{
  "endpoint": "${ENDPOINT}",
  "token": "${TOKEN}"
}
JSON

echo "wrote native host config -> ${CFG_DIR}/native-host.json"
echo "Done. In extension options: enable Native Messaging and host 'com.lc5900.flamingo.bridge'."
