#!/bin/zsh
cd "$(dirname "$0")/../.."
export PATH="$HOME/.local/node/bin:/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"
{ echo "=== cc-merges $(date) ==="
  caffeinate -i claude --dangerously-skip-permissions -p "$(cat _handoff/KICKOFF-MERGES-REFUTACAO.md)"
  echo "=== fim $(date) · exit=$? ===" } >> _handoff/cc-merges.log 2>&1
