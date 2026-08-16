#!/usr/bin/env bash
# Prova o VERDE VAZIO sem tocar no ledger de producao:
# com um job activo no ledger, o WIP guard recusa TODOS os dispatches — e os
# testes K4/K7/K8 passam na mesma, porque leem r.erro e o guard escreve r.error.
set -u
BR="/c/Users/Paulo Loureiro/frugal/.claude/worktrees/contrato-sandbox/packages/mooter-bridge"
BASE="$(mktemp -d)"

echo "=== A) ledger LIMPO (o teste despacha a serio) ==="
HA="$BASE/home-a"; mkdir -p "$HA"
cd "$BR" || exit 1
MOOTER_HOME="$HA" OLLAMA_HOST=127.0.0.1:1 MOOTER_JOB_TIMEOUT_MS=8000 \
  timeout 120 node --test contrato.test.js > "$BASE/a.txt" 2>&1
echo "  resultado : $(grep -cE '^✔' "$BASE/a.txt") verdes / $(grep -cE '^✖' "$BASE/a.txt") vermelhos"
echo "  dispatched no ledger: $(grep -c '"event":"dispatched"' "$HA/ledger.jsonl" 2>/dev/null || echo 0)"

echo
echo "=== B) ledger com UM job activo (o WIP guard recusa tudo) ==="
HB="$BASE/home-b"; mkdir -p "$HB"
# um job dispatched e NUNCA terminado, na worktree que o teste usa (process.cwd())
CWD_JSON=$(node -e "console.log(JSON.stringify(process.cwd()))" )
printf '{"ts":"2026-08-16T00:00:00.000Z","job_id":"probe-wip","event":"dispatched","agent":"moo","wave":"probe","worktree":%s}\n' "$CWD_JSON" > "$HB/ledger.jsonl"
MOOTER_HOME="$HB" OLLAMA_HOST=127.0.0.1:1 MOOTER_JOB_TIMEOUT_MS=8000 \
  timeout 120 node --test contrato.test.js > "$BASE/b.txt" 2>&1
echo "  resultado : $(grep -cE '^✔' "$BASE/b.txt") verdes / $(grep -cE '^✖' "$BASE/b.txt") vermelhos"
NOVOS=$(grep -c '"event":"dispatched"' "$HB/ledger.jsonl" 2>/dev/null || echo 0)
echo "  dispatched no ledger: $NOVOS  (1 = so o probe; o teste NAO despachou nada)"

echo
echo "=== VEREDICTO ==="
VA=$(grep -cE '^✔' "$BASE/a.txt"); VB=$(grep -cE '^✔' "$BASE/b.txt")
echo "  A (despachou a serio) : $VA verdes"
echo "  B (nao despachou nada): $VB verdes"
if [ "$VA" = "$VB" ] && [ "$NOVOS" = "1" ]; then
  echo "  >> VERDE VAZIO CONFIRMADO: o mesmo numero de verdes com e sem exercer o contrato."
else
  echo "  >> nao reproduziu — investigar"
fi
echo
echo "artefactos em $BASE"
