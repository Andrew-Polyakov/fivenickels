# Fetch homepage and verify FT-style site chrome is present (not legacy sector-nav layout).
# Usage: .\scripts\validate-wigtail-header.ps1 [-Url http://127.0.0.1:8765/]
param(
    [string]$Url = "http://127.0.0.1:8765/"
)
$ErrorActionPreference = "Stop"
$r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 15
$html = $r.Content
$ok = $true
$checks = @(
    @{ Name = "HTTP 200"; Pass = ($r.StatusCode -eq 200) },
    @{ Name = "site-header chrome"; Pass = ($html -match 'class="site-header"') },
    @{ Name = "data-site-header marker"; Pass = ($html -match 'data-site-header') },
    @{ Name = "ticker strip"; Pass = ($html -match 'site-header__ticker') },
    @{ Name = "main bar"; Pass = ($html -match 'site-header__main') },
    @{ Name = "section strip"; Pass = ($html -match 'site-header__sectors') },
    @{ Name = "no legacy sector-nav pills"; Pass = ($html -notmatch 'sector-nav__btn') },
    @{ Name = "no legacy floating site-logo"; Pass = ($html -notmatch 'class="site-logo"') },
    @{ Name = "Roboto font link"; Pass = ($html -match 'fonts\.googleapis\.com/css2\?family=Roboto') },
    @{ Name = "Material Symbols font"; Pass = ($html -match 'Material\+Symbols\+Outlined') },
    @{ Name = "favicon link"; Pass = ($html -match 'rel="icon"') }
)
foreach ($c in $checks) {
    $sym = if ($c.Pass) { "[ok]" } else { "[FAIL]" }
    Write-Host "$sym $($c.Name)"
    if (-not $c.Pass) { $ok = $false }
}
if (-not $ok) {
    Write-Host "`nFirst 2000 chars of response:`n"
    Write-Host $html.Substring(0, [Math]::Min(2000, $html.Length))
    Write-Host @"

Tip: If you see legacy markup (site-logo, sector-nav__btn), the URL is probably not this repo's runserver.
Free the port or run: .\scripts\run-wigtail-dev.ps1 18765
Then: .\scripts\validate-wigtail-header.ps1 -Url http://127.0.0.1:18765/
"@
    exit 1
}
Write-Host "`nAll header validation checks passed."
exit 0
