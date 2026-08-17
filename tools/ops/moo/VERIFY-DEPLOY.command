#!/bin/bash
GH="$HOME/.local/bin/gh"; [ -x "$GH" ] || GH="$(command -v gh)"
R="pauloloureiroshp-ship-it/mooter"
echo "═══ estado dos 3 PRs (merjaram mesmo?) ═══"
for PR in 270 268 269; do
  S=$("$GH" pr view "$PR" -R "$R" --json state,mergedAt,mergeCommit -q '.state+"  merged:"+((.mergedAt//"NAO"))+"  sha:"+((.mergeCommit.oid//"-")[0:8])' 2>/dev/null)
  echo "  #$PR → $S"
done
echo ""
echo "═══ workflows a correr/recentes na main ═══"
"$GH" run list -R "$R" --branch main -L 10 2>/dev/null | head -11
echo ""; echo "(janela fica aberta 45s)"; sleep 45
