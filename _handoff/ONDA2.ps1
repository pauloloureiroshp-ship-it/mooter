# ONDA2.ps1 - runner nativo auto-validante (Onda 2, conduzida via Mooter/Codex)
$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\Paulo Loureiro\frugal'
$pkg  = Join-Path $repo 'packages\mooter-bridge'
$log  = Join-Path $repo '_handoff\onda2-resultado.txt'
Start-Transcript -Path $log -Force

try {
  $lock = Join-Path $repo '.git\index.lock'
  if (Test-Path $lock) { Remove-Item $lock -Force; Write-Host 'index.lock stale removido' }

  $suites = @('v12.test.js','seamless.test.js','fleet.test.js','moo.test.js','quota.test.js','ondaA.test.js',
    'a4.test.js','cabine.test.js','v12.test.js','tools6.test.js','audit.test.js',
    'context.test.js','sessao.test.js','paths.test.js','path.test.js','preview.test.js',
    'server.test.js','update.test.js','worktrees.test.js','bundle.test.js')
  Push-Location $pkg
  $so = Join-Path $env:TEMP 'onda2-out.txt'
  foreach ($s in $suites) {
    Write-Host ("=== " + $s + " ===")
    cmd /c ("node " + $s + " > `"" + $so + "`" 2>&1")
    if ($LASTEXITCODE -ne 0) { Get-Content $so -Tail 25; Pop-Location; throw ("SUITE FALHOU: " + $s) }
    Get-Content $so -Tail 3
  }
  Pop-Location
  Write-Host 'TODAS AS SUITES VERDES (nativo Windows)'

  Push-Location $repo
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  if ($branch -eq 'main') { throw 'branch e main - nao comito em main sem gate humano' }
  git add packages/mooter-bridge/seamless.js packages/mooter-bridge/fleet.js `
    packages/mooter-bridge/seamless.test.js packages/mooter-bridge/fleet.test.js `
    packages/mooter-bridge/manifest.json _handoff/PLANO_CONDUTOR_2026-07-26.md
  if ($LASTEXITCODE -ne 0) { throw 'git add falhou' }
  git commit -m 'feat(mooter-bridge): v1.13.0 - Onda 2, a lentidao sentida: timeout de preparacao (MOOTER_PREP_TIMEOUT_MS 20s), fallback quando o moo falha (chain nunca morre em silencio), prep medida no ledger (duration+poupanca estimada), sondas do painel em paralelo com timeout por sonda - implementado por Codex, conduzido e verificado pelo Cowork'
  if ($LASTEXITCODE -ne 0) { throw 'git commit falhou' }
  git push origin $branch
  if ($LASTEXITCODE -ne 0) { throw 'git push falhou' }
  git show --stat HEAD | Select-Object -First 12
  Pop-Location

  Write-Host 'OK ONDA2 COMPLETA - commit e push feitos'
} catch {
  Write-Host ("FALHOU: " + $_.Exception.Message)
} finally {
  Stop-Transcript
}
