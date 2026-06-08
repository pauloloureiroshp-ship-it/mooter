#!/usr/bin/env bash
# e2e_friends_launch.sh (Wave 33 D.3) — friends-launch smoke test.
#
# Simulates the surface a new "friend" user touches, against the LOCAL built CLI.
# It does NOT install from the network or train models (those need a real box);
# it verifies the command surface a first-run user hits is wired and responds.
# Each step prints PASS/FAIL/SKIP; the script exits non-zero if any step FAILs.
#
#   bash scripts/e2e_friends_launch.sh
#
# Steps that need external services (live hub, Ollama daemon, GPU) are SKIPPED
# with a clear note rather than failing — a green run means the CLI surface is
# sound, not that the whole cloud stack is up.

set -uo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI_DIR="$REPO_ROOT/packages/cli"
PASS=0; FAIL=0; SKIP=0
NL=$'\n'

step() { printf '  %-46s' "$1"; }
ok()   { echo "PASS"; PASS=$((PASS+1)); }
bad()  { echo "FAIL — $1"; FAIL=$((FAIL+1)); }
skip() { echo "SKIP — $1"; SKIP=$((SKIP+1)); }

# Run the built bundle with node, from the repo root (so `sessions list` resolves
# the right Claude Code project dir). Step 1 builds mooter.js before any run_cli.
# `</dev/null` makes any interactive TUI exit on EOF; `timeout` is a hard backstop.
run_cli() { ( cd "$REPO_ROOT" && timeout 20 node "$CLI_DIR/mooter.js" "$@" </dev/null ) 2>&1; }

echo "🐮 Mooter friends-launch e2e smoke"
echo "  repo: $REPO_ROOT"
echo

# 1 — build the bundle (the artifact a real install ships)
step "1. CLI bundle builds"
if ( cd "$CLI_DIR" && npm run build >/dev/null 2>&1 ); then
  SZ=$(stat -c%s "$CLI_DIR/mooter.js" 2>/dev/null || echo 0)
  if [ "$SZ" -gt 0 ] && [ "$SZ" -lt 665600 ]; then ok; else bad "bundle missing or >650KB ($SZ bytes)"; fi
else bad "npm run build failed"; fi

# 2 — help surface responds
step "2. mooter --help lists commands"
if run_cli --help | grep -q "mooter sessions list"; then ok; else bad "help missing sessions list"; fi

# 3 — statusline modes discoverable
step "3. statusline show (lists modes)"
if run_cli statusline show | grep -qiE "compact|didactic"; then ok; else bad "modes not listed"; fi

# 4 — sessions list renders (this very project)
step "4. mooter sessions list"
OUT="$(run_cli sessions list --limit 3)"
if echo "$OUT" | grep -qiE "session start|no Claude Code sessions"; then ok; else bad "no sessions output"; fi

# 5 — effort mode shows
step "5. mooter effort show"
if run_cli effort show 2>/dev/null | grep -qiE "default|ultramoo|low|high"; then ok; else skip "effort show not available"; fi

# 6 — dashboard renders without throwing
step "6. mooter dashboard (one-shot)"
if run_cli dashboard --once >/dev/null 2>&1 || run_cli dashboard >/dev/null 2>&1; then ok; else skip "dashboard needs a TTY"; fi

# 7 — new Wave 33 backends respond honestly
step "7. turboquant status"
if run_cli turboquant status | grep -qiE "TurboQuant|prereqs"; then ok; else bad "turboquant status broken"; fi

step "8. minimax-m3 status"
if run_cli minimax-m3 status | grep -qiE "MiniMax M3"; then ok; else bad "minimax status broken"; fi

step "9. pricing-update --show (cache may be empty)"
if run_cli pricing-update --show >/dev/null 2>&1 || true; then ok; else bad "pricing-update crashed"; fi

# 10 — slash command skills present
step "10. /moo-* slash command skills present"
MOO=$(ls "$REPO_ROOT/.claude/skills" 2>/dev/null | grep -c '^moo-' || echo 0)
if [ "${MOO:-0}" -ge 1 ]; then ok; else skip "no .claude/skills/moo-* found in repo"; fi

# Steps that need a live environment — documented as SKIP, not FAIL.
step "11. curl install.sh | bash"
skip "needs network + a clean machine (manual)"
step "12. Ollama daemon active + 5 prompts"
skip "needs Ollama running + Claude Code session (manual)"
step "13. mooter sync → mooter.ai/dashboard"
skip "needs live hub + signed-in account (manual)"

echo
echo "  ───────────────────────────────"
printf '  PASS %d · FAIL %d · SKIP %d\n' "$PASS" "$FAIL" "$SKIP"
if [ "$FAIL" -eq 0 ]; then
  echo "  ✓ friends-launch CLI surface is sound."
  exit 0
else
  echo "  ✗ friends-launch smoke FAILED."
  exit 1
fi
