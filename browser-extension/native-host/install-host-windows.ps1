param(
  [Parameter(Mandatory = $true)] [string]$ChromiumExtensionId,
  [string]$FirefoxExtensionId = "flamingo-downloader@lc5900",
  [string]$Endpoint = "http://127.0.0.1:16789/add",
  [string]$Token = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$hostScript = Join-Path $root "flamingo_native_host.py"
$manifestDir = Join-Path $env:LOCALAPPDATA "Flamingo Downloader\native-host"
New-Item -ItemType Directory -Force -Path $manifestDir | Out-Null

function Write-Manifest {
  param(
    [string]$Template,
    [string]$Output,
    [string]$ExtensionId
  )
  $content = Get-Content -Path $Template -Raw
  $content = $content.Replace('__HOST_PATH__', 'python')
  $content = $content.Replace('"type": "stdio"', ('"type": "stdio",' + "`n" + '  "args": ["' + $hostScript.Replace('\\', '\\\\') + '"]'))
  $content = $content.Replace('__EXTENSION_ID__', $ExtensionId)
  $content = $content.Replace('__FIREFOX_EXTENSION_ID__', $ExtensionId)
  Set-Content -Path $Output -Value $content -Encoding UTF8
}

$chromeManifest = Join-Path $manifestDir "com.lc5900.flamingo.bridge.chrome.json"
$firefoxManifest = Join-Path $manifestDir "com.lc5900.flamingo.bridge.firefox.json"
Write-Manifest -Template (Join-Path $root "com.lc5900.flamingo.bridge.chrome.json.template") -Output $chromeManifest -ExtensionId $ChromiumExtensionId
Write-Manifest -Template (Join-Path $root "com.lc5900.flamingo.bridge.firefox.json.template") -Output $firefoxManifest -ExtensionId $FirefoxExtensionId

New-Item -Path "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.lc5900.flamingo.bridge" -Force | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.lc5900.flamingo.bridge" -Name "(Default)" -Value $chromeManifest
New-Item -Path "HKCU:\Software\Chromium\NativeMessagingHosts\com.lc5900.flamingo.bridge" -Force | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Chromium\NativeMessagingHosts\com.lc5900.flamingo.bridge" -Name "(Default)" -Value $chromeManifest
New-Item -Path "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.lc5900.flamingo.bridge" -Force | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.lc5900.flamingo.bridge" -Name "(Default)" -Value $chromeManifest
New-Item -Path "HKCU:\Software\Mozilla\NativeMessagingHosts\com.lc5900.flamingo.bridge" -Force | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Mozilla\NativeMessagingHosts\com.lc5900.flamingo.bridge" -Name "(Default)" -Value $firefoxManifest

$configDir = Join-Path $env:APPDATA "Flamingo Downloader"
New-Item -ItemType Directory -Force -Path $configDir | Out-Null
$configPath = Join-Path $configDir "native-host.json"
@{
  endpoint = $Endpoint
  token = $Token
} | ConvertTo-Json | Set-Content -Path $configPath -Encoding UTF8

Write-Host "wrote native host config -> $configPath"
Write-Host "Done. In extension options: enable Native Messaging and host 'com.lc5900.flamingo.bridge'."
