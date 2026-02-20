# Native Messaging Host Installer

This folder provides a native messaging host bridge so the browser extension can send download requests to Flamingo without exposing an HTTP bridge port publicly.

Host name:
- `com.lc5900.flamingo.bridge`

## Prerequisites

- Flamingo app running locally.
- Python 3 installed and available in `PATH`.
- Extension installed in browser.
- Extension ID known (Chromium family) and addon ID known (Firefox; optional with default value).

## What gets installed

- Native host manifests for Chrome/Chromium/Edge and Firefox.
- A small host program (`flamingo_native_host.py`) registered by manifest.
- Config file containing Flamingo bridge endpoint/token.

Config files:
- macOS: `~/Library/Application Support/Flamingo Downloader/native-host.json`
- Linux: `~/.config/flamingo-downloader/native-host.json`
- Windows: `%APPDATA%\\Flamingo Downloader\\native-host.json`

## Install

### macOS

```bash
cd browser-extension/native-host
./install-host-macos.sh <chromium_extension_id> [firefox_extension_id] [endpoint] [token]
```

Example:

```bash
./install-host-macos.sh abcdefghijklmnopabcdefghijklmnop flamingo-downloader@lc5900 http://127.0.0.1:16789/add YOUR_TOKEN
```

### Linux

```bash
cd browser-extension/native-host
./install-host-linux.sh <chromium_extension_id> [firefox_extension_id] [endpoint] [token]
```

### Windows (PowerShell)

```powershell
cd browser-extension\native-host
.\install-host-windows.ps1 -ChromiumExtensionId <extension_id> -FirefoxExtensionId flamingo-downloader@lc5900 -Endpoint http://127.0.0.1:16789/add -Token YOUR_TOKEN
```

## Enable extension native mode

In extension options:
- Enable Flamingo bridge: ON
- Use native messaging: ON
- Native host: `com.lc5900.flamingo.bridge`
- Auto-intercept: optional

## Verify

1. Open extension options and click refresh status.
2. Trigger context menu: `Download with Flamingo` on a link.
3. Confirm task appears in Flamingo.

If failed, check:
- Host manifest path and extension ID/addon ID are correct.
- Token in `native-host.json` matches Flamingo settings.
- Python 3 is available from shell for your browser user session.
