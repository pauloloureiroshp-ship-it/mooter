#!/usr/bin/env bash
# SessionStart hook — Wave 2 Day 2.
#
# Boots the local savings-tracker (HTTP :7821) if it isn't already running.
# The tracker is what feeds the statusline's "$X saved today (Y%)" headline;
# without it the statusline drops to either GREEN "routing healthy" or to the
# new SETUP state on a clean install.
#
# Idempotent — re-running while the tracker is up is a no-op.
# Silent on failure — a degraded statusline is preferable to a hook that yells.

set -uo pipefail

TRACKER_URL="http://127.0.0.1:7821/health"
TRACKER_SCRIPT="${HOME}/.claude/tools/router/savings-tracker.js"

# Fast path: tracker already responding → exit.
if curl -fsS --max-time 1 "$TRACKER_URL" >/dev/null 2>&1; then
  exit 0
fi

# Cold path: spawn detached when both prerequisites are present.
if [ -f "$TRACKER_SCRIPT" ] && command -v node >/dev/null 2>&1; then
  ( nohup node "$TRACKER_SCRIPT" >/dev/null 2>&1 & ) >/dev/null 2>&1
fi

exit 0
