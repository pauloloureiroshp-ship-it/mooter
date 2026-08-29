#!/bin/zsh
# 20-MOTOR-MAC-FIX — repoe o contexto em 65536 e verifica.
# PORQUE EXISTE: o 19-MOTOR-MAC foi escrito assumindo 16 GB de RAM e contexto 4k.
# A medicao provou 24 GB (M4 Pro) e contexto JA a 65536 pelo slider da app.
# O passo 5 do 19 poe 32000 por launchctl, que OVERRIDE o slider e DESCE o contexto.
# Este ficheiro desfaz isso. Correr SEMPRE depois do 19.
cd "$(dirname "$0")/../.."
REPO="$(pwd)"
LOG="$REPO/_handoff/motor-mac-fix-$(date +%Y%m%d-%H%M).log"
exec > >(tee -a "$LOG") 2>&1

echo "=================================================================="
echo "  20-MOTOR-MAC-FIX  ·  $(date)"
echo "=================================================================="
echo ""
echo "--- antes ---"
for V in OLLAMA_CONTEXT_LENGTH OLLAMA_MAX_LOADED_MODELS; do
  echo "  $V = $(launchctl getenv $V 2>/dev/null || echo '(nao definido)')"
done
ollama ps 2>/dev/null

echo ""
echo "--- a repor ---"
launchctl setenv OLLAMA_CONTEXT_LENGTH 65536
launchctl setenv OLLAMA_MAX_LOADED_MODELS 2
echo "  OLLAMA_CONTEXT_LENGTH  = 65536  (>= 64000, o minimo que o Ollama recomenda para agentes)"
echo "  OLLAMA_MAX_LOADED_MODELS = 2"

pkill -x Ollama 2>/dev/null
pkill -x ollama 2>/dev/null
sleep 5
open -a Ollama 2>/dev/null
sleep 12

echo ""
echo "--- depois ---"
for V in OLLAMA_CONTEXT_LENGTH OLLAMA_MAX_LOADED_MODELS; do
  echo "  $V = $(launchctl getenv $V 2>/dev/null || echo '(VAZIO — falhou)')"
done
ollama run granite4.2:3b "ok" >/dev/null 2>&1 || ollama run gemma4:12b "ok" >/dev/null 2>&1
echo "  --- ollama ps · a coluna CONTEXT tem de dizer 65536 ---"
ollama ps 2>/dev/null

echo ""
echo "=================================================================="
echo "  FIM · $(date) · recibo: $LOG"
echo "=================================================================="
sleep 2
{ echo ""; echo "## FIX 20 · $(date '+%Y-%m-%d %H:%M')"; echo ""; echo '```'; cat "$LOG"; echo '```'; } \
  >> "$HOME/paulo-vault/50-fleet/$(date +%Y-%m-%d)-mac-mini-motor-medicao.md" 2>/dev/null
echo "Fecha esta janela."
