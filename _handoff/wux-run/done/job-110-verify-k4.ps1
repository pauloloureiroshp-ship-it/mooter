# job-110-verify-k4.ps1 -- deterministic verification of keeper 4
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

Write-Output '== grep: watcher guard rails (visible/debounce/never throws) =='
& git -C $W diff -U1 -- packages/vscode-extension/src 2>&1 | Select-String -Pattern 'fs.watch|debounce|setVisible|recentSessions|watcher' | ForEach-Object { $_.Line } | Select-Object -First 25

Write-Output '== tooltip sweep: interactive elements without title in rendered sources =='
Push-Location (Join-Path $W 'packages\vscode-extension\src')
$files = @('row-renderer.js','mission-control-view.js')
foreach ($f in $files) {
    $raw = Get-Content -Raw $f
    $btns = [regex]::Matches($raw, '<button[^>]*>')
    $noTitle = @($btns | Where-Object { $_.Value -notmatch 'title=' })
    Write-Output ($f + ': buttons=' + $btns.Count + ' sem-title=' + $noTitle.Count)
    $noTitle | ForEach-Object { $_.Value.Substring(0, [Math]::Min(120, $_.Value.Length)) } | Select-Object -First 5
}
Pop-Location
Write-Output '== job-110 done =='
