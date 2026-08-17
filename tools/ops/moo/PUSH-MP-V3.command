#!/bin/bash
GH="$HOME/.local/bin/gh"; [ -x "$GH" ] || GH="$(command -v gh)"
cd "$HOME/frugal" || exit 1; BR="$(git branch --show-current)"
git add _handoff/MP_HIPER_MOO_PILOT_CICLO_DE_VALOR_2026-08-17.md _handoff/shortlist-triada-2026-08-17.json
git commit -m "docs(handoff): MP v3 — F-A vira consertar a GERACAO (so codigo + ancora estatica + prompt afiado)

A triagem correu (\$0, ground-truth): 860 achados citados, todas as citacoes existem,
272 distintos, mas 27% em .md, 14% citam comentarios/fences, ~65% nitpick.
So ~41 (15%) sobrevivem. O problema nao e a triagem, e a geracao.
Criterio de aceitacao: >=50% acionaveis e 0% a citar comentario, antes do F-C.
Anexa a shortlist triada dos 41.

Co-Authored-By: Claude <noreply@anthropic.com>" 2>&1 | tail -3
git push https://github.com/pauloloureiroshp-ship-it/mooter.git "$BR" 2>&1 | tail -3
echo "🏁 MP v3 + shortlist empurrados em \$BR."; echo "(janela 25s)"; sleep 25
