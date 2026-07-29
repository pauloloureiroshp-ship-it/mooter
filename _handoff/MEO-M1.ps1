# MEO-M1.ps1 - sonda de capacidades (M0) + scorecard (M1) + skills M-level. So ASCII.
$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\Paulo Loureiro\frugal'
$pkg  = Join-Path $repo 'packages\mooter-bridge'
$log  = Join-Path $repo '_handoff\meo-m1-resultado.txt'
Start-Transcript -Path $log -Force
try {
  $lock = Join-Path $repo '.git\index.lock'
  if (Test-Path $lock) { Remove-Item $lock -Force }

  $suites = @('board.test.js','capacidades.test.js','fosso.test.js','aprender.test.js','v12.test.js',
    'seamless.test.js','fleet.test.js','quota.test.js','moo.test.js','cabine.test.js','a4.test.js',
    'ondaA.test.js','tools6.test.js','audit.test.js','context.test.js','sessao.test.js',
    'paths.test.js','path.test.js','preview.test.js','server.test.js','update.test.js',
    'worktrees.test.js','bundle.test.js')
  Push-Location $pkg
  $so = Join-Path $env:TEMP 'meo-m1-out.txt'
  foreach ($s in $suites) {
    cmd /c ("node " + $s + " > `"" + $so + "`" 2>&1")
    if ($LASTEXITCODE -ne 0) { Get-Content $so -Tail 25; Pop-Location; throw ("SUITE FALHOU: " + $s) }
    Write-Host ("=== " + $s + " :: " + ((Get-Content $so | Select-String 'pass \d|passaram|verde' | Select-Object -First 1)))
  }

  # guarda de coerencia: o require graph tem de fechar (licao do commit 6224a0d)
  $graph = Join-Path $pkg 'meo-graph.tmp.js'
  [IO.File]::WriteAllText($graph, "require('./board.js');require('./capacidades.js');require('./fosso.js');require('./aprender.js');require('./seamless.js');require('./fleet.js');console.log('require graph OK');")
  cmd /c ("node `"" + $graph + "`"")
  $graphOk = ($LASTEXITCODE -eq 0)
  Remove-Item $graph -Force -ErrorAction SilentlyContinue
  if (-not $graphOk) { Pop-Location; throw 'require graph partido' }

  # o bundle tem de conhecer os ficheiros novos
  foreach ($f in @('board.js','capacidades.js','fosso.js','aprender.js')) {
    if (-not (Select-String -Path (Join-Path $pkg 'pack-mcpb.mjs') -Pattern ([regex]::Escape($f)) -Quiet)) {
      Pop-Location; throw ("pack-mcpb.mjs nao inclui " + $f)
    }
  }
  Pop-Location
  Write-Host 'TODAS AS SUITES VERDES + coerencia verificada'

  Push-Location $repo
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  if ($branch -eq 'main') { throw 'branch e main' }
  git add packages/mooter-bridge/board.js packages/mooter-bridge/board.test.js `
    packages/mooter-bridge/capacidades.js packages/mooter-bridge/capacidades.test.js `
    packages/mooter-bridge/fleet.js packages/mooter-bridge/server.js `
    packages/mooter-bridge/pack-mcpb.mjs packages/mooter-bridge/manifest.json `
    skills/ INFRA.md
  if ($LASTEXITCODE -ne 0) { throw 'git add falhou' }
  git commit -m 'feat(mooter-bridge): v1.16.0 - MEO M0+M1: sonda de capacidades do cliente MCP (n/d nunca vira false) e board.js com scorecard sem LLM, faixas calibraveis, excepcoes com dono e historico diario; skills dos seis cargos M-level versionadas no repo'
  if ($LASTEXITCODE -ne 0) { throw 'git commit falhou' }
  git push origin $branch
  if ($LASTEXITCODE -ne 0) { throw 'git push falhou' }
  git show --stat HEAD | Select-Object -First 16
  Pop-Location
  Write-Host 'OK MEO M0+M1 COMPLETO'
} catch {
  Write-Host ("FALHOU: " + $_.Exception.Message)
} finally { Stop-Transcript }
