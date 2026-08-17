#!/bin/bash
GH="$HOME/.local/bin/gh"; [ -x "$GH" ] || GH="$(command -v gh)"
cd "$HOME/frugal" || exit 1
BR="$(git branch --show-current)"
if ! "$GH" auth status -h github.com >/dev/null 2>&1; then echo "❌ gh"; sleep 20; exit 1; fi
git add _handoff/MP_HIPER_MOO_PILOT_CICLO_DE_VALOR_2026-08-17.md
git commit -m "docs(handoff): MP hiper — fechar o ciclo de valor do Moo Pilot (triagem→ação→PR→deploy, dropdown LLM, workflow)

Co-Authored-By: Claude <noreply@anthropic.com>" 2>&1 | tail -3
echo "→ push $BR..."
git push https://github.com/pauloloureiroshp-ship-it/mooter.git "$BR" 2>&1 | tail -3
echo "🏁 MP do ciclo de valor empurrado em $BR."
echo "(janela 30s)"; sleep 30
