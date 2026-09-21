<#
.SYNOPSIS
    Wave 12 U1 (docs/plans/W12_RELEASE_ASSETS_PLAN.md, contract 5) -- attaches built assets (installer,
    portable zip, checksum manifest) to the GitHub release for a tag. Every input file must exist
    before anything happens, in both -WhatIf and the real path. Under -WhatIf, only a listing is
    printed and `gh` is never invoked. Otherwise it shells out to `gh release upload <Tag> <Files...>
    --clobber`, which requires `GH_TOKEN` (or `GITHUB_TOKEN`) to already be set in the environment
    (release.yml sets `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` on this step).

.EVIDENCE
    Contract 5 requires evidence on whether `gh release upload <tag> ...` can find a DRAFT release
    (tauri-action creates the release with `releaseDraft: true`) by its tag alone, since a draft has
    no associated git tag ref until it is published.

    1. GitHub REST API docs, "Get a release by tag name"
       (https://docs.github.com/en/rest/releases/releases#get-a-release-by-tag-name): the endpoint is
       described as retrieving "a published release with the specified tag" -- i.e. the plain REST
       lookup by tag does NOT cover drafts.
    2. `gh` CLI source, `pkg/cmd/release/shared/fetch.go` (cli/cli, current `trunk`, matching the
       locally installed `gh version 2.98.0`): `FetchRelease` runs two lookups concurrently and
       reports whichever succeeds first --
         - a REST call to `GET /repos/{owner}/{repo}/releases/tags/{tagName}` (published releases), and
         - `fetchDraftRelease`, a GraphQL `RepositoryReleaseByTag` query used specifically "since the
           REST API cannot query draft releases by pending tag name", which resolves the draft's
           database ID and then re-fetches full details via
           `GET /repos/{owner}/{repo}/releases/{databaseId}`.
       The function's own comment: "A single failed lookup ... must not mask a release found by the
       other; only report an error when both lookups fail."

    Conclusion: `gh release upload <tag> <files> --clobber` (and `gh release view <tag>`) DO find a
    draft release by its tag, via this GraphQL fallback -- contract 5's `-Tag` form is used, not the
    `-ReleaseId` fallback contract 5 allows for the case where this were not true. See notes/
    openQuestions in the stream report for how U2 (workflows) should read this.

.PARAMETER Tag
    The release tag, e.g. "v0.2.0".

.PARAMETER Files
    One or more asset file paths to upload.

.PARAMETER WhatIf
    Standard SupportsShouldProcess switch. Lists the files and their sizes; never calls `gh`.
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
param(
    [Parameter(Mandatory = $true)]
    [string]$Tag,

    [Parameter(Mandatory = $true)]
    [string[]]$Files
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $Files -or $Files.Count -eq 0) {
    throw "No -Files were given -- pass at least one asset file path to upload."
}

# Every file must exist before anything happens -- including under -WhatIf, so a dry run catches a
# missing asset just as reliably as the real upload would.
$items = @()
foreach ($f in $Files) {
    if (-not (Test-Path -LiteralPath $f -PathType Leaf)) {
        throw "File not found: '$f' -- every -Files entry must exist before it can be uploaded (or listed under -WhatIf)."
    }
    $items += Get-Item -LiteralPath $f
}

if ($PSCmdlet.ShouldProcess("release '$Tag'", "gh release upload --clobber ($($items.Count) file(s))")) {
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        throw "'gh' was not found on PATH -- install the GitHub CLI (https://cli.github.com) or run in a runner image that includes it."
    }

    $ghArgs = @('release', 'upload', $Tag) + ($items | ForEach-Object { $_.FullName }) + @('--clobber')
    & gh @ghArgs
    if ($LASTEXITCODE -ne 0) {
        throw "gh release upload failed with exit code $LASTEXITCODE -- verify GH_TOKEN/GITHUB_TOKEN has write access to this repository's releases, and that a release for tag '$Tag' exists (draft or published)."
    }

    Write-Host "OK: uploaded $($items.Count) file(s) to release '$Tag'"
}
else {
    Write-Host "WhatIf: would upload $($items.Count) file(s) to release '$Tag' (gh was not called):"
    foreach ($item in $items) {
        $sizeMiB = [Math]::Round($item.Length / 1MB, 2)
        Write-Host " - $($item.Name) ($($item.Length) bytes, $sizeMiB MiB)"
    }
    Write-Host "OK: -WhatIf listed $($items.Count) file(s); gh was not called"
}
