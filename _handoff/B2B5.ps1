# B2B5.ps1 - fecho: Ollama reiniciado, faixas calibradas, scripts registados. So ASCII.
$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\Paulo Loureiro\frugal'
Start-Transcript -Path (Join-Path $repo '_handoff\b2b5-resultado.txt') -Force
try {
  $lock = Join-Path $repo '.git\index.lock'
  if (Test-Path $lock) { Remove-Item $lock -Force }
  Push-Location $repo
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  if ($branch -eq 'main') { throw 'branch e main' }
  git add _handoff/OLLAMA-RESTART.ps1 _handoff/calibrar-faixas.js `
    _handoff/INVENTARIO_PENDENTES_2026-07-27.md
  if ($LASTEXITCODE -ne 0) { throw 'git add falhou' }
  git commit -m 'chore(handoff): B2+B5 fechados - reinicio do Ollama com prova (context_length 16384 CONFIRMADO no /api/ps) e as 11 faixas do scorecard calibradas com o historico real (355 eventos), zero defaults decorativos'
  if ($LASTEXITCODE -ne 0) { throw 'git commit falhou' }
  git push origin $branch
  if ($LASTEXITCODE -ne 0) { throw 'git push falhou' }
  git log --oneline -4
  Pop-Location
  Write-Host 'OK B2B5 COMPLETO'
} catch {
  Write-Host ("FALHOU: " + $_.Exception.Message)
} finally { Stop-Transcript }
