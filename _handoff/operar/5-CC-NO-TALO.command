#!/bin/zsh
cd "$(dirname "$0")/../.."
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"
{
  echo "=== cc-no-talo $(date) ==="
  command -v claude || { echo "ERRO: claude CLI nao encontrado no PATH"; exit 1; }
  claude --version
  claude --dangerously-skip-permissions -p "$(cat _handoff/KICKOFF-NO-TALO-MAC.md)"
  echo "=== fim $(date) · exit=$? ==="
} >> _handoff/cc-no-talo.log 2>&1
