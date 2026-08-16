#!/usr/bin/env bash
#
# A FONTE ÚNICA dos números desta frente.
#
# ⚠️ Existe porque a mesma classe de erro apareceu TRÊS vezes: números do ledger
# pinados em documentos, que apodrecem porque o ledger é vivo. Contados em
# sítios diferentes e momentos diferentes, ficaram incoerentes entre si e com a
# realidade — e um deles trocou eventos por jobs, inflacionando ~5x.
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

linhas=$(grep -c "\"wave\":\"$W\"" "$L" || true)
[ "${linhas:-0}" -gt 0 ] 2>/dev/null || { echo "wave '$W': 0 eventos no ledger."; exit 0; }

ev_moo=$(grep "\"wave\":\"$W\"" "$L" | grep -c '"agent":"moo"' || true)
ev_cc=$(grep "\"wave\":\"$W\"" "$L" | grep -c '"agent":"cc"' || true)
jobs=$(grep "\"wave\":\"$W\"" "$L" | grep -oE '"job_id":"[^"]*"' | sort -u | wc -l)
jobs_moo=$(grep "\"wave\":\"$W\"" "$L" | grep '"agent":"moo"' | grep -oE '"job_id":"[^"]*"' | sort -u | wc -l)
jobs_cc=$(grep "\"wave\":\"$W\"" "$L" | grep '"agent":"cc"' | grep -oE '"job_id":"[^"]*"' | sort -u | wc -l)
disp=$(grep "\"wave\":\"$W\"" "$L" | grep -c '"event":"dispatched"' || true)
orf=$(grep "\"wave\":\"$W\"" "$L" | grep -c 'orphaned-by-restart' || true)

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
echo "EVENTOS != JOBS. Um job escreve vários eventos; trocá-los infla o número ~5x."
