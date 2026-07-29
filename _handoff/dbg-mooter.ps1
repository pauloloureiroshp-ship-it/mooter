# dbg-mooter.ps1 — diagnóstico do conector mooter no Claude Desktop (2026-07-24)
# Copia config + logs MCP para _handoff e testa o server manualmente. Leitura pura + cópias.
$ErrorActionPreference = 'Continue'
$repo = "C:\Users\Paulo Loureiro\frugal"
$out  = Join-Path $repo "_handoff\dbg-mooter.log"
"=== DBG MOOTER $(Get-Date -Format o) ===" | Out-File $out -Encoding utf8

$cfg = Join-Path $env:APPDATA "Claude\claude_desktop_config.json"
"--- config ---" | Out-File $out -Append -Encoding utf8
Get-Content $cfg -Raw | Out-File $out -Append -Encoding utf8

"--- logs dir (ultimos 15 por data) ---" | Out-File $out -Append -Encoding utf8
$logdir = Join-Path $env:APPDATA "Claude\logs"
Get-ChildItem $logdir -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 15 | ForEach-Object { "$($_.LastWriteTime.ToString('HH:mm:ss'))  $($_.Length)  $($_.Name)" } | Out-File $out -Append -Encoding utf8

"--- tail dos logs mcp*mooter* ---" | Out-File $out -Append -Encoding utf8
Get-ChildItem $logdir -File -Filter "*mooter*" -ErrorAction SilentlyContinue | ForEach-Object {
  ">> $($_.Name)" | Out-File $out -Append -Encoding utf8
  Get-Content $_.FullName -Tail 40 | Out-File $out -Append -Encoding utf8
}

"--- tail mcp.log geral (60) ---" | Out-File $out -Append -Encoding utf8
$general = Join-Path $logdir "mcp.log"
if (Test-Path $general) { Get-Content $general -Tail 60 | Out-File $out -Append -Encoding utf8 }

"--- teste manual do server (initialize + tools/list, 15s timeout) ---" | Out-File $out -Append -Encoding utf8
$srv = "C:\Users\Paulo Loureiro\frugal\packages\mooter-bridge\server-seamless.js"
"exists: $(Test-Path $srv)" | Out-File $out -Append -Encoding utf8
$lines = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}' + "`n" + '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' + "`n"
$tmpIn = Join-Path $env:TEMP "mooter-dbg-in.txt"
[IO.File]::WriteAllText($tmpIn, $lines)
$res = cmd /c "node ""$srv"" < ""$tmpIn"" 2>&1"
$res | Out-File $out -Append -Encoding utf8
"=== FIM $(Get-Date -Format o) ===" | Out-File $out -Append -Encoding utf8
