#!/bin/bash
GH="$HOME/.local/bin/gh"; [ -x "$GH" ] || GH="$(command -v gh)"
R="pauloloureiroshp-ship-it/mooter"
echo "═══ os workflows de PUBLISH/DEPLOY na main passaram MESMO? ═══"
"$GH" run list -R "$R" --branch main -L 25 2>/dev/null | grep -iE "publish|deploy|npm|mcpb|cockpit|hub" | head -12
echo ""
echo "═══ todos os runs recentes na main (estado real) ═══"
"$GH" run list -R "$R" --branch main -L 12 2>/dev/null
echo "(janela 45s)"; sleep 45
