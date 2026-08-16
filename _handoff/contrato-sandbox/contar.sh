#!/usr/bin/env bash
#
# A FONTE ÚNICA dos números desta frente.
#
# ⚠️ Existe porque a mesma classe de erro apareceu TRÊS vezes: números do ledger
# pinados em documentos, que apodrecem porque o ledger é vivo. Contados em
# sítios diferentes e momentos diferentes, ficaram incoerentes entre si e com a
# realidade — e um deles trocou eventos por jobs (o racio real entre os dois
# e calculado no fim desta saida, nunca afirmado aqui).
#
# Regra desta frente, a partir daqui: NENHUM documento pina uma contagem do
# ledger. Ou aponta para este script, ou apresenta um snapshot com data e a
# palavra "snapshot" ao lado. Um número sem data não é um facto, é uma memória.
#
# Uso:  bash _handoff/contrato-sandbox/contar.sh
#
set -uo pipefail
L="${MOOTER_LEDGER:-$HOME/.mooter/ledger.jsonl}"
W="${1:-contrato-test}"

[ -f "$L" ] || { echo "ABORTAR: não encontrei o ledger em $L"; exit 2; }

# ⚠️ Duas coisas que o G4 #5 apanhou nesta fonte "única":
#  1. `$W` entrava directamente no regex do grep — uma wave com `.` ou `|`
#     contaria linhas a mais em silêncio. Passa a ser comparada como STRING.
#  2. uma linha truncada podia ser contada como evento sem `job_id`, dando
#     "1 evento, 0 jobs" com exit 0. Agora as linhas inválidas são CONTADAS e
#     declaradas — um ledger corrompido tem de ser visível, não arredondado.
if ! command -v node >/dev/null 2>&1; then
  echo "ABORTAR: preciso do node para ler o ledger como JSON, não como texto"; exit 2
fi
INVALIDAS=$(node -e '
const fs=require("fs");
const [f,w]=process.argv.slice(1);
let mau=0;
for (const l of fs.readFileSync(f,"utf8").split(String.fromCharCode(10))) {
  if (!l.trim()) continue;
  try { const o=JSON.parse(l); if (o && o.wave===w && !o.job_id) mau++; }
  catch { mau++; }
}
console.log(mau);
' "$L" "$W" 2>/dev/null || echo "?")
if [ "${INVALIDAS:-?}" != "0" ]; then
  echo "⚠️  $INVALIDAS linha(s) do ledger inválidas ou sem job_id — as contagens abaixo"
  echo "    podem estar incompletas. Um ledger corrompido não se arredonda em silêncio."
  echo
fi

linhas=$(grep -cF "\"wave\":\"$W\"" "$L" || true)
[ "${linhas:-0}" -gt 0 ] 2>/dev/null || { echo "wave '$W': 0 eventos no ledger."; exit 0; }

ev_moo=$(grep -F "\"wave\":\"$W\"" "$L" | grep -c '"agent":"moo"' || true)
ev_cc=$(grep -F "\"wave\":\"$W\"" "$L" | grep -c '"agent":"cc"' || true)
jobs=$(grep -F "\"wave\":\"$W\"" "$L" | grep -oE '"job_id":"[^"]*"' | sort -u | wc -l)
jobs_moo=$(grep -F "\"wave\":\"$W\"" "$L" | grep '"agent":"moo"' | grep -oE '"job_id":"[^"]*"' | sort -u | wc -l)
jobs_cc=$(grep -F "\"wave\":\"$W\"" "$L" | grep '"agent":"cc"' | grep -oE '"job_id":"[^"]*"' | sort -u | wc -l)
disp=$(grep -F "\"wave\":\"$W\"" "$L" | grep -c '"event":"dispatched"' || true)
orf=$(grep -F "\"wave\":\"$W\"" "$L" | grep -c 'orphaned-by-restart' || true)

echo "ledger : $L"
echo "wave   : $W"
echo "lido em: $(date -u '+%Y-%m-%dT%H:%M:%SZ') (UTC)  — isto é um SNAPSHOT"
echo
printf '  %-34s %6s\n' "EVENTOS (linhas do ledger)"    "$linhas"
printf '  %-34s %6s\n' "  · com agent moo"             "$ev_moo"
printf '  %-34s %6s\n' "  · com agent cc"              "$ev_cc"
echo
printf '  %-34s %6s\n' "JOBS ÚNICOS (job_id distintos)" "$jobs"
printf '  %-34s %6s\n' "  · moo"                        "$jobs_moo"
printf '  %-34s %6s\n' "  · cc  (CLI pago)"             "$jobs_cc"
echo
printf '  %-34s %6s\n' "dispatches"                     "$disp"
printf '  %-34s %6s\n' "orphaned-by-restart"            "$orf"
echo
# a verificação que faltava: as duas contagens têm de fechar entre si
soma=$((ev_moo + ev_cc))
if [ "$soma" -ne "$linhas" ]; then
  echo "  nota: moo+cc = $soma != $linhas eventos — há eventos de outros agentes ou sem agent."
fi
if [ "$jobs" -ne "$disp" ]; then
  echo "  nota: jobs únicos ($jobs) != dispatches ($disp) — esperado que batam."
fi
# ⚠️ O racio e CALCULADO, nunca afirmado. Este script ja teve "~5x" escrito a mao
# — uma afirmacao corrente pinada, exactamente o que ele existe para eliminar.
# Apanhado pelo G4 #4.
if [ "$jobs" -gt 0 ] 2>/dev/null; then
  racio=$(awk -v e="$linhas" -v j="$jobs" 'BEGIN{ printf "%.1f", e/j }')
  echo "EVENTOS != JOBS. Nesta wave, cada job escreveu ${racio} eventos em media:"
  echo "  trocar uma contagem pela outra multiplica o numero por ${racio}."
else
  echo "EVENTOS != JOBS. Um job escreve varios eventos; trocá-los infla o numero."
fi
