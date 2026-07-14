# job-120-vsix-gate.ps1 -- GATE: build vsix from the worktree and install it locally
$ErrorActionPreference = 'Continue'
$W = 'C:\Users\Paulo Loureiro\frugal-wave-ux'
$EXT = Join-Path $W 'packages\vscode-extension'

Push-Location $EXT
Write-Output '== vsce package =='
& npx.cmd --yes @vscode/vsce package --allow-missing-repository 2>&1 | Select-Object -Last 6
Write-Output ('vsce exit=' + $LASTEXITCODE)
$vsix = Get-ChildItem -Path $EXT -Filter '*.vsix' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $vsix) { Write-Output 'NO VSIX PRODUCED'; Pop-Location; exit 2 }
Write-Output ('vsix: ' + $vsix.Name + ' ' + $vsix.Length + ' bytes')
Write-Output '== code --install-extension =='
& code.cmd --install-extension $vsix.FullName --force 2>&1 | Select-Object -Last 4
Write-Output ('install exit=' + $LASTEXITCODE)
Pop-Location
Write-Output '== job-120 done =='
