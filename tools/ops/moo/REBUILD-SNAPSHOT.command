#!/bin/bash
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO" || exit 1
echo "═══ a gerar snapshot NATIVO (ioreg funciona aqui) ═══"
node tools/cockpit/runner/build-shell-snapshot.mjs dist/moo-pilot-snapshot.html 2>&1 | tail -4
echo "-- GPU capturada no snapshot? --"
grep -oE '"gpu":\{[^}]*\}' dist/moo-pilot-snapshot.html | head -1
echo "pronto: $REPO/dist/moo-pilot-snapshot.html"
echo "(janela 15s)"; sleep 15
