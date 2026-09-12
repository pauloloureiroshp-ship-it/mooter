#!/bin/zsh
# 21-VERIFICAR-MOTOR — prova que o catalogo do router bate com o disco, no macOS.
cd "$(dirname "$0")/../.."
LOG="$(pwd)/_handoff/motor-mac-verificar-$(date +%Y%m%d-%H%M).log"
exec > >(tee -a "$LOG") 2>&1
echo "=== 21-VERIFICAR-MOTOR · $(date) ==="
echo ""
echo "--- env do Ollama ---"
for V in OLLAMA_CONTEXT_LENGTH OLLAMA_MAX_LOADED_MODELS; do
  echo "  $V = $(launchctl getenv $V 2>/dev/null || echo '(vazio)')"
done
echo ""
echo "--- modelos no disco ---"
ollama list
echo ""
echo "--- check-local-models.js (o catalogo bate com o disco?) ---"
node tools/router/check-local-models.js 2>&1 | head -30
echo ""
echo "--- hardware-matcher (quality n/d nao pode rebentar) ---"
node tools/router/hardware-matcher.js 2>&1 | head -30
echo ""
echo "--- carregado agora ---"
ollama ps
echo ""
echo "=== FIM · $(date) · $LOG ==="
sleep 2
{ echo ""; echo "## VERIFICACAO 21 · $(date '+%Y-%m-%d %H:%M')"; echo ""; echo '```'; cat "$LOG"; echo '```'; } \
  >> "$HOME/paulo-vault/50-fleet/$(date +%Y-%m-%d)-mac-mini-motor-medicao.md" 2>/dev/null
echo "Fecha esta janela."
