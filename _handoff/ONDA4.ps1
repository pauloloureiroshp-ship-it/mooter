# ONDA4.ps1 - o fosso. Suites nativas + guarda de coerencia do commit + push selectivo.
$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\Paulo Loureiro\frugal'
$pkg  = Join-Path $repo 'packages\mooter-bridge'
$log  = Join-Path $repo '_handoff\onda4-resultado.txt'
Start-Transcript -Path $log -Force
try {
  $lock = Join-Path $repo '.git\index.lock'
  if (Test-Path $lock) { Remove-Item $lock -Force }

  $suites = @('fosso.test.js','aprender.test.js','v12.test.js','seamless.test.js','fleet.test.js',
    'quota.test.js','moo.test.js','cabine.test.js','a4.test.js','ondaA.test.js','tools6.test.js',
    'audit.test.js','context.test.js','sessao.test.js','paths.test.js','path.test.js',
    'preview.test.js','server.test.js','update.test.js','worktrees.test.js','bundle.test.js')
  Push-Location $pkg
  $so = Join-Path $env:TEMP 'onda4-out.txt'
  foreach ($s in $suites) {
    cmd /c ("node " + $s + " > `"" + $so + "`" 2>&1")
    if ($LASTEXITCODE -ne 0) { Get-Content $so -Tail 25; Pop-Location; throw ("SUITE FALHOU: " + $s) }
    Write-Host ("=== " + $s + " :: " + ((Get-Content $so | Select-String 'pass \d|passaram|verde' | Select-Object -First 1)))
  }

  # GUARDA DE COERENCIA (licao do commit 6224a0d): tudo o que o bundle serve tem
  # de existir, e o pack tem de conhecer os ficheiros novos.
  foreach ($f in @('fosso.js','aprender.js')) {
    if (-not (Select-String -Path (Join-Path $pkg 'pack-mcpb.mjs') -Pattern ([regex]::Escape($f)) -Quiet)) {
      Pop-Location; throw ("pack-mcpb.mjs nao inclui " + $f + " - o bundle sairia partido")
    }
  }
  # AVISO: aspas aninhadas E acentos rebentam o PARSE em PS 5.1 (le ANSI sem BOM),
  # e um erro de parse acontece ANTES do Start-Transcript - por isso nem log fica.
  # Regra: runners so em ASCII. Script a parte para o require graph.
  # require('./x') resolve relativo ao DIRECTORIO DO SCRIPT, nao ao cwd:
  # o script tem de nascer dentro do pacote, senao nao encontra nada.
  $graph = Join-Path $pkg 'onda4-graph.tmp.js'
  [IO.File]::WriteAllText($graph, "require('./fosso.js');require('./aprender.js');require('./seamless.js');require('./fleet.js');console.log('require graph OK');")
  cmd /c ("node `"" + $graph + "`"")
  Remove-Item $graph -Force -ErrorAction SilentlyContinue
  if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'require graph partido' }
  Pop-Location
  Write-Host 'TODAS AS SUITES VERDES + coerencia do bundle verificada'

  Push-Location $repo
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  if ($branch -eq 'main') { throw 'branch e main' }
  git add packages/mooter-bridge/fosso.js packages/mooter-bridge/fosso.test.js `
    packages/mooter-bridge/seamless.js packages/mooter-bridge/pack-mcpb.mjs `
    packages/mooter-bridge/manifest.json packages/mooter-bridge/aprender.js `
    packages/mooter-bridge/aprender.test.js `
    SYNC.md _handoff/PLANO_CONDUTOR_2026-07-26.md
  if ($LASTEXITCODE -ne 0) { throw 'git add falhou' }
  git commit -m 'feat(mooter-bridge): v1.15.0 - Onda 4, o fosso: mapa de projecto persistente (PROJECT_CONTEXT.json, n/d onde nao sabe) e verificacao cruzada local-nuvem a custo zero (o moo confirma o que consegue provar, nunca julga qualidade); pack-mcpb passa a incluir aprender.js - implementado por Codex, conduzido e verificado pelo Cowork'
  if ($LASTEXITCODE -ne 0) { throw 'git commit falhou' }
  git push origin $branch
  if ($LASTEXITCODE -ne 0) { throw 'git push falhou' }
  git show --stat HEAD | Select-Object -First 14
  Pop-Location
  Write-Host 'OK ONDA4 COMPLETA'
} catch {
  Write-Host ("FALHOU: " + $_.Exception.Message)
} finally { Stop-Transcript }
