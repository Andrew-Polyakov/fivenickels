# Runs StockCrawler and Wagtail Alpaca ingest with separate log files under .cache/logs/
# Usage: from repository root,  pwsh -File scripts/log-alpaca-tools.ps1
# Requires: .apca or .env in repo root (or APCA_* in environment) like StockCrawler.

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ts = Get-Date -Format "yyyy-MM-dd_HHmmss"
$logDir = Join-Path $repo ".cache\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$sc = Join-Path $logDir "stockcrawler-$ts.log"
"=== StockCrawler | $ts ===" | Set-Content -Encoding utf8 $sc
Push-Location $repo
try {
    dotnet run --project (Join-Path $repo "tools\StockCrawler\StockCrawler.csproj") -- TSM SNDK ASML NVDA 2>&1 | Tee-Object -FilePath $sc -Append
    "=== exit $LASTEXITCODE ===" | Add-Content -Encoding utf8 $sc
} finally {
    Pop-Location
}

$wg = Join-Path $logDir "wagtail-ingest-$ts.log"
"=== Wagtail ingest_alpaca_news dry-run | $ts ===" | Set-Content -Encoding utf8 $wg
Push-Location (Join-Path $repo "wigtail")
try {
    python manage.py ingest_alpaca_news NVDA TSM --limit 5 --dry-run 2>&1 | Tee-Object -FilePath $wg -Append
    "=== exit $LASTEXITCODE ===" | Add-Content -Encoding utf8 $wg
} finally {
    Pop-Location
}

Write-Host "StockCrawler log: $sc"
Write-Host "Wagtail log:      $wg"
