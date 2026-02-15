#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ARIA2_BIN_DIR="${ROOT_DIR}/aria2/bin"

binary_path="${1:-}"
if [[ -z "${binary_path}" ]]; then
  binary_path="$(command -v aria2c || true)"
fi

if [[ -z "${binary_path}" || ! -f "${binary_path}" ]]; then
  echo "aria2c binary not found. Install aria2 first." >&2
  exit 1
fi

platform=""
case "$(uname -s)" in
  Linux*) platform="linux" ;;
  Darwin*) platform="macos" ;;
  *)
    echo "Unsupported unix platform: $(uname -s)" >&2
    exit 1
    ;;
esac

mkdir -p "${ARIA2_BIN_DIR}/${platform}"
cp "${binary_path}" "${ARIA2_BIN_DIR}/${platform}/aria2c"
cp "${binary_path}" "${ARIA2_BIN_DIR}/aria2c"
chmod +x "${ARIA2_BIN_DIR}/${platform}/aria2c" "${ARIA2_BIN_DIR}/aria2c"

echo "Staged aria2 binary:"
echo "  - ${ARIA2_BIN_DIR}/${platform}/aria2c"
echo "  - ${ARIA2_BIN_DIR}/aria2c"
"${ARIA2_BIN_DIR}/aria2c" --version | head -n 1
