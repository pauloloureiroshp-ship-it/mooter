# MEO-M1B.ps1 - coerencia de versao: o commit anunciava v1.16.0 mas o manifest ficou em 1.15.0.
$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\Paulo Loureiro\frugal'
$pkg  = Join-Path $repo 'packages\mooter-bridge'
Start-Transcript -Path (Join-Path $repo '_handoff\meo-m1b-resultado.txt') -Force
try {
  $lock = Join-Path $repo '.git\index.lock'
  if (Test-Path $lock) { Remove-Item $lock -Force }

  # o .mcpb da versao antiga sai do disco: dois bundles com o mesmo conteudo e
  # versoes diferentes e' a receita para instalar o errado
  $velho = Join-Path $repo '_handoff\mooter-v1150.mcpb'
  if (Test-Path $velho) { Remove-Item $velho -Force; Write-Host 'mooter-v1150.mcpb removido' }

  Push-Location $pkg
  cmd /c "node bundle.test.js > `"$env:TEMP\m1b.txt`" 2>&1"
  if ($LASTEXITCODE -ne 0) { Get-Content "$env:TEMP\m1b.txt" -Tail 15; Pop-Location; throw 'bundle.test.js falhou' }
  Write-Host ('bundle guard: ' + ((Get-Content "$env:TEMP\m1b.txt" | Select-String 'pass \d' | Select-Object -First 1)))
  Pop-Location

  Push-Location $repo
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  if ($branch -eq 'main') { throw 'branch e main' }
  git add packages/mooter-bridge/manifest.json
  if ($LASTEXITCODE -ne 0) { throw 'git add falhou' }
  git commit -m 'fix(mooter-bridge): manifest sobe a v1.16.0 - o commit anterior anunciava a versao no texto mas deixava o manifest em 1.15.0 (mesma classe de incoerencia do 6224a0d)'
  if ($LASTEXITCODE -ne 0) { throw 'git commit falhou' }
  git push origin $branch
  if ($LASTEXITCODE -ne 0) { throw 'git push falhou' }
  Pop-Location
  Write-Host 'OK M1B COMPLETO'
} catch {
  Write-Host ("FALHOU: " + $_.Exception.Message)
} finally { Stop-Transcript }
