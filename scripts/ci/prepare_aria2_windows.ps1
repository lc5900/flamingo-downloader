Param(
  [string]$BinaryPath = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot | Split-Path -Parent
$Aria2BinDir = Join-Path $Root "aria2/bin"
$TauriResourceAria2Dir = Join-Path $Root "src-tauri/resources/aria2/bin"

if ([string]::IsNullOrWhiteSpace($BinaryPath)) {
  $cmd = Get-Command aria2c.exe -ErrorAction SilentlyContinue
  if ($null -eq $cmd) {
    throw "aria2c.exe not found. Install aria2 first."
  }
  $BinaryPath = $cmd.Source
}

if (!(Test-Path $BinaryPath)) {
  throw "aria2 binary path does not exist: $BinaryPath"
}

$WindowsDir = Join-Path $Aria2BinDir "windows"
New-Item -ItemType Directory -Path $WindowsDir -Force | Out-Null
$WindowsResourceDir = Join-Path $TauriResourceAria2Dir "windows"
New-Item -ItemType Directory -Path $WindowsResourceDir -Force | Out-Null

Copy-Item -Path $BinaryPath -Destination (Join-Path $WindowsDir "aria2c.exe") -Force
Copy-Item -Path $BinaryPath -Destination (Join-Path $Aria2BinDir "aria2c.exe") -Force
Copy-Item -Path $BinaryPath -Destination (Join-Path $WindowsResourceDir "aria2c.exe") -Force
Copy-Item -Path $BinaryPath -Destination (Join-Path $TauriResourceAria2Dir "aria2c.exe") -Force

Write-Host "Staged aria2 binary:"
Write-Host "  - $WindowsDir/aria2c.exe"
Write-Host "  - $Aria2BinDir/aria2c.exe"
Write-Host "  - $WindowsResourceDir/aria2c.exe"
Write-Host "  - $TauriResourceAria2Dir/aria2c.exe"

& (Join-Path $Aria2BinDir "aria2c.exe") --version | Select-Object -First 1
