#!/bin/bash
GH="$HOME/.local/bin/gh"; [ -x "$GH" ] || GH="$(command -v gh)"
cd "$HOME/frugal" || exit 1
BR="$(git branch --show-current)"
echo "═══ branch: $BR ═══"
if [ "$BR" != "feat/f1-runner-canonico" ]; then echo "⚠️ não estou na f1 — abortado"; sleep 20; exit 1; fi
git add tools/cockpit/runner/build-shell-snapshot.mjs
git commit -m "fix(cockpit): snapshot instantâneo lê GPU (ioreg) e frota (beacons), como o F10

O build-shell-snapshot já chamava sampleGpu() mas nunca lia os beacons,
por isso a frota vinha n/d. Agora usa deviceName()+beaconDir()+readBeacons
e passa device+fleet ao buildFleetState — o mesmo que o f10-server faz ao vivo.

Co-Authored-By: Claude <noreply@anthropic.com>" 2>&1 | tail -3
echo "→ push $BR..."
git push https://github.com/pauloloureiroshp-ship-it/mooter.git "$BR" 2>&1 | tail -3
echo "🏁 fix preservado na f1."
echo "(janela 30s)"; sleep 30
