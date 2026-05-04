# Start Wagtail from the repo (correct templates + static) on port 8765 by default.
# Usage: .\scripts\run-wigtail-dev.ps1  [port]
$ErrorActionPreference = "Stop"
$port = if ($args[0]) { $args[0] } else { "8765" }
$portNum = 0
if (-not [int]::TryParse("$port", [ref]$portNum)) {
    throw "Invalid port: $port"
}
$busy = Get-NetTCPConnection -LocalPort $portNum -State Listen -ErrorAction SilentlyContinue
if ($busy) {
    $pids = ($busy | Select-Object -ExpandProperty OwningProcess -Unique) -join ", "
    throw @"
Port $port is already in use (listening PID(s): $pids).
Usually this is a stale `manage.py runserver` from another folder. Stop those processes, or start on a free port, for example:
  .\scripts\run-wigtail-dev.ps1 18765
"@
}
$root = Split-Path $PSScriptRoot -Parent
$wigtail = Join-Path $root "wigtail"
if (-not (Test-Path (Join-Path $wigtail "manage.py"))) {
    Write-Error "Expected wigtail/manage.py under repo root: $wigtail"
}
Set-Location $wigtail
$env:DJANGO_SETTINGS_MODULE = "mysite.settings.dev"
Write-Host "Starting Django at http://127.0.0.1:$port/ (cwd: $wigtail)"
python manage.py runserver "127.0.0.1:$port"
