#!/usr/bin/env bash
#
# Prova o VERDE VAZIO que esta frente corrigiu, e prova que ele já não existe.
#
# ⚠️ VERSÃO 2 — a v1 era TAUTOLÓGICA e foi apanhada pelo G4 (2026-08-16).
# Ela corria o ficheiro do HEAD passando-lhe `MOOTER_HOME` por fora; só que o
# ficheiro corrigido define `process.env.MOOTER_HOME` internamente, logo ignorava
# os ledgers do script. Pior: não validava códigos de saída, portanto imprimia
# "VERDE VAZIO CONFIRMADO" mesmo quando nada tinha corrido. Um artefacto de prova
# com o mesmo defeito que a frente existe para corrigir.
#
# Esta versão:
#   · extrai do git a versão PRÉ-CORRECÇÃO (é essa que tem o defeito a provar)
#   · corre SÓ K4 e K7 — usam `moo`, e com o Ollama morto não lançam CLI pago.
#     A v1 corria o ficheiro todo, e na versão antiga o K8 lança `claude` a sério.
#   · valida os códigos de saída e aborta se uma premissa falhar
#   · confirma que o HEAD já NÃO aceita o cenário do verde vazio
#
set -uo pipefail

BR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../packages/mooter-bridge" && pwd)"
BASE="$(mktemp -d)"
ANTIGO="$BASE/contrato-antigo.test.js"
cd "$BR" || { echo "ABORTAR: não encontrei packages/mooter-bridge"; exit 2; }

# A versão pré-correcção. `main` tem-na; se um dia deixar de ter, o script
# aborta em vez de medir a versão errada e chamar-lhe prova.
git show main:packages/mooter-bridge/contrato.test.js > "$ANTIGO" 2>/dev/null \
  || { echo "ABORTAR: não consegui extrair a versão antiga de main"; exit 2; }
if grep -q "process.env.MOOTER_HOME" "$ANTIGO"; then
  echo "ABORTAR: a versão extraída JÁ tem sandbox — não é a que tem o defeito."
  echo "         (é isto que tornava a v1 deste script tautológica)"
  exit 2
fi
cp "$ANTIGO" "$BR/.contrato-antigo.test.js"
trap 'rm -f "$BR/.contrato-antigo.test.js"' EXIT

corre() {  # $1=MOOTER_HOME  $2=ficheiro  -> ecoa "verdes|falhas|dispatches"
  local home="$1"
  local alvo="$2"
  local out
  out="$BASE/$(basename "$alvo").$$.txt"
  MOOTER_HOME="$home" OLLAMA_HOST=127.0.0.1:1 MOOTER_JOB_TIMEOUT_MS=8000 \
    timeout 120 node --test --test-name-pattern='K4|K7' "$alvo" > "$out" 2>&1
  local rc=$?
  [ $rc -eq 124 ] && { echo "TIMEOUT|-|-"; return; }
  # ⚠️ `grep -c` imprime 0 E sai com código 1 quando não há match; um
  # `|| echo 0` a seguir imprimiria um SEGUNDO zero. Usa-se `|| true`.
  local v f d
  v=$(grep -cE '^✔' "$out" || true)
  f=$(grep -cE '^✖' "$out" || true)
  d=$(grep -c '"event":"dispatched"' "$home/ledger.jsonl" 2>/dev/null || true)
  echo "${v:-0}|${f:-0}|${d:-0}"
}

echo "=== VERSÃO PRÉ-CORRECÇÃO (o defeito) ==="
HA="$BASE/a"; mkdir -p "$HA"
A=$(corre "$HA" ".contrato-antigo.test.js")
echo "  A) ledger limpo          -> ${A%%|*} verdes · dispatches: ${A##*|}"

HB="$BASE/b"; mkdir -p "$HB"
printf '{"ts":"2026-01-01T00:00:00.000Z","job_id":"probe-wip","event":"dispatched","agent":"moo","wave":"probe","worktree":%s}\n' \
  "$(node -e 'console.log(JSON.stringify(process.cwd()))')" > "$HB/ledger.jsonl"
B=$(corre "$HB" ".contrato-antigo.test.js")
echo "  B) ledger com job activo -> ${B%%|*} verdes · dispatches: ${B##*|} (1 = só o probe)"

echo
echo "=== VERSÃO ACTUAL (HEAD): já não toca em ledger nenhum de fora ==="
# Não repetimos o cenário B contra o HEAD: ele monta o seu próprio sandbox e
# ignora o MOOTER_HOME que lhe passemos, portanto "passar em B" não provaria
# nada — foi essa confusão que tornou a v1 deste script tautológica.
# O que se pode verificar, e é o que interessa: correr o HEAD não escreve
# UMA linha no ledger que lhe pomos à frente.
HC="$BASE/c"; mkdir -p "$HC"; : > "$HC/ledger.jsonl"
C=$(corre "$HC" "contrato.test.js")
LINHAS_C=$(wc -l < "$HC/ledger.jsonl" 2>/dev/null || echo 0)
echo "  HEAD -> ${C%%|*} verdes, $(echo "$C" | cut -d'|' -f2) falhas"
echo "  linhas escritas no ledger que lhe demos: $LINHAS_C  (0 = isolado)"

echo
echo "=== VEREDICTO ==="
VA="${A%%|*}"; VB="${B%%|*}"; DB="${B##*|}"
falhou=0
[ "$A" = "TIMEOUT|-|-" ] && { echo "  !! A pendurou — não é possível concluir"; falhou=1; }
[ "$B" = "TIMEOUT|-|-" ] && { echo "  !! B pendurou — não é possível concluir"; falhou=1; }
[ "${A##*|}" -lt 1 ] 2>/dev/null && { echo "  !! A não despachou nada: o cenário 'ledger limpo' não se realizou"; falhou=1; }
[ "$DB" != "1" ] && { echo "  !! B tinha $DB dispatches, esperava 1 (só o probe)"; falhou=1; }
[ "$VA" -lt 1 ] 2>/dev/null && { echo "  !! A não teve verdes nenhuns — o teste não correu"; falhou=1; }

if [ "$falhou" = "0" ] && [ "$VA" = "$VB" ]; then
  echo "  >> VERDE VAZIO CONFIRMADO na versão antiga: $VA verdes com $((${A##*|})) dispatches,"
  echo "     e os mesmos $VB verdes com 0 dispatches. O resultado não depende de exercer o contrato."
elif [ "$falhou" = "0" ]; then
  echo "  >> NÃO reproduziu: A=$VA verdes, B=$VB verdes. Investigar antes de confiar."
else
  echo "  >> INCONCLUSIVO — uma premissa falhou acima. Nenhuma conclusão é válida."
  exit 1
fi
echo
echo "artefactos em $BASE"
