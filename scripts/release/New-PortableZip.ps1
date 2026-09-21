<#
.SYNOPSIS
    Wave 12 U1 (docs/plans/W12_RELEASE_ASSETS_PLAN.md, contract 3) -- builds the portable zip that
    wave 11 built inline in release-dryrun.yml (x64 only), now shared so both architectures in the
    dry run and release.yml build it the same way.

    Zip contents match packaging/portable/README-PORTABLE.txt's own description: the exe, an empty
    `lalin-cast.portable` marker (contents never read -- only its presence beside the exe matters,
    see docs/plans/W11_PORTABLE_PLAN.md contract 1), and the README itself. After creation the zip is
    re-opened and its entries are verified against the expected set -- never trust
    Compress-Archive's exit code alone.

.PARAMETER ExePath
    Path to the built release exe, e.g. target/<triple>/release/lalin-cast.exe.

.PARAMETER ReadmePath
    Path to packaging/portable/README-PORTABLE.txt.

.PARAMETER OutputDir
    Directory the zip is written into (created if missing).

.PARAMETER Version
    App version string, e.g. "0.2.0".

.PARAMETER Arch
    "x64" or "arm64".

.OUTPUTS
    The full path to the created zip (also written to $env:GITHUB_OUTPUT as `path=` when set).
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ExePath,

    [Parameter(Mandatory = $true)]
    [string]$ReadmePath,

    [Parameter(Mandatory = $true)]
    [string]$OutputDir,

    [Parameter(Mandatory = $true)]
    [string]$Version,

    [Parameter(Mandatory = $true)]
    [ValidateSet('x64', 'arm64')]
    [string]$Arch
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $ExePath -PathType Leaf)) {
    throw "ExePath not found: '$ExePath' -- build the release exe for this target before creating the portable zip."
}
if (-not (Test-Path -LiteralPath $ReadmePath -PathType Leaf)) {
    throw "ReadmePath not found: '$ReadmePath' -- packaging/portable/README-PORTABLE.txt must exist before creating the portable zip."
}

if (-not (Test-Path -LiteralPath $OutputDir)) {
    New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
}
$resolvedOutputDir = (Resolve-Path -LiteralPath $OutputDir).ProviderPath

$zipName = "Lalin-Cast_${Version}_${Arch}_portable.zip"
$zipPath = Join-Path $resolvedOutputDir $zipName

$stagingDir = Join-Path ([System.IO.Path]::GetTempPath()) ("lalin-cast-portable-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $stagingDir | Out-Null

try {
    Copy-Item -LiteralPath $ExePath -Destination (Join-Path $stagingDir 'lalin-cast.exe') -Force
    New-Item -ItemType File -Force -Path (Join-Path $stagingDir 'lalin-cast.portable') | Out-Null
    Copy-Item -LiteralPath $ReadmePath -Destination (Join-Path $stagingDir 'README-PORTABLE.txt') -Force

    if (Test-Path -LiteralPath $zipPath) {
        Remove-Item -LiteralPath $zipPath -Force
    }
    Compress-Archive -Path (Join-Path $stagingDir '*') -DestinationPath $zipPath

    # Re-open the zip we just wrote and verify it has exactly the three expected root entries.
    Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction SilentlyContinue
    $expectedEntries = @('lalin-cast.exe', 'lalin-cast.portable', 'README-PORTABLE.txt')
    $zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
    try {
        $actualEntries = @($zip.Entries | ForEach-Object { $_.FullName })
    }
    finally {
        $zip.Dispose()
    }

    $actualSorted = @($actualEntries | Sort-Object)
    $expectedSorted = @($expectedEntries | Sort-Object)
    $diff = @(Compare-Object -ReferenceObject $expectedSorted -DifferenceObject $actualSorted)
    if ($diff.Count -ne 0) {
        throw "Verification failed: '$zipPath' contains [$($actualSorted -join ', ')] but expected exactly [$($expectedSorted -join ', ')] -- the zip was built incorrectly. Delete it and re-run."
    }

    Write-Host "OK: $zipPath contains exactly the three expected root entries"

    if ($env:GITHUB_OUTPUT) {
        Add-Content -Path $env:GITHUB_OUTPUT -Value "path=$zipPath"
    }

    return $zipPath
}
finally {
    Remove-Item -LiteralPath $stagingDir -Recurse -Force -ErrorAction SilentlyContinue
}
