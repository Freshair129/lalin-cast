<#
.SYNOPSIS
    Drives Lalin Cast's `--lifecycle launch|focus|close` CLI contract and
    polls the resulting `lifecycle.json` state file for the outcome.

.DESCRIPTION
    See docs/architecture/CAST_LAUNCHER_IPC.md for the full contract and
    scripts/README.md for usage. This script only starts `lalin-cast.exe`
    with fixed, whitelisted arguments and reads `lifecycle.json` — it never
    writes to that file or to any other file.

.PARAMETER Command
    Which lifecycle command to send: launch, focus, or close.

.PARAMETER RequestId
    The `--request-id` token to send. Must match `[A-Za-z0-9_.-]{1,64}`
    (the same character class `lalin-cast.exe` itself validates). Defaults
    to a freshly generated token so repeat runs never collide.

.PARAMETER ExePath
    Path to `lalin-cast.exe`. Required.

.PARAMETER TimeoutSeconds
    How long to poll `lifecycle.json` for a matching, terminal record
    before giving up. Defaults to 10.

.OUTPUTS
    Exit code 0 when the state file reaches `ready` or `stopped` for this
    request id, 1 when it reaches `failed`, 2 on timeout.

.EXAMPLE
    ./scripts/lifecycle-driver.ps1 -Command launch -ExePath "C:\Program Files\Lalin Cast\lalin-cast.exe"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("launch", "focus", "close")]
    [string]$Command,

    [Parameter(Mandatory = $false)]
    [ValidatePattern('^[A-Za-z0-9_.-]{1,64}$')]
    [string]$RequestId,

    [Parameter(Mandatory = $true)]
    [string]$ExePath,

    [Parameter(Mandatory = $false)]
    [int]$TimeoutSeconds = 10
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $ExePath)) {
    Write-Host "ExePath not found: $ExePath"
    exit 2
}

if (-not $RequestId) {
    # A short, unique token in the same character class lalin-cast.exe
    # validates ([A-Za-z0-9_.-]{1,64}) — no URL, cookie, or TV code ever
    # goes into this value.
    $RequestId = "driver-" + [Guid]::NewGuid().ToString("N").Substring(0, 12)
}

Write-Host "Lalin Cast lifecycle driver: sending '$Command' with request id '$RequestId'"

# Fixed, whitelisted argument list — nothing here is built from
# unvalidated input beyond the already-pattern-checked $RequestId.
$arguments = @("--lifecycle", $Command, "--request-id", $RequestId)
Start-Process -FilePath $ExePath -ArgumentList $arguments | Out-Null

$lifecyclePath = Join-Path $env:LOCALAPPDATA "ai.lalin.cast\lifecycle.json"
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)

while ((Get-Date) -lt $deadline) {
    if (Test-Path -LiteralPath $lifecyclePath) {
        try {
            $state = Get-Content -Raw -LiteralPath $lifecyclePath | ConvertFrom-Json
        } catch {
            $state = $null
        }

        if ($null -ne $state -and $state.PSObject.Properties['requestId'] -and $state.PSObject.Properties['type'] -and $state.requestId -eq $RequestId) {
            switch ($state.type) {
                "ready" {
                    Write-Host "lifecycle.json record:"
                    $state | ConvertTo-Json -Depth 5 | Write-Host
                    exit 0
                }
                "stopped" {
                    Write-Host "lifecycle.json record:"
                    $state | ConvertTo-Json -Depth 5 | Write-Host
                    exit 0
                }
                "failed" {
                    Write-Host "lifecycle.json record:"
                    $state | ConvertTo-Json -Depth 5 | Write-Host
                    exit 1
                }
                default {
                    # "starting" or an unrecognized value — not terminal yet,
                    # keep polling.
                }
            }
        }
    }

    Start-Sleep -Milliseconds 250
}

Write-Warning "Timed out after $TimeoutSeconds s waiting for lifecycle.json requestId '$RequestId' to reach ready/stopped/failed."
if (Test-Path -LiteralPath $lifecyclePath) {
    Write-Host "Last known lifecycle.json contents:"
    Get-Content -Raw -LiteralPath $lifecyclePath | Write-Host
}
exit 2
