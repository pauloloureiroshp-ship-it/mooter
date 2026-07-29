# MEO.ps1 - commit selectivo da doutrina MEO (docs, sem codigo). So ASCII.
$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\Paulo Loureiro\frugal'
$log  = Join-Path $repo '_handoff\meo-resultado.txt'
Start-Transcript -Path $log -Force
try {
  $lock = Join-Path $repo '.git\index.lock'
  if (Test-Path $lock) { Remove-Item $lock -Force }
  Push-Location $repo
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  if ($branch -eq 'main') { throw 'branch e main' }
  git add docs/strategy/GOVERNANCA_MEO.md _handoff/MASTERPROMPT_MEO_M0_M3.md `
    _handoff/FECHO_SESSAO_2026-07-26.md
  if ($LASTEXITCODE -ne 0) { throw 'git add falhou' }
  git commit -m 'docs(strategy): doutrina MEO / M-level - governanca por exceccao com autonomia ganha, rituais e cadencia, arquitectura de sessoes por cargo, capacidades MCP em falta (resources/prompts/elicitation/sampling/roots), conector vs plugin e caminho de distribuicao; master prompt M0-M3'
  if ($LASTEXITCODE -ne 0) { throw 'git commit falhou' }
  git push origin $branch
  if ($LASTEXITCODE -ne 0) { throw 'git push falhou' }
  git show --stat HEAD | Select-Object -First 8
  Pop-Location
  Write-Host 'OK MEO DOCS COMPLETO'
} catch {
  Write-Host ("FALHOU: " + $_.Exception.Message)
} finally { Stop-Transcript }
