#!/bin/zsh
cd "$(dirname "$0")/../.."
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"
{ echo "=== cc-construir $(date) ==="
  caffeinate -i claude --dangerously-skip-permissions -p "$(cat _handoff/KICKOFF-CONSTRUIR-MAC.md)"
  echo "=== fim $(date) · exit=$? ===" } >> _handoff/cc-construir.log 2>&1
