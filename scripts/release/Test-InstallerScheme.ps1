<#
.SYNOPSIS
    Wave 12 U1 (docs/plans/W12_RELEASE_ASSETS_PLAN.md, contract 2) -- moved verbatim (not loosened)
    from the wave 10 dry-run workflow step "Check rendered NSIS script for self-registered scheme"
    in .github/workflows/release-dryrun.yml, so release.yml and the dry run both run the exact same
    fail-closed check.

    Finds every rendered `installer.nsi` under -SearchRoot. If none is found, the check would verify
    nothing, so it fails closed rather than silently passing. If any is found containing
    `Classes\lalin-cast` (case-insensitive), it fails: Lalin Cast registers its `lalin-cast://` scheme
    only at runtime, opt-in, via HKCU (see docs/plans/W7_DEEPLINK_PLAN.md) -- never from the installer.

.PARAMETER SearchRoot
    Directory to search recursively for installer.nsi, e.g. src-tauri/target.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$SearchRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $SearchRoot)) {
    throw "SearchRoot not found: '$SearchRoot' -- point -SearchRoot at the build output directory (e.g. src-tauri/target) after building the NSIS bundle."
}

$nsiFiles = @(Get-ChildItem -Path $SearchRoot -Recurse -Filter 'installer.nsi' -ErrorAction SilentlyContinue)
if (-not $nsiFiles -or $nsiFiles.Count -eq 0) {
    throw "No installer.nsi found under '$SearchRoot' -- the bundle step did not produce an NSIS script, so this check would verify nothing. Failing closed; build the NSIS bundle (tauri build with the nsis target) before running this check."
}

Write-Host "Found $($nsiFiles.Count) rendered installer.nsi file(s):"
$nsiFiles | ForEach-Object { Write-Host " - $($_.FullName)" }

$schemeHits = @()
foreach ($f in $nsiFiles) {
    $content = Get-Content -Raw -LiteralPath $f.FullName
    if ($content -match [regex]::Escape('Classes\lalin-cast')) {
        $schemeHits += $f.FullName
    }
}

if ($schemeHits.Count -gt 0) {
    Write-Host "The following installer.nsi file(s) contain 'Classes\lalin-cast':"
    $schemeHits | ForEach-Object { Write-Host " - $_" }
    throw "installer.nsi references Classes\lalin-cast -- the installer must never self-register the lalin-cast:// URL scheme (see docs/plans/W7_DEEPLINK_PLAN.md). Remove any installer-side registry write for that key and rebuild."
}

Write-Host "OK: no installer.nsi references Classes\lalin-cast -- the installer does not self-register the scheme."

if ($env:GITHUB_OUTPUT) {
    Add-Content -Path $env:GITHUB_OUTPUT -Value "result=pass"
}
