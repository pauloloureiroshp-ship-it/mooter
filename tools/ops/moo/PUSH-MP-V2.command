#!/bin/bash
GH="$HOME/.local/bin/gh"; [ -x "$GH" ] || GH="$(command -v gh)"
cd "$HOME/frugal" || exit 1; BR="$(git branch --show-current)"
git add _handoff/MP_HIPER_MOO_PILOT_CICLO_DE_VALOR_2026-08-17.md
git commit -m "docs(handoff): MP v2 — correções do gauntlet (ground-truth>votos, dois-modelos, recon prior art)

Co-Authored-By: Claude <noreply@anthropic.com>" 2>&1 | tail -3
git push https://github.com/pauloloureiroshp-ship-it/mooter.git "$BR" 2>&1 | tail -3
echo "🏁 MP v2 empurrado em $BR."; echo "(janela 25s)"; sleep 25
