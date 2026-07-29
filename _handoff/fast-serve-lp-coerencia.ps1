$ErrorActionPreference = 'Continue'
$log = 'C:\Users\Paulo Loureiro\frugal\_handoff\fast-serve-lp-coerencia.log'
$root = 'C:\Users\Paulo Loureiro\frugal-lp-coerencia'
"=== fast-serve frugal-lp-coerencia landing on 7819 $(Get-Date -Format o) ===" | Out-File -FilePath $log -Encoding ascii

"--- killing stray npm/node from the stuck install ---" | Out-File -FilePath $log -Append -Encoding ascii
Get-CimInstance Win32_Process -Filter "Name='node.exe' or Name='npm.exe' or Name='cmd.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match 'frugal-lp-coerencia' } |
  ForEach-Object { "killing pid $($_.ProcessId): $($_.CommandLine)" | Out-File -FilePath $log -Append -Encoding utf8; Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

$conn = Get-NetTCPConnection -LocalPort 7819 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) { Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue; "killed old 7819 listener (pid $($conn.OwningProcess))" | Out-File -FilePath $log -Append -Encoding ascii }

$srcCandidates = @(
  'C:\Users\Paulo Loureiro\frugal-w2\landing\node_modules',
  'C:\Users\Paulo Loureiro\frugal-final\landing\node_modules',
  'C:\Users\Paulo Loureiro\frugal\landing\node_modules'
)
$src = $srcCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
$dst = Join-Path $root 'landing\node_modules'
if ($src) {
  "copiando node_modules de $src (atalho para evitar npm install lento)" | Out-File -FilePath $log -Append -Encoding utf8
  if (Test-Path $dst) { Remove-Item $dst -Recurse -Force -ErrorAction SilentlyContinue }
  & robocopy $src $dst /MIR /NFL /NDL /NJH /NJS /NP /MT:16 2>&1 | Select-Object -Last 10 | Out-File -FilePath $log -Append -Encoding utf8
  "robocopy exit=$LASTEXITCODE" | Out-File -FilePath $log -Append -Encoding ascii
} else {
  "nenhuma node_modules candidata encontrada; sem atalho possivel" | Out-File -FilePath $log -Append -Encoding ascii
}

if (Test-Path $dst) {
  Start-Process cmd -ArgumentList '/k','cd /d "C:\Users\Paulo Loureiro\frugal-lp-coerencia\landing" && npm run dev' -WindowStyle Minimized
  "started npm run dev from frugal-lp-coerencia\landing" | Out-File -FilePath $log -Append -Encoding ascii
  $ok = $false
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 2
    try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:7819/' -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop; if ($r.StatusCode -eq 200) { $ok = $true; break } } catch { }
  }
  if ($ok) { "UP: 200 after ~$([int]($i*2))s" | Out-File -FilePath $log -Append -Encoding ascii } else { "TIMEOUT after 120s" | Out-File -FilePath $log -Append -Encoding ascii }
} else {
  "sem node_modules -> nao arranquei o dev server" | Out-File -FilePath $log -Append -Encoding ascii
}
"done $(Get-Date -Format o)" | Out-File -FilePath $log -Append -Encoding ascii
