#!/usr/bin/env bash
# Wave 55 (Phase D.2) — MCP tools health. The authoritative, dependency-free check
# is the declared tool count in packages/mcp-server/manifest.json (no server spawn,
# no network). Day-0 P5 verified 20 tools (12 W32 + 16→20 W-Mega).
#
#   bash scripts/audit/mcp_tools_health.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MANIFEST="$ROOT/packages/mcp-server/manifest.json"
EXPECT_MIN="${MOOTER_MCP_MIN_TOOLS:-12}"

echo "🐂 MCP tools health"
if [ ! -f "$MANIFEST" ]; then echo "❌ manifest not found at $MANIFEST"; exit 1; fi

# Run node from the manifest's own dir with a RELATIVE path: node.exe cannot
# resolve an MSYS /c/Users/… absolute path, but resolves './manifest.json'
# against its real (Windows) cwd. Portable on macOS/Linux too.
cd "$ROOT/packages/mcp-server" || { echo "❌ cannot cd to mcp-server"; exit 1; }
COUNT="$(node -e "
  const m = require('./manifest.json');
  const t = m.tools || (m.capabilities && m.capabilities.tools) || [];
  console.log(Array.isArray(t) ? t.length : Object.keys(t).length);
" 2>/dev/null || echo 0)"

NAMES="$(node -e "
  const m = require('./manifest.json');
  const t = m.tools || [];
  if (Array.isArray(t)) console.log(t.map(x => typeof x === 'string' ? x : (x && (x.name || x.id) || '?')).filter(Boolean).join(', '));
" 2>/dev/null || echo '')"

echo "   declared tools: $COUNT (expect ≥ $EXPECT_MIN)"
[ -n "$NAMES" ] && echo "   names: $NAMES"

if [ "$COUNT" -ge "$EXPECT_MIN" ]; then
  echo "✅ MCP manifest declares $COUNT tools (≥ $EXPECT_MIN)"
  exit 0
else
  echo "❌ MCP manifest declares only $COUNT tools (< $EXPECT_MIN)"
  exit 1
fi
