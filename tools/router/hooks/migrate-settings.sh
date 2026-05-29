#!/usr/bin/env bash
# migrate-settings.sh — Wave 2 Day 6.
#
# Migrate ~/.claude/settings.json hooks.SessionStart from the legacy bare-string
# form to the array-of-matchers form newer Claude Code expects. Idempotent and
# non-destructive: backs up before touching, leaves an already-migrated file
# alone, and preserves every sibling key (jq edits only the SessionStart node).
set -uo pipefail

SETTINGS="${1:-$HOME/.claude/settings.json}"
BACKUP="${SETTINGS}.pre-migrate-day6.bak"

if [ ! -f "$SETTINGS" ]; then
  echo "· no settings.json at $SETTINGS — nothing to migrate"
  exit 0
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "✗ jq not found on PATH — cannot migrate safely" >&2
  exit 1
fi

# Already migrated (array form) — leave it alone.
if jq -e '.hooks.SessionStart | type == "array"' "$SETTINGS" >/dev/null 2>&1; then
  echo "✓ already in array format"
  exit 0
fi

# Legacy string form → wrap in a single wildcard matcher.
if jq -e '.hooks.SessionStart | type == "string"' "$SETTINGS" >/dev/null 2>&1; then
  cp "$SETTINGS" "$BACKUP"
  CMD=$(jq -r '.hooks.SessionStart' "$SETTINGS")
  if jq --arg cmd "$CMD" \
      '.hooks.SessionStart = [{matcher: "*", hooks: [{type: "command", command: $cmd}]}]' \
      "$SETTINGS" > "$SETTINGS.tmp" && mv "$SETTINGS.tmp" "$SETTINGS"; then
    echo "✓ migrated SessionStart string → array of matchers. Backup at $BACKUP"
    exit 0
  else
    echo "✗ jq edit failed — settings.json left untouched (backup at $BACKUP)" >&2
    rm -f "$SETTINGS.tmp"
    exit 1
  fi
fi

# No SessionStart, or some other shape — nothing to do.
echo "· SessionStart absent or non-legacy — no migration needed"
exit 0
