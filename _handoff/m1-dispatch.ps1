# m1-dispatch.ps1 — MARCO 1 (parte 1): dispatch real via daemon mooter-bridge v0.2 (2026-07-24)
# ASCII-only por causa do PS5.1 sem BOM; o char de routing é injetado via [char]0x21C4.
$ErrorActionPreference = 'Continue'
$repo = "C:\Users\Paulo Loureiro\frugal"
$log  = Join-Path $repo "_handoff\m1-dispatch.log"
$srv  = Join-Path $repo "packages\mooter-bridge\server-seamless.js"
$arrow = [char]0x21C4
$nl = [char]10

$mp = "$arrow ROUTING" + $nl + "DE: Cowork (brain)" + $nl + "PARA: cc" + $nl + "WAVE: mooter-seamless-m1" + $nl + $nl + "Responde exatamente com a palavra: ok. Nada mais."

$args1 = @{ agent = "cc"; worktree = "C:\Users\Paulo Loureiro\frugal-w2"; masterprompt = $mp; wave = "mooter-seamless-m1"; allowedTools = "Read" }
$call = @{ jsonrpc = "2.0"; id = 3; method = "tools/call"; params = @{ name = "mooter_dispatch"; arguments = $args1 } } | ConvertTo-Json -Compress -Depth 6
$init = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}'

$tmpIn = Join-Path $env:TEMP "m1-in.jsonl"
[IO.File]::WriteAllText($tmpIn, $init + $nl + $call + $nl, (New-Object System.Text.UTF8Encoding($false)))

"=== M1 DISPATCH $(Get-Date -Format o) ===" | Out-File $log -Encoding utf8
# o daemon fica vivo ate o job fechar (drain do REGISTRY) e escreve done+custo no ledger
cmd /c "node ""$srv"" < ""$tmpIn""" 2>&1 | Out-File $log -Append -Encoding utf8
"daemon exit=$LASTEXITCODE $(Get-Date -Format o)" | Out-File $log -Append -Encoding utf8
"--- ledger tail ---" | Out-File $log -Append -Encoding utf8
Get-Content "$env:USERPROFILE\.mooter\ledger.jsonl" -Tail 10 -ErrorAction SilentlyContinue | Out-File $log -Append -Encoding utf8
"=== FIM ===" | Out-File $log -Append -Encoding utf8
