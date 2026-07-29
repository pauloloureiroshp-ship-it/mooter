# commit-seamless.ps1 — commit SELETIVO da wave mooter-seamless Fase 0 (2026-07-24)
# Doutrina: git add seletivo (nunca -A) · commit na branch ATUAL · push/merge = gate do Paulo.
$ErrorActionPreference = 'Stop'
$repo = "C:\Users\Paulo Loureiro\frugal"
Set-Location $repo
$log = Join-Path $repo "_handoff\commit-seamless.log"

"=== COMMIT SEAMLESS $(Get-Date -Format o) ===" | Out-File $log -Encoding utf8
"branch: $(git branch --show-current)" | Out-File $log -Append -Encoding utf8

$files = @(
  "packages/mooter-bridge/seamless.js",
  "packages/mooter-bridge/seamless.test.js",
  "packages/mooter-bridge/server-seamless.js",
  "packages/mooter-bridge/SEAMLESS.md",
  "_handoff/precheck-seamless.ps1",
  "_handoff/RUN-PRECHECK-SEAMLESS.bat",
  "_handoff/apply-desktop-config-mooter.ps1",
  "_handoff/RUN-APPLY-DESKTOP-CONFIG-MOOTER.bat"
)
foreach ($f in $files) {
  if (-not (Test-Path (Join-Path $repo $f))) { "AUSENTE ❌ $f" | Out-File $log -Append -Encoding utf8 }
}
git add -- $files 2>&1 | Out-File $log -Append -Encoding utf8

# gate de sanidade: suites do bridge antes do commit
$out = node --test "packages\mooter-bridge\seamless.test.js" 2>&1 | Out-String
"seamless suite exit=$LASTEXITCODE" | Out-File $log -Append -Encoding utf8
if ($LASTEXITCODE -ne 0) {
  "TESTES FALHARAM - commit ABORTADO" | Out-File $log -Append -Encoding utf8
  git reset -- $files | Out-Null
  Write-Host "Testes falharam. Commit abortado. Ver $log"
  Start-Sleep -Seconds 6
  exit 1
}

git commit -m "feat(mooter-bridge): v0.2 seamless dispatch - route/dispatch/status/collect + ledger v1 (wave mooter-seamless F0)" 2>&1 | Out-File $log -Append -Encoding utf8
"HEAD: $(git rev-parse --short HEAD)" | Out-File $log -Append -Encoding utf8
"=== FIM (sem push - gate do Paulo) ===" | Out-File $log -Append -Encoding utf8
Write-Host "Commit local feito na branch atual. SEM push (gate). Log: $log"
Get-Content $log | Select-Object -Last 10
Start-Sleep -Seconds 4
