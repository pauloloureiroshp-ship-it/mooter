# cleanup-info-architecture.ps1 - Fase 2c da limpeza IA (2026-07-07)
# So MOVE arquivos (nunca apaga, exceto node_modules acidental em docs/strategy).
# Log completo em _handoff\cleanup-log.txt. Git staging continua sendo do Paulo.
# ASCII-only (PowerShell 5.1 le ps1 sem BOM como ANSI).

$ErrorActionPreference = 'Continue'
$repo = "C:\Users\Paulo Loureiro\frugal"
Set-Location $repo
Start-Transcript -Path "$repo\_handoff\cleanup-log.txt" -Force

function MoveSafe($from, $to) {
    if (Test-Path $from) {
        try { Move-Item -Path $from -Destination $to -ErrorAction Stop; Write-Host "OK    $from" }
        catch { Write-Host "ERRO  $from -> $($_.Exception.Message)" }
    } else { Write-Host "SKIP  $from (nao existe)" }
}

Write-Host "=== 1) Estrutura de arquivo ==="
New-Item -ItemType Directory -Force "$repo\_handoff\_archive\2026-06" | Out-Null
New-Item -ItemType Directory -Force "$repo\_handoff\_archive\2026-07" | Out-Null
New-Item -ItemType Directory -Force "$repo\docs\archive\waves" | Out-Null

Write-Host "=== 2) Efemeros de junho -> _archive\2026-06 ==="
$jun = @(
  "MOOTER_DESIGN_MASTERPROMPT.md","MOOTER_CLAUDE_DESIGN_MASTERPROMPT.md",
  "WAVE_SITE_MOCK_COW_REVERT.md","WAVE66_GRAPHIFY_LANDING_MASTERPROMPT.md",
  "MASTERPROMPT_LAND_AND_EVAL.md","LAND_PARKED_MASTERPROMPT.md",
  "ONDA0_BOOTSTRAP_DOCS_MASTERPROMPT.md","PERFECT_HANDOFF_MASTERPROMPT.md",
  "SITE_HANDOFF_STORY_MASTERPROMPT.md","TRIAGE_PARKED_OLD_MASTERPROMPT.md",
  "overclock-benchmark-2026-06-28T22-29-55.md","AUDIT_FLEET_ZERO_COST_MASTERPROMPT.md",
  "FLEET_W4_MASTERPROMPT.md","FLEET_W4_FASE2_EXTRACT.md","CTO_COMMAND_DECK_SPEC.md"
)
foreach ($f in $jun) { MoveSafe "$repo\_handoff\$f" "$repo\_handoff\_archive\2026-06\" }
MoveSafe "$repo\_handoff\mock" "$repo\_handoff\_archive\2026-06\mock"

Write-Host "=== 3) Efemeros de julho + LP consolidados -> _archive\2026-07 ==="
$jul = @(
  "LIVE_PREVIEW_SUPER_MASTERPROMPT.md","LIVE_PREVIEW_HOTRELOAD_TEST.md",
  "LIVE_PREVIEW_MP4_DIAGNOSTICS_MASTERPROMPT.md","LIVE_PREVIEW_CONSOLIDATE.md",
  "WAVE_LP1_MP3v2_MP4polish.md","WAVE_LP2_MP5_SelectToEdit.md",
  "COCKPIT_HONEST_CONTROLS_BRIEF.md","HONEST_CONTROLS_MASTERPROMPT.md",
  "FLEET_FASE3_ARM_MASTERPROMPT.md","LIVE_EDIT_LP4_LP6_VISION.md",
  "LIVE_EDIT_MP5_SPEC.md","LIVE_EDIT_MP5_2_SelectLock_Spec.md",
  "LIVE_EDIT_LP46_CONTEXT_PACK_STUDY.md","LIVE_EDIT_LP47_MOO_QUALITY_UX_STUDY.md",
  "INFO_ARCHITECTURE_CLEANUP_HANDOFF.md"
)
foreach ($f in $jul) { MoveSafe "$repo\_handoff\$f" "$repo\_handoff\_archive\2026-07\" }
# NOTA: LIVE_PREVIEW_TOTAL_AUDIT_WAVE.md fica - so arquiva depois da auditoria CCA correr.

Write-Host "=== 4) Waves historicas de docs\strategy -> docs\archive\waves ==="
Get-ChildItem "$repo\docs\strategy\WAVE*.md" -File | ForEach-Object {
    MoveSafe $_.FullName "$repo\docs\archive\waves\"
}

Write-Host "=== 5) node_modules acidental em docs\strategy (lixo npm, regeneravel) ==="
if (Test-Path "$repo\docs\strategy\node_modules") {
    Remove-Item -Recurse -Force "$repo\docs\strategy\node_modules"
    Write-Host "OK    docs\strategy\node_modules removido"
} else { Write-Host "SKIP  docs\strategy\node_modules (nao existe)" }
if (Test-Path "$repo\docs\strategy\package.json") { Write-Host "AVISO docs\strategy\package.json existe - revisar manualmente" }
if (Test-Path "$repo\docs\strategy\package-lock.json") { Write-Host "AVISO docs\strategy\package-lock.json existe - revisar manualmente" }

Write-Host "=== 6) SYNC.md vira archive (o Cowork escreve o novo em seguida) ==="
MoveSafe "$repo\SYNC.md" "$repo\docs\foundation\SYNC_ARCHIVE_2026H1.md"

Write-Host "=== 7) git status (nativo, so leitura) ==="
git -C $repo status --short | Out-String | Write-Host
Write-Host "=== FIM - log em _handoff\cleanup-log.txt ==="
Stop-Transcript
