# ONDE.ps1 - descobre a pasta REAL da extensao pelo processo em execucao. So ASCII.
$ErrorActionPreference = 'Continue'
Start-Transcript -Path 'C:\Users\Paulo Loureiro\frugal\_handoff\onde-saida.txt' -Force
try {
  Write-Host '=== processos node com o servidor do mooter ==='
  $procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue
  foreach ($p in $procs) {
    $cl = $p.CommandLine
    if ($cl -and ($cl -match 'server-apps|mooter|seamless')) {
      Write-Host ('pid ' + $p.ProcessId)
      Write-Host ('  cmd: ' + $cl.Substring(0, [Math]::Min(300, $cl.Length)))
    }
  }
  Write-Host ''
  Write-Host '=== procura directa por server-apps.js fora do repo ==='
  $raizes = @(
    (Join-Path $env:APPDATA 'Claude'),
    (Join-Path $env:LOCALAPPDATA 'AnthropicClaude'),
    (Join-Path $env:LOCALAPPDATA 'Claude'),
    $env:USERPROFILE
  )
  foreach ($r in $raizes) {
    if (-not (Test-Path $r)) { continue }
    $achados = Get-ChildItem -Path $r -Filter 'server-apps.js' -Recurse -ErrorAction SilentlyContinue -Force |
      Where-Object { $_.FullName -notlike '*\frugal\packages\*' -and $_.FullName -notlike '*\.mooter\backup-*' } |
      Select-Object -First 5
    foreach ($a in $achados) {
      $man = Join-Path (Split-Path $a.FullName -Parent) '..\manifest.json'
      $v = 'n/d'
      try { $v = (Get-Content $man -Raw | ConvertFrom-Json).version } catch { }
      Write-Host ('  ' + $a.DirectoryName + '   manifest=' + $v)
    }
  }
  Write-Host 'FIM'
} catch {
  Write-Host ("FALHOU: " + $_.Exception.Message)
} finally { Stop-Transcript }
