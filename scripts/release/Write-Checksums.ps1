<#
.SYNOPSIS
    Wave 12 U1 (docs/plans/W12_RELEASE_ASSETS_PLAN.md, contract 4) -- writes a SHA-256 checksum
    manifest in the same format `sha256sum` produces, so anyone can verify it with either
    `sha256sum -c` (WSL/Linux) or PowerShell's `Get-FileHash` (see docs/runbooks/RELEASE_CHECKLIST.md).

    Each line is `<lower-case hex sha256><two spaces><bare file name>` (no directory component),
    sorted by file name, and the file ends with a single trailing LF (no CRLF anywhere). Fails if any
    input file is missing, or if two input files share the same base name (the format has no room for
    a directory component to disambiguate them).

.PARAMETER Files
    One or more file paths to checksum.

.PARAMETER OutputPath
    Where to write the checksum manifest, e.g. Lalin-Cast_<Version>_<Arch>_SHA256SUMS.txt.

.PARAMETER GitHubAssetNames
    Records each file under the name GitHub gives it as a release asset instead of its local name:
    every space becomes a dot (the NSIS installer is built as `Lalin Cast_<v>_<arch>-setup.exe`
    and published as `Lalin.Cast_<v>_<arch>-setup.exe`). Any other character outside
    [A-Za-z0-9._+-] fails instead of being guessed, so the manifest never names an asset that
    does not exist. Added at the wave 12 final gate so `sha256sum -c` works on downloaded assets.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string[]]$Files,

    [Parameter(Mandatory = $true)]
    [string]$OutputPath,

    [switch]$GitHubAssetNames
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $Files -or $Files.Count -eq 0) {
    throw "No -Files were given -- pass at least one file path to checksum."
}

$resolved = @()
foreach ($f in $Files) {
    if (-not (Test-Path -LiteralPath $f -PathType Leaf)) {
        throw "File not found: '$f' -- every -Files entry must exist before checksums can be written."
    }
    $resolved += Get-Item -LiteralPath $f
}

function Get-RecordedName([string]$localName) {
    if (-not $GitHubAssetNames) {
        return $localName
    }
    $assetName = $localName.Replace(' ', '.')
    if ($assetName -notmatch '^[A-Za-z0-9._+-]+$') {
        throw "'$localName' contains characters whose GitHub asset name cannot be predicted -- rename the file to use only letters, digits, '.', '_', '+', '-' or spaces."
    }
    return $assetName
}

$names = @($resolved | ForEach-Object { Get-RecordedName $_.Name })
$dupeGroups = $names | Group-Object | Where-Object { $_.Count -gt 1 }
if ($dupeGroups) {
    $dupeNames = ($dupeGroups | ForEach-Object { $_.Name }) -join ', '
    throw "Duplicate file name(s) among -Files: $dupeNames -- the checksum manifest records bare file names only, so every input must have a unique base name. Rename or drop the duplicate(s)."
}

$sorted = @($resolved | Sort-Object -Property { Get-RecordedName $_.Name })

$lines = foreach ($item in $sorted) {
    $hash = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    "$hash  $(Get-RecordedName $item.Name)"
}

$content = ($lines -join "`n") + "`n"

$outDir = Split-Path -Parent $OutputPath
if ($outDir -and -not (Test-Path -LiteralPath $outDir)) {
    New-Item -ItemType Directory -Force -Path $outDir | Out-Null
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($OutputPath, $content, $utf8NoBom)

Write-Host "OK: wrote $($sorted.Count) checksum(s) to $OutputPath"

if ($env:GITHUB_OUTPUT) {
    Add-Content -Path $env:GITHUB_OUTPUT -Value "path=$OutputPath"
}
