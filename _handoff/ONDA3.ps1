# ONDA3.ps1 - o loop que aprende. Suites nativas + prova com o ledger real + commit selectivo.
$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\Paulo Loureiro\frugal'
$pkg  = Join-Path $repo 'packages\mooter-bridge'
$log  = Join-Path $repo '_handoff\onda3-resultado.txt'
Start-Transcript -Path $log -Force
try {
  $lock = Join-Path $repo '.git\index.lock'
  if (Test-Path $lock) { Remove-Item $lock -Force }

  $suites = @('aprender.test.js','v12.test.js','seamless.test.js','fleet.test.js','quota.test.js',
    'moo.test.js','cabine.test.js','a4.test.js','ondaA.test.js','tools6.test.js','audit.test.js',
    'context.test.js','sessao.test.js','paths.test.js','path.test.js','preview.test.js',
    'server.test.js','update.test.js','worktrees.test.js','bundle.test.js')
  Push-Location $pkg
  $so = Join-Path $env:TEMP 'onda3-out.txt'
  foreach ($s in $suites) {
    cmd /c ("node " + $s + " > `"" + $so + "`" 2>&1")
    if ($LASTEXITCODE -ne 0) { Get-Content $so -Tail 25; Pop-Location; throw ("SUITE FALHOU: " + $s) }
    Write-Host ("=== " + $s + " :: " + ((Get-Content $so | Select-String 'pass \d|passaram|verde' | Select-Object -First 1)))
  }
  Pop-Location
  Write-Host 'TODAS AS SUITES VERDES (nativo Windows)'

  # a prova: o loop lê o ledger REAL e diz o que aprendeu (n/d onde não sabe)
  node (Join-Path $repo '_handoff\onda3-prova.js')
  if ($LASTEXITCODE -ne 0) { throw 'prova falhou' }

  Push-Location $repo
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  if ($branch -eq 'main') { throw 'branch e main' }
  git add packages/mooter-bridge/aprender.js packages/mooter-bridge/aprender.test.js `
    packages/mooter-bridge/seamless.js packages/mooter-bridge/manifest.json `
    _handoff/onda3-prova.js _handoff/medir-gitbase.js
  if ($LASTEXITCODE -ne 0) { throw 'git add falhou' }
  git commit -m 'feat(mooter-bridge): v1.14.0 - Onda 3, o loop que aprende: aprender.js le o ledger e um resultado de job passa a mudar decisoes futuras (>=5 observacoes, nunca contra um veto de risco), keep rate honesto (n/d quando nao e atribuivel), satisfacao inferida, custo por tarefa entregue e bloco -o que aprendi- - implementado por Codex, conduzido e verificado pelo Cowork'
  if ($LASTEXITCODE -ne 0) { throw 'git commit falhou' }
  git push origin $branch
  if ($LASTEXITCODE -ne 0) { throw 'git push falhou' }
  git show --stat HEAD | Select-Object -First 12
  Pop-Location
  Write-Host 'OK ONDA3 COMPLETA'
} catch {
  Write-Host ("FALHOU: " + $_.Exception.Message)
} finally { Stop-Transcript }
