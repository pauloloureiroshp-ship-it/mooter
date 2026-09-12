#!/bin/zsh
# 27-ACTUALIZAR-OLLAMA — 0.32.5 -> mais recente. Antes do bench longo, nunca a meio.
# Verifica que os modelos e o contexto sobrevivem. Nao apaga nada.
cd "$(dirname "$0")/../.."
LOG="$(pwd)/_handoff/motor-mac-ollama-$(date +%Y%m%d-%H%M).log"
exec > >(tee -a "$LOG") 2>&1
abort() { echo ""; echo "❌ ABORTADO: $1"; exit 1; }
echo "=== 27-ACTUALIZAR-OLLAMA · $(date) ==="

echo ""
echo "--- antes ---"
ANTES=$(ollama --version 2>/dev/null); echo "  versao: $ANTES"
echo "  modelos:"; ollama list | tail -n +2 | awk '{print "    "$1"  "$3$4}'
NMOD=$(ollama list | tail -n +2 | grep -c .)
echo "  total: $NMOD modelos"
echo "  ctx:  $(launchctl getenv OLLAMA_CONTEXT_LENGTH 2>/dev/null)"
echo "  max:  $(launchctl getenv OLLAMA_MAX_LOADED_MODELS 2>/dev/null)"

echo ""
echo "--- nada a correr? ---"
ollama ps
if ollama ps | tail -n +2 | grep -q .; then echo "  ⚠️ ha modelo carregado; vou descarregar"; ollama ps | tail -n +2 | awk '{print $1}' | while read m; do ollama stop "$m"; done; sleep 3; fi
# `pgrep -f "mooterbench"` apanhava a janela do Terminal do bench JA TERMINADO —
# o argv do shell ainda contem o caminho do .command. Perguntar pelo processo
# node concreto e a diferenca entre "esta a correr" e "ja esteve aberto".
VIVO=$(pgrep -fl "node .*(mooterbench|moo-runner)\\.mjs" 2>/dev/null | grep -v "$$" || true)
[ -z "$VIVO" ] || { echo "$VIVO"; abort "ha um bench/runner NODE a correr — espera que acabe"; }
echo "  ✅ nenhum processo node de bench/runner vivo"

echo ""
echo "--- actualizar ---"
if command -v brew >/dev/null && brew list --cask ollama >/dev/null 2>&1; then
  echo "  via Homebrew cask"
  brew upgrade --cask ollama 2>&1 | tail -8
else
  echo "  via instalador oficial (mesma via do site)"
  TMP=$(mktemp -d)
  curl -fsSL -o "$TMP/Ollama.dmg" https://ollama.com/download/Ollama.dmg || abort "download falhou"
  echo "  descarregado: $(du -h "$TMP/Ollama.dmg" | cut -f1)"
  pkill -x Ollama 2>/dev/null; pkill -x ollama 2>/dev/null; sleep 4
  MNT=$(hdiutil attach "$TMP/Ollama.dmg" -nobrowse -quiet | tail -1 | awk '{print $NF}') || abort "hdiutil falhou"
  echo "  montado em $MNT"
  [ -d "$MNT/Ollama.app" ] || { hdiutil detach "$MNT" -quiet; abort "Ollama.app nao esta no dmg"; }
  ditto "$MNT/Ollama.app" "/Applications/Ollama.app" || { hdiutil detach "$MNT" -quiet; abort "copia falhou"; }
  hdiutil detach "$MNT" -quiet
  rm -rf "$TMP"
fi

echo ""
echo "--- rearrancar ---"
open -a Ollama 2>/dev/null
sleep 15

echo ""
echo "--- depois ---"
DEPOIS=$(ollama --version 2>/dev/null); echo "  versao: $ANTES  ->  $DEPOIS"
echo "  ctx:  $(launchctl getenv OLLAMA_CONTEXT_LENGTH 2>/dev/null)"
echo "  max:  $(launchctl getenv OLLAMA_MAX_LOADED_MODELS 2>/dev/null)"
echo "  modelos:"; ollama list | tail -n +2 | awk '{print "    "$1"  "$3$4}'
NDEP=$(ollama list | tail -n +2 | grep -c .)
[ "$NDEP" = "$NMOD" ] || abort "modelos passaram de $NMOD para $NDEP — algo se perdeu"
echo "  ✅ $NDEP modelos intactos"

echo ""
echo "--- prova de vida: uma ronda real ---"
ollama run --verbose granite4.2:3b "Responde só: ok" 2>&1 | tail -8
ollama ps
ollama stop granite4.2:3b 2>/dev/null

echo ""
echo "=== ✅ FIM · $(date) ==="
sleep 2
{ echo ""; echo "## OLLAMA 27 · $(date '+%Y-%m-%d %H:%M')"; echo ""; echo '```'; cat "$LOG"; echo '```'; } \
  >> "$HOME/paulo-vault/50-fleet/$(date +%Y-%m-%d)-mac-mini-motor-medicao.md" 2>/dev/null
echo "Fecha esta janela."
