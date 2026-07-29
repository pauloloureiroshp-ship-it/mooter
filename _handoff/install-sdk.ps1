$ErrorActionPreference = 'Continue'
$root = 'C:\Users\Paulo Loureiro\frugal'
$log = Join-Path $root '_handoff\install-sdk.log'
Set-Location $root
"=== install @anthropic-ai/claude-agent-sdk $(Get-Date -Format o) ===" | Out-File -FilePath $log -Encoding ascii
& npm install -D "@anthropic-ai/claude-agent-sdk" 2>&1 | Out-File -FilePath $log -Append -Encoding utf8
"npm install exit=$LASTEXITCODE" | Out-File -FilePath $log -Append -Encoding ascii
& npm ls "@anthropic-ai/claude-agent-sdk" 2>&1 | Out-File -FilePath $log -Append -Encoding utf8
if (Test-Path (Join-Path $root 'node_modules\@anthropic-ai\claude-agent-sdk\package.json')) {
  "VERIFY: SDK PRESENT in node_modules" | Out-File -FilePath $log -Append -Encoding ascii
} else {
  "VERIFY: SDK MISSING in node_modules" | Out-File -FilePath $log -Append -Encoding ascii
}
"done $(Get-Date -Format o)" | Out-File -FilePath $log -Append -Encoding ascii
