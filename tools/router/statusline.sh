#!/usr/bin/env bash
# statusline.sh — frugal terminal statusline for Claude Code (LEGACY)
#
# ─────────────────────────────────────────────────────────────────────────
# ⚠ LEGACY / FALLBACK ENTRY POINT
#
# The wired statusline (referenced by ~/.claude/settings.json) is
# tools/router/gsd-statusline.js (Node, multi-line, richer rendering).
# This .sh file remains as:
#   - A POSIX-only fallback for environments without Node available
#   - A debug helper for the savings/budget endpoints (cheap to invoke)
#   - The single-line reference renderer for old documentation
#
# When making rendering changes, edit gsd-statusline.js FIRST. Only
# mirror visual fixes here when there is a clear value (e.g. the
# 2026-05-07 "[object Object]%" schema fix that affected both paths).
# ─────────────────────────────────────────────────────────────────────────
#
# Output format (one line):
#   ◈ <model> │ ctx:NN% ▓▓░░░░ │ 5h:NN% ▓▓░░░░ ↺Hh:Mm │ 7d:NN% │ $X.XX │ 💰 $X.XX (NN%) │ alltime:$X.XX │ max:TN
#
# Data sources:
#   - stdin JSON (Claude Code passes session info)            → model, ctx
#   - ~/.claude/tools/router/.budget-cache.json               → 5h, 7d, reset
#   - http://127.0.0.1:7821/metrics (savings-tracker.js)      → 💰 saved
#
# Auto-starts savings-tracker.js if /health probe fails.
# Flags:
#   --mock   render with fake data for testing

set -uo pipefail

MOCK=0
[ "${1:-}" = "--mock" ] && MOCK=1

TRACKER_URL="http://127.0.0.1:7821"
BUDGET_CACHE="${HOME}/.claude/tools/router/.budget-cache.json"
TRACKER_SCRIPT="${HOME}/.claude/tools/router/savings-tracker.js"

# ── Helpers ─────────────────────────────────────────────────────────────────

# Render a 10-cell progress bar from a percentage (0-100)
bar() {
  local pct=$1
  local filled=$(( pct / 10 ))
  [ "$filled" -gt 10 ] && filled=10
  [ "$filled" -lt 0 ] && filled=0
  local empty=$(( 10 - filled ))
  printf '%0.s▓' $(seq 1 $filled 2>/dev/null)
  printf '%0.s░' $(seq 1 $empty 2>/dev/null)
}

# Read JSON value with node (most reliable on Windows + Linux + macOS)
json_get() {
  local json="$1"
  local key="$2"
  node -e "try{const d=JSON.parse(process.argv[1]||'{}');const k='${key}'.split('.');let v=d;for(const x of k)v=v&&v[x];process.stdout.write(v==null?'':String(v))}catch{process.stdout.write('')}" "$json" 2>/dev/null
}

# Curl with hard timeout, returns empty on failure
fetch() {
  curl -fsS --max-time 1 "$1" 2>/dev/null
}

# Auto-start savings tracker if /health fails
ensure_tracker() {
  if ! fetch "${TRACKER_URL}/health" >/dev/null 2>&1; then
    if [ -f "${TRACKER_SCRIPT}" ] && command -v node >/dev/null 2>&1; then
      ( nohup node "${TRACKER_SCRIPT}" >/dev/null 2>&1 & ) >/dev/null 2>&1
    fi
  fi
}

# ── 1. Read session JSON from stdin (Claude Code passes this) ───────────────
STDIN_JSON=""
if [ ! -t 0 ]; then
  STDIN_JSON=$(cat)
fi

if [ "$MOCK" = "1" ]; then
  MODEL="claude-sonnet-4-6"
  CTX_PCT=23
  FIVE_PCT=37
  SEVEN_PCT=12
  RESET="2h14m"
  COST="0.04"
else
  MODEL=$(json_get "$STDIN_JSON" "model.id")
  [ -z "$MODEL" ] && MODEL=$(json_get "$STDIN_JSON" "model.display_name")
  [ -z "$MODEL" ] && MODEL="claude"
  CTX_PCT=$(json_get "$STDIN_JSON" "context.percent_used")
  [ -z "$CTX_PCT" ] && CTX_PCT=0
  CTX_PCT=${CTX_PCT%.*}
  COST=$(json_get "$STDIN_JSON" "session.cost_usd")
  [ -z "$COST" ] && COST="0.00"
fi

# ── 2. OAuth budget from disk cache (written by inject_context.js) ──────────
# Schema (current 2026-05-07):
#   data.five_hour  = { utilization: <number>, resets_at: <ISO> }
#   data.seven_day  = { utilization: <number>, resets_at: <ISO> }
# Older schemas (kept as fallbacks for compatibility):
#   data.fiveHour / data.sevenDay   — camelCase variant
#   data.five_hour as flat number   — legacy pre-object
if [ "$MOCK" != "1" ]; then
  if [ -f "$BUDGET_CACHE" ]; then
    BUDGET_JSON=$(cat "$BUDGET_CACHE" 2>/dev/null)
    # New schema: pull `.utilization` from the nested object.
    FIVE_PCT=$(json_get "$BUDGET_JSON" "data.five_hour.utilization")
    SEVEN_PCT=$(json_get "$BUDGET_JSON" "data.seven_day.utilization")
    # camelCase fallback (older inject_context versions)
    [ -z "$FIVE_PCT" ] && FIVE_PCT=$(json_get "$BUDGET_JSON" "data.fiveHour.utilization")
    [ -z "$SEVEN_PCT" ] && SEVEN_PCT=$(json_get "$BUDGET_JSON" "data.sevenDay.utilization")
    # Pre-nested-object fallback (numeric leaf at the top level of `data`).
    # If the leaf is itself an object the json_get helper returns
    # "[object Object]" — strip that to empty so the default zero kicks in.
    [ -z "$FIVE_PCT" ] && FIVE_PCT=$(json_get "$BUDGET_JSON" "data.five_hour")
    [ -z "$SEVEN_PCT" ] && SEVEN_PCT=$(json_get "$BUDGET_JSON" "data.seven_day")
    case "$FIVE_PCT"  in *"[object Object]"*) FIVE_PCT="";;  esac
    case "$SEVEN_PCT" in *"[object Object]"*) SEVEN_PCT=""; esac
  fi
  FIVE_PCT=${FIVE_PCT:-0}
  SEVEN_PCT=${SEVEN_PCT:-0}
  FIVE_PCT=${FIVE_PCT%.*}
  SEVEN_PCT=${SEVEN_PCT%.*}
  RESET=""
fi

# ── 3. Savings from local tracker (auto-start if dead) ──────────────────────
ensure_tracker
SAVINGS_SECTION="💰 –"
ALLTIME_SECTION=""
if [ "$MOCK" = "1" ]; then
  SAVINGS_SECTION="💰 \$0.31 (89%)"
  ALLTIME_SECTION="alltime:\$4.21"
else
  METRICS=$(fetch "${TRACKER_URL}/metrics")
  if [ -n "$METRICS" ]; then
    SAVED=$(json_get "$METRICS" "saved")
    SAVED_PCT=$(json_get "$METRICS" "saved_pct")
    REAL=$(json_get "$METRICS" "real_cost")
    if [ -n "$SAVED" ] && [ -n "$SAVED_PCT" ]; then
      SAVED_FMT=$(printf "%.2f" "$SAVED" 2>/dev/null || echo "$SAVED")
      SAVED_PCT_FMT=$(printf "%.0f" "$SAVED_PCT" 2>/dev/null || echo "$SAVED_PCT")
      SAVINGS_SECTION="💰 \$${SAVED_FMT} (${SAVED_PCT_FMT}%)"
    fi
    if [ -n "$REAL" ]; then
      REAL_FMT=$(printf "%.2f" "$REAL" 2>/dev/null || echo "$REAL")
      ALLTIME_SECTION="alltime:\$${REAL_FMT}"
    fi
  fi
fi

# ── 4. Compute max_tier from 5h budget ──────────────────────────────────────
MAX_TIER="T3"
if [ "$FIVE_PCT" -ge 85 ] 2>/dev/null; then MAX_TIER="T0"
elif [ "$FIVE_PCT" -ge 70 ] 2>/dev/null; then MAX_TIER="T1"
elif [ "$FIVE_PCT" -ge 50 ] 2>/dev/null; then MAX_TIER="T2"
fi

# ── 5. Render the line ──────────────────────────────────────────────────────
CTX_BAR=$(bar "${CTX_PCT:-0}")
FIVE_BAR=$(bar "${FIVE_PCT:-0}")

PARTS=(
  "◈ ${MODEL}"
  "ctx:${CTX_PCT}% ${CTX_BAR}"
  "5h:${FIVE_PCT}% ${FIVE_BAR}${RESET:+ ↺${RESET}}"
  "7d:${SEVEN_PCT}%"
  "\$${COST}"
  "${SAVINGS_SECTION}"
)
[ -n "$ALLTIME_SECTION" ] && PARTS+=("${ALLTIME_SECTION}")
PARTS+=("max:${MAX_TIER}")

# Join with " │ "
out=""
for p in "${PARTS[@]}"; do
  if [ -z "$out" ]; then out="$p"; else out="$out │ $p"; fi
done
printf '%s\n' "$out"
