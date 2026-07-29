# ONDA54.ps1 - bugs de honestidade do conector. So ASCII.
$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\Paulo Loureiro\frugal'
$pkg  = Join-Path $repo 'packages\mooter-bridge'
Start-Transcript -Path (Join-Path $repo '_handoff\onda54-resultado.txt') -Force
try {
  $lock = Join-Path $repo '.git\index.lock'
  if (Test-Path $lock) { Remove-Item $lock -Force }

  $suites = @('worktrees.test.js','tools6.test.js','seamless.test.js','v12.test.js','board.test.js',
    'capacidades.test.js','fosso.test.js','aprender.test.js','fleet.test.js','quota.test.js',
    'moo.test.js','cabine.test.js','a4.test.js','ondaA.test.js','audit.test.js','context.test.js',
    'sessao.test.js','paths.test.js','path.test.js','preview.test.js','server.test.js',
    'update.test.js','bundle.test.js')
  Push-Location $pkg
  $so = Join-Path $env:TEMP 'onda54-out.txt'
  foreach ($s in $suites) {
    cmd /c ("node " + $s + " > `"" + $so + "`" 2>&1")
    if ($LASTEXITCODE -ne 0) { Get-Content $so -Tail 25; Pop-Location; throw ("SUITE FALHOU: " + $s) }
    Write-Host ("=== " + $s + " :: " + ((Get-Content $so | Select-String 'pass \d|passaram|verde' | Select-Object -First 1)))
  }
  $graph = Join-Path $pkg 'onda54-graph.tmp.js'
  [IO.File]::WriteAllText($graph, "require('./board.js');require('./capacidades.js');require('./fosso.js');require('./aprender.js');require('./seamless.js');require('./fleet.js');require('./worktrees.js');require('./tools6.js');console.log('require graph OK');")
  cmd /c ("node `"" + $graph + "`"")
  $ok = ($LASTEXITCODE -eq 0)
  Remove-Item $graph -Force -ErrorAction SilentlyContinue
  if (-not $ok) { Pop-Location; throw 'require graph partido' }
  Pop-Location
  Write-Host 'TODAS AS SUITES VERDES + require graph OK'

  Push-Location $repo
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  if ($branch -eq 'main') { throw 'branch e main' }
  git add packages/mooter-bridge/seamless.js packages/mooter-bridge/seamless.test.js `
    packages/mooter-bridge/worktrees.js packages/mooter-bridge/worktrees.test.js `
    packages/mooter-bridge/tools6.js packages/mooter-bridge/tools6.test.js `
    packages/mooter-bridge/fleet.js packages/mooter-bridge/capacidades.js `
    packages/mooter-bridge/manifest.json docs/strategy/GOVERNANCA_MEO.md
  if ($LASTEXITCODE -ne 0) { throw 'git add falhou' }
  git commit -m 'fix(mooter-bridge): v1.17.0 - Onda 5.4, os tres bugs de honestidade: create_worktree deixa de ser aceite e ignorado, permissoes_efectivas passa a refletir o que o CLI recebeu (n/d quando indeterminavel) e o bind de projecto deixa de ser apagado por um bind parcial (roots do cliente como fonte preferida - MEDIDO: o cliente suporta roots com 9 raizes)'
  if ($LASTEXITCODE -ne 0) { throw 'git commit falhou' }
  git push origin $branch
  if ($LASTEXITCODE -ne 0) { throw 'git push falhou' }
  git show --stat HEAD | Select-Object -First 14
  Pop-Location
  Write-Host 'OK ONDA54 COMPLETO'
} catch {
  Write-Host ("FALHOU: " + $_.Exception.Message)
} finally { Stop-Transcript }
