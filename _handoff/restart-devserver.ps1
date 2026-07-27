$ErrorActionPreference = 'Continue'
$log = 'C:\Users\Paulo Loureiro\frugal\_handoff\restart-devserver.log'
"=== restart dev server 7819 $(Get-Date -Format o) ===" | Out-File -FilePath $log -Encoding ascii
$conn = Get-NetTCPConnection -LocalPort 7819 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) {
  $p = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $conn.OwningProcess) -ErrorAction SilentlyContinue
  ("old owner pid=" + $conn.OwningProcess) | Out-File -FilePath $log -Append -Encoding ascii
  if ($p) { ("old cmdline: " + $p.CommandLine) | Out-File -FilePath $log -Append -Encoding utf8 }
  Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
  "killed old listener" | Out-File -FilePath $log -Append -Encoding ascii
} else {
  "no listener on 7819" | Out-File -FilePath $log -Append -Encoding ascii
}
Start-Sleep -Seconds 2
if (-not (Test-Path 'C:\Users\Paulo Loureiro\frugal\landing\node_modules')) {
  "landing node_modules MISSING - aborting (needs npm install first)" | Out-File -FilePath $log -Append -Encoding ascii
  exit 1
}
Start-Process cmd -ArgumentList '/k','cd /d "C:\Users\Paulo Loureiro\frugal\landing" && npm run dev' -WindowStyle Minimized
"started npm run dev (minimized) from frugal\landing" | Out-File -FilePath $log -Append -Encoding ascii
$ok = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Seconds 2
  try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:7819/' -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
    if ($r.StatusCode -eq 200) { $ok = $true; break }
  } catch { }
}
if ($ok) { "UP: 200 on http://127.0.0.1:7819/ after ~$([int]($i*2))s" | Out-File -FilePath $log -Append -Encoding ascii }
else { "TIMEOUT: no 200 after 80s" | Out-File -FilePath $log -Append -Encoding ascii }
"done $(Get-Date -Format o)" | Out-File -FilePath $log -Append -Encoding ascii
