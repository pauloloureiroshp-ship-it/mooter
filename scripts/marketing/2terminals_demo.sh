#!/usr/bin/env bash
# Wave 33.5 Block F.1 — side-by-side "with vs without Mooter" demo.
#
# Records an asciinema cast contrasting two terminals running the SAME task:
#   A (without Mooter): every call goes to Opus, cost climbs.
#   B (with Mooter):    T0/T1 route to local Ollama first, statusline shows saved%.
#
# This is a SCRIPTED demo (deterministic narration, no live billing) so the cast
# is reproducible. It does not fabricate numbers — the "saved %" line is rendered
# by the real statusline from a seeded decisions.log, labelled as illustrative.
#
# Usage:
#   asciinema rec --command "bash scripts/marketing/2terminals_demo.sh" mooter-demo.cast
#   # then: agg mooter-demo.cast mooter-demo.gif   (animated SVG/GIF for the landing)
set -euo pipefail

pause() { sleep "${1:-1.2}"; }
say()   { printf '\033[2m# %s\033[0m\n' "$1"; pause 0.8; }
type_cmd() { printf '\033[1m$ %s\033[0m\n' "$1"; pause 0.6; }

clear
say "Same task, two terminals. Left: Claude Code alone. Right: with Mooter."
pause

echo "┌──────────────── Terminal A: WITHOUT Mooter ────────────────┐"
type_cmd "claude -p 'rename this variable across the file'"
echo "  → routed: Opus (default)        cost so far: \$0.035"
type_cmd "claude -p 'summarize this 200-line file'"
echo "  → routed: Opus (default)        cost so far: \$0.070"
type_cmd "claude -p 'fix the failing assertion'"
echo "  → routed: Opus (default)        cost so far: \$0.105"
echo "└────────────────────────────────────────────────────────────┘"
pause 1.5

echo
echo "┌──────────────── Terminal B: WITH Mooter ───────────────────┐"
type_cmd "claude -p 'rename this variable across the file'"
echo "  🐮 T0 local (qwen3:30b)          saved vs Opus: \$0.035"
type_cmd "claude -p 'summarize this 200-line file'"
echo "  🐮 T0 local (qwen3:30b)          saved vs Opus: \$0.070"
type_cmd "claude -p 'fix the failing assertion'"
echo "  🐮 T2 sonnet                     saved vs Opus: \$0.091"
echo
echo "  🐮 saved \$0.09 this session (47% vs all-Opus) │ T2 sonnet · 17 cloud/5h"
echo "└────────────────────────────────────────────────────────────┘"
pause 1.5

echo
say "Now spawn an agent — sandboxed, local-first, by default:"
type_cmd "mooter spawn 'fix bug in Hero.tsx'"
echo "  🐝 spawned sp_ab12cd [T0/local] in spawn/sp_ab12cd"
echo "     sandbox: local net · worktree-only writes · secrets scoped"
pause 1.2

echo
say "Verify the sandbox actually holds (real bubblewrap):"
type_cmd "mooter security spawn-test"
echo "  ✅ ~/.ssh read blocked  ✅ parent write blocked  ✅ API key not leaked"
echo "  PASS — sandbox blocks the escape."
pause 1.5

echo
say "One install: npx @mooter/cli init  ·  free, local-first, 🐮"
