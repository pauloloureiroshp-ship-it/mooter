# job-030-runner-state-tip.ps1 -- latest RUNNER_STATE on feat/fleet-arm tip (DELEGATED check)
$ErrorActionPreference = 'Continue'
$W = 'C:\Users\Paulo Loureiro\frugal-wave-ux'
$F = 'C:\Users\Paulo Loureiro\frugal'
$Mirror = Join-Path $F '_handoff\wux-run\mirror'

Write-Output '== feat/fleet-arm tip =='
& git -C $W log --oneline -6 feat/fleet-arm 2>&1
Write-Output '== RUNNER_STATE history on feat/fleet-arm =='
& git -C $W log --oneline -8 feat/fleet-arm -- _handoff/waves/RUNNER_STATE.md 2>&1
Write-Output '== RUNNER_STATE at tip =='
& git -C $W show feat/fleet-arm:_handoff/waves/RUNNER_STATE.md 2>&1 | Set-Content -Path (Join-Path $Mirror 'tip__RUNNER_STATE.md') -Encoding UTF8
Write-Output ('saved -> ' + (Test-Path (Join-Path $Mirror 'tip__RUNNER_STATE.md')))
Write-Output '== grep DELEGATED across the file =='
& git -C $W show feat/fleet-arm:_handoff/waves/RUNNER_STATE.md 2>&1 | Select-String -Pattern 'DELEGATED|W-UX|Wave 3' | ForEach-Object { $_.Line }
Write-Output '== job-030 done =='
