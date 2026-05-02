param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateSet("list", "stats", "health", "add", "pause", "resume", "retry", "remove", "status")]
  [string]$Action,

  [Parameter(Position = 1)]
  [string]$Value,

  [string]$Endpoint = "http://127.0.0.1:16789/api",
  [string]$Token,
  [switch]$DeleteFiles
)

function Resolve-Token {
  param([string]$Current)
  if ($Current) { return $Current }
  if ($env:FLAMINGO_TOKEN) { return $env:FLAMINGO_TOKEN }
  throw "Missing token. Pass -Token or set FLAMINGO_TOKEN."
}

function Invoke-FlamingoApi {
  param(
    [string]$Method,
    [string]$Path,
    [object]$Body = $null
  )

  $headers = @{ "X-Token" = (Resolve-Token $Token) }
  $uri = "$Endpoint$Path"
  if ($null -eq $Body) {
    return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers
  }
  return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 8)
}

switch ($Action) {
  "health" {
    Invoke-FlamingoApi -Method GET -Path "/health" | ConvertTo-Json -Depth 8
  }
  "stats" {
    Invoke-FlamingoApi -Method GET -Path "/stats" | ConvertTo-Json -Depth 8
  }
  "list" {
    Invoke-FlamingoApi -Method GET -Path "/tasks" | ConvertTo-Json -Depth 8
  }
  "status" {
    if (-not $Value) { throw "status requires a task id" }
    Invoke-FlamingoApi -Method GET -Path "/tasks/$Value" | ConvertTo-Json -Depth 8
  }
  "add" {
    if (-not $Value) { throw "add requires a URL or magnet" }
    $payload = if ($Value.StartsWith("magnet:?")) {
      @{ magnet = $Value }
    } else {
      @{ url = $Value }
    }
    Invoke-FlamingoApi -Method POST -Path "/tasks" -Body $payload | ConvertTo-Json -Depth 8
  }
  "pause" {
    if (-not $Value) { throw "pause requires a task id" }
    Invoke-FlamingoApi -Method POST -Path "/tasks/$Value/actions" -Body @{ action = "pause" } | ConvertTo-Json -Depth 8
  }
  "resume" {
    if (-not $Value) { throw "resume requires a task id" }
    Invoke-FlamingoApi -Method POST -Path "/tasks/$Value/actions" -Body @{ action = "resume" } | ConvertTo-Json -Depth 8
  }
  "retry" {
    if (-not $Value) { throw "retry requires a task id" }
    Invoke-FlamingoApi -Method POST -Path "/tasks/$Value/actions" -Body @{ action = "retry" } | ConvertTo-Json -Depth 8
  }
  "remove" {
    if (-not $Value) { throw "remove requires a task id" }
    Invoke-FlamingoApi -Method POST -Path "/tasks/$Value/actions" -Body @{ action = "remove"; delete_files = [bool]$DeleteFiles } | ConvertTo-Json -Depth 8
  }
}
