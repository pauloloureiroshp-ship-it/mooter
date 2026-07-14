# verify-lp48-merge.ps1 - confrontar o handoff do CC com o git real (read-only + fetch)
# Log em _handoff\verify-log.txt. ASCII-only. NAO altera nada alem de refs remotas (fetch).

$ErrorActionPreference = 'Continue'
$repo = "C:\Users\Paulo Loureiro\frugal"
Set-Location $repo
Start-Transcript -Path "$repo\_handoff\verify-log.txt" -Force

Write-Host "=== 1) fetch origin (so refs, nao toca no working tree) ==="
git -C $repo fetch origin 2>&1 | Out-String | Write-Host

Write-Host "=== 2) origin/main - ultimos 6 commits ==="
git -C $repo log --oneline -6 origin/main | Out-String | Write-Host

Write-Host "=== 3) O merge LP-4.8 esta em origin/main? ==="
git -C $repo branch -r --contains 20226a2 2>&1 | Out-String | Write-Host
git -C $repo log --oneline -1 origin/wave/lp-4-8-ux-skills 2>&1 | Out-String | Write-Host

Write-Host "=== 4) classify.js sha (frozen check no working tree) ==="
certutil -hashfile "$repo\tools\router\classify.js" SHA256 | Out-String | Write-Host

Write-Host "=== 5) Estado local ==="
git -C $repo status -sb | Select-Object -First 3 | Out-String | Write-Host
Write-Host "=== FIM ==="
Stop-Transcript
