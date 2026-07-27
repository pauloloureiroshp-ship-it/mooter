# push-info-architecture.ps1 - push do commit 28fe2e5 (limpeza IA) para origin
# Autorizado pelo Paulo em 2026-07-07 ("ok manda bala"). Log em _handoff\push-log.txt.
# ASCII-only. SO faz push da branch atual (wave/honest-controls). NAO toca em main.

$ErrorActionPreference = 'Continue'
$repo = "C:\Users\Paulo Loureiro\frugal"
Set-Location $repo
Start-Transcript -Path "$repo\_handoff\push-log.txt" -Force

Write-Host "=== 1) Confirmar branch e HEAD ==="
$branch = git -C $repo branch --show-current
Write-Host "Branch: $branch"
git -C $repo log --oneline -1 | Out-String | Write-Host

if ($branch -ne "wave/honest-controls") {
    Write-Host "ABORT: branch inesperada ($branch). Nada foi feito."
    Stop-Transcript
    exit 1
}

Write-Host "=== 2) Push (branch de trabalho, nao main) ==="
git -C $repo push origin wave/honest-controls 2>&1 | Out-String | Write-Host

Write-Host "=== 3) Prova ==="
git -C $repo status -sb | Out-String | Write-Host
git -C $repo log --oneline origin/wave/honest-controls -1 2>&1 | Out-String | Write-Host
Write-Host "=== FIM ==="
Stop-Transcript
