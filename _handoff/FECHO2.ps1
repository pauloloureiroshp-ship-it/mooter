# FECHO2.ps1 - manifest v1.17.0 + limpeza de bundles ambiguos + fecho da sessao. So ASCII.
$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\Paulo Loureiro\frugal'
$pkg  = Join-Path $repo 'packages\mooter-bridge'
Start-Transcript -Path (Join-Path $repo '_handoff\fecho2-resultado.txt') -Force
try {
  $lock = Join-Path $repo '.git\index.lock'
  if (Test-Path $lock) { Remove-Item $lock -Force }

  # ARMADILHA APANHADA: um .mcpb com o MESMO numero de versao e conteudo diferente
  # faz o actualizador dizer "ja tens essa versao" e nunca instalar o codigo novo.
  # Regra nova: bundle novo = versao nova, e o antigo sai do disco.
  foreach ($v in @('mooter-v1160.mcpb','mooter-v1150.mcpb','mooter-v1120.mcpb')) {
    $p = Join-Path $repo ('_handoff\' + $v)
    if (Test-Path $p) { Remove-Item $p -Force; Write-Host ('removido bundle ambiguo/antigo: ' + $v) }
  }

  Push-Location $pkg
  cmd /c "node bundle.test.js > `"$env:TEMP\f2.txt`" 2>&1"
  if ($LASTEXITCODE -ne 0) { Get-Content "$env:TEMP\f2.txt" -Tail 15; Pop-Location; throw 'bundle.test.js falhou' }
  Write-Host ('bundle guard: ' + ((Get-Content "$env:TEMP\f2.txt" | Select-String 'pass \d' | Select-Object -First 1)))
  Pop-Location

  Push-Location $repo
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  if ($branch -eq 'main') { throw 'branch e main' }
  git add packages/mooter-bridge/manifest.json SYNC.md _handoff/PLANO_CONDUTOR_2026-07-26.md `
    _handoff/FECHO_SESSAO_2026-07-26.md docs/strategy/GOVERNANCA_MEO.md
  if ($LASTEXITCODE -ne 0) { throw 'git add falhou' }
  git commit -m 'chore(mooter-bridge): manifest v1.17.0 e registo do fecho - capacidades MEDIDAS no cliente real (roots suportado com 9 raizes; elicitation/sampling/resources/prompts n/d) e a armadilha do bundle com mesma versao e conteudo diferente'
  if ($LASTEXITCODE -ne 0) { throw 'git commit falhou' }
  git push origin $branch
  if ($LASTEXITCODE -ne 0) { throw 'git push falhou' }
  git log --oneline -6
  Pop-Location
  Write-Host 'OK FECHO2 COMPLETO'
} catch {
  Write-Host ("FALHOU: " + $_.Exception.Message)
} finally { Stop-Transcript }
