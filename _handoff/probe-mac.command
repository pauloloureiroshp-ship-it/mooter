#!/bin/bash
# probe-mac.command — OPTIONAL Mac diagnostic for the FIX-MP-1 / cross-device tree gate (CROSSDEVICE_RECON §3).
#
# NON-BLOCKING: the C1 casing bug is already fixed in code (extension.js: _sharesLineageByInode + the
# EMPIRICAL _caseInsensitiveFS probe — NO process.platform guess) and proven on both path semantics by
# packages/vscode-extension/src/lp-crossdevice.test.js (§2 repro, Scenarios A/B/C). This script exists only
# to CONFIRM the live values on Paulo's MacBook if the preview ever misbehaves again — it is not required to
# ship. Double-click it (or `bash _handoff/probe-mac.command`) from anywhere in the clone.
#
# It answers ONE question: does the tree the dev server actually SERVES share lineage with the folder VS Code
# has OPEN? If CONFIRMED=false, the two values it prints show you EXACTLY where they diverge (usually casing).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
LANDING="$REPO/landing"

echo "=================================================="
echo " Mooter — PROBE cross-device (Mac, diagnostico)"
echo " repo: $REPO"
echo "=================================================="

# 1) servedRoot — the realpath the dev server would advertise as NEXT_PUBLIC_LP_ROOT (what becomes _servedRoot).
if [ -d "$LANDING" ]; then
  SERVED="$(cd "$LANDING" && node -e "console.log(require('fs').realpathSync(process.cwd()))")"
else
  SERVED="$(node -e "console.log(require('fs').realpathSync(process.argv[1]))" "$REPO")"
  echo "(!) landing/ ausente — a usar a raiz do repo como served root"
fi
echo "servedRoot (dev) = $SERVED"

# 2) wsReal — the realpath of the folder VS Code has open. Defaults to this repo; pass another path as \$1 to override.
WS_INPUT="${1:-$REPO}"
WSREAL="$(node -e "console.log(require('fs').realpathSync(process.argv[1]))" "$WS_INPUT")"
echo "wsRoot   (arg)   = $WS_INPUT"
echo "wsReal   (real)  = $WSREAL"

# 3) The verdict — lineage by realpath'd string (identical, or one contains the other). This mirrors the
#    host gate's FALLBACK layer; production also has the stronger inode authority, so this is the pessimistic view.
node -e '
  const path = require("path");
  const [sr, ws] = process.argv.slice(1);
  const within = (a, b) => { const r = path.relative(a, b); return !!r && !r.startsWith("..") && !path.isAbsolute(r); };
  const confirmed = sr === ws || within(ws, sr) || within(sr, ws);
  console.log("CONFIRMED =", confirmed);
  if (!confirmed) {
    console.log("--> divergem. Compara os dois paths acima a olho:");
    console.log("    se so diferem no CASING de um segmento (frugal vs Frugal) e o teu volume e case-insensitive,");
    console.log("    o gate CONFIRMA na mesma (inode authority) — este probe mostra a vista pessimista de string.");
    console.log("    se sao arvores DIFERENTES (worktrees irmas), o BLOQUEIO e correto: reinicia o dev server neste workspace.");
  }
' "$SERVED" "$WSREAL"

echo "=================================================="
echo "Cola servedRoot + wsReal na seccao 6 do _handoff/CROSSDEVICE_RECON.md se quiseres arquivar o resultado."
