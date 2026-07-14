# job-020-history-deps.ps1 -- recover orphaned checkpoint + specs from git, install deps, baseline tests
$ErrorActionPreference = 'Continue'
$W = 'C:\Users\Paulo Loureiro\frugal-wave-ux'
$F = 'C:\Users\Paulo Loureiro\frugal'
$Mirror = Join-Path $F '_handoff\wux-run\mirror'
New-Item -ItemType Directory -Path $Mirror -Force | Out-Null

Write-Output '== which refs contain cb38684 =='
& git -C $W branch --all --contains cb38684 2>&1
Write-Output '== cb38684 parent chain =='
& git -C $W log --oneline -3 cb38684 2>&1

Write-Output '== RUNNER_STATE.md from cb38684 =='
& git -C $W show cb38684:_handoff/waves/RUNNER_STATE.md 2>&1 | Set-Content -Path (Join-Path $Mirror 'cb38684__RUNNER_STATE.md') -Encoding UTF8
Write-Output ('saved -> ' + (Test-Path (Join-Path $Mirror 'cb38684__RUNNER_STATE.md')))

Write-Output '== other files in cb38684 tree under _handoff/waves =='
& git -C $W ls-tree -r --name-only cb38684 -- _handoff/waves 2>&1

Write-Output '== CTO_COMMAND_DECK_SPEC.md history (all refs) =='
& git -C $W log --all --oneline -5 -- _handoff/CTO_COMMAND_DECK_SPEC.md 2>&1
$rev = (& git -C $W log --all --format=%H -1 -- _handoff/CTO_COMMAND_DECK_SPEC.md 2>$null | Select-Object -First 1)
if ($rev) {
    Write-Output ('latest rev with spec: ' + $rev)
    & git -C $W show ($rev + ':_handoff/CTO_COMMAND_DECK_SPEC.md') 2>&1 | Set-Content -Path (Join-Path $Mirror 'CTO_COMMAND_DECK_SPEC.md') -Encoding UTF8
    Write-Output ('saved -> ' + (Test-Path (Join-Path $Mirror 'CTO_COMMAND_DECK_SPEC.md')))
} else {
    Write-Output 'CTO spec not found in any ref of this worktree'
}

Write-Output '== mirror extra sources =='
foreach ($rel in @('packages\vscode-extension\src\row-renderer.js', 'packages\vscode-extension\src\mission-control-view.test.js', 'packages\vscode-extension\src\mode-registry.js')) {
    $src = Join-Path $W $rel
    if (Test-Path $src) {
        Copy-Item $src -Destination (Join-Path $Mirror (($rel -replace '[\\/]', '__'))) -Force
        Write-Output ('mirrored: ' + $rel)
    } else { Write-Output ('MISSING: ' + $rel) }
}

Write-Output '== npm ci packages/vscode-extension =='
Push-Location (Join-Path $W 'packages\vscode-extension')
& npm ci --no-audit --no-fund 2>&1 | Select-Object -Last 5
Write-Output ('npm ci exit=' + $LASTEXITCODE)

Write-Output '== baseline: npm test (vscode-extension) =='
& npm test 2>&1 | Select-Object -Last 40
Write-Output ('npm test exit=' + $LASTEXITCODE)
Pop-Location

Write-Output '== job-020 done =='
