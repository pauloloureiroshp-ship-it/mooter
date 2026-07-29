$ErrorActionPreference = 'Continue'
$log = 'C:\Users\Paulo Loureiro\frugal\_handoff\diag-sdk.log'
"=== diag SDK $(Get-Date -Format o) ===" | Out-File -FilePath $log -Encoding ascii
"--- mooter extension versions installed ---" | Out-File -FilePath $log -Append -Encoding ascii
& code --list-extensions --show-versions 2>&1 | Select-String -Pattern 'mooter' | Out-File -FilePath $log -Append -Encoding utf8
"--- SDK presence ---" | Out-File -FilePath $log -Append -Encoding ascii
$paths = @(
  'C:\Users\Paulo Loureiro\frugal',
  'C:\Users\Paulo Loureiro\frugal-w2',
  'C:\Users\Paulo Loureiro\frugal-w1-f3',
  'C:\Users\Paulo Loureiro\frugal-eyeball'
)
foreach ($p in $paths) {
  $sdk = Join-Path $p 'node_modules\@anthropic-ai\claude-agent-sdk\package.json'
  if (Test-Path $sdk) {
    $v = (Get-Content $sdk | ConvertFrom-Json).version
    "$p : SDK PRESENT v$v" | Out-File -FilePath $log -Append -Encoding ascii
  } elseif (Test-Path $p) {
    "$p : SDK MISSING" | Out-File -FilePath $log -Append -Encoding ascii
  } else {
    "$p : (pasta nao existe)" | Out-File -FilePath $log -Append -Encoding ascii
  }
}
"--- VS Code window titles (processos) ---" | Out-File -FilePath $log -Append -Encoding ascii
Get-Process | Where-Object { $_.ProcessName -eq 'Code' -and $_.MainWindowTitle } | ForEach-Object { $_.MainWindowTitle } | Out-File -FilePath $log -Append -Encoding utf8
"done $(Get-Date -Format o)" | Out-File -FilePath $log -Append -Encoding ascii
