#!/usr/bin/env python3
import json
import os
import struct
import sys
import urllib.error
import urllib.request
from pathlib import Path

HOST_NAME = "com.lc5900.flamingo.bridge"
DEFAULT_ENDPOINT = "http://127.0.0.1:16789/add"


def stderr(msg: str) -> None:
    sys.stderr.write(f"[flamingo-native-host] {msg}\n")
    sys.stderr.flush()


def get_config_path() -> Path:
    if sys.platform == "win32":
        appdata = os.environ.get("APPDATA") or str(Path.home() / "AppData" / "Roaming")
        return Path(appdata) / "Flamingo Downloader" / "native-host.json"
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "Flamingo Downloader" / "native-host.json"
    return Path.home() / ".config" / "flamingo-downloader" / "native-host.json"


def read_config() -> dict:
    cfg = {
        "endpoint": os.environ.get("FLAMINGO_BRIDGE_ENDPOINT", DEFAULT_ENDPOINT),
        "token": os.environ.get("FLAMINGO_BRIDGE_TOKEN", ""),
    }
    path = get_config_path()
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                endpoint = str(data.get("endpoint") or "").strip()
                token = str(data.get("token") or "").strip()
                if endpoint:
                    cfg["endpoint"] = endpoint
                if token:
                    cfg["token"] = token
        except Exception as exc:
            stderr(f"failed to parse config {path}: {exc}")
    return cfg


def read_native_message() -> dict:
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) == 0:
        raise EOFError
    if len(raw_length) < 4:
        raise ValueError("invalid message length")
    message_length = struct.unpack("<I", raw_length)[0]
    if message_length <= 0 or message_length > 10 * 1024 * 1024:
        raise ValueError("native message too large")
    message_bytes = sys.stdin.buffer.read(message_length)
    if len(message_bytes) < message_length:
        raise ValueError("message body truncated")
    payload = json.loads(message_bytes.decode("utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("message payload must be object")
    return payload


def write_native_message(payload: dict) -> None:
    encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def post_download(cfg: dict, payload: dict) -> dict:
    endpoint = str(cfg.get("endpoint") or DEFAULT_ENDPOINT).strip()
    token = str(cfg.get("token") or "").strip()
    url = str(payload.get("url") or "").strip()
    save_dir = payload.get("save_dir")

    if not url:
        return {"ok": False, "error": "url is required"}
    if not token:
        return {"ok": False, "error": "bridge token missing in native-host config"}

    body = {"url": url}
    if isinstance(save_dir, str) and save_dir.strip():
        body["save_dir"] = save_dir.strip()

    req = urllib.request.Request(
        endpoint,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-Token": token,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            text = resp.read().decode("utf-8", errors="replace")
            try:
                parsed = json.loads(text) if text else {}
                if isinstance(parsed, dict):
                    return parsed
                return {"ok": True}
            except json.JSONDecodeError:
                return {"ok": resp.status < 400, "status": resp.status, "raw": text[:500]}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        return {
            "ok": False,
            "error": f"bridge request failed: {exc.code}",
            "detail": detail[:500],
        }
    except Exception as exc:
        return {"ok": False, "error": f"bridge request failed: {exc}"}


def main() -> int:
    cfg = read_config()
    while True:
        try:
            message = read_native_message()
        except EOFError:
            return 0
        except Exception as exc:
            write_native_message({"ok": False, "error": str(exc)})
            continue

        action = str(message.get("action") or "").strip().lower()
        if action == "ping":
            write_native_message({"ok": True, "host": HOST_NAME})
            continue

        result = post_download(cfg, message)
        write_native_message(result)


if __name__ == "__main__":
    raise SystemExit(main())
