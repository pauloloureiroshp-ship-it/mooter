# PUSH_GENESIS.ps1 - push do feat/genesis-tab (backup remoto do corpus). Autorizado por Paulo 2026-07-18.
# Sem PR, sem merge - so publica o branch. ASCII. Log verificado.
$ErrorActionPreference = "Continue"
$repo = "C:\Users\Paulo Loureiro\frugal"
$wt   = "C:\Users\Paulo Loureiro\frugal-genesis"
$log  = Join-Path $repo "_handoff\push-genesis.log"
function W($m){ $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"; Add-Content -Path $log -Value "$ts  $m" -Encoding ASCII; Write-Host $m }
Set-Content -Path $log -Value "=== PUSH FEAT/GENESIS-TAB ===" -Encoding ASCII
$br = (git -C $wt rev-parse --abbrev-ref HEAD 2>$null)
W "branch: $br"
if ($br -ne "feat/genesis-tab") { W "STOP: branch inesperada. ABORTADO."; exit 1 }
git -C $wt fetch origin 2>&1 | Out-Null
git -C $wt push -u origin feat/genesis-tab 2>&1 | ForEach-Object { W "  push> $_" }
git -C $wt log --oneline -3 2>&1 | ForEach-Object { W "  log> $_" }
W "=== DONE ==="
