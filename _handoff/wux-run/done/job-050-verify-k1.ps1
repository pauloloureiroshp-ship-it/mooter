# job-050-verify-k1.ps1 -- deterministic verification of keeper 1 (Cowork gate, $0 LLM)
$ErrorActionPreference = 'Continue'
$W = 'C:\Users\Paulo Loureiro\frugal-wave-ux'

Write-Output '== classify.js sha256 (must be 427D8C0B...) =='
(Get-FileHash (Join-Path $W 'tools\router\classify.js') -Algorithm SHA256).Hash

Write-Output '== changed files (must be packages/vscode-extension only + .codex-briefs untracked) =='
& git -C $W status --porcelain=v1 2>&1

Write-Output '== npm test =='
Push-Location (Join-Path $W 'packages\vscode-extension')
& npm test 2>&1 | Select-Object -Last 30
Write-Output ('npm test exit=' + $LASTEXITCODE)
Pop-Location

Write-Output '== grep: openSession handler must delegate (no inline primaryEditor.open in handler) =='
& git -C $W diff -U2 -- packages/vscode-extension/src/extension.js 2>&1 | Select-String -Pattern 'openSession|openSessionTab|primaryEditor' | ForEach-Object { $_.Line } | Select-Object -First 40

Write-Output '== grep: tooltips on touched mission-control buttons =='
Select-String -Path (Join-Path $W 'packages\vscode-extension\src\mission-control-view.js') -Pattern 'mcv2-tgopen|mcf-brow|mcf-gitlink|mcf-pushbtn' | ForEach-Object { ($_.Line.Trim()).Substring(0, [Math]::Min(220, $_.Line.Trim().Length)) }

Write-Output '== job-050 done =='
