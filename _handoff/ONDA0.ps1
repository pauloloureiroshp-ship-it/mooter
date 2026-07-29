# ONDA0.ps1 - runner nativo auto-validante (Onda 0, 2026-07-26)
# 1) backup, 2) suites uma-a-uma com timeout, 3) medicao real, 4) commit+push selectivo.
# Qualquer falha aborta ANTES do git. Transcript completo em _handoff\onda0-resultado.txt
$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\Paulo Loureiro\frugal'
$pkg  = Join-Path $repo 'packages\mooter-bridge'
$log  = Join-Path $repo '_handoff\onda0-resultado.txt'
Start-Transcript -Path $log -Force

try {
  # 0) lock stale do mount (gotcha conhecido: o mount nao consegue apagar dentro do .git)
  $lock = Join-Path $repo '.git\index.lock'
  if (Test-Path $lock) { Remove-Item $lock -Force; Write-Host 'index.lock stale removido' }

  # 1) backup dos ficheiros tocados
  $bak = Join-Path $repo '_handoff\onda0-backup'
  New-Item -ItemType Directory -Force -Path $bak | Out-Null
  $tocados = @('quota.js','quota.test.js','localfirst.js','seamless.js','context.js','manifest.json')
  foreach ($f in $tocados) {
    Copy-Item (Join-Path $pkg $f) (Join-Path $bak $f) -Force
    $h = (Get-FileHash (Join-Path $pkg $f) -Algorithm SHA256).Hash
    Write-Host ("sha256 " + $f + " = " + $h)
  }

  # 2) suites uma a uma, timeout 120s cada
  $suites = @('quota.test.js','context.test.js','sessao.test.js','a4.test.js','ondaA.test.js',
    'seamless.test.js','cabine.test.js','v12.test.js','tools6.test.js','fleet.test.js',
    'moo.test.js','paths.test.js','path.test.js','preview.test.js','server.test.js',
    'update.test.js','worktrees.test.js','audit.test.js','bundle.test.js')
  # gotcha PS 5.1 provado hoje neste host: Start-Process -PassThru devolve
  # ExitCode $null mesmo apos WaitForExit(). cmd /c + $LASTEXITCODE e fiavel.
  Push-Location $pkg
  $so = Join-Path $env:TEMP 'onda0-out.txt'
  foreach ($s in $suites) {
    Write-Host ("=== " + $s + " ===")
    cmd /c ("node " + $s + " > `"" + $so + "`" 2>&1")
    if ($LASTEXITCODE -ne 0) {
      Get-Content $so -Tail 25
      Pop-Location
      throw ("SUITE FALHOU: " + $s + " (exit " + $LASTEXITCODE + ")")
    }
    Get-Content $so -Tail 3
  }
  Pop-Location
  Write-Host 'TODAS AS SUITES VERDES (nativo Windows)'

  # 3) medicao real (Onda 0.3) - escreve _handoff\onda0-medicao.json
  Push-Location (Join-Path $repo '_handoff')
  node .\onda0-medir.js
  if ($LASTEXITCODE -ne 0) { throw 'medicao falhou' }
  Pop-Location

  # 4) git NATIVO, adds selectivos apenas (nunca add -A)
  Push-Location $repo
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  if ($branch -eq 'main') { throw 'branch e main - nao comito em main sem gate humano' }
  Write-Host ("branch: " + $branch)
  git add packages/mooter-bridge/quota.js packages/mooter-bridge/quota.test.js `
    packages/mooter-bridge/localfirst.js packages/mooter-bridge/seamless.js `
    packages/mooter-bridge/context.js packages/mooter-bridge/manifest.json `
    _handoff/onda0-medir.js
  if ($LASTEXITCODE -ne 0) { throw 'git add falhou' }
  git commit -m 'feat(mooter-bridge): Onda 0.3 - referencia da quota calibravel via ~/.mooter/preferences.json (quota_referencia), com origem declarada; medicao real: inflacao 2.44x (2061 linhas -> 844 turnos), Codex disponivel'
  if ($LASTEXITCODE -ne 0) { throw 'git commit falhou' }
  git push origin $branch
  if ($LASTEXITCODE -ne 0) { throw 'git push falhou' }
  git show --stat HEAD | Select-Object -First 15
  Pop-Location

  Write-Host 'OK ONDA0 COMPLETA - commit e push feitos'
} catch {
  Write-Host ("FALHOU: " + $_.Exception.Message)
} finally {
  Stop-Transcript
}
