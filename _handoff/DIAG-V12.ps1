# DIAG-V12.ps1 - a falha do E2E e regressao da Onda 2 ou pre-existente?
# Corre v12.test.js 3x com o codigo ACTUAL e 3x com seamless.js/fleet.js do HEAD.
$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\Paulo Loureiro\frugal'
$pkg  = Join-Path $repo 'packages\mooter-bridge'
$log  = Join-Path $repo '_handoff\diag-v12.txt'
Start-Transcript -Path $log -Force
try {
  $base = Join-Path $env:TEMP 'onda2-baseline'
  if (Test-Path $base) { Remove-Item $base -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $base | Out-Null
  Copy-Item (Join-Path $pkg '*') $base -Recurse -Force

  # substituir apenas o que a Onda 2 tocou, pela versao do HEAD
  Push-Location $repo
  foreach ($f in @('seamless.js','fleet.js','seamless.test.js','fleet.test.js')) {
    cmd /c ("git show HEAD:packages/mooter-bridge/" + $f + " > `"" + (Join-Path $base $f) + "`"")
    if ($LASTEXITCODE -ne 0) { throw ("git show falhou para " + $f) }
  }
  Pop-Location

  $so = Join-Path $env:TEMP 'diag-out.txt'
  Write-Host '--- ACTUAL (com Onda 2) ---'
  Push-Location $pkg
  for ($i=1; $i -le 3; $i++) {
    cmd /c ("node v12.test.js > `"" + $so + "`" 2>&1")
    Write-Host ("run " + $i + " exit=" + $LASTEXITCODE + " :: " + ((Get-Content $so | Select-String 'testes passaram|FAIL ' | Select-Object -First 2) -join ' | '))
  }
  Pop-Location

  Write-Host '--- BASELINE (HEAD, sem Onda 2) ---'
  Push-Location $base
  for ($i=1; $i -le 3; $i++) {
    cmd /c ("node v12.test.js > `"" + $so + "`" 2>&1")
    Write-Host ("run " + $i + " exit=" + $LASTEXITCODE + " :: " + ((Get-Content $so | Select-String 'testes passaram|FAIL ' | Select-Object -First 2) -join ' | '))
  }
  Pop-Location
  Write-Host 'DIAG COMPLETO'
} catch {
  Write-Host ("FALHOU: " + $_.Exception.Message)
} finally { Stop-Transcript }
