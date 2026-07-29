# L1.ps1 - 14 loopholes (v1.22.0): suites + commit + empacotar + INSTALAR. So ASCII.
$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\Paulo Loureiro\frugal'
$pkg  = Join-Path $repo 'packages\mooter-bridge'
Start-Transcript -Path (Join-Path $repo '_handoff\l1-resultado.txt') -Force
try {
  $lock = Join-Path $repo '.git\index.lock'
  if (Test-Path $lock) { Remove-Item $lock -Force }

  $suites = @('fleet.test.js','update.test.js','board.test.js','sentinela.test.js','afericao.test.js',
    'seamless.test.js','v12.test.js','aprender.test.js','quota.test.js','capacidades.test.js',
    'fosso.test.js','moo.test.js','cabine.test.js','a4.test.js','ondaA.test.js','tools6.test.js',
    'audit.test.js','context.test.js','sessao.test.js','paths.test.js','path.test.js',
    'preview.test.js','server.test.js','worktrees.test.js','bundle.test.js')
  Push-Location $pkg
  $so = Join-Path $env:TEMP 'l1-out.txt'
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
  git add packages/mooter-bridge/ docs/strategy/ _handoff/PLANO_POS_AUDITORIA.md `
    _handoff/PROMPT_AUDITORIA_UX.md _handoff/PROMPT_APOS_REINICIO.md _handoff/instalar-nativo.js `
    _handoff/ONDE.ps1
  if ($LASTEXITCODE -ne 0) { throw 'git add falhou' }
  git commit -m 'fix(mooter-bridge): v1.22.0 - L1 fecha os 14 loopholes da auditoria UX: nenhum agregado nasce a 0 (somatorio sem parcelas medidas e n/d com jobs_sem_medicao), totals e arvore derivam da mesma funcao, medido_em+fresco+idade_h por bloco, blocos vazios desaparecem e o coherence deixa de mostrar stderr de ambiente; e o BUG DE TIJOLO: o verificador rejeitava o shebang dos nossos proprios ficheiros e teria trancado todas as instalacoes futuras'
  if ($LASTEXITCODE -ne 0) { throw 'git commit falhou' }
  git push origin $branch
  if ($LASTEXITCODE -ne 0) { throw 'git push falhou' }
  git show --stat HEAD | Select-Object -First 12
  Pop-Location

  Write-Host ''
  Write-Host '=== EMPACOTAR ==='
  Push-Location $pkg
  cmd /c "node pack-mcpb.mjs"
  if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'pack falhou' }
  Pop-Location

  Write-Host ''
  Write-Host '=== INSTALAR NA PASTA REAL DA EXTENSAO ==='
  Push-Location (Join-Path $repo '_handoff')
  cmd /c "node instalar-nativo.js"
  if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'instalacao falhou' }
  Pop-Location

  Write-Host 'OK L1 COMPLETO - reinicia o Claude Desktop e cola o prompt'
} catch {
  Write-Host ("FALHOU: " + $_.Exception.Message)
} finally { Stop-Transcript }
