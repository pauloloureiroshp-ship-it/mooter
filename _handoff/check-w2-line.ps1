$ErrorActionPreference = 'Continue'
$log = 'C:\Users\Paulo Loureiro\frugal\_handoff\check-w2-line.log'
"=== page.tsx lines 54-58 $(Get-Date -Format o) ===" | Out-File -FilePath $log -Encoding ascii
(Get-Content 'C:\Users\Paulo Loureiro\frugal-w2\landing\app\page.tsx')[53..57] | Out-File -FilePath $log -Append -Encoding utf8
"--- git diff stat (read-only) ---" | Out-File -FilePath $log -Append -Encoding ascii
Push-Location 'C:\Users\Paulo Loureiro\frugal-w2'
& git diff --stat -- landing/app/page.tsx 2>&1 | Out-File -FilePath $log -Append -Encoding utf8
Pop-Location
"done" | Out-File -FilePath $log -Append -Encoding ascii
