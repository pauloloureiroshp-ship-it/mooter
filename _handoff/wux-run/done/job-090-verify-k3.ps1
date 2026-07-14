# job-090-verify-k3.ps1 -- deterministic verification of keeper 3
$ErrorActionPreference = 'Continue'
$W = 'C:\Users\Paulo Loureiro\frugal-wave-ux'

Write-Output '== classify.js sha256 =='
(Get-FileHash (Join-Path $W 'tools\router\classify.js') -Algorithm SHA256).Hash

Write-Output '== changed files =='
& git -C $W status --porcelain=v1 2>&1

Write-Output '== npm test =='
Push-Location (Join-Path $W 'packages\vscode-extension')
& npm test 2>&1 | Select-Object -Last 20
Write-Output ('npm test exit=' + $LASTEXITCODE)
Pop-Location

Write-Output '== grep: optimistic wiring on B1 controls (flashApply / immediate flip) =='
& git -C $W diff -U1 -- packages/vscode-extension/src/extension.js 2>&1 | Select-String -Pattern 'flashApply|a aplicar|optimis|budget|rate|data-eff|\.mo\b' | ForEach-Object { $_.Line } | Select-Object -First 30

Write-Output '== grep: no new hex colors =='
& git -C $W diff -U0 -- packages/vscode-extension/src 2>&1 | Select-String -Pattern '^\+.*#[0-9a-fA-F]{3,6}\b' | ForEach-Object { $_.Line } | Select-Object -First 10

Write-Output '== job-090 done =='
