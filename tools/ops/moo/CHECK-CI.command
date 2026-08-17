#!/bin/bash
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
GH="$HOME/.local/bin/gh"; [ -x "$GH" ] || GH="$(command -v gh)"
R="pauloloureiroshp-ship-it/mooter"
echo "═══ estado do CI dos 3 PRs (após fix ratchet) ═══"
for PR in 270 268 269; do
  echo ""; echo "══════ PR #$PR ══════"
  "$GH" pr checks "$PR" -R "$R" 2>/dev/null > /tmp/c$PR
  # mostra só os que interessam + contagem
  grep -iE "ratchet|piorar|suite|higiene" /tmp/c$PR | sed 's/^/  /'
  F=$(grep -ic "fail" /tmp/c$PR); P=$(grep -ic "pending" /tmp/c$PR); OK=$(grep -ic "pass" /tmp/c$PR)
  echo "  ── resumo: fail=$F · pending=$P · pass=$OK"
  if [ "$F" -eq 0 ] && [ "$P" -eq 0 ]; then echo "  ✅ VERDE"; elif [ "$P" -gt 0 ]; then echo "  🟡 ainda a correr"; else echo "  ❌ tem falha"; fi
done
echo ""; echo "(janela fica aberta 45s)"; sleep 45
