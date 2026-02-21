Param(
  [ValidateSet("build-ui", "check-only")]
  [string]$Mode = "build-ui"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (!(Test-Path "ui/package.json")) {
  throw "Missing ui/package.json"
}

if (!(Test-Path "src-tauri/tauri.conf.json")) {
  throw "Missing src-tauri/tauri.conf.json"
}

if ($Mode -eq "build-ui") {
  npm --prefix ui run build
}

if (!(Test-Path "ui/dist") -or !(Test-Path "ui/dist/index.html")) {
  throw "Missing ui/dist build output. Ensure frontendDist=../ui/dist and UI build passes."
}

if (!(Select-String -Path "src-tauri/tauri.conf.json" -Pattern '"devtools"\s*:\s*false' -Quiet)) {
  throw "Release hardening check failed: src-tauri/tauri.conf.json must set devtools=false."
}

if (!(Select-String -Path "ui/src/App.tsx" -Pattern "addEventListener\('contextmenu'" -Quiet)) {
  throw "Release hardening check failed: ui/src/App.tsx must block context menu in production."
}

if (!(Select-String -Path "ui/src/App.tsx" -Pattern "F12|shiftKey.*\(key === 'i' \|\| key === 'j' \|\| key === 'c'\)" -Quiet)) {
  throw "Release hardening check failed: ui/src/App.tsx must block DevTools hotkeys in production."
}

Write-Host "preflight ok: ui/dist is ready"
