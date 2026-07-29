# ONDA2B.ps1 - o commit 6224a0d ficou INCOERENTE: fleet.js chama quota.estadoAsync
# e o quota.js nao entrou no commit. Sem isto, um checkout limpo tem o painel a
# apanhar excepcao e a devolver quota n/d em silencio.
$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\Paulo Loureiro\frugal'
$pkg  = Join-Path $repo 'packages\mooter-bridge'
$log  = Join-Path $repo '_handoff\onda2b-resultado.txt'
Start-Transcript -Path $log -Force
try {
  $lock = Join-Path $repo '.git\index.lock'
  if (Test-Path $lock) { Remove-Item $lock -Force }

  # prova de que o commit anterior esta partido: sem a arvore de trabalho, a funcao nao existe
  Push-Location $repo
  cmd /c "git show 6224a0d:packages/mooter-bridge/quota.js > `"$env:TEMP\quota-commitado.js`""
  $temCommitado = Select-String -Path "$env:TEMP\quota-commitado.js" -Pattern 'estadoAsync' -Quiet
  Write-Host ("quota.js NO COMMIT 6224a0d tem estadoAsync? " + $temCommitado + "   <- se False, o commit estava partido")
  Pop-Location

  $suites = @('quota.test.js','fleet.test.js','seamless.test.js','v12.test.js','moo.test.js','cabine.test.js','a4.test.js')
  Push-Location $pkg
  $so = Join-Path $env:TEMP 'onda2b-out.txt'
  foreach ($s in $suites) {
    cmd /c ("node " + $s + " > `"" + $so + "`" 2>&1")
    if ($LASTEXITCODE -ne 0) { Get-Content $so -Tail 20; Pop-Location; throw ("SUITE FALHOU: " + $s) }
    Write-Host ("=== " + $s + " :: " + ((Get-Content $so | Select-String 'pass|passaram' | Select-Object -First 1)))
  }
  Pop-Location

  Push-Location $repo
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  if ($branch -eq 'main') { throw 'branch e main' }
  git add packages/mooter-bridge/quota.js packages/mooter-bridge/quota.test.js `
    docs/strategy/STRATEGY.md docs/strategy/RADAR_CONCORRENCIA.md `
    docs/foundation/STRATEGY_ARCHIVE_2026-05-24.md
  if ($LASTEXITCODE -ne 0) { throw 'git add falhou' }
  git commit -m 'fix(mooter-bridge): quota.estadoAsync entra no commit (a Onda 2 chamava-a sem a incluir) + Onda 5: STRATEGY.md reescrito na tese motor/cabine com factos medidos, radar de concorrencia trimestral'
  if ($LASTEXITCODE -ne 0) { throw 'git commit falhou' }
  git push origin $branch
  if ($LASTEXITCODE -ne 0) { throw 'git push falhou' }
  git show --stat HEAD | Select-Object -First 12
  Pop-Location
  Write-Host 'OK ONDA2B COMPLETA'
} catch {
  Write-Host ("FALHOU: " + $_.Exception.Message)
} finally { Stop-Transcript }
