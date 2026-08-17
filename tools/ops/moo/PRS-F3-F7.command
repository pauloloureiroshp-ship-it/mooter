#!/bin/bash
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
GH="$HOME/.local/bin/gh"; [ -x "$GH" ] || GH="$(command -v gh)"
LOG="$REPO/_handoff/prs.log"; : > "$LOG"
cd "$REPO" || exit 1
echo "→ PR f3..." | tee -a "$LOG"
"$GH" pr create -R pauloloureiroshp-ship-it/mooter --base main --head feat/f3-stop-killswitch --title "feat(F3): STOP vira kill-switch medido, não decorativo" --body "Kill-switch único do motor (o mesmo STOP do ▶/⏸ do Moo Pilot). Auditado ✅ (4e9c41e8)." 2>&1 | tee -a "$LOG" | tail -1
echo "→ PR f7..." | tee -a "$LOG"
"$GH" pr create -R pauloloureiroshp-ship-it/mooter --base main --head feat/f7-skills-pilares --title "feat(F7): as 7 skills dos pilares GPU aterram no repo" --body "Skills moo-talo + 6 pilares, ao lado das meo-*. Auditado ✅ (0ee9c875)." 2>&1 | tee -a "$LOG" | tail -1
echo "🏁 PRs f3+f7 criados. (janela 20s)"; sleep 20
