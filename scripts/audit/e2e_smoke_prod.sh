#!/usr/bin/env bash
# Wave 55 (Phase D.1) — end-to-end production smoke. Read-only: only HTTP GETs to
# Mooter's own infra + local file hashing. The ONLY hard failure is a classify.js
# sha mismatch (the frozen-engine invariant); everything else degrades to a ⚠️
# warning so a transient network blip or a private-repo 404 never red-fails CI.
#
#   bash scripts/audit/e2e_smoke_prod.sh
#
# Env overrides: MOOTER_HUB_URL, MOOTER_LANDING_URL, MOOTER_REPO (owner/name).
set -uo pipefail

HUB="${MOOTER_HUB_URL:-https://mooter-hub.frugal-hub.workers.dev}"
LANDING="${MOOTER_LANDING_URL:-https://mooter.ai}"
REPO="${MOOTER_REPO:-pauloloureiroshp-ship-it/mooter}"
FROZEN_SHA="427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

pass=0; warn=0; fail=0
ok()   { echo "✅ $*"; pass=$((pass+1)); }
note() { echo "⚠️  $*"; warn=$((warn+1)); }
bad()  { echo "❌ $*"; fail=$((fail+1)); }

# HTTP status of a URL (000 on connection failure), 12s cap.
code() { curl -s -o /dev/null -w "%{http_code}" --max-time 12 "$1" 2>/dev/null || echo "000"; }

echo "🐂 E2E smoke audit — production (read-only)"
echo "   hub=$HUB  landing=$LANDING  repo=$REPO"
echo

# 1. classify.js frozen sha — LOCAL is authoritative (always runs, the hard gate).
if command -v sha256sum >/dev/null 2>&1; then
  LOCAL_SHA="$(sha256sum "$ROOT/tools/router/classify.js" | cut -d' ' -f1)"
else
  LOCAL_SHA="$(shasum -a 256 "$ROOT/tools/router/classify.js" | cut -d' ' -f1)"
fi
if [ "$LOCAL_SHA" = "$FROZEN_SHA" ]; then ok "classify.js sha INTACT (local)"; else bad "classify.js sha CHANGED (local): $LOCAL_SHA"; fi

# 1b. Remote sha (best-effort — private repo / network may 404; never hard-fails).
REMOTE_SHA="$(curl -s --max-time 12 "https://raw.githubusercontent.com/$REPO/main/tools/router/classify.js" 2>/dev/null | { command -v sha256sum >/dev/null 2>&1 && sha256sum || shasum -a 256; } | cut -d' ' -f1)"
if [ "$REMOTE_SHA" = "$FROZEN_SHA" ]; then ok "classify.js sha INTACT (remote main)";
elif [ -n "$REMOTE_SHA" ] && [ "$REMOTE_SHA" != "$(printf '' | { command -v sha256sum >/dev/null 2>&1 && sha256sum || shasum -a 256; } | cut -d' ' -f1)" ]; then note "remote sha differs or unreadable (private repo? got: ${REMOTE_SHA:0:12}…)";
else note "remote classify.js not fetchable (private repo / network) — local check is authoritative"; fi

# 2. Hub LIVE
c=$(code "$HUB/v1/pricing");          [ "$c" = "200" ] && ok "hub /v1/pricing $c" || note "hub /v1/pricing $c"
c=$(code "$HUB/aggregate-stats");     [ "$c" = "200" ] && ok "hub /aggregate-stats $c" || note "hub /aggregate-stats $c"

# 3. Landing + install
c=$(code "$LANDING");                 [ "$c" = "200" ] && ok "landing $c" || note "landing $c"
c=$(code "$LANDING/install.sh");      [ "$c" = "200" ] && ok "install.sh $c" || note "install.sh $c"
# Landing version (known stale per Wave 55 Day-0 P4 — informational, not a failure).
LV="$(curl -s --max-time 12 "$LANDING" 2>/dev/null | grep -oE 'v1\.[0-9]+\.[0-9]+' | head -1)"
[ -n "$LV" ] && note "landing version $LV (P4: copy refresh OUT OF SCOPE)" || note "landing version not detected"

# 4. Latest release
TAG="$(curl -s --max-time 12 "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null | grep '"tag_name"' | head -1 | sed -E 's/.*"tag_name":\s*"([^"]+)".*/\1/')"
[ -n "$TAG" ] && ok "latest release: $TAG" || note "release API not reachable (private repo / rate limit)"

echo
echo "🐮 smoke: $pass ok · $warn warn · $fail fail"
exit "$fail"
