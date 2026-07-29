# M15.ps1 - instrumentacao honesta. So ASCII.
$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\Paulo Loureiro\frugal'
$pkg  = Join-Path $repo 'packages\mooter-bridge'
Start-Transcript -Path (Join-Path $repo '_handoff\m15-resultado.txt') -Force
try {
  $lock = Join-Path $repo '.git\index.lock'
  if (Test-Path $lock) { Remove-Item $lock -Force }

  $suites = @('board.test.js','aprender.test.js','seamless.test.js','v12.test.js','capacidades.test.js',
    'fosso.test.js','fleet.test.js','quota.test.js','moo.test.js','cabine.test.js','a4.test.js',
    'ondaA.test.js','tools6.test.js','audit.test.js','context.test.js','sessao.test.js',
    'paths.test.js','path.test.js','preview.test.js','server.test.js','update.test.js',
    'worktrees.test.js','bundle.test.js')
  Push-Location $pkg
  $so = Join-Path $env:TEMP 'm15-out.txt'
  foreach ($s in $suites) {
    cmd /c ("node " + $s + " > `"" + $so + "`" 2>&1")
    if ($LASTEXITCODE -ne 0) { Get-Content $so -Tail 25; Pop-Location; throw ("SUITE FALHOU: " + $s) }
    Write-Host ("=== " + $s + " :: " + ((Get-Content $so | Select-String 'pass \d|passaram|verde' | Select-Object -First 1)))
  }
  $graph = Join-Path $pkg 'm15-graph.tmp.js'
  [IO.File]::WriteAllText($graph, "require('./board.js');require('./capacidades.js');require('./fosso.js');require('./aprender.js');require('./seamless.js');require('./fleet.js');require('./telemetry.js');console.log('require graph OK');")
  cmd /c ("node `"" + $graph + "`"")
  $ok = ($LASTEXITCODE -eq 0)
  Remove-Item $graph -Force -ErrorAction SilentlyContinue
  if (-not $ok) { Pop-Location; throw 'require graph partido' }
  Pop-Location
  Write-Host 'TODAS AS SUITES VERDES + require graph OK'

  # scorecard real depois da correccao: a taxa de falha tem de baixar
  node (Join-Path $repo '_handoff\diag-ledger.js')

  Push-Location $repo
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  if ($branch -eq 'main') { throw 'branch e main' }
  git add packages/mooter-bridge/board.js packages/mooter-bridge/board.test.js `
    packages/mooter-bridge/seamless.js packages/mooter-bridge/seamless.test.js `
    packages/mooter-bridge/telemetry.js packages/mooter-bridge/aprender.js `
    packages/mooter-bridge/aprender.test.js packages/mooter-bridge/fleet.js `
    packages/mooter-bridge/manifest.json packages/mooter-bridge/pack-mcpb.mjs `
    _handoff/PERGUNTAS_MEO_2026-07-27.md _handoff/diag-ledger.js
  if ($LASTEXITCODE -ne 0) { throw 'git add falhou' }
  git commit -m 'feat(mooter-bridge): v1.18.0 - M1.5 instrumentacao honesta: desfecho separa falhou de interrompido e expirou (31% do que contavamos como falha nao era), local_decisao no ledger explica o que impediu a GPU, ttft_ms mede a lentidao sentida, interrupcoes ao MEO passam a ser contadas e keep rate so onde e atribuivel'
  if ($LASTEXITCODE -ne 0) { throw 'git commit falhou' }
  git push origin $branch
  if ($LASTEXITCODE -ne 0) { throw 'git push falhou' }
  git show --stat HEAD | Select-Object -First 14
  Pop-Location
  Write-Host 'OK M15 COMPLETO'
} catch {
  Write-Host ("FALHOU: " + $_.Exception.Message)
} finally { Stop-Transcript }
