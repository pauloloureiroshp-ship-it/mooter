# COMMIT_GENESIS_CORPUS.ps1 - versiona o corpus Genesis no worktree feat/genesis-tab
# Fecha o RED ALERT do F0 (corpus untracked num unico disco). Commit LOCAL apenas.
# NAO faz push (gate Paulo). Idempotente. ASCII. Cowork gera e executa; log verificado.

$ErrorActionPreference = "Continue"
$repo = "C:\Users\Paulo Loureiro\frugal"
$wt   = "C:\Users\Paulo Loureiro\frugal-genesis"
$log  = Join-Path $repo "_handoff\commit-genesis-corpus.log"

$files = @(
  "docs\strategy\MOOTER_GENESIS_SPEC.md",
  "_handoff\GENESIS_PILLAR_PROMPTS.md",
  "_handoff\GENESIS_WAVE_MASTERPROMPT.md",
  "_handoff\MOOTER_SKILLS_MAP.md",
  "_handoff\MOOTER_PROJECT_ZERO_BLUEPRINT.md",
  "_handoff\SETUP_RADAR_MASTERPROMPT.md",
  "_handoff\MOO_HARMONY_MESH_BLUEPRINT.md",
  "_handoff\PROJECT_GENESIS_MASTER_HANDOFF.md",
  "_handoff\MOOTER_ONBOARDING_WORLDCLASS_HANDOFF.md"
)

function W($m){ $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"; $line = "$ts  $m"; Add-Content -Path $log -Value $line -Encoding ASCII; Write-Host $line }

Set-Content -Path $log -Value "=== COMMIT GENESIS CORPUS ===" -Encoding ASCII

if (-not (Test-Path $wt)) { W "STOP: worktree $wt nao existe. ABORTADO."; exit 1 }
$br = (git -C $wt rev-parse --abbrev-ref HEAD 2>$null)
W "worktree: $wt  branch: $br"
if ($br -ne "feat/genesis-tab") { W "STOP: branch inesperada ($br), esperava feat/genesis-tab. ABORTADO."; exit 1 }

$added = 0
foreach ($f in $files) {
  $src = Join-Path $repo $f
  if (-not (Test-Path $src)) { W "  SKIP (nao existe na arvore principal): $f"; continue }
  $dst = Join-Path $wt $f
  $dstDir = Split-Path $dst -Parent
  New-Item -ItemType Directory -Force -Path $dstDir | Out-Null
  Copy-Item $src $dst -Force
  $rel = $f -replace "\\","/"
  git -C $wt add -- $rel 2>&1 | Out-Null
  W "  add: $rel"
  $added++
}

if ($added -eq 0) { W "STOP: nada para adicionar. ABORTADO."; exit 1 }

W "staged (git status --short):"
git -C $wt status --short 2>&1 | ForEach-Object { W "  $_" }
git -C $wt commit -m "docs(genesis): version Genesis corpus - spec + pillar prompts + skills map + project zero + radar + mesh + handoffs [Cowork pre-wave, F0 RED ALERT fix]" 2>&1 | ForEach-Object { W "  commit> $_" }
git -C $wt log --oneline -2 2>&1 | ForEach-Object { W "  log> $_" }

W "=== DONE. Commit LOCAL em feat/genesis-tab. NAO foi feito push (gate Paulo). ==="
