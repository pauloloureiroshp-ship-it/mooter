#!/bin/zsh
cd "$(dirname "$0")/../.."
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"
{
  echo "=== cc-fecho $(date) ==="
  caffeinate -i claude --dangerously-skip-permissions -p "$(cat _handoff/KICKOFF-FECHO-MAC.md)"
  echo "=== fim $(date) · exit=$? ==="
} >> _handoff/cc-fecho.log 2>&1
