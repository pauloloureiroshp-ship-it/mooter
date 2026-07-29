# PACK-INSTALL.ps1 - empacota a versao do manifest e instala na pasta real, com PROVA. So ASCII.
$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\Paulo Loureiro\frugal'
$pkg  = Join-Path $repo 'packages\mooter-bridge'
Start-Transcript -Path (Join-Path $repo '_handoff\pack-install.txt') -Force
try {
  $v = (Get-Content (Join-Path $pkg 'manifest.json') -Raw | ConvertFrom-Json).version
  Write-Host ('manifest no repo: ' + $v)

  Push-Location $pkg
  $out = Join-Path $env:TEMP 'pack.txt'
  cmd /c ("node pack-mcpb.mjs > `"" + $out + "`" 2>&1")
  $packOk = ($LASTEXITCODE -eq 0)
  Get-Content $out | ForEach-Object { Write-Host ('  ' + $_) }
  Pop-Location
  if (-not $packOk) { throw 'pack-mcpb falhou' }

  $alvo = Join-Path $repo ('_handoff\mooter-v' + ($v -replace '\.','') + '.mcpb')
  if (-not (Test-Path $alvo)) { throw ('o bundle esperado nao existe: ' + $alvo) }
  Write-Host ('bundle: ' + $alvo + '  ' + (Get-Item $alvo).Length + ' bytes')

  Push-Location (Join-Path $repo '_handoff')
  $out2 = Join-Path $env:TEMP 'inst.txt'
  cmd /c ("node instalar-nativo.js > `"" + $out2 + "`" 2>&1")
  $instOk = ($LASTEXITCODE -eq 0)
  Get-Content $out2 | ForEach-Object { Write-Host ('  ' + $_) }
  Pop-Location
  if (-not $instOk) { throw 'instalacao falhou' }

  # PROVA FINAL: ler o manifest na pasta real da extensao
  $ext = Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA 'Packages') -Filter 'manifest.json' -Recurse -ErrorAction SilentlyContinue -Force |
    Where-Object { $_.FullName -like '*Claude Extensions*mooter*' } | Select-Object -First 1
  if ($ext) {
    $vi = (Get-Content $ext.FullName -Raw | ConvertFrom-Json).version
    Write-Host ''
    Write-Host ('PROVA - manifest instalado: ' + $vi + '   (' + $ext.FullName + ')')
    if ($vi -eq $v) { Write-Host 'OK A VERSAO INSTALADA BATE COM O REPO' }
    else { Write-Host ('ATENCAO: instalado ' + $vi + ' mas o repo tem ' + $v) }
  } else { Write-Host 'ATENCAO: nao encontrei o manifest instalado para provar' }
} catch {
  Write-Host ("FALHOU: " + $_.Exception.Message)
} finally { Stop-Transcript }
