# BATERIA.ps1 - regista a bateria multi-LLM, os loops e os dois bugs novos. So ASCII.
$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\Paulo Loureiro\frugal'
Start-Transcript -Path (Join-Path $repo '_handoff\bateria-resultado.txt') -Force
try {
  $lock = Join-Path $repo '.git\index.lock'
  if (Test-Path $lock) { Remove-Item $lock -Force }
  Push-Location $repo
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  if ($branch -eq 'main') { throw 'branch e main' }
  git add _handoff/BATERIA_E_LOOPS_2026-07-27.md _handoff/aplicar-bundle.js `
    _handoff/calibrar-faixas.js _handoff/OLLAMA-RESTART.ps1
  if ($LASTEXITCODE -ne 0) { throw 'git add falhou' }
  git commit -m 'docs(handoff): bateria multi-LLM com respostas verificaveis (moo 3/3 em 7s a 0 USD contra sonnet 0.44 USD por um n/d honesto) e dois bugs novos - o relocate por ficheiro em falta so vale para o codex, e o aplicar do bundle deixou de caber no timeout de 30s do host'
  if ($LASTEXITCODE -ne 0) { throw 'git commit falhou' }
  git push origin $branch
  if ($LASTEXITCODE -ne 0) { throw 'git push falhou' }
  git log --oneline -3
  Pop-Location
  Write-Host 'OK BATERIA REGISTADA'
} catch {
  Write-Host ("FALHOU: " + $_.Exception.Message)
} finally { Stop-Transcript }
