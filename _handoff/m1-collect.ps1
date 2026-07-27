# m1-collect.ps1 — MARCO 1 (parte 2): status + collect do job (processo novo do daemon, prova idempotencia do ledger)
$ErrorActionPreference = 'Continue'
$repo = "C:\Users\Paulo Loureiro\frugal"
$log  = Join-Path $repo "_handoff\m1-collect.log"
$srv  = Join-Path $repo "packages\mooter-bridge\server-seamless.js"
$nl = [char]10

# job_id = ultimo dispatched do ledger
$ledger = "$env:USERPROFILE\.mooter\ledger.jsonl"
$last = Get-Content $ledger | ForEach-Object { $_ | ConvertFrom-Json } | Where-Object { $_.event -eq 'dispatched' } | Select-Object -Last 1
$jobId = $last.job_id

$init = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}'
$st = @{ jsonrpc = "2.0"; id = 2; method = "tools/call"; params = @{ name = "mooter_status"; arguments = @{ job_id = $jobId } } } | ConvertTo-Json -Compress -Depth 6
$co = @{ jsonrpc = "2.0"; id = 3; method = "tools/call"; params = @{ name = "mooter_collect"; arguments = @{ job_id = $jobId } } } | ConvertTo-Json -Compress -Depth 6

$tmpIn = Join-Path $env:TEMP "m1-collect-in.jsonl"
[IO.File]::WriteAllText($tmpIn, $init + $nl + $st + $nl + $co + $nl, (New-Object System.Text.UTF8Encoding($false)))

"=== M1 COLLECT $(Get-Date -Format o) · job=$jobId ===" | Out-File $log -Encoding utf8
cmd /c "node ""$srv"" < ""$tmpIn""" 2>&1 | Out-File $log -Append -Encoding utf8
"--- ledger completo ---" | Out-File $log -Append -Encoding utf8
Get-Content $ledger | Out-File $log -Append -Encoding utf8
"=== FIM ===" | Out-File $log -Append -Encoding utf8
