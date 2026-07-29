# BUGS.ps1 - fecho dos dois bugs de honestidade (v1.19.0). So ASCII.
$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\Paulo Loureiro\frugal'
$pkg  = Join-Path $repo 'packages\mooter-bridge'
Start-Transcript -Path (Join-Path $repo '_handoff\bugs-resultado.txt') -Force
try {
  $lock = Join-Path $repo '.git\index.lock'
  if (Test-Path $lock) { Remove-Item $lock -Force }

  $suites = @('seamless.test.js','board.test.js','v12.test.js','aprender.test.js','quota.test.js',
    'capacidades.test.js','fosso.test.js','fleet.test.js','moo.test.js','cabine.test.js',
    'a4.test.js','ondaA.test.js','tools6.test.js','audit.test.js','context.test.js',
    'sessao.test.js','paths.test.js','path.test.js','preview.test.js','server.test.js',
    'update.test.js','worktrees.test.js','bundle.test.js')
  Push-Location $pkg
  $so = Join-Path $env:TEMP 'bugs-out.txt'
  foreach ($s in $suites) {
    cmd /c ("node " + $s + " > `"" + $so + "`" 2>&1")
    if ($LASTEXITCODE -ne 0) { Get-Content $so -Tail 25; Pop-Location; throw ("SUITE FALHOU: " + $s) }
    Write-Host ("=== " + $s + " :: " + ((Get-Content $so | Select-String 'pass \d|passaram|verde' | Select-Object -First 1)))
  }
  $graph = Join-Path $pkg 'bugs-graph.tmp.js'
  [IO.File]::WriteAllText($graph, "require('./board.js');require('./capacidades.js');require('./fosso.js');require('./aprender.js');require('./seamless.js');require('./fleet.js');console.log('require graph OK');")
  cmd /c ("node `"" + $graph + "`"")
  $ok = ($LASTEXITCODE -eq 0)
  Remove-Item $graph -Force -ErrorAction SilentlyContinue
  if (-not $ok) { Pop-Location; throw 'require graph partido' }
  $v = (Get-Content (Join-Path $pkg 'manifest.json') | Select-String '"version"' | Select-Object -First 1)
  Write-Host ('manifest: ' + $v)
  Pop-Location
  Write-Host 'TODAS AS SUITES VERDES + require graph OK'

  Push-Location $repo
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  if ($branch -eq 'main') { throw 'branch e main' }
  git add packages/mooter-bridge/seamless.js packages/mooter-bridge/seamless.test.js `
    packages/mooter-bridge/localfirst.js packages/mooter-bridge/board.js `
    packages/mooter-bridge/manifest.json packages/mooter-bridge/pack-mcpb.mjs `
    _handoff/ACHADOS_POS_RESTART_2026-07-27.md _handoff/INVENTARIO_PENDENTES_2026-07-27.md
  if ($LASTEXITCODE -ne 0) { throw 'git add falhou' }
  git commit -m 'fix(mooter-bridge): v1.19.0 - dois bugs de honestidade: o motor sem ferramentas deixa de aceitar pedidos de execucao que nao cumpre (respondia sem correr nada) e o tecto de tier da quota passa a ser aplicado ao modelo final (um job T0 acabou em opus a 0.81 USD com tecto sonnet declarado)'
  if ($LASTEXITCODE -ne 0) { throw 'git commit falhou' }
  git push origin $branch
  if ($LASTEXITCODE -ne 0) { throw 'git push falhou' }
  git show --stat HEAD | Select-Object -First 12
  Pop-Location
  Write-Host 'OK BUGS COMPLETO'
} catch {
  Write-Host ("FALHOU: " + $_.Exception.Message)
} finally { Stop-Transcript }
