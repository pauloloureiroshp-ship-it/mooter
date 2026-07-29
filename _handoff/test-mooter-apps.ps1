# test-mooter-apps.ps1 - corre o smoke do mooter-bridge v0.3 e grava o log SEM BOM.
# PS 5.1 safe: stderr benigno nao mata o script (o servidor escreve o "ready" em stderr).
$ErrorActionPreference = 'Continue'

$here   = Split-Path -Parent $MyInvocation.MyCommand.Path
$smoke  = Join-Path $here 'apps-smoke.js'
$logOut = Join-Path $here 'test-mooter-apps.log'
$lines  = New-Object System.Collections.Generic.List[string]

function Add-Line([string]$s) { $lines.Add($s); Write-Host $s }

Add-Line ("=== RUN " + (Get-Date -Format o) + " ===")
Add-Line ("PSVersion: " + $PSVersionTable.PSVersion.ToString())

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Add-Line 'FALHA: node nao esta no PATH desta shell.'
  Add-Line 'Instala Node ou usa o caminho absoluto do node.exe no registo do conector.'
} else {
  Add-Line ("node no PATH: " + $node.Source)
  $v = & node --version 2>&1
  Add-Line ("node version: " + $v)
}

if (-not (Test-Path $smoke)) {
  Add-Line ("FALHA: nao encontrei " + $smoke)
} else {
  Add-Line ''
  $out = & node $smoke 2>&1
  $code = $LASTEXITCODE
  foreach ($l in $out) { Add-Line ([string]$l) }
  Add-Line ''
  Add-Line ("exit code: " + $code)
}

Add-Line ("=== FIM " + (Get-Date -Format o) + " ===")

# Gotcha conhecido do repo: Out-File/Set-Content -Encoding utf8 no PS 5.1 mete BOM.
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($logOut, ($lines -join "`r`n"), $utf8NoBom)
Write-Host ''
Write-Host ("log gravado em: " + $logOut)
