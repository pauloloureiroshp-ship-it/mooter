#!/bin/bash
GH="$HOME/.local/bin/gh"; [ -x "$GH" ] || GH="$(command -v gh)"
cd "$HOME/frugal" || exit 1
echo "═══ push do fix ratchet (176→215) nos 3 PRs ═══"
if ! "$GH" auth status -h github.com >/dev/null 2>&1; then echo "❌ gh não autenticado"; sleep 25; exit 1; fi
for BR in chore/f5-higiene-ci feat/f3-stop-killswitch feat/f7-skills-pilares; do
  echo ""; echo "── $BR ──"
  git push https://github.com/pauloloureiroshp-ship-it/mooter.git "$BR" 2>&1 | tail -3
done
echo ""; echo "🏁 3 branches empurradas. O CI vai re-correr nos 3 PRs (#270 #268 #269)."
echo "(janela fica aberta 40s)"; sleep 40
