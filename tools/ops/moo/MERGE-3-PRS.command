#!/bin/bash
# MERGE dos 3 PRs — gesto do Paulo. Checa CI antes; só merjar se verde.
GH="$HOME/.local/bin/gh"; [ -x "$GH" ] || GH="$(command -v gh)"
R="pauloloureiroshp-ship-it/mooter"
echo "═══════════════════════════════════════"
echo "  MERGE dos 3 PRs do Mooter (#268 #269 #270)"
echo "═══════════════════════════════════════"
if ! "$GH" auth status -h github.com >/dev/null 2>&1; then
  echo "❌ gh não autenticado. Roda GO-GITHUB.command primeiro."; sleep 25; exit 1
fi
for PR in 268 269 270; do
  echo ""; echo "── PR #$PR ──"
  "$GH" pr checks "$PR" -R "$R" 2>/dev/null | tail -8
done
echo ""
echo "Se os checks acima estão verdes (ou sem checks bloqueantes), confirma o merge."
read -p "Merjar os 3 agora? (s/N) " OK
if [ "$OK" = "s" ] || [ "$OK" = "S" ]; then
  for PR in 270 268 269; do
    echo "→ merge #$PR..."; "$GH" pr merge "$PR" -R "$R" --merge --delete-branch 2>&1 | tail -2
  done
  echo ""; echo "🏁 Merge concluído. Agora: reinicia o Claude desktop app."
else
  echo "Cancelado — nenhum merge feito. (Podes merjar no GitHub pelo celular quando quiseres.)"
fi
echo "(janela fica aberta 30s)"; sleep 30
