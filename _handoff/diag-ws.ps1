$ErrorActionPreference = 'Continue'
$log = 'C:\Users\Paulo Loureiro\frugal\_handoff\diag-ws.log'
"=== code --status $(Get-Date -Format o) ===" | Out-File -FilePath $log -Encoding ascii
& code --status 2>&1 | Select-String -Pattern 'Folder|Workspace|window' -Context 0,2 | Out-File -FilePath $log -Append -Encoding utf8
"--- SDK em frugal-lp49 ---" | Out-File -FilePath $log -Append -Encoding ascii
if (Test-Path 'C:\Users\Paulo Loureiro\frugal-lp49\node_modules\@anthropic-ai\claude-agent-sdk\package.json') {
  "frugal-lp49 : SDK PRESENT" | Out-File -FilePath $log -Append -Encoding ascii
} else {
  "frugal-lp49 : SDK MISSING" | Out-File -FilePath $log -Append -Encoding ascii
}
"done $(Get-Date -Format o)" | Out-File -FilePath $log -Append -Encoding ascii
