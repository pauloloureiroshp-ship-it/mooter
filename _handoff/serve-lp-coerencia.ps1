$ErrorActionPreference = 'Continue'
$log = 'C:\Users\Paulo Loureiro\frugal\_handoff\serve-lp-coerencia.log'
$root = 'C:\Users\Paulo Loureiro\frugal-lp-coerencia'
"=== serve frugal-lp-coerencia landing on 7819 $(Get-Date -Format o) ===" | Out-File -FilePath $log -Encoding ascii
$conn = Get-NetTCPConnection -LocalPort 7819 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) { Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue; "killed old 7819 (pid $($conn.OwningProcess))" | Out-File -FilePath $log -Append -Encoding ascii }
if (-not (Test-Path (Join-Path $root 'landing\node_modules'))) {
  "landing node_modules missing -> npm install (pode demorar)" | Out-File -FilePath $log -Append -Encoding ascii
  Push-Location (Join-Path $root 'landing')
  & npm install 2>&1 | Select-Object -Last 5 | Out-File -FilePath $log -Append -Encoding utf8
  Pop-Location
}
Start-Process cmd -ArgumentList '/k','cd /d "C:\Users\Paulo Loureiro\frugal-lp-coerencia\landing" && npm run dev' -WindowStyle Minimized
"started npm run dev from frugal-lp-coerencia\landing" | Out-File -FilePath $log -Append -Encoding ascii
$ok = $false
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 2
  try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:7819/' -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop; if ($r.StatusCode -eq 200) { $ok = $true; break } } catch { }
}
if ($ok) { "UP: 200 after ~$([int]($i*2))s" | Out-File -FilePath $log -Append -Encoding ascii } else { "TIMEOUT after 120s" | Out-File -FilePath $log -Append -Encoding ascii }
"marker check:" | Out-File -FilePath $log -Append -Encoding ascii
Select-String -Path (Join-Path $root 'landing\next.config.ts') -Pattern 'LP_ROOT' -ErrorAction SilentlyContinue | Select-Object -First 2 | Out-File -FilePath $log -Append -Encoding utf8
"done $(Get-Date -Format o)" | Out-File -FilePath $log -Append -Encoding ascii
