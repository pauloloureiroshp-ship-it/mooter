#!/usr/bin/env bash
# Wave 26 (26.F) — end-to-end real-sync test: Paulo's machine → CF Workers → dashboard.
#
# Proves the full loop the brief asked for: seed 5 local routing decisions, run
# `mooter sync` (REAL, not --dry-run), then assert the hub's aggregate count rose
# and the public community pulse flips to source:"live".
#
# NON-DESTRUCTIVE: backs up your real decisions.log, seeds 5 synthetic decisions,
# and RESTORES it on exit (even on failure). It never opts you into telemetry —
# if you haven't run `mooter init`, it stops and tells you to.
#
# Requires: a DEPLOYED hub with /v1/events (26.C). Run AFTER `wrangler deploy`.
#
# Usage:
#   bash scripts/e2e_sync.sh
#   HUB_URL=https://mooter-hub.frugal-hub.workers.dev bash scripts/e2e_sync.sh
set -euo pipefail

HUB_URL="${HUB_URL:-https://mooter-hub.frugal-hub.workers.dev}"
PULSE_URL="${PULSE_URL:-https://mooter.ai/api/community/pulse}"
DECISIONS_LOG="${DECISIONS_LOG:-$HOME/.claude/tools/router/decisions.log}"
MOOTER_HOME="${MOOTER_HOME:-$HOME/.mooter}"
SEED_N=5

say() { printf '%s\n' "$*"; }
fail() { printf '✗ %s\n' "$*" >&2; exit 1; }

command -v curl >/dev/null || fail "curl not found"
command -v mooter >/dev/null || fail "mooter CLI not on PATH (install it first)"

# ── consent gate (never auto-opt-in) ──
if [ ! -f "$MOOTER_HOME/consent.json" ] || ! grep -q '"telemetry_enabled":[[:space:]]*true' "$MOOTER_HOME/consent.json" 2>/dev/null; then
  fail "Telemetry not opted-in. Run \`mooter init\` first (this test will not opt you in)."
fi

# ── backup + guaranteed restore ──
BACKUP=""
restore() {
  if [ -n "$BACKUP" ]; then
    if [ -f "$BACKUP" ]; then mv -f "$BACKUP" "$DECISIONS_LOG"; else rm -f "$DECISIONS_LOG"; fi
    say "↩ restored $DECISIONS_LOG"
  fi
}
trap restore EXIT

mkdir -p "$(dirname "$DECISIONS_LOG")"
if [ -f "$DECISIONS_LOG" ]; then
  BACKUP="$(mktemp)"; cp -f "$DECISIONS_LOG" "$BACKUP"
else
  BACKUP="$DECISIONS_LOG.e2e-absent"  # sentinel: original did not exist
fi

# ── seed 5 fresh decisions (mixed tiers) in the 24h window ──
NOW_MS="$(node -e 'process.stdout.write(String(Date.now()))')"
say "▶ seeding $SEED_N decisions into $DECISIONS_LOG"
for i in $(seq 1 "$SEED_N"); do
  TIER=$([ "$i" -le 3 ] && echo "T0" || ([ "$i" -eq 4 ] && echo "T2" || echo "T3"))
  printf '{"event":"classified","ts_ms":%s,"tier":"%s","confidence":0.9,"safety_boost_applied":false}\n' \
    "$((NOW_MS - i * 1000))" "$TIER" >> "$DECISIONS_LOG"
done

# ── before snapshot ──
before="$(curl -fsS "$HUB_URL/aggregate-stats" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String((JSON.parse(s).total_events)||0))}catch{process.stdout.write("0")}})')"
say "▶ hub total_events BEFORE: $before"

# ── 405 smoke (GET must be rejected) ──
code="$(curl -s -o /dev/null -w '%{http_code}' "$HUB_URL/v1/events")"
[ "$code" = "405" ] || fail "GET /v1/events expected 405, got $code"
say "✓ GET /v1/events → 405 (POST-only)"

# ── real sync ──
say "▶ running: MOOTER_CF_BACKEND_URL=$HUB_URL mooter sync"
MOOTER_CF_BACKEND_URL="$HUB_URL" mooter sync || fail "mooter sync exited non-zero"

# ── poll the hub for the new events (eventual consistency) ──
after="$before"
for _ in $(seq 1 10); do
  sleep 3
  after="$(curl -fsS "$HUB_URL/aggregate-stats" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String((JSON.parse(s).total_events)||0))}catch{process.stdout.write("0")}})')"
  [ "$after" -gt "$before" ] && break
done
say "▶ hub total_events AFTER: $after"
[ "$after" -gt "$before" ] || fail "hub total_events did not increase ($before → $after)"

# ── community pulse must be live ──
src="$(curl -fsS "$PULSE_URL" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s).source||"?"))}catch{process.stdout.write("?")}})')"
say "▶ community pulse source: $src"
[ "$src" = "live" ] || fail "community pulse still '$src' (expected 'live')"

say ""
say "✅ E2E PASS — sync landed in the hub ($before → $after) and the pulse is live."
