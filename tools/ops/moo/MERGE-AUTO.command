#!/bin/bash
GH="$HOME/.local/bin/gh"; [ -x "$GH" ] || GH="$(command -v gh)"
R="pauloloureiroshp-ship-it/mooter"
if ! "$GH" auth status -h github.com >/dev/null 2>&1; then echo "❌ gh não autenticado"; sleep 25; exit 1; fi
echo "═══ trava de segurança: re-verificar verde ═══"
BLOCK=0
for PR in 270 268 269; do
  "$GH" pr checks "$PR" -R "$R" > /tmp/mc$PR 2>/dev/null
  F=$(grep -ic "fail" /tmp/mc$PR)
  echo "  #$PR: fails=$F"
  [ "$F" -gt 0 ] && { echo "  ⚠️ #$PR VERMELHO"; BLOCK=1; }
done
if [ "$BLOCK" = "1" ]; then echo ""; echo "❌ ABORTADO — há check vermelho. Nada merjado."; sleep 30; exit 1; fi
echo ""; echo "═══ tudo verde. A merjar 270 → 268 → 269 ═══"
for PR in 270 268 269; do
  echo "── merge #$PR ──"
  "$GH" pr merge "$PR" -R "$R" --merge --delete-branch 2>&1 | tail -3
done
echo ""; echo "🏁 MERGES FEITOS. Deploy dispara na main (publish-npm/mcpb/cockpit/deploy-hub)."
echo "(janela fica aberta 50s)"; sleep 50
