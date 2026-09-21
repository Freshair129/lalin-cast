<#
.SYNOPSIS
    Wave 12 U1 (docs/plans/W12_RELEASE_ASSETS_PLAN.md, contract 6) -- exercises every pass and fail
    case for the five scripts in this directory against the fixtures in scripts/release/fixtures/,
    using only throwaway temp files (never touching the real repo files or a real `gh`/network call).

    Exit 0 when every case behaves as expected (including every "must throw" case genuinely
    throwing). Exit 1 with a summary of what failed otherwise. CI runs this as a blocking job
    (ci.yml's `release-scripts` job) on every PR that touches scripts/release/**.
#>
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$fixtures = Join-Path $root 'fixtures'

$script:results = New-Object System.Collections.Generic.List[object]

function Invoke-SelfTestCase {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][scriptblock]$Body
    )
    try {
        & $Body
        $script:results.Add([pscustomobject]@{ Name = $Name; Passed = $true; Error = $null })
        Write-Host "PASS: $Name"
    }
    catch {
        $script:results.Add([pscustomobject]@{ Name = $Name; Passed = $false; Error = $_.Exception.Message })
        Write-Host "FAIL: $Name -- $($_.Exception.Message)"
    }
}

function Assert-Throws {
    param(
        [Parameter(Mandatory = $true)][scriptblock]$Body,
        [string]$Because = 'expected a throw but none occurred'
    )
    $threw = $false
    try {
        & $Body
    }
    catch {
        $threw = $true
    }
    if (-not $threw) {
        throw $Because
    }
}

$work = Join-Path ([System.IO.Path]::GetTempPath()) ("lalin-release-selftest-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $work | Out-Null

try {
    # ---------------------------------------------------------------------
    # Contract 1: Test-ReleaseVersion.ps1
    # ---------------------------------------------------------------------
    $scriptVersion = Join-Path $root 'Test-ReleaseVersion.ps1'
    $cargoToml = Join-Path $fixtures 'version/Cargo.toml'
    $tauriNoVersion = Join-Path $fixtures 'version/tauri.conf.no-version.json'
    $tauriWithVersion = Join-Path $fixtures 'version/tauri.conf.with-version.json'
    $changelogGood = Join-Path $fixtures 'version/CHANGELOG-good.md'
    $changelogMissing = Join-Path $fixtures 'version/CHANGELOG-missing.md'
    $changelogEmpty = Join-Path $fixtures 'version/CHANGELOG-empty-section.md'
    $tauriWithPrerelease = Join-Path $fixtures 'version/tauri.conf.with-prerelease.json'

    Invoke-SelfTestCase 'Test-ReleaseVersion: correct tag, version from Cargo.toml fallback (-SkipChangelog)' {
        & $scriptVersion -Tag 'v0.1.0' -CargoToml $cargoToml -TauriConf $tauriNoVersion -Changelog $changelogGood -SkipChangelog
    }

    Invoke-SelfTestCase 'Test-ReleaseVersion: wrong tag fails' {
        Assert-Throws { & $scriptVersion -Tag 'v9.9.9' -CargoToml $cargoToml -TauriConf $tauriNoVersion -Changelog $changelogGood -SkipChangelog }
    }

    Invoke-SelfTestCase 'Test-ReleaseVersion: tauri.conf.json version overrides Cargo.toml' {
        & $scriptVersion -Tag 'v0.2.0' -CargoToml $cargoToml -TauriConf $tauriWithVersion -Changelog $changelogGood -SkipChangelog
    }

    Invoke-SelfTestCase 'Test-ReleaseVersion: tag with wrong case in the leading "v" fails (case-sensitive compare)' {
        Assert-Throws { & $scriptVersion -Tag 'V0.1.0' -CargoToml $cargoToml -TauriConf $tauriNoVersion -Changelog $changelogGood -SkipChangelog }
    }

    Invoke-SelfTestCase 'Test-ReleaseVersion: tag whose prerelease differs only in letter case fails (case-sensitive compare)' {
        Assert-Throws { & $scriptVersion -Tag 'v0.2.0-RC.1' -CargoToml $cargoToml -TauriConf $tauriWithPrerelease -Changelog $changelogGood -SkipChangelog }
    }

    Invoke-SelfTestCase 'Test-ReleaseVersion: full check (no -SkipChangelog) passes with a filled CHANGELOG section' {
        & $scriptVersion -Tag 'v0.1.0' -CargoToml $cargoToml -TauriConf $tauriNoVersion -Changelog $changelogGood
    }

    Invoke-SelfTestCase 'Test-ReleaseVersion: missing CHANGELOG section fails' {
        Assert-Throws { & $scriptVersion -Tag 'v0.1.0' -CargoToml $cargoToml -TauriConf $tauriNoVersion -Changelog $changelogMissing }
    }

    Invoke-SelfTestCase 'Test-ReleaseVersion: empty CHANGELOG section fails' {
        Assert-Throws { & $scriptVersion -Tag 'v0.1.0' -CargoToml $cargoToml -TauriConf $tauriNoVersion -Changelog $changelogEmpty }
    }

    # ---------------------------------------------------------------------
    # Contract 2: Test-InstallerScheme.ps1
    # ---------------------------------------------------------------------
    $scriptScheme = Join-Path $root 'Test-InstallerScheme.ps1'
    $installerGood = Join-Path $fixtures 'installer/good'
    $installerBad = Join-Path $fixtures 'installer/bad'
    $installerEmptyDir = Join-Path $work 'installer-empty'
    New-Item -ItemType Directory -Force -Path $installerEmptyDir | Out-Null

    Invoke-SelfTestCase 'Test-InstallerScheme: clean installer.nsi passes' {
        & $scriptScheme -SearchRoot $installerGood
    }

    Invoke-SelfTestCase 'Test-InstallerScheme: installer.nsi with Classes\lalin-cast fails' {
        Assert-Throws { & $scriptScheme -SearchRoot $installerBad }
    }

    Invoke-SelfTestCase 'Test-InstallerScheme: no installer.nsi anywhere fails closed' {
        Assert-Throws { & $scriptScheme -SearchRoot $installerEmptyDir }
    }

    # ---------------------------------------------------------------------
    # Contract 3: New-PortableZip.ps1
    # ---------------------------------------------------------------------
    $scriptZip = Join-Path $root 'New-PortableZip.ps1'
    $exeFixture = Join-Path $fixtures 'portable/lalin-cast.exe'
    $readmeFixture = Join-Path $fixtures 'portable/README-PORTABLE.txt'
    $zipOutDir = Join-Path $work 'zip-out'

    Invoke-SelfTestCase 'New-PortableZip: builds a zip with exactly three entries' {
        $zipPath = & $scriptZip -ExePath $exeFixture -ReadmePath $readmeFixture -OutputDir $zipOutDir -Version '0.1.0' -Arch 'x64'
        if (-not (Test-Path -LiteralPath $zipPath)) {
            throw "zip was not created at reported path '$zipPath'"
        }
        $expectedName = 'Lalin-Cast_0.1.0_x64_portable.zip'
        $actualName = Split-Path -Leaf $zipPath
        if ($actualName -ne $expectedName) {
            throw "zip name '$actualName' does not match expected '$expectedName'"
        }
        Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction SilentlyContinue
        $zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
        try {
            $entries = @($zip.Entries | ForEach-Object { $_.FullName } | Sort-Object)
        }
        finally {
            $zip.Dispose()
        }
        $expected = @('README-PORTABLE.txt', 'lalin-cast.exe', 'lalin-cast.portable') | Sort-Object
        $diff = @(Compare-Object -ReferenceObject $expected -DifferenceObject $entries)
        if ($diff.Count -ne 0) {
            throw "zip entries [$($entries -join ', ')] do not match expected [$($expected -join ', ')]"
        }
    }

    Invoke-SelfTestCase 'New-PortableZip: missing exe fails' {
        Assert-Throws { & $scriptZip -ExePath (Join-Path $work 'does-not-exist.exe') -ReadmePath $readmeFixture -OutputDir $zipOutDir -Version '0.1.0' -Arch 'x64' }
    }

    # ---------------------------------------------------------------------
    # Contract 4: Write-Checksums.ps1
    # ---------------------------------------------------------------------
    $scriptChecksums = Join-Path $root 'Write-Checksums.ps1'
    $fileA = Join-Path $fixtures 'checksums/file-a.txt'
    $fileB = Join-Path $fixtures 'checksums/file-b.txt'
    $checksumOut = Join-Path $work 'SHA256SUMS.txt'

    Invoke-SelfTestCase 'Write-Checksums: matches independently computed hashes, sorted, LF-only' {
        & $scriptChecksums -Files @($fileA, $fileB) -OutputPath $checksumOut
        $bytes = [System.IO.File]::ReadAllBytes($checksumOut)
        $text = [System.Text.Encoding]::UTF8.GetString($bytes)
        if ($text.Contains("`r")) {
            throw "output contains CR -- must be LF-only"
        }
        if (-not $text.EndsWith("`n")) {
            throw "output does not end with a trailing LF"
        }
        $lines = $text.TrimEnd("`n") -split "`n"
        if ($lines.Count -ne 2) {
            throw "expected 2 lines, got $($lines.Count)"
        }
        $hashA = (Get-FileHash -LiteralPath $fileA -Algorithm SHA256).Hash.ToLowerInvariant()
        $hashB = (Get-FileHash -LiteralPath $fileB -Algorithm SHA256).Hash.ToLowerInvariant()
        $expectedLine0 = "$hashA  file-a.txt"
        $expectedLine1 = "$hashB  file-b.txt"
        if ($lines[0] -ne $expectedLine0 -or $lines[1] -ne $expectedLine1) {
            throw "checksum lines [$($lines -join ' | ')] did not match expected sha256sum-format output"
        }
    }

    Invoke-SelfTestCase 'Write-Checksums: missing file fails' {
        Assert-Throws { & $scriptChecksums -Files @($fileA, (Join-Path $work 'missing.txt')) -OutputPath $checksumOut }
    }

    Invoke-SelfTestCase 'Write-Checksums: duplicate file names fail' {
        $dupDir1 = Join-Path $work 'dup1'
        $dupDir2 = Join-Path $work 'dup2'
        New-Item -ItemType Directory -Force -Path $dupDir1 | Out-Null
        New-Item -ItemType Directory -Force -Path $dupDir2 | Out-Null
        Copy-Item -LiteralPath $fileA -Destination (Join-Path $dupDir1 'same-name.txt')
        Copy-Item -LiteralPath $fileB -Destination (Join-Path $dupDir2 'same-name.txt')
        Assert-Throws { & $scriptChecksums -Files @((Join-Path $dupDir1 'same-name.txt'), (Join-Path $dupDir2 'same-name.txt')) -OutputPath $checksumOut }
    }

    Invoke-SelfTestCase 'Write-Checksums: -GitHubAssetNames records spaces as dots' {
        $spaced = Join-Path $work 'Lalin Cast_0.2.0_x64-setup.exe'
        Copy-Item -LiteralPath $fileA -Destination $spaced
        & $scriptChecksums -Files @($spaced) -OutputPath $checksumOut -GitHubAssetNames
        $text = [System.IO.File]::ReadAllText($checksumOut)
        $expectedHash = (Get-FileHash -LiteralPath $spaced -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($text -ne "$expectedHash  Lalin.Cast_0.2.0_x64-setup.exe`n") {
            throw "unexpected manifest: $text"
        }
    }

    Invoke-SelfTestCase 'Write-Checksums: -GitHubAssetNames refuses an unpredictable name' {
        $odd = Join-Path $work 'odd#name.txt'
        Copy-Item -LiteralPath $fileA -Destination $odd
        Assert-Throws { & $scriptChecksums -Files @($odd) -OutputPath $checksumOut -GitHubAssetNames }
    }

    # ---------------------------------------------------------------------
    # Contract 5: Publish-ReleaseAssets.ps1
    # ---------------------------------------------------------------------
    $scriptPublish = Join-Path $root 'Publish-ReleaseAssets.ps1'
    $shimDir = Join-Path $work 'gh-shim'
    New-Item -ItemType Directory -Force -Path $shimDir | Out-Null
    $marker = Join-Path $work 'gh-called.marker'

    Invoke-SelfTestCase 'Publish-ReleaseAssets: -WhatIf lists files and never calls gh' {
        if (Test-Path -LiteralPath $marker) {
            Remove-Item -LiteralPath $marker -Force
        }
        # Shim 'gh' on PATH so that, if -WhatIf ever regresses into calling it, this test catches it
        # instead of silently passing (or hitting the network).
        $ghCmdContent = "@echo off`r`necho called > `"$marker`"`r`nexit /b 0`r`n"
        Set-Content -LiteralPath (Join-Path $shimDir 'gh.cmd') -Value $ghCmdContent -NoNewline
        $oldPath = $env:PATH
        $env:PATH = "$shimDir;$oldPath"
        try {
            & $scriptPublish -Tag 'v0.1.0' -Files @($fileA, $fileB) -WhatIf
        }
        finally {
            $env:PATH = $oldPath
        }
        if (Test-Path -LiteralPath $marker) {
            throw "the gh shim was invoked -- -WhatIf must never call gh"
        }
    }

    Invoke-SelfTestCase 'Publish-ReleaseAssets: missing file fails even under -WhatIf' {
        Assert-Throws { & $scriptPublish -Tag 'v0.1.0' -Files @($fileA, (Join-Path $work 'nope.txt')) -WhatIf }
    }
}
finally {
    Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}

$failed = @($script:results | Where-Object { -not $_.Passed })
Write-Host ""
Write-Host "===== scripts/release/selftest.ps1 summary ====="
Write-Host "Total: $($script:results.Count)  Passed: $($script:results.Count - $failed.Count)  Failed: $($failed.Count)"
if ($failed.Count -gt 0) {
    foreach ($f in $failed) {
        Write-Host "FAILED: $($f.Name) -- $($f.Error)"
    }
    exit 1
}
Write-Host "OK: all release-script self-tests passed"
exit 0
