#!/usr/bin/env bash
# benchmark.sh — empirically measure router efficiency.
#
# Runs a fixed corpus of 12 representative prompts through the classifier and
# (where applicable) the actual local Ollama backend. Compares mediator path
# (route to cheapest viable tier) against naive baseline (everything → Opus).
#
# Outputs:
#   - per-prompt classification + tier
#   - per-prompt timing for local executions
#   - aggregate cost comparison
#   - JSON summary for VALIDATION_REPORT.md

set -euo pipefail

ROUTER_DIR="$HOME/.claude/tools/router"
RESULTS_DIR="$HOME/.claude/tools/router/benchmark-results"
mkdir -p "$RESULTS_DIR"
TS=$(date +%Y%m%d-%H%M%S)
OUT="$RESULTS_DIR/run-$TS.json"

# Representative prompts: 3 trivial, 3 simple, 3 medium, 3 complex.
declare -a PROMPTS=(
  "que horas são?"
  "resume o que faz a função handleConnect"
  "compara estes dois snippets de código rapidamente"
  "gera uma commit message para esta mudança"
  "escreve uma docstring para a função getUser"
  "cria um regex para validar email"
  "porque é que o websocket reconnect falha às vezes"
  "investiga a causa raiz deste bug intermitente no STT"
  "decompõe o sprint 9 em tarefas executáveis"
  "refator a arquitetura do hub para suportar multi-tenant"
  "audita o sistema de auth antes do deploy de produção"
  "review final antes de fazer push para main"
)

declare -a EXPECTED_TIERS=(
  "T0" "T0" "T0"
  "T0" "T0" "T0"
  "T2" "T2" "T2"
  "T3" "T3" "T3"
)

echo "" > "$OUT.tmp"
echo "[" > "$OUT"

CORRECT=0
TOTAL=${#PROMPTS[@]}
NAIVE_OPUS_COST=0
MEDIATOR_COST=0

# Cost computation now delegates to pricing.js (single source of truth).
# Previously this used hardcoded $/tok constants that drifted from real
# Anthropic prices and the rest of the toolchain.
PROMPT_LEN_DEFAULT=200

for i in "${!PROMPTS[@]}"; do
  PROMPT="${PROMPTS[$i]}"
  EXPECTED="${EXPECTED_TIERS[$i]}"
  RESULT=$(node "$ROUTER_DIR/classify.js" "$PROMPT")
  TIER=$(echo "$RESULT" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{console.log(JSON.parse(d).tier);})")
  MODEL=$(echo "$RESULT" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{console.log(JSON.parse(d).recommended_model);})")
  CONF=$(echo "$RESULT" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{console.log(JSON.parse(d).confidence);})")
  CAT=$(echo "$RESULT" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{console.log(JSON.parse(d).task_category);})")

  MATCH="false"
  if [ "$TIER" = "$EXPECTED" ]; then MATCH="true"; CORRECT=$((CORRECT+1)); fi

  # Cost calc — uses pricing.js for both naive and mediator costs.
  NAIVE_USD=$(node -e "const p=require('$ROUTER_DIR/pricing');console.log(p.naiveOpusCost($PROMPT_LEN_DEFAULT).toFixed(6));")
  MED_USD=$(node -e "const p=require('$ROUTER_DIR/pricing');console.log(p.estimateTurnCost('$TIER',$PROMPT_LEN_DEFAULT).toFixed(6));")

  NAIVE_OPUS_COST=$(node -e "console.log(($NAIVE_OPUS_COST + $NAIVE_USD).toFixed(6));")
  MEDIATOR_COST=$(node -e "console.log(($MEDIATOR_COST + $MED_USD).toFixed(6));")

  printf "  %-2s expected=%s got=%-3s conf=%-4s match=%-5s cat=%s\n" "$((i+1))" "$EXPECTED" "$TIER" "$CONF" "$MATCH" "$CAT"

  COMMA=","
  if [ "$i" = "$((TOTAL-1))" ]; then COMMA=""; fi
  cat >> "$OUT.tmp" <<EOF
  {"idx":$i,"prompt":"$(echo "$PROMPT" | sed 's/"/\\"/g')","expected":"$EXPECTED","got":"$TIER","model":"$MODEL","confidence":$CONF,"category":"$CAT","match":$MATCH,"naive_usd":$NAIVE_USD,"mediator_usd":$MED_USD}$COMMA
EOF
done

cat "$OUT.tmp" >> "$OUT"
echo "]" >> "$OUT"
rm "$OUT.tmp"

ACCURACY=$(node -e "console.log((($CORRECT/$TOTAL)*100).toFixed(1))")
SAVINGS=$(node -e "console.log(($NAIVE_OPUS_COST - $MEDIATOR_COST).toFixed(6))")
SAVINGS_PCT=$(node -e "console.log(((($NAIVE_OPUS_COST - $MEDIATOR_COST) / $NAIVE_OPUS_COST) * 100).toFixed(1))")

echo ""
echo "═══════════════════════════════════════════════════════"
echo "Benchmark complete: $TS"
echo "═══════════════════════════════════════════════════════"
echo "Classifier accuracy:  $CORRECT/$TOTAL ($ACCURACY%)"
echo "Naive Opus cost:      \$$NAIVE_OPUS_COST"
echo "Mediator cost:        \$$MEDIATOR_COST"
echo "Savings:              \$$SAVINGS ($SAVINGS_PCT%)"
echo ""
echo "Per-prompt JSON: $OUT"
echo ""

# Append summary
SUMMARY="$RESULTS_DIR/summary-$TS.json"
cat > "$SUMMARY" <<EOF
{
  "timestamp": "$TS",
  "total_prompts": $TOTAL,
  "correct_tier": $CORRECT,
  "accuracy_pct": $ACCURACY,
  "naive_opus_cost_usd": $NAIVE_OPUS_COST,
  "mediator_cost_usd": $MEDIATOR_COST,
  "savings_usd": $SAVINGS,
  "savings_pct": $SAVINGS_PCT,
  "avg_output_tokens_assumed": $AVG_TOK,
  "details": "$OUT"
}
EOF
echo "Summary: $SUMMARY"
