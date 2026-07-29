# precheck-seamless.ps1 — PRECOND 3 do handoff mooter-seamless (2026-07-24)
# Testa os 3 CLIs headless + autenticação, loga tudo em _handoff/precheck-seamless.log.
# Leitura pura: nenhum ficheiro do repo é alterado. Duplo-clique no RUN-PRECHECK-SEAMLESS.bat.
$ErrorActionPreference = 'Continue'
$repo = "C:\Users\Paulo Loureiro\frugal"
$log  = Join-Path $repo "_handoff\precheck-seamless.log"
Set-Location $repo

"=== PRECHECK SEAMLESS $(Get-Date -Format o) ===" | Out-File $log -Encoding utf8

foreach ($c in @('node','git','claude','codex','gemini')) {
  $src = (Get-Command $c -ErrorAction SilentlyContinue).Source
  $line = if ($src) { "which $c => $src" } else { "which $c => AUSENTE ❌" }
  $line | Out-File $log -Append -Encoding utf8
}

"`n--- claude -p headless (subscricao, sem --bare) ---" | Out-File $log -Append -Encoding utf8
$t0 = Get-Date
$out = & claude -p "responde exatamente: ok" --output-format json 2>&1 | Out-String
$dt = [int]((Get-Date) - $t0).TotalSeconds
"exit=$LASTEXITCODE duration_s=$dt" | Out-File $log -Append -Encoding utf8
$out.Substring(0, [Math]::Min(1500, $out.Length)) | Out-File $log -Append -Encoding utf8

"`n--- codex exec headless ---" | Out-File $log -Append -Encoding utf8
$t0 = Get-Date
$out = & codex exec "responde exatamente: ok" --json 2>&1 | Out-String
$dt = [int]((Get-Date) - $t0).TotalSeconds
"exit=$LASTEXITCODE duration_s=$dt" | Out-File $log -Append -Encoding utf8
$out.Substring(0, [Math]::Min(1500, $out.Length)) | Out-File $log -Append -Encoding utf8

"`n--- gemini -p headless ---" | Out-File $log -Append -Encoding utf8
$t0 = Get-Date
$out = & gemini -p "responde exatamente: ok" --output-format json 2>&1 | Out-String
$dt = [int]((Get-Date) - $t0).TotalSeconds
"exit=$LASTEXITCODE duration_s=$dt" | Out-File $log -Append -Encoding utf8
$out.Substring(0, [Math]::Min(1500, $out.Length)) | Out-File $log -Append -Encoding utf8

"`n--- suites do bridge (base + seamless) ---" | Out-File $log -Append -Encoding utf8
$out = & node --test "packages\mooter-bridge\server.test.js" "packages\mooter-bridge\seamless.test.js" 2>&1 | Out-String
"exit=$LASTEXITCODE" | Out-File $log -Append -Encoding utf8
($out -split "`n" | Select-Object -Last 12) -join "`n" | Out-File $log -Append -Encoding utf8

"`n=== FIM $(Get-Date -Format o) ===" | Out-File $log -Append -Encoding utf8
Write-Host "Precheck concluido. Log: $log"
Get-Content $log | Select-Object -Last 20
Start-Sleep -Seconds 3
