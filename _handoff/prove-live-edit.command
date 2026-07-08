#!/bin/bash
# prove-live-edit.command — Mac (double-click) launcher for the Mooter Live Preview. Mirror of the
# Windows prove-live-edit.cmd but PORTABLE: it derives the repo root from its OWN location (no hardcoded
# C:\Users paths), so it runs on any Mac / any clone. Committed on purpose (the .cmd was machine-specific
# and untracked). Cross-device fix (2026-07-08): served tree == workspace tree → the FIX-MP-1 gate opens.
set -euo pipefail

# ── locate the repo root from this script's own location (…/_handoff/prove-live-edit.command) ──
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
LANDING="$REPO/landing"
echo "=================================================="
echo " Mooter — PROVA DA MAGIA (Mac, tudo automatico)"
echo " repo: $REPO"
echo "=================================================="

EXT="$REPO/packages/vscode-extension"

# ── locate the `code` CLI (PATH first, else the app bundle) ──
if command -v code >/dev/null 2>&1; then CODE="code"
elif [ -x "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" ]; then
  CODE="/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
else CODE=""; fi
if [ -z "$CODE" ]; then
  echo "/!\\ nao encontrei o 'code' CLI. Abre o VS Code -> Cmd+Shift+P -> 'Shell Command: Install code command in PATH', e corre outra vez."
  exit 1
fi

echo "[1/6] A parar dev servers antigos (next dev)..."
pkill -f "next dev" 2>/dev/null || true
sleep 1

echo "[2/6] A arrancar o dev server em landing/ (janela nova do Terminal)..."
if [ -d "$LANDING" ]; then
  osascript -e "tell application \"Terminal\" to do script \"cd \\\"$LANDING\\\" && npm run dev\"" >/dev/null 2>&1 \
    || ( cd "$LANDING" && npm run dev & )
  echo "    Aguarda o dev server subir (~18s)..."
  sleep 18
else
  echo "    /!\\ nao encontrei $LANDING — salta o dev server"
fi

echo "[3/6] A remover versoes antigas do mooter (evita conflito)..."
rm -rf "$HOME/.vscode/extensions/mooter.mooter-cockpit-"* 2>/dev/null || true

echo "[4/6] A construir um vsix FRESCO a partir do codigo desta branch (nunca instalar um .vsix velho)..."
rm -f "$EXT"/mooter-cockpit-*.vsix 2>/dev/null || true   # limpa vsix antigos p/ nao instalar o errado
( cd "$EXT" && npx --yes @vscode/vsce package --allow-star-activation --skip-license ) \
  || { echo "ERRO no build do vsix (npx @vscode/vsce precisa de rede na 1a vez) — cola este ecra no Cowork"; exit 1; }
VSIX="$(ls -t "$EXT"/mooter-cockpit-*.vsix 2>/dev/null | head -1)"
[ -n "$VSIX" ] || { echo "ERRO: build nao produziu vsix"; exit 1; }

echo "[5/6] A instalar $VSIX ..."
"$CODE" --install-extension "$VSIX" --force || { echo "ERRO na instalacao — cola este ecra no Cowork"; exit 1; }

echo "[6/6] A abrir o VS Code na arvore servida ($REPO — o gate abre porque served==workspace)..."
"$CODE" "$REPO" || true

echo ""
echo "=================================================="
echo " FIM — falta so 3 cliques teus no VS Code:"
echo "  1) Trust the authors -> Yes"
echo "  2) Recarrega a janela (Cmd+Shift+P -> 'Reload Window') p/ apanhar o vsix novo"
echo "  3) Abre o Live Preview, liga o target, seleciona um texto"
echo " O dev server esta na janela nova do Terminal."
echo "=================================================="
