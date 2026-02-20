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

build_manifest() {
  local template="$1"
  local output="$2"
  local ext_id="$3"
  sed \
    -e "s|__HOST_PATH__|/usr/bin/env|g" \
    -e "s|\"type\": \"stdio\"|\"type\": \"stdio\",\n  \"args\": [\"python3\", \"${HOST_SCRIPT}\"]|" \
    -e "s|__EXTENSION_ID__|${ext_id}|g" \
    -e "s|__FIREFOX_EXTENSION_ID__|${ext_id}|g" \
    "$template" > "$output"
  echo "installed manifest -> ${output}"
}

for dir in \
  "${HOME}/.config/google-chrome/NativeMessagingHosts" \
  "${HOME}/.config/chromium/NativeMessagingHosts" \
  "${HOME}/.config/microsoft-edge/NativeMessagingHosts"; do
  mkdir -p "$dir"
  build_manifest \
    "${ROOT_DIR}/com.lc5900.flamingo.bridge.chrome.json.template" \
    "${dir}/com.lc5900.flamingo.bridge.json" \
    "${EXTENSION_ID}"
done

mkdir -p "${HOME}/.mozilla/native-messaging-hosts"
build_manifest \
  "${ROOT_DIR}/com.lc5900.flamingo.bridge.firefox.json.template" \
  "${HOME}/.mozilla/native-messaging-hosts/com.lc5900.flamingo.bridge.json" \
  "${FIREFOX_ID}"

CFG_DIR="${HOME}/.config/flamingo-downloader"
mkdir -p "${CFG_DIR}"
cat > "${CFG_DIR}/native-host.json" <<JSON
{
  "endpoint": "${ENDPOINT}",
  "token": "${TOKEN}"
}
JSON

echo "wrote native host config -> ${CFG_DIR}/native-host.json"
echo "Done. In extension options: enable Native Messaging and host 'com.lc5900.flamingo.bridge'."
