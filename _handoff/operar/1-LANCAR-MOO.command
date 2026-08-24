#!/bin/zsh
cd "$(dirname "$0")/../.."
export MOO_PUBLICAR_BEACON=1
export VAULT_PATH="$HOME/paulo-vault"
{
  echo "=== lancar-moo $(date) ==="
  node tools/cockpit/runner/launch.mjs --no-open
  node tools/cockpit/runner/launch.mjs --status
  echo "=== fim $(date) ==="
} >> _handoff/lancar-moo.log 2>&1
