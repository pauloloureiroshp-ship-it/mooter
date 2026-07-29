# LOOPS.ps1 - sentinela + afericao (v1.20.0) e o estudo dos pilares. So ASCII.
$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\Paulo Loureiro\frugal'
$pkg  = Join-Path $repo 'packages\mooter-bridge'
Start-Transcript -Path (Join-Path $repo '_handoff\loops-resultado.txt') -Force
try {
  $lock = Join-Path $repo '.git\index.lock'
  if (Test-Path $lock) { Remove-Item $lock -Force }

  $suites = @('sentinela.test.js','afericao.test.js','board.test.js','seamless.test.js','v12.test.js',
    'aprender.test.js','quota.test.js','capacidades.test.js','fosso.test.js','fleet.test.js',
    'moo.test.js','cabine.test.js','a4.test.js','ondaA.test.js','tools6.test.js','audit.test.js',
    'context.test.js','sessao.test.js','paths.test.js','path.test.js','preview.test.js',
    'server.test.js','update.test.js','worktrees.test.js','bundle.test.js')
  Push-Location $pkg
  $so = Join-Path $env:TEMP 'loops-out.txt'
  foreach ($s in $suites) {
    if (-not (Test-Path (Join-Path $pkg $s))) { Write-Host ('=== ' + $s + ' :: AUSENTE (o job pode nao ter chegado la)'); continue }
    cmd /c ("node " + $s + " > `"" + $so + "`" 2>&1")
    if ($LASTEXITCODE -ne 0) { Get-Content $so -Tail 25; Pop-Location; throw ("SUITE FALHOU: " + $s) }
    Write-Host ("=== " + $s + " :: " + ((Get-Content $so | Select-String 'pass \d|passaram|verde' | Select-Object -First 1)))
  }
  $graph = Join-Path $pkg 'loops-graph.tmp.js'
  [IO.File]::WriteAllText($graph, "require('./board.js');require('./aprender.js');require('./seamless.js');require('./fleet.js');console.log('require graph OK');")
  cmd /c ("node `"" + $graph + "`"")
  $ok = ($LASTEXITCODE -eq 0)
  Remove-Item $graph -Force -ErrorAction SilentlyContinue
  if (-not $ok) { Pop-Location; throw 'require graph partido' }
  Write-Host ('manifest: ' + ((Get-Content (Join-Path $pkg 'manifest.json') | Select-String '"version"' | Select-Object -First 1)))
  Pop-Location
  Write-Host 'TODAS AS SUITES VERDES + require graph OK'

  Push-Location $repo
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  if ($branch -eq 'main') { throw 'branch e main' }
  git add packages/mooter-bridge/ docs/strategy/PILARES_VIBE_CODING.md
  if ($LASTEXITCODE -ne 0) { throw 'git add falhou' }
  git commit -m 'feat(mooter-bridge): v1.20.0 - os dois loops de self-learning: sentinela horaria que ESCREVE em vez de gritar (so transicoes, custo zero) e afericao com tarefas de resposta conhecida que mede custo por resposta certa por motor; estudo dos pilares de vibe coding com a bateria real (moo 3/3 em 7s a 0 USD contra sonnet a 0.44 USD)'
  if ($LASTEXITCODE -ne 0) { throw 'git commit falhou' }
  git push origin $branch
  if ($LASTEXITCODE -ne 0) { throw 'git push falhou' }
  git show --stat HEAD | Select-Object -First 14
  Pop-Location
  Write-Host 'OK LOOPS COMPLETO'
} catch {
  Write-Host ("FALHOU: " + $_.Exception.Message)
} finally { Stop-Transcript }
