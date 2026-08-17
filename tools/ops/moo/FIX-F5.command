#!/bin/bash
GH="$HOME/.local/bin/gh"; [ -x "$GH" ] || GH="$(command -v gh)"
LOG="$HOME/frugal/_handoff/fix-f5.log"; : > "$LOG"
echo "O gh vai pedir UM código novo (para ganhar permissão de workflow). Autoriza no browser." | tee -a "$LOG"
"$GH" auth refresh -h github.com -s workflow 2>&1 | tee -a "$LOG"
cd "$HOME/frugal" || exit 1
echo "→ push f5..." | tee -a "$LOG"
git push https://github.com/pauloloureiroshp-ship-it/mooter.git chore/f5-higiene-ci 2>&1 | tee -a "$LOG"
echo "→ PR f5..." | tee -a "$LOG"
"$GH" pr create -R pauloloureiroshp-ship-it/mooter --base main --head chore/f5-higiene-ci --title "chore(F5): higiene+CI — SYNC rolado 3682→606 com tesoura testada" --body "SYNC.md 3682→606 · SYNC_ARCHIVE_2026.md · handoff CC→Cowork 2026-08-15 · workflow docs-hygiene.yml. Auditado ✅ (a604970f)." 2>&1 | tee -a "$LOG" | tail -1
echo "🏁 f5 PRONTO. (janela 20s)"; sleep 20
