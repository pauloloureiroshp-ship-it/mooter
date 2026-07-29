# COMMIT_GENESIS_DC.ps1 - grava o DECISION CONTRACT STOP-0 no worktree feat/genesis-tab
# Commit LOCAL apenas. NAO faz push (gate Paulo). Idempotente. ASCII.
$ErrorActionPreference = "Continue"
$repo = "C:\Users\Paulo Loureiro\frugal"
$wt   = "C:\Users\Paulo Loureiro\frugal-genesis"
$log  = Join-Path $repo "_handoff\commit-genesis-dc.log"
$f    = "_handoff\GENESIS_DECISION_CONTRACT_STOP0.md"

function W($m){ $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"; Add-Content -Path $log -Value "$ts  $m" -Encoding ASCII; Write-Host $m }
Set-Content -Path $log -Value "=== COMMIT GENESIS DECISION CONTRACT ===" -Encoding ASCII

if (-not (Test-Path (Join-Path $repo $f))) { W "STOP: fonte $f ausente na arvore principal. ABORTADO."; exit 1 }
$br = (git -C $wt rev-parse --abbrev-ref HEAD 2>$null)
W "worktree: $wt  branch: $br"
if ($br -ne "feat/genesis-tab") { W "STOP: branch inesperada ($br). ABORTADO."; exit 1 }

Copy-Item (Join-Path $repo $f) (Join-Path $wt $f) -Force
git -C $wt add -- "_handoff/GENESIS_DECISION_CONTRACT_STOP0.md" 2>&1 | Out-Null
git -C $wt status --short 2>&1 | ForEach-Object { W "  $_" }
git -C $wt commit -m "docs(genesis): DECISION CONTRACT STOP-0 - payload=(b) product contract, genesis probe, merge order #255-first [Cowork]" 2>&1 | ForEach-Object { W "  commit> $_" }
git -C $wt log --oneline -2 2>&1 | ForEach-Object { W "  log> $_" }
W "=== DONE. Commit LOCAL. Sem push (gate Paulo). ==="
