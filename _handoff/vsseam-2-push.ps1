# VSSEAM-2 PUSH — publica as 3 branches + abre PRs (ESTE script E o teu gate: rodar = aprovar)
$log = Join-Path $PSScriptRoot "vsseam-2-push.log"
$repo = "C:\Users\Paulo Loureiro\frugal"
"=== VSSEAM-2 PUSH $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii

"--- push das 3 branches ---" | Out-File $log -Append -Encoding ascii
git -C $repo push origin feat/vs-w1-semaforo feat/mesh-phase-a feat/ledger-receipts 2>&1 | Out-File $log -Append -Encoding ascii

$gh = Get-Command gh -ErrorAction SilentlyContinue
if ($gh) {
  "--- gh pr create (2 PRs) ---" | Out-File $log -Append -Encoding ascii
  gh pr create --repo pauloloureiroshp-ship-it/mooter -H feat/vs-w1-semaforo -B main -t "VS-Seam: dispatch contract + terminal receipts + Semaforo Camada 1" -b "Cadeia VS-W0 (Codex @6271f85) + VS-W1 (CC @531a3b1). Gates: 24/24 novos reproduzidos pelo brain, suite 1423/1422/0 fail, classify frozen, allowlist exata. Handoffs arbitrados via moo-handoff-check." 2>&1 | Out-File $log -Append -Encoding ascii
  gh pr create --repo pauloloureiroshp-ship-it/mooter -H feat/mesh-phase-a -B main -t "Mesh fase A: 4 checkers L0 deterministicos" -b "Sentinelas orphan-watch/pointer-sentinel/projection-drift/brief-keeper @7d408f5. Gate U2 ao vivo (Codex): 41/41 targeted, achados reais no repo (1790 orphans, 22 pointers, 3 drifts). Reconciliacao fleet-arm decidida: mesh primeiro; fleet-arm rebase depois (overlap = fleet-orchestrator.mjs)." 2>&1 | Out-File $log -Append -Encoding ascii
} else {
  "gh CLI ausente - abre os PRs manualmente nestes links:" | Out-File $log -Append -Encoding ascii
  "https://github.com/pauloloureiroshp-ship-it/mooter/compare/main...feat/vs-w1-semaforo" | Out-File $log -Append -Encoding ascii
  "https://github.com/pauloloureiroshp-ship-it/mooter/compare/main...feat/mesh-phase-a" | Out-File $log -Append -Encoding ascii
}
"DONE. Log: vsseam-2-push.log" | Out-File $log -Append -Encoding ascii
Write-Host "VSSEAM-2 concluido. Veja vsseam-2-push.log"
