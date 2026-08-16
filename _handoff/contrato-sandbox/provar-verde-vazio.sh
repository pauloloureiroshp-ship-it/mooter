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

# ⚠️ `BR` vazio não é apanhado por `cd "$BR"` — `cd ""` fica no cwd e o script
# segue a escrever em sítios errados até falhar com uma mensagem sobre outra
# coisa. Descoberto ao correr este script a partir do scratchpad: a mensagem que
# saiu foi "não consegui copiar a versão antiga", que manda investigar o `cp`
# quando o problema era a localização. Uma premissa não verificada mente sobre
# qual premissa falhou.
BR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../packages/mooter-bridge" 2>/dev/null && pwd)"
[ -n "${BR:-}" ] && [ -d "$BR" ] \
  || { echo "ABORTAR: não encontrei packages/mooter-bridge a partir de $(dirname "${BASH_SOURCE[0]}")"; exit 2; }
[ -f "$BR/contrato.test.js" ] \
  || { echo "ABORTAR: $BR não parece o pacote certo — falta contrato.test.js"; exit 2; }
BASE="$(mktemp -d)" || { echo "ABORTAR: mktemp -d falhou — sem sítio para os artefactos"; exit 2; }
[ -d "$BASE" ] || { echo "ABORTAR: o temp devolvido por mktemp não existe"; exit 2; }
ANTIGO="$BASE/contrato-antigo.test.js"
cd "$BR" || { echo "ABORTAR: não consegui entrar em $BR"; exit 2; }

# A versão pré-correcção. `main` tem-na; se um dia deixar de ter, o script
# aborta em vez de medir a versão errada e chamar-lhe prova.
git show main:packages/mooter-bridge/contrato.test.js > "$ANTIGO" 2>/dev/null \
  || { echo "ABORTAR: não consegui extrair a versão antiga de main"; exit 2; }
if grep -q "process.env.MOOTER_HOME" "$ANTIGO"; then
  echo "ABORTAR: a versão extraída JÁ tem sandbox — não é a que tem o defeito."
  echo "         (é isto que tornava a v1 deste script tautológica)"
  exit 2
fi
# ⚠️ Um SIGKILL numa corrida anterior deixa `.contrato-antigo.test.js` para tras
# (o trap nao corre). Se o `cp` seguinte falhar em silencio — e `set -e` NAO esta
# ligado — A e B correriam esse ficheiro velho e o script atribuiria o resultado
# ao `git show main`. Apaga-se primeiro, copia-se depois, e verifica-se as duas
# coisas. Apanhado pelo G4 #4.
rm -f "$BR/.contrato-antigo.test.js"
cp "$ANTIGO" "$BR/.contrato-antigo.test.js"   || { echo "ABORTAR: nao consegui copiar a versao antiga para o pacote"; exit 2; }
trap 'rm -f "$BR/.contrato-antigo.test.js"' EXIT
[ -s "$BR/.contrato-antigo.test.js" ]   || { echo "ABORTAR: a copia da versao antiga ficou vazia"; exit 2; }
if ! cmp -s "$ANTIGO" "$BR/.contrato-antigo.test.js"; then
  echo "ABORTAR: a copia nao bate com o que saiu do git — nao corro um ficheiro que nao reconheco"
  exit 2
fi

corre() {  # $1=MOOTER_HOME  $2=ficheiro  -> ecoa "verdes|falhas|dispatches"
  local home="$1"
  local alvo="$2"
  local out
  out="$BASE/$(basename "$alvo").$$.txt"
  MOOTER_HOME="$home" OLLAMA_HOST=127.0.0.1:1 MOOTER_JOB_TIMEOUT_MS=8000 \
    timeout 120 node --test --test-name-pattern='K4|K7' "$alvo" > "$out" 2>&1
  local rc=$?
  [ $rc -eq 124 ] && { echo "TIMEOUT|-|-|124"; return; }
  # ⚠️ `grep -c` imprime 0 E sai com código 1 quando não há match; um
  # `|| echo 0` a seguir imprimiria um SEGUNDO zero. Usa-se `|| true`.
  local v f d
  v=$(grep -cE '^✔' "$out" || true)
  f=$(grep -cE '^✖' "$out" || true)
  d=$(grep -c '"event":"dispatched"' "$home/ledger.jsonl" 2>/dev/null || true)
  # ⚠️ O RC DO RUNNER VIAJA. A v3 só tratava 124 e descartava tudo o resto: um
  # node que rebentasse com rc=1 depois de imprimir um ✔ era contado como corrida
  # válida, e o veredicto podia sair CONFIRMADO. Demonstrado pelo G4 #3 com
  # `1 pass · 0 fail · rc=1`. Contar linhas de output sem olhar ao código de
  # saída é ler o resultado de uma corrida que pode nem ter acontecido.
  echo "${v:-0}|${f:-0}|${d:-0}|${rc}"
}

echo "=== VERSÃO PRÉ-CORRECÇÃO (o defeito) ==="
HA="$BASE/a"; mkdir -p "$HA"
A=$(corre "$HA" ".contrato-antigo.test.js")
echo "  A) ledger limpo          -> $(echo "$A"|cut -d'|' -f1) verdes · dispatches: $(echo "$A"|cut -d'|' -f3) · rc: $(echo "$A"|cut -d'|' -f4)"

HB="$BASE/b"; mkdir -p "$HB"
printf '{"ts":"2026-01-01T00:00:00.000Z","job_id":"probe-wip","event":"dispatched","agent":"moo","wave":"probe","worktree":%s}\n' \
  "$(node -e 'console.log(JSON.stringify(process.cwd()))')" > "$HB/ledger.jsonl"
B=$(corre "$HB" ".contrato-antigo.test.js")
echo "  B) ledger com job activo -> $(echo "$B"|cut -d'|' -f1) verdes · dispatches: $(echo "$B"|cut -d'|' -f3) · rc: $(echo "$B"|cut -d'|' -f4) (1 dispatch = só o probe)"

echo
echo "=== VERSÃO ACTUAL (HEAD): já não toca em ledger nenhum de fora ==="
# Não repetimos o cenário B contra o HEAD: ele monta o seu próprio sandbox e
# ignora o MOOTER_HOME que lhe passemos, portanto "passar em B" não provaria
# nada — foi essa confusão que tornou a v1 deste script tautológica.
# O que se pode verificar, e é o que interessa: correr o HEAD não escreve
# UMA linha no ledger que lhe pomos à frente.
# ⚠️ "zero escritas" so significa alguma coisa se o observador EXISTIR. Sem estas
# verificacoes, um mkdir falhado ou um ledger inexistente davam `wc || echo 0` =>
# 0 => "isolado", declarando isolamento sem nunca ter observado nada. G4 #4.
HC="$BASE/c"
mkdir -p "$HC" || { echo "ABORTAR: nao consegui criar o sandbox do observador"; exit 2; }
: > "$HC/ledger.jsonl" || { echo "ABORTAR: nao consegui criar o ledger-observador"; exit 2; }
[ -f "$HC/ledger.jsonl" ] || { echo "ABORTAR: o ledger-observador nao existe depois de o criar"; exit 2; }
C=$(corre "$HC" "contrato.test.js")
[ -f "$HC/ledger.jsonl" ]   || { echo "ABORTAR: o ledger-observador desapareceu durante a corrida — nada foi observado"; exit 2; }
LINHAS_C=$(wc -l < "$HC/ledger.jsonl")
echo "  HEAD -> ${C%%|*} verdes, $(echo "$C" | cut -d'|' -f2) falhas"
echo "  linhas escritas no ledger que lhe demos: $LINHAS_C  (0 = isolado)"

echo
echo "=== VEREDICTO ==="
# ⚠️ VERSÃO 3 — a v2 validava UMAS premissas e ignorava outras (G4 #2, ALTO).
# Ignorava as falhas de A/B, ignorava por completo o resultado do HEAD que ela
# própria media, e as comparações `-lt` com valores não-numéricos falhavam em
# silêncio sem activar `falhou`. Aqui TODAS as premissas são verificadas, e
# qualquer valor não-numérico é ele próprio uma premissa falhada.
falhou=0
num() {  # $1=valor $2=descrição — falha se não for um inteiro
  case "${1:-}" in
    ''|*[!0-9]*) echo "  !! $2 não é um número: '${1:-vazio}'"; falhou=1; return 1 ;;
    *) return 0 ;;
  esac
}
avalia() {  # $1=rótulo $2=resultado "verdes|falhas|dispatches|rc"
  local rot="$1" res="$2"
  [ "$res" = "TIMEOUT|-|-|124" ] && { echo "  !! $rot pendurou — nenhuma conclusão é válida"; falhou=1; return; }
  local v f d rc
  v=$(echo "$res" | cut -d'|' -f1); f=$(echo "$res" | cut -d'|' -f2)
  d=$(echo "$res" | cut -d'|' -f3); rc=$(echo "$res" | cut -d'|' -f4)
  num "$v" "$rot: verdes" && num "$f" "$rot: falhas" && num "$d" "$rot: dispatches"     && num "$rc" "$rot: exit code" || return
  # o exit code do RUNNER é premissa, não decoração: um node que rebenta depois
  # de imprimir alguns ✔ não é uma corrida válida, por muitos verdes que tenha.
  [ "$rc" -ne 0 ] && { echo "  !! $rot: o runner saiu com código $rc — a corrida não é fiável"; falhou=1; }
  [ "$v" -lt 1 ] && { echo "  !! $rot não teve verdes nenhuns — o teste não chegou a correr"; falhou=1; }
  [ "$f" -gt 0 ] && { echo "  !! $rot teve $f falhas — o cenário não é o esperado"; falhou=1; }
}
avalia "A" "$A"
avalia "B" "$B"
avalia "HEAD" "$C"

VA=$(echo "$A" | cut -d'|' -f1); DA=$(echo "$A" | cut -d'|' -f3)
VB=$(echo "$B" | cut -d'|' -f1); DB=$(echo "$B" | cut -d'|' -f3)

if [ "$falhou" = "0" ]; then
  [ "$DA" -lt 1 ] && { echo "  !! A não despachou nada: o cenário 'ledger limpo' não se realizou"; falhou=1; }
  [ "$DB" != "1" ] && { echo "  !! B tinha $DB dispatches, esperava 1 (só o probe)"; falhou=1; }
  # o HEAD tem de estar isolado — é metade do que este script existe para mostrar
  num "$LINHAS_C" "HEAD: linhas escritas no ledger externo" \
    && [ "$LINHAS_C" -ne 0 ] \
    && { echo "  !! o HEAD escreveu $LINHAS_C linhas no ledger que lhe demos — não está isolado"; falhou=1; }
fi

if [ "$falhou" != "0" ]; then
  echo "  >> INCONCLUSIVO — uma premissa falhou acima. Nenhuma conclusão é válida."
  exit 1
fi
if [ "$VA" = "$VB" ]; then
  echo "  >> VERDE VAZIO CONFIRMADO na versão antiga: $VA verdes com $DA dispatches,"
  echo "     e os mesmos $VB verdes com 0 dispatches do teste. O resultado não"
  echo "     depende de exercer o contrato."
  echo "  >> E o HEAD, no mesmo banco de ensaio, não escreveu uma linha no ledger externo."
else
  echo "  >> NÃO reproduziu: A=$VA verdes, B=$VB verdes. Investigar antes de confiar."
  exit 1
fi
echo
echo "artefactos em $BASE"
