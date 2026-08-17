#!/bin/bash
GH="$HOME/.local/bin/gh"; [ -x "$GH" ] || GH="$(command -v gh)"
cd "$HOME/frugal" || exit 1
echo "═══ estado ═══"; git branch --show-current
if ! "$GH" auth status -h github.com >/dev/null 2>&1; then
  echo "❌ gh não autenticado. Roda GO-GITHUB.command primeiro."; sleep 25; exit 1
fi
git add _handoff/MP_HIPER_MOO_AUTOPILOT_2026-08-16.md
git commit -m "docs(handoff): achado CI vermelho — ratchet+suite fail em #269/#270, resolver antes de merjar

Co-Authored-By: Claude <noreply@anthropic.com>" 2>&1 | tail -3
BR="$(git branch --show-current)"
echo "→ push do branch $BR..."
git push https://github.com/pauloloureiroshp-ship-it/mooter.git "$BR" 2>&1 | tail -4
echo ""; echo "🏁 Atualização do MP empurrada em $BR."
echo "(janela fica aberta 30s)"; sleep 30
