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

Write-Host "preflight ok: ui/dist is ready"
