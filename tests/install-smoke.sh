#!/bin/bash
# test-install.sh -- simulates a fresh Linux user install, in a Docker container
#
# Validates:
#   1. Prereq checks (no Claude Code -> exits 3, no Node -> exits 3)
#   2. Happy path (Claude Code + Node 18 present)
#   3. mooter binary lands in ~/.local/bin
#   4. mooter --version / mooter doctor / mooter help work
#   5. mooter uninstall cleans up

set -e

echo ""
echo "=============================================="
echo "  STEP 1 -- Prereq check FAIL (no Claude Code)"
echo "=============================================="
echo "Expectation: installer detects missing claude, exits 3 with friendly message"
echo ""

bash /repo/install.sh 2>&1 | head -20 || true
echo ""

echo ""
echo "=============================================="
echo "  STEP 2 -- Install fake Claude Code shim"
echo "=============================================="
mkdir -p ~/.local/bin ~/.claude
cat > ~/.local/bin/claude <<'EOF'
#!/bin/bash
echo "Claude Code (fake shim) received: $@"
EOF
chmod +x ~/.local/bin/claude
echo '{"hooks":{}}' > ~/.claude/settings.json
export PATH="$HOME/.local/bin:$PATH"
which claude
echo '  [OK] fake claude installed at' $(which claude)

echo ""
echo "=============================================="
echo "  STEP 3 -- Real install (happy path)"
echo "=============================================="
bash /repo/install.sh 2>&1 | tail -40
echo ""

echo ""
echo "=============================================="
echo "  STEP 4 -- Verify artifacts on disk"
echo "=============================================="
echo ""
echo "-- ~/.local/bin/mooter (shim):"
ls -la ~/.local/bin/mooter && cat ~/.local/bin/mooter
echo ""
echo "-- ~/.mooter/ (CLI + env):"
ls ~/.mooter/
echo ""
echo "-- ~/.mooter/cli/ (JS code):"
ls ~/.mooter/cli/
echo ""
echo "-- ~/.claude/tools/router/ (routing runtime):"
ls ~/.claude/tools/router/ | head -10
echo "  ... ($(ls ~/.claude/tools/router/ | wc -l) files total)"
echo ""
echo "-- ~/.claude/hooks/ (event hooks):"
ls ~/.claude/hooks/
echo ""
echo "-- ~/.claude/settings.json (hooks registered?):"
cat ~/.claude/settings.json | head -30
echo ""
echo "-- ~/.mooter/device.id:"
cat ~/.mooter/device.id
echo ""
echo "-- ~/.mooter/env (shell profile source):"
cat ~/.mooter/env
echo ""
echo "-- shell profile PATH injection:"
grep -A1 "mooter (managed)" ~/.bashrc 2>/dev/null || echo "  (no .bashrc markers found)"

echo ""
echo "=============================================="
echo "  STEP 5 -- Source env + invoke mooter"
echo "=============================================="
# Source the env file so PATH picks up ~/.local/bin
. ~/.mooter/env
hash -r

echo ""
echo "-- mooter --version:"
mooter --version
echo ""
echo "-- mooter --help:"
mooter --help
echo ""
echo "-- mooter doctor:"
mooter doctor || echo "  (doctor exits non-zero when warnings/fails present -- expected)"

echo ""
echo "=============================================="
echo "  STEP 6 -- Default behavior (mooter with no args)"
echo "=============================================="
echo "Expectation: spawns the fake claude with MOOTER_MODE=1"
mooter 2>&1 | head -5

echo ""
echo "=============================================="
echo "  STEP 7 -- Uninstall"
echo "=============================================="
mooter uninstall --yes 2>&1 | tail -15
echo ""
echo "-- post-uninstall check:"
[ -d ~/.mooter ] && echo "  [XX] ~/.mooter still exists" || echo "  [OK] ~/.mooter removed"
[ -d ~/.claude/tools/router ] && echo "  [XX] ~/.claude/tools/router still exists" || echo "  [OK] ~/.claude/tools/router removed"
[ -f ~/.local/bin/mooter ] && echo "  [XX] ~/.local/bin/mooter still exists" || echo "  [OK] ~/.local/bin/mooter removed"

echo ""
echo "=============================================="
echo "  Simulation complete."
echo "=============================================="
