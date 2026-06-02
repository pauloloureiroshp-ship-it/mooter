#!/usr/bin/env bash
# test-install-docker.sh — Wave 11 (D4) fresh-machine install smoke test.
#
# Runs the public-one-liner path (self-clone branch of landing/public/install.sh)
# inside a clean node:20 container and asserts the install completes with the
# real artifacts. This is the regression guard for the "friend runs curl | bash
# on a fresh machine" flow. Requires Docker + network.
#
# Usage: bash scripts/test-install-docker.sh
# Exit 0 = pass. Non-zero = a fresh install would break.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_SH="$ROOT/landing/public/install.sh"
[ -f "$INSTALL_SH" ] || { echo "FAIL: $INSTALL_SH not found"; exit 1; }

echo "==> Running fresh node:20 Docker install (self-clone path)..."
out="$(timeout 600 docker run -i --rm node:20 bash -c '
  apt-get update -qq >/dev/null 2>&1 && apt-get install -y -qq git curl >/dev/null 2>&1
  cat > /tmp/install.sh
  # Simulate Claude Code present (mooter is a Claude Code hook).
  mkdir -p "$HOME/.claude"
  printf "#!/bin/sh\necho claude 1.0\n" > /usr/local/bin/claude && chmod +x /usr/local/bin/claude
  bash /tmp/install.sh </dev/null 2>&1
  echo "INSTALL_EXIT=$?"
  echo "AGENTS_COUNT=$(ls "$HOME/.claude/agents/" 2>/dev/null | wc -l | tr -d " ")"
  export PATH="$HOME/.local/bin:$PATH"; [ -f "$HOME/.mooter/env" ] && . "$HOME/.mooter/env" 2>/dev/null
  if mooter --version </dev/null >/dev/null 2>&1; then echo "VERSION_OK=1"; else echo "VERSION_OK=0"; fi
' < "$INSTALL_SH")" || { echo "FAIL: docker run errored"; echo "$out"; exit 1; }

echo "$out" | tail -6

fail=0
echo "$out" | grep -q "INSTALL_EXIT=0"  || { echo "FAIL: install.sh non-zero exit"; fail=1; }
echo "$out" | grep -q "AGENTS_COUNT=6"  || { echo "FAIL: expected 6 subagents in ~/.claude/agents/"; fail=1; }
echo "$out" | grep -q "VERSION_OK=1"    || { echo "FAIL: mooter --version did not run"; fail=1; }

if [ "$fail" = "0" ]; then
  echo "==> PASS: fresh install completes, 6 subagents bundled, mooter runs."
else
  echo "==> FAIL: see above."
fi
exit "$fail"
