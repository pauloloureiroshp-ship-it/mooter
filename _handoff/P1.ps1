# P1.ps1 - aplicar assincrono (v1.21.0) + spec do Recibo de Fecho. So ASCII.
$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\Paulo Loureiro\frugal'
$pkg  = Join-Path $repo 'packages\mooter-bridge'
Start-Transcript -Path (Join-Path $repo '_handoff\p1-resultado.txt') -Force
try {
  $lock = Join-Path $repo '.git\index.lock'
  if (Test-Path $lock) { Remove-Item $lock -Force }
  $suites = @('update.test.js','sentinela.test.js','afericao.test.js','board.test.js','seamless.test.js',
    'v12.test.js','aprender.test.js','quota.test.js','capacidades.test.js','fosso.test.js',
    'fleet.test.js','moo.test.js','cabine.test.js','a4.test.js','ondaA.test.js','tools6.test.js',
    'audit.test.js','context.test.js','sessao.test.js','paths.test.js','path.test.js',
    'preview.test.js','server.test.js','worktrees.test.js','bundle.test.js')
  Push-Location $pkg
  $so = Join-Path $env:TEMP 'p1-out.txt'
  foreach ($s in $suites) {
    if (-not (Test-Path (Join-Path $pkg $s))) { continue }
    cmd /c ("node " + $s + " > `"" + $so + "`" 2>&1")
    if ($LASTEXITCODE -ne 0) { Get-Content $so -Tail 25; Pop-Location; throw ("SUITE FALHOU: " + $s) }
    Write-Host ("=== " + $s + " :: " + ((Get-Content $so | Select-String 'pass \d|passaram|verde' | Select-Object -First 1)))
  }
  Write-Host ('manifest: ' + ((Get-Content (Join-Path $pkg 'manifest.json') | Select-String '"version"' | Select-Object -First 1)))
  Pop-Location
  Write-Host 'TODAS AS SUITES VERDES'

  Push-Location $repo
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  if ($branch -eq 'main') { throw 'branch e main' }
  git add packages/mooter-bridge/ docs/strategy/RECIBO_DE_FECHO.md _handoff/PLANO_AUTOUPDATE.md
  if ($LASTEXITCODE -ne 0) { throw 'git add falhou' }
  git commit -m 'feat(mooter-bridge): v1.21.0 - aplicar assincrono (o update deixou de caber no timeout de 30s do host quando o bundle passou a 32 ficheiros) com estado persistido e stale honesto; spec do Recibo de Fecho e plano de actualizacao silenciosa'
  if ($LASTEXITCODE -ne 0) { throw 'git commit falhou' }
  git push origin $branch
  if ($LASTEXITCODE -ne 0) { throw 'git push falhou' }
  git show --stat HEAD | Select-Object -First 12
  Pop-Location
  Write-Host 'OK P1 COMPLETO'
} catch {
  Write-Host ("FALHOU: " + $_.Exception.Message)
} finally { Stop-Transcript }
