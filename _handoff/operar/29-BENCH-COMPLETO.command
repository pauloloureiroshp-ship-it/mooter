#!/bin/zsh
# 29-BENCH-COMPLETO — B1..B6 com N=100. ~2h. Deixa a janela aberta.
# Corre com o runner de pe, que e a condicao especificada no mapa §3
# ("Bench com painel+runner de pe, nao maquina vazia").
cd "$(dirname "$0")/../.."
LOG="$(pwd)/_handoff/motor-mac-bench100-$(date +%Y%m%d-%H%M).log"
exec > >(tee -a "$LOG") 2>&1
echo "=== 29-BENCH-COMPLETO · $(date) ==="
echo "N=100 x 3 modelos = 300 rondas + B3 (75 chamadas) + B6 (30). ~2h."
echo "runner de pe: $(pgrep -f 'moo-runner.mjs' >/dev/null && echo sim || echo nao) — e a condicao do mapa §3"
echo ""
node tools/cockpit/runner/mooterbench.mjs --n=100 --pilar=P2
echo ""
echo "=== FIM · $(date) ==="
sleep 2
S=$(ls -t _handoff/mooterbench-*.md 2>/dev/null | head -1)
[ -n "$S" ] && { echo ""; echo "## MOOTERBENCH COMPLETO (N=100) · $(date '+%Y-%m-%d %H:%M')"; echo ""; cat "$S"; } \
  >> "$HOME/paulo-vault/50-fleet/$(date +%Y-%m-%d)-mac-mini-motor-medicao.md" 2>/dev/null
echo "Fecha esta janela."
