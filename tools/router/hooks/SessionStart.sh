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

# Wave 21 (C5) — ensure the Stop session-report digest is enabled. The digest code
# (stop_hook.js buildSessionReport: TOKENS BY TIER / CHOICE REASONS / PER-TASK
# BREAKDOWN / HERD / SAVINGS) is complete and correct, but it is OPT-IN
# (`session_report_enabled`, default OFF) and the preferences file was never
# created — so it never rendered despite the audit expecting it. Self-heal: create
# a minimal prefs file enabling the report when none exists. Idempotent; the user
# can disable by editing the file. Runs before the tracker fast-path so it always
# applies. Silent on failure (a missing digest beats a hook that yells).
PREFS="${HOME}/.mooter/preferences.json"
if [ ! -f "$PREFS" ]; then
  mkdir -p "${HOME}/.mooter" 2>/dev/null || true
  printf '{\n  "session_report_enabled": true,\n  "herd_visibility": "standard"\n}\n' > "$PREFS" 2>/dev/null || true
fi

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
