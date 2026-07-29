# ONDA1.ps1 - runner nativo auto-validante (Onda 1, 2026-07-26)
# suites -> calibragem da quota (75%) -> OLLAMA_KV_CACHE_TYPE -> commit+push selectivo
$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\Paulo Loureiro\frugal'
$pkg  = Join-Path $repo 'packages\mooter-bridge'
$log  = Join-Path $repo '_handoff\onda1-resultado.txt'
Start-Transcript -Path $log -Force

try {
  $lock = Join-Path $repo '.git\index.lock'
  if (Test-Path $lock) { Remove-Item $lock -Force; Write-Host 'index.lock stale removido' }

  # 1) suites uma a uma (cmd /c + LASTEXITCODE - gotcha PS 5.1 provado hoje)
  $suites = @('moo.test.js','quota.test.js','seamless.test.js','ondaA.test.js','a4.test.js',
    'cabine.test.js','fleet.test.js','v12.test.js','tools6.test.js','audit.test.js',
    'context.test.js','sessao.test.js','paths.test.js','path.test.js','preview.test.js',
    'server.test.js','update.test.js','worktrees.test.js','bundle.test.js')
  Push-Location $pkg
  $so = Join-Path $env:TEMP 'onda1-out.txt'
  foreach ($s in $suites) {
    Write-Host ("=== " + $s + " ===")
    cmd /c ("node " + $s + " > `"" + $so + "`" 2>&1")
    if ($LASTEXITCODE -ne 0) { Get-Content $so -Tail 25; Pop-Location; throw ("SUITE FALHOU: " + $s) }
    Get-Content $so -Tail 3
  }
  Pop-Location
  Write-Host 'TODAS AS SUITES VERDES (nativo Windows)'

  # 2) calibragem da referencia (75% medido pelo Paulo) + verificacao
  node (Join-Path $repo '_handoff\onda1-prefs.js')
  if ($LASTEXITCODE -ne 0) { throw 'calibragem falhou' }

  # 3) Onda 1.5 - KV cache q8_0 (so vale apos reiniciar o Ollama)
  [Environment]::SetEnvironmentVariable('OLLAMA_KV_CACHE_TYPE','q8_0','User')
  $kv = [Environment]::GetEnvironmentVariable('OLLAMA_KV_CACHE_TYPE','User')
  if ($kv -ne 'q8_0') { throw 'env OLLAMA_KV_CACHE_TYPE nao ficou gravada' }
  Write-Host ('OLLAMA_KV_CACHE_TYPE=' + $kv + ' (User) - REINICIAR o Ollama para valer')

  # 4) git nativo, adds selectivos
  Push-Location $repo
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  if ($branch -eq 'main') { throw 'branch e main - nao comito em main sem gate humano' }
  git add packages/mooter-bridge/moo.js packages/mooter-bridge/moo.test.js `
    packages/mooter-bridge/seamless.js packages/mooter-bridge/manifest.json `
    INFRA.md _handoff/onda1-prefs.js
  if ($LASTEXITCODE -ne 0) { throw 'git add falhou' }
  git commit -m 'feat(mooter-bridge): v1.12.0 - Onda 1, parar de sabotar o tier local: num_ctx>=16384 + keep_alive (fim da truncagem silenciosa a 4096), selector adequacao x capacidade (qwen3.6:27b > qwen3:30b; codigo -> coder), KV cache q8_0 documentado'
  if ($LASTEXITCODE -ne 0) { throw 'git commit falhou' }
  git push origin $branch
  if ($LASTEXITCODE -ne 0) { throw 'git push falhou' }
  git show --stat HEAD | Select-Object -First 12
  Pop-Location

  Write-Host 'OK ONDA1 COMPLETA - commit e push feitos'
} catch {
  Write-Host ("FALHOU: " + $_.Exception.Message)
} finally {
  Stop-Transcript
}
