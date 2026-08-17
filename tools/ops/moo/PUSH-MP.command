#!/bin/bash
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
# PUSH-MP — empurra o MP hiper + prova pro branch atual (feat/f1-runner-canonico). gh já autenticado.
GH="$HOME/.local/bin/gh"; [ -x "$GH" ] || GH="$(command -v gh)"
cd "$REPO" || exit 1
echo "═══ estado ═══"; git branch --show-current
if ! "$GH" auth status -h github.com >/dev/null 2>&1; then
  echo "❌ gh não autenticado. Roda GO-GITHUB.command primeiro."; sleep 25; exit 1
fi
echo "→ commit dos ficheiros de handoff (só estes, não git add -A)..."
git add _handoff/MP_HIPER_MOO_AUTOPILOT_2026-08-16.md _handoff/moo-pilot-v5-live.jpg 2>/dev/null
git commit -m "docs(handoff): MP hiper Moo Auto Pilot v2 — unir skill↔runner + prova v5 ao vivo

Co-Authored-By: Claude <noreply@anthropic.com>" 2>&1 | tail -3
BR="$(git branch --show-current)"
echo "→ push do branch $BR..."
git push https://github.com/pauloloureiroshp-ship-it/mooter.git "$BR" 2>&1 | tail -4
echo ""
echo "🏁 MP empurrado no branch $BR. (Vê em github.com/pauloloureiroshp-ship-it/mooter/tree/$BR/_handoff)"
echo "(janela fica aberta 30s)"; sleep 30
