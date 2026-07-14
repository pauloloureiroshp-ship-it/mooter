# job-010-recon.ps1 -- W-UX plane Day-0 recon (read-only + mirror copies)
$ErrorActionPreference = 'Continue'
$W = 'C:\Users\Paulo Loureiro\frugal-wave-ux'
$F = 'C:\Users\Paulo Loureiro\frugal'

Write-Output '== codex version =='
& codex --version 2>&1
Write-Output ('codex exit=' + $LASTEXITCODE)
Write-Output '== codex auth =='
& codex login status 2>&1

Write-Output '== toolchain =='
& node --version 2>&1
& npm --version 2>&1
& gh --version 2>&1 | Select-Object -First 1

Write-Output '== git worktrees =='
& git -C $F worktree list 2>&1

Write-Output '== wave-ux branch/status =='
& git -C $W status --porcelain=v1 -b 2>&1
Write-Output '== wave-ux log -10 =='
& git -C $W log --oneline -10 2>&1
Write-Output '== wave-ux merge-base vs origin/main =='
& git -C $W fetch origin main --tags 2>&1 | Select-Object -First 3
& git -C $W rev-parse origin/main 2>&1
& git -C $W merge-base HEAD origin/main 2>&1

Write-Output '== classify.js sha256 (worktree) =='
(Get-FileHash (Join-Path $W 'tools\router\classify.js') -Algorithm SHA256).Hash

Write-Output '== cb38684 (confronto + plano) =='
& git -C $W show cb38684 --name-status --format='%H %s' 2>&1 | Select-Object -First 40

Write-Output '== RUNNER_STATE candidates (both trees) =='
Get-ChildItem -Path (Join-Path $W '_handoff') -Filter '*RUNNER*' -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }
Get-ChildItem -Path (Join-Path $F '_handoff') -Filter '*RUNNER*' -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }

Write-Output '== key specs present in worktree =='
foreach ($rel in @('_handoff\CTO_COMMAND_DECK_SPEC.md', '_handoff\COCKPIT_LIVE_SESSIONS_UX_BRIEF.md', '_handoff\waves\RUNNER_STATE.md', 'docs\strategy\COCKPIT_UX_AUDIT.md')) {
    $p = Join-Path $W $rel
    Write-Output ('{0} -> {1}' -f $rel, (Test-Path $p))
}

Write-Output '== node_modules state (worktree) =='
foreach ($rel in @('packages\vscode-extension\node_modules', 'packages\cli\node_modules', 'packages\router\node_modules')) {
    Write-Output ('{0} -> {1}' -f $rel, (Test-Path (Join-Path $W $rel)))
}

Write-Output '== extension src inventory =='
Get-ChildItem (Join-Path $W 'packages\vscode-extension\src') -File -ErrorAction SilentlyContinue | ForEach-Object { '{0}  {1}' -f $_.Length, $_.Name }
Get-ChildItem (Join-Path $W 'packages\vscode-extension') -File -ErrorAction SilentlyContinue | ForEach-Object { $_.Name }

Write-Output '== live session source =='
Write-Output ('cowork-sessions.json -> ' + (Test-Path (Join-Path $env:USERPROFILE '.claude\tools\router\.cowork-sessions.json')))

# Mirror files the orchestrator needs to read (into the mounted frugal folder)
$Mirror = Join-Path $F '_handoff\wux-run\mirror'
New-Item -ItemType Directory -Path $Mirror -Force | Out-Null
$toMirror = @(
    '_handoff\CTO_COMMAND_DECK_SPEC.md',
    '_handoff\waves\RUNNER_STATE.md',
    'docs\strategy\COCKPIT_UX_AUDIT.md',
    'packages\vscode-extension\package.json',
    'packages\vscode-extension\src\mission-control-view.js',
    'packages\vscode-extension\src\mc-snapshot.js',
    'packages\vscode-extension\src\host-extra.js',
    'packages\vscode-extension\src\extension.js'
)
foreach ($rel in $toMirror) {
    $src = Join-Path $W $rel
    if (Test-Path $src) {
        $flat = $rel -replace '[\\/]', '__'
        Copy-Item $src -Destination (Join-Path $Mirror $flat) -Force
        Write-Output ('mirrored: ' + $rel)
    } else {
        Write-Output ('MISSING (not mirrored): ' + $rel)
    }
}
# Also mirror any plan file introduced by cb38684
$planFiles = & git -C $W show cb38684 --name-only --format= 2>&1 | Where-Object { $_ -match '\.md$' }
foreach ($rel in $planFiles) {
    $src = Join-Path $W ($rel -replace '/', '\')
    if (Test-Path $src) {
        $flat = 'cb38684__' + (($rel -replace '/', '__'))
        Copy-Item $src -Destination (Join-Path $Mirror $flat) -Force
        Write-Output ('mirrored (cb38684): ' + $rel)
    }
}
Write-Output '== recon done =='
