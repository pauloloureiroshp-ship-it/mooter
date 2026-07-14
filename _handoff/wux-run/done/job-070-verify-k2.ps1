# job-070-verify-k2.ps1 -- deterministic verification of keeper 2
$ErrorActionPreference = 'Continue'
$W = 'C:\Users\Paulo Loureiro\frugal-wave-ux'

Write-Output '== classify.js sha256 =='
(Get-FileHash (Join-Path $W 'tools\router\classify.js') -Algorithm SHA256).Hash

Write-Output '== changed files =='
& git -C $W status --porcelain=v1 2>&1

Write-Output '== npm test =='
Push-Location (Join-Path $W 'packages\vscode-extension')
& npm test 2>&1 | Select-Object -Last 25
Write-Output ('npm test exit=' + $LASTEXITCODE)
Pop-Location

Write-Output '== grep: no new hex colors in touched files =='
& git -C $W diff -U0 -- packages/vscode-extension/src/extension.js packages/vscode-extension/src/row-renderer.js 2>&1 | Select-String -Pattern '^\+.*#[0-9a-fA-F]{3,6}\b' | ForEach-Object { $_.Line } | Select-Object -First 10

Write-Output '== job-070 done =='
