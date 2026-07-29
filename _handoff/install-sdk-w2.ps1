$ErrorActionPreference = 'Continue'
$root = 'C:\Users\Paulo Loureiro\frugal-w2'
$log = 'C:\Users\Paulo Loureiro\frugal\_handoff\install-sdk-w2.log'
Set-Location $root
"=== npm install in frugal-w2 $(Get-Date -Format o) ===" | Out-File -FilePath $log -Encoding ascii
& npm install 2>&1 | Out-File -FilePath $log -Append -Encoding utf8
"npm install exit=$LASTEXITCODE" | Out-File -FilePath $log -Append -Encoding ascii
if (Test-Path (Join-Path $root 'node_modules\@anthropic-ai\claude-agent-sdk\package.json')) {
  $v = (Get-Content (Join-Path $root 'node_modules\@anthropic-ai\claude-agent-sdk\package.json') | ConvertFrom-Json).version
  "VERIFY: SDK PRESENT v$v in frugal-w2" | Out-File -FilePath $log -Append -Encoding ascii
} else {
  "VERIFY: SDK MISSING in frugal-w2" | Out-File -FilePath $log -Append -Encoding ascii
}
"done $(Get-Date -Format o)" | Out-File -FilePath $log -Append -Encoding ascii
