# Flamingo Browser Bridge Extension (Dev)

This extension forwards browser downloads to Flamingo Downloader through a local HTTP bridge.

## 1) Start Flamingo

Run Flamingo first. In Settings, check:
- `Browser Bridge Enabled`
- `Browser Bridge Port` (default `16789`)
- `Browser Bridge Token`

## 2) Load extension (Chrome/Edge)

1. Open `chrome://extensions` (or `edge://extensions`)
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder: `browser-extension`

## 2.1) Load extension (Firefox)

1. In `browser-extension/`, temporarily replace manifest:
   - backup `manifest.json`
   - copy `manifest.firefox.json` to `manifest.json`
2. Open `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on...**
4. Select `browser-extension/manifest.json`
5. (Optional) restore Chromium manifest after testing:
   - move backup file back to `manifest.json`

## 3) Configure extension

Open extension options and set:
- Endpoint: `http://127.0.0.1:16789/add`
- Token: paste from Flamingo settings
- Enable takeover: on

## 4) Behavior

- Auto takeover: new browser downloads are sent to Flamingo and canceled in browser.
- Context menu: right click a link -> `Download with Flamingo`.

## Build notes

- Chromium uses `manifest.json` (MV3 service worker).
- Firefox uses `manifest.firefox.json` (MV2 background script).
- Keep both files in repo and select the target manifest before packaging.

## Request format

`POST /add` with headers:
- `Content-Type: application/json`
- `X-Token: <token>`

Body:
```json
{
  "url": "https://example.com/file.zip",
  "save_dir": "/optional/path"
}
```
