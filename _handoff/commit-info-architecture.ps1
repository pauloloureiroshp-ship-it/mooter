# commit-info-architecture.ps1 - commit seletivo da limpeza IA (2026-07-07)
# Branch atual (wave/honest-controls), SEM trocar branch, SEM push.
# ASCII-only. Log em _handoff\commit-log.txt.

$ErrorActionPreference = 'Continue'
$repo = "C:\Users\Paulo Loureiro\frugal"
Set-Location $repo
Start-Transcript -Path "$repo\_handoff\commit-log.txt" -Force

Write-Host "=== 0) Arquivar os scripts da limpeza (efemeros) ==="
foreach ($f in @("cleanup-info-architecture.ps1","RUN-CLEANUP.bat","cleanup-log.txt")) {
    if (Test-Path "$repo\_handoff\$f") { Move-Item "$repo\_handoff\$f" "$repo\_handoff\_archive\2026-07\" -Force; Write-Host "OK    $f -> _archive\2026-07" }
}

Write-Host "=== 1) Branch e HEAD atuais (nao trocamos de branch) ==="
git -C $repo branch --show-current
git -C $repo log --oneline -1

Write-Host "=== 2) Stage seletivo ==="
# 2a. Deletions/renames dos paths limpos (so tracked; nao pega untracked)
git -C $repo add -u _handoff docs
# 2b. Canonicos modificados + SYNC novo
git -C $repo add SYNC.md AGENTS.md CLAUDE.md LOOP.md MEMORY.md
# 2c. Novos: arquivo morto, waves, SYNC archive, roadmap vivo, auditoria IA, masterprompt CCA emendado
git -C $repo add _handoff/_archive docs/archive/waves docs/foundation/SYNC_ARCHIVE_2026H1.md
git -C $repo add docs/strategy/LIVE_EDIT_ROADMAP.md _handoff/INFO_AUDIT.md _handoff/LIVE_EDIT_CCA_AUDIT_MASTERPROMPT.md

Write-Host "=== 3) O que vai no commit (staged) ==="
git -C $repo diff --cached --stat | Select-Object -Last 15 | Out-String | Write-Host

Write-Host "=== 4) Guard: classify.js NAO pode estar staged ==="
$staged = git -C $repo diff --cached --name-only
if ($staged -match "tools/router/classify.js") {
    Write-Host "ABORT: classify.js staged! Reset e sair."
    git -C $repo reset
    Stop-Transcript
    exit 1
} else { Write-Host "OK    classify.js fora do stage" }

Write-Host "=== 5) Commit ==="
git -C $repo commit -m "docs(ia): information architecture - lifecycle rule, LP roadmap consolidation, archive sweep, SYNC snapshot (2026-07-07)"

Write-Host "=== 6) Prova ==="
git -C $repo log --oneline -2
git -C $repo status --short | Out-String | Write-Host
Write-Host "=== FIM - SEM push (autorizacao do Paulo pendente) ==="
Stop-Transcript
