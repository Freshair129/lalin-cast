<#
.SYNOPSIS
    Wave 12 U1 (docs/plans/W12_RELEASE_ASSETS_PLAN.md, contract 1) -- fails BEFORE any build if the
    tag being released does not match the app's own version, or if CHANGELOG.md has no populated
    section for that version. This is the guard that was missing from release.yml: tauri-action's
    `tagName: v__VERSION__` derives the release name from the app version at build time, so a tag
    that does not match it silently produces a draft release with the wrong name and a `latest.json`
    that lies about what version shipped.

.EVIDENCE
    Precedence of tauri.conf.json's `version` over Cargo.toml's `[package].version`, confirmed from
    tauri-utils 2.9.3's own source (the crate actually compiled by tauri 2.11.5's `Config` type) in
    the local cargo registry:

      C:\Users\pc\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\tauri-utils-2.9.3\src\config.rs:3609-3626

    The `version` field's doc comment on the top-level `Config` struct reads verbatim:
      "App version. It is a semver version number or a path to a `package.json` file containing the
      `version` field.
      If removed the version number from `Cargo.toml` is used.
      It's recommended to manage the app versioning in the Tauri config."
    (config.rs:3609-3611, field declared `pub version: Option<String>` at config.rs:3626)

    This confirms: tauri.conf.json's `version`, when present, wins; when absent (as in this repo
    today -- `grep -n version src-tauri/tauri.conf.json` finds no top-level key), tauri falls back to
    `Cargo.toml`'s `[package].version`. This script mirrors that exact precedence, plus the documented
    "path to a package.json" form for completeness (not exercised by this repo, which has none).

.PARAMETER Tag
    The git tag being released, e.g. "v0.2.0" (in release.yml this is $env:GITHUB_REF_NAME).

.PARAMETER CargoToml
    Path to src-tauri/Cargo.toml.

.PARAMETER TauriConf
    Path to src-tauri/tauri.conf.json.

.PARAMETER Changelog
    Path to CHANGELOG.md.

.PARAMETER SkipChangelog
    Skips the CHANGELOG.md section check. Dry-run only (release-dryrun.yml has no real tag to check
    a CHANGELOG section against) -- release.yml must NEVER pass this switch.

.PARAMETER ResolveOnly
    Resolves the app version, prints it, writes `version=` to GITHUB_OUTPUT and stops, checking
    neither a tag nor CHANGELOG.md. The dry run uses this to build its simulated tag, so the
    version-precedence rule lives only in this script (wave 12 final gate).
#>
[CmdletBinding(DefaultParameterSetName = 'Check')]
param(
    [Parameter(Mandatory = $true, ParameterSetName = 'Check')]
    [string]$Tag,

    [Parameter(Mandatory = $true)]
    [string]$CargoToml,

    [Parameter(Mandatory = $true)]
    [string]$TauriConf,

    [Parameter(Mandatory = $true, ParameterSetName = 'Check')]
    [string]$Changelog,

    [Parameter(ParameterSetName = 'Check')]
    [switch]$SkipChangelog,

    [Parameter(Mandatory = $true, ParameterSetName = 'Resolve')]
    [switch]$ResolveOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $TauriConf -PathType Leaf)) {
    throw "TauriConf not found: '$TauriConf' -- pass the path to src-tauri/tauri.conf.json."
}
if (-not (Test-Path -LiteralPath $CargoToml -PathType Leaf)) {
    throw "CargoToml not found: '$CargoToml' -- pass the path to src-tauri/Cargo.toml."
}

# --- Resolve the app version: tauri.conf.json's `version` wins; Cargo.toml's [package].version is
#     the fallback. See .EVIDENCE above. ---
$confRaw = Get-Content -LiteralPath $TauriConf -Raw
try {
    $conf = $confRaw | ConvertFrom-Json
}
catch {
    throw "Failed to parse '$TauriConf' as JSON: $($_.Exception.Message) -- fix the JSON syntax."
}

$confVersion = $null
if ($conf.PSObject.Properties.Name -contains 'version') {
    $rawVersion = $conf.version
    if ($null -ne $rawVersion -and $rawVersion -is [string] -and $rawVersion.Trim() -ne '') {
        $confVersion = $rawVersion.Trim()
    }
}

if ($confVersion -and $confVersion -like '*.json') {
    # Documented alternate form: a path to a package.json containing the version field, resolved
    # relative to tauri.conf.json's own directory.
    $pkgJsonPath = Join-Path (Split-Path -Parent $TauriConf) $confVersion
    if (-not (Test-Path -LiteralPath $pkgJsonPath -PathType Leaf)) {
        throw "tauri.conf.json's 'version' points to '$confVersion' but '$pkgJsonPath' was not found -- fix the path, or set 'version' to a literal semver string."
    }
    try {
        $pkgJson = Get-Content -LiteralPath $pkgJsonPath -Raw | ConvertFrom-Json
    }
    catch {
        throw "Failed to parse '$pkgJsonPath' as JSON: $($_.Exception.Message)"
    }
    if (-not ($pkgJson.PSObject.Properties.Name -contains 'version') -or [string]::IsNullOrWhiteSpace([string]$pkgJson.version)) {
        throw "'$pkgJsonPath' has no non-empty 'version' field -- required because tauri.conf.json's 'version' points to it."
    }
    $confVersion = [string]$pkgJson.version
}

$appVersion = $confVersion
if (-not $appVersion) {
    $cargoLines = Get-Content -LiteralPath $CargoToml
    $inPackageSection = $false
    $cargoVersion = $null
    foreach ($line in $cargoLines) {
        $trimmed = $line.Trim()
        if ($trimmed -match '^\[(.+)\]$') {
            $inPackageSection = ($matches[1].Trim() -eq 'package')
            continue
        }
        if ($inPackageSection -and $trimmed -match '^version\s*=\s*"([^"]+)"') {
            $cargoVersion = $matches[1]
            break
        }
    }
    if (-not $cargoVersion) {
        throw "No 'version' found in the [package] section of '$CargoToml', and tauri.conf.json has no 'version' either -- set one of them to a semver string."
    }
    $appVersion = $cargoVersion
}

if ($ResolveOnly) {
    Write-Host "OK: app version is '$appVersion'"
    if ($env:GITHUB_OUTPUT) {
        Add-Content -Path $env:GITHUB_OUTPUT -Value "version=$appVersion"
    }
    return
}

# --- Tag must be exactly v<appVersion>. ---
$expectedTag = "v$appVersion"
if ($Tag -cne $expectedTag) {
    throw "Tag '$Tag' does not match the app version '$appVersion' (expected '$expectedTag') -- either the tag was pushed with the wrong version, or the app version was not bumped before tagging. Fix one of them: bump 'version' in src-tauri/tauri.conf.json (or src-tauri/Cargo.toml's [package].version) to match the tag, or re-tag with '$expectedTag'. See docs/runbooks/RELEASE_CHECKLIST.md."
}
Write-Host "OK: tag '$Tag' matches app version '$appVersion'"

# --- CHANGELOG.md must have a non-empty '## [<version>]' section, unless explicitly skipped. ---
if (-not $SkipChangelog) {
    if (-not (Test-Path -LiteralPath $Changelog -PathType Leaf)) {
        throw "Changelog not found: '$Changelog' -- pass the path to CHANGELOG.md, or use -SkipChangelog in a dry run only."
    }

    $lines = Get-Content -LiteralPath $Changelog
    $headerPattern = '^## \[' + [regex]::Escape($appVersion) + '\]'

    $startIndex = -1
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -cmatch $headerPattern) {
            $startIndex = $i
            break
        }
    }
    if ($startIndex -lt 0) {
        throw "CHANGELOG.md has no '## [$appVersion]' section -- add one describing this release (see the [Unreleased] entries to move) before tagging. See docs/runbooks/RELEASE_CHECKLIST.md."
    }

    $endIndex = $lines.Count
    for ($j = $startIndex + 1; $j -lt $lines.Count; $j++) {
        if ($lines[$j] -match '^## \[') {
            $endIndex = $j
            break
        }
    }

    $sectionLines = if ($endIndex -gt ($startIndex + 1)) { $lines[($startIndex + 1)..($endIndex - 1)] } else { @() }
    $sectionText = ($sectionLines -join "`n").Trim()
    if ([string]::IsNullOrWhiteSpace($sectionText)) {
        throw "CHANGELOG.md's '## [$appVersion]' section has no content -- add release notes under that heading before tagging. See docs/runbooks/RELEASE_CHECKLIST.md."
    }

    Write-Host "OK: CHANGELOG.md has a non-empty '## [$appVersion]' section"
}
else {
    Write-Host "OK: CHANGELOG.md check skipped (-SkipChangelog; dry run only, never use this in release.yml)"
}

if ($env:GITHUB_OUTPUT) {
    Add-Content -Path $env:GITHUB_OUTPUT -Value "version=$appVersion"
}
