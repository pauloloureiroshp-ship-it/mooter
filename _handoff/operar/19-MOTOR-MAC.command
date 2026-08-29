#!/bin/zsh
# 19-MOTOR-MAC — mede o motor local deste Mac, corrige o contexto, e deixa recibo.
# Origem: estudo 2026-08-29 (vault 10-projects/2026-08-29-mac-estudo-llms-locais.md)
# NAO promove nenhum modelo a residente. NAO apaga nada. NAO toca em git.
cd "$(dirname "$0")/../.."
REPO="$(pwd)"
TS="$(date +%Y%m%d-%H%M)"
LOG="$REPO/_handoff/motor-mac-$TS.log"
VAULT="$HOME/paulo-vault/50-fleet/$(date +%Y-%m-%d)-mac-mini-motor-medicao.md"
PROMPT="Responde em uma frase: o que faz a funcao Array.prototype.reduce em JavaScript?"

exec > >(tee -a "$LOG") 2>&1
echo "=================================================================="
echo "  19-MOTOR-MAC  ·  $(date)"
echo "=================================================================="

echo ""
echo "### 1 · HARDWARE E TECTO (antes de tocar em nada)"
CHIP="$(sysctl -n machdep.cpu.brand_string 2>/dev/null)"
MEMB="$(sysctl -n hw.memsize 2>/dev/null)"
MEMGB=$(( MEMB / 1073741824 ))
WIRED="$(sysctl -n iogpu.wired_limit_mb 2>/dev/null)"
echo "chip           : ${CHIP:-n/d}"
echo "RAM unificada  : ${MEMGB:-n/d} GB"
echo "wired_limit_mb : ${WIRED:-n/d}   (0 = default do macOS)"
if [ "${WIRED:-0}" = "0" ] || [ -z "$WIRED" ]; then
  echo "tecto GPU est. : ~$(( MEMGB * 2 / 3 )) GB (66%) a ~$(( MEMGB * 3 / 4 )) GB (75%) — as duas fontes divergem"
else
  echo "tecto GPU      : $(( WIRED / 1024 )) GB (definido explicitamente)"
fi
sw_vers 2>/dev/null
echo "disco livre    : $(df -g / 2>/dev/null | awk 'NR==2{print $4" GB"}')"
LIVRE=$(df -g / 2>/dev/null | awk 'NR==2{print $4}')

echo ""
echo "### 2 · OLLAMA — estado actual"
ollama --version 2>/dev/null || { echo "!! ollama nao encontrado. Aborta."; exit 3; }
echo "--- env em vigor (launchctl) ---"
for V in OLLAMA_CONTEXT_LENGTH OLLAMA_MAX_LOADED_MODELS OLLAMA_KEEP_ALIVE OLLAMA_NUM_PARALLEL; do
  echo "  $V = $(launchctl getenv $V 2>/dev/null || echo '(nao definido)')"
done
echo "--- modelos no disco ---"
ollama list 2>/dev/null
echo "--- carregados agora ---"
ollama ps 2>/dev/null

echo ""
echo "### 3 · PRIMEIRA MEDICAO REAL DE tok/s NESTE MAC"
echo "    (B4/B5 informal — NAO e o MooterBench. Maquina com o stack como esta.)"
for M in gemma4:12b qwen2.5-coder:14b gpt-oss:20b; do
  if ollama list 2>/dev/null | awk '{print $1}' | grep -qx "$M"; then
    echo ""
    echo "  ---------- $M ----------"
    ollama run --verbose "$M" "$PROMPT" 2>&1 | tail -12
    echo "  --- ollama ps (coluna PROCESSOR arbitra GPU vs CPU) ---"
    ollama ps 2>/dev/null
    ollama stop "$M" 2>/dev/null
  else
    echo "  ---------- $M : nao instalado, saltado ----------"
  fi
done

echo ""
echo "### 4 · CANDIDATOS DO ESTUDO (Apache 2.0, 25/08/2026) — 7,5 GB"
if [ "${LIVRE:-0}" -lt 20 ]; then
  echo "!! Menos de 20 GB livres ($LIVRE GB). NAO puxa. Liberta disco primeiro."
else
  ollama pull granite4.2:3b 2>&1 | tail -3
  ollama pull granite4.2:8b 2>&1 | tail -3
  for M in granite4.2:3b granite4.2:8b; do
    echo ""
    echo "  ---------- $M ----------"
    ollama run --verbose "$M" "$PROMPT" 2>&1 | tail -12
    ollama ps 2>/dev/null
    ollama stop "$M" 2>/dev/null
  done
fi

echo ""
echo "### 5 · A CORRECCAO QUE VALE MAIS: contexto 4k -> 32k"
echo "    Fonte: docs.ollama.com/context-length (<24 GiB = 4k por omissao)"
launchctl setenv OLLAMA_CONTEXT_LENGTH 32000
launchctl setenv OLLAMA_MAX_LOADED_MODELS 2
echo "  OLLAMA_CONTEXT_LENGTH  = 32000"
echo "  OLLAMA_MAX_LOADED_MODELS = 2   (default 3 estoura o tecto em 16 GB)"
echo "  a reiniciar a app Ollama (obrigatorio para o env pegar)..."
pkill -x Ollama 2>/dev/null
pkill -x ollama 2>/dev/null
sleep 5
open -a Ollama 2>/dev/null
sleep 12
echo "  --- confirmacao ---"
for V in OLLAMA_CONTEXT_LENGTH OLLAMA_MAX_LOADED_MODELS; do
  echo "  $V = $(launchctl getenv $V 2>/dev/null || echo '(vazio!)')"
done
ollama run granite4.2:3b "ok" >/dev/null 2>&1
echo "  --- ollama ps (coluna CONTEXT deve dizer 32000) ---"
ollama ps 2>/dev/null

echo ""
echo "=================================================================="
echo "  FIM  ·  $(date)"
echo "  recibo: $LOG"
echo "=================================================================="

sleep 3
mkdir -p "$(dirname "$VAULT")" 2>/dev/null
{
  echo "---"
  echo "data: $(date +%Y-%m-%d)"
  echo "tipo: medicao"
  echo "device: mac-mini-de-paulo-local"
  echo "origem: _handoff/operar/19-MOTOR-MAC.command"
  echo "---"
  echo ""
  echo "# Medicao do motor local — Mac mini — $(date '+%Y-%m-%d %H:%M %Z')"
  echo ""
  echo "Recibo bruto: \`$LOG\`"
  echo ""
  echo '```'
  cat "$LOG"
  echo '```'
} > "$VAULT" 2>/dev/null
echo "recibo no vault: $VAULT"
echo ""
echo "Fecha esta janela. Cola o caminho do recibo no Cowork."
