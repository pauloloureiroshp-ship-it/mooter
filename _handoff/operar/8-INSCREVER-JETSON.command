#!/bin/zsh
cd "$(dirname "$0")/../.."
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"
{ echo "=== cc-inscrever-jetson $(date) ==="
  caffeinate -i claude --dangerously-skip-permissions -p "$(cat _handoff/KICKOFF-INSCREVER-JETSON.md)"
  echo "=== fim $(date) · exit=$? ===" } >> _handoff/cc-inscrever-jetson.log 2>&1
