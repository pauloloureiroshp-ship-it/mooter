#!/bin/bash
GH="$HOME/.local/bin/gh"; [ -x "$GH" ] || GH="$(command -v gh)"
LOG="$HOME/frugal/_handoff/push-agora.log"; : > "$LOG"
echo "== push-agora $(date) ==" | tee -a "$LOG"
"$GH" auth status --hostname github.com 2>&1 | tee -a "$LOG"
if ! "$GH" auth status --hostname github.com >/dev/null 2>&1; then
  echo "❌ gh NÃO está autenticado ainda. Roda o GO-GITHUB.command primeiro." | tee -a "$LOG"; echo "(janela fica aberta 30s)"; sleep 30; exit 1
fi
"$GH" auth setup-git 2>/dev/null
cd "$HOME/frugal" || exit 1
echo "→ push das 3 branches..." | tee -a "$LOG"
git push https://github.com/pauloloureiroshp-ship-it/mooter.git chore/f5-higiene-ci feat/f3-stop-killswitch feat/f7-skills-pilares 2>&1 | tee -a "$LOG"
echo "→ PRs..." | tee -a "$LOG"
"$GH" pr create -R pauloloureiroshp-ship-it/mooter --base main --head chore/f5-higiene-ci --title "chore(F5): higiene+CI — SYNC rolado 3682→606 com tesoura testada" --body "SYNC.md 3682→606 · SYNC_ARCHIVE_2026.md · handoff CC→Cowork 2026-08-15. Auditado (a604970f)." 2>&1 | tee -a "$LOG" | tail -1
"$GH" pr create -R pauloloureiroshp-ship-it/mooter --base main --head feat/f3-stop-killswitch --title "feat(F3): STOP vira kill-switch medido, não decorativo" --body "Kill-switch único do motor. Auditado (4e9c41e8)." 2>&1 | tee -a "$LOG" | tail -1
"$GH" pr create -R pauloloureiroshp-ship-it/mooter --base main --head feat/f7-skills-pilares --title "feat(F7): as 7 skills dos pilares GPU aterram no repo" --body "moo-talo + 6 pilares. Auditado (0ee9c875)." 2>&1 | tee -a "$LOG" | tail -1
echo "🏁 PRONTO" | tee -a "$LOG"
echo "(janela fica aberta 20s)"; sleep 20
