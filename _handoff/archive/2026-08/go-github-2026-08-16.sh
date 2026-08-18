#!/bin/bash
# go-github v3 — usa o próprio gh (device flow nativo), depois push + 3 PRs
GH="$HOME/.local/bin/gh"; [ -x "$GH" ] || GH="$(command -v gh)"
[ -z "$GH" ] && { echo "❌ gh não encontrado"; exit 1; }
LOG="$HOME/frugal/_handoff/go-github.log"
echo "== v3 $(date) ==" >> "$LOG"
echo "O gh vai mostrar um código de 8 letras e abrir o browser sozinho."
echo "Digita o código na página (já estás logado) e clica Authorize."
printf '\n' | "$GH" auth login --hostname github.com --git-protocol https --web 2>&1 | tee -a "$LOG"
if ! "$GH" auth status --hostname github.com >/dev/null 2>&1; then
  echo "❌ gh não autenticou (vê acima) — roda de novo"; exit 1
fi
echo "✅ gh autenticado."; "$GH" auth setup-git 2>/dev/null
cd "$HOME/frugal" || exit 1
echo "→ push das 3 branches..."
git push https://github.com/pauloloureiroshp-ship-it/mooter.git chore/f5-higiene-ci feat/f3-stop-killswitch feat/f7-skills-pilares 2>&1 | tee -a "$LOG" || { echo "❌ push falhou"; exit 1; }
echo "→ abrindo os 3 PRs..."
"$GH" pr create -R pauloloureiroshp-ship-it/mooter --base main --head chore/f5-higiene-ci --title "chore(F5): higiene+CI — SYNC rolado 3682→606 com tesoura testada" --body "SYNC.md 3682→606 · SYNC_ARCHIVE_2026.md · handoff CC→Cowork 2026-08-15. Auditado ✅ (a604970f)." 2>&1 | tail -1
"$GH" pr create -R pauloloureiroshp-ship-it/mooter --base main --head feat/f3-stop-killswitch --title "feat(F3): STOP vira kill-switch medido, não decorativo" --body "Kill-switch único do motor (o mesmo STOP do ▶/⏸ do Moo Pilot). Auditado ✅ (4e9c41e8)." 2>&1 | tail -1
"$GH" pr create -R pauloloureiroshp-ship-it/mooter --base main --head feat/f7-skills-pilares --title "feat(F7): as 7 skills dos pilares GPU aterram no repo" --body "Skills moo-talo + 6 pilares, ao lado das meo-*. Auditado ✅ (0ee9c875)." 2>&1 | tail -1
echo "🏁 PRONTO — 3 branches no GitHub, PRs abertos."
