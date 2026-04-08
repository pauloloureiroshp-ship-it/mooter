#!/usr/bin/env bash
# install-stop-hook.sh — idempotent patcher for Claude Code settings.json
#
# Adds the Stop hook required by frugal v0.7.2 turn-latency measurement.
# Safe to run multiple times: detects existing configuration and skips.
#
# What it does:
#   1. Find ~/.claude/settings.json (or CLAUDE_CONFIG_DIR override)
#   2. Parse it with jq
#   3. Check if a Stop hook already exists with our command
#   4. If not, add it (preserving all other config)
#   5. Write back via atomic temp file + rename
#
# Fails safe: if anything goes wrong, the original settings.json is untouched
# and the script prints exactly what to add manually.

set -euo pipefail

SETTINGS_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
SETTINGS_FILE="$SETTINGS_DIR/settings.json"
HOOK_CMD='node ~/.claude/hooks/gsd-turn-end.js'

if ! command -v jq >/dev/null 2>&1; then
  echo "✗ jq is required (install: brew install jq / apt install jq / choco install jq)"
  echo ""
  echo "Manual install — add this to $SETTINGS_FILE under the 'hooks' object:"
  echo '  "Stop": [{"type": "command", "command": "'"$HOOK_CMD"'"}]'
  exit 1
fi

if [ ! -f "$SETTINGS_FILE" ]; then
  echo "✗ $SETTINGS_FILE not found"
  echo ""
  echo "Create it first by running Claude Code once, or copy from:"
  echo "  $HOME/.claude/settings.example.json"
  exit 1
fi

# Already installed?
if jq -e '.hooks.Stop[]? | select(.command == $cmd)' --arg cmd "$HOOK_CMD" "$SETTINGS_FILE" >/dev/null 2>&1; then
  echo "✓ Stop hook already installed — no changes made"
  exit 0
fi

# Backup
BACKUP="$SETTINGS_FILE.bak.$(date +%Y%m%d-%H%M%S)"
cp "$SETTINGS_FILE" "$BACKUP"
echo "→ Backup saved to $BACKUP"

# Add the hook (preserving other config)
TMP="$(mktemp)"
jq --arg cmd "$HOOK_CMD" '
  .hooks //= {}
  | .hooks.Stop //= []
  | .hooks.Stop += [{"type": "command", "command": $cmd}]
' "$SETTINGS_FILE" > "$TMP"

# Validate the result parses as JSON before overwriting
if ! jq empty "$TMP" >/dev/null 2>&1; then
  echo "✗ Generated invalid JSON, aborting (original file untouched)"
  rm -f "$TMP"
  exit 1
fi

mv "$TMP" "$SETTINGS_FILE"
echo "✓ Installed Stop hook in $SETTINGS_FILE"
echo ""
echo "Restart Claude Code (or the VS Code extension) for the hook to take effect."
echo "After ~3 complete turns, the statusline will show: ⏱ Xs p50 · ~±Ys vs Opus"
