# ACHADOS.ps1 - regista os dois bugs apanhados pos-restart. So ASCII.
$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\Paulo Loureiro\frugal'
Start-Transcript -Path (Join-Path $repo '_handoff\achados-resultado.txt') -Force
try {
  $lock = Join-Path $repo '.git\index.lock'
  if (Test-Path $lock) { Remove-Item $lock -Force }
  Push-Location $repo
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  if ($branch -eq 'main') { throw 'branch e main' }
  git add _handoff/ACHADOS_POS_RESTART_2026-07-27.md
  if ($LASTEXITCODE -ne 0) { throw 'git add falhou' }
  git commit -m 'docs(handoff): dois bugs apanhados pos-restart - o moo aceita pedidos de execucao que nao consegue cumprir e responde na mesma; e o tecto de tier da quota nao e aplicado quando o modelo cloud so e resolvido depois do bloco do tecto (job T0 acabou em opus a 0.81 USD com tecto sonnet declarado)'
  if ($LASTEXITCODE -ne 0) { throw 'git commit falhou' }
  git push origin $branch
  if ($LASTEXITCODE -ne 0) { throw 'git push falhou' }
  Pop-Location
  Write-Host 'OK ACHADOS REGISTADOS'
} catch {
  Write-Host ("FALHOU: " + $_.Exception.Message)
} finally { Stop-Transcript }
