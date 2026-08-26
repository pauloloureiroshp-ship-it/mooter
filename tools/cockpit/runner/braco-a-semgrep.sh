#!/usr/bin/env bash
# Braco A do A/B do Moo Audit — Semgrep cru, saida crua, sem filtro nenhum.
# Pre-registo: _handoff/AB_MOO_AUDIT_PREREGISTO.md (branch ab-audit/preregisto), §2 e §2.1/§2.2.
#
# PORQUE E UM .sh E NAO UM .mjs COMO O RESTO DO runner/
#   O §9 do pre-registo mediu que o semgrep NAO corre em Windows nativo (todo o scan
#   morre em `semgrep-core exited with 1`) e que CORRE em WSL2 Ubuntu-22.04. Mediu
#   tambem que o Node esta AUSENTE dentro do WSL. Um .mjs aqui nao teria interprete
#   do lado onde o semgrep vive. O resumo/analise (`braco-a-resumo.mjs`) e que fica
#   em Node, do lado Windows, onde o Node existe.
#
# MODOS
#   --limpo     corrida cronometrada. E esta que produz o tempo de parede reportado.
#   --strace    a MESMA corrida sob `strace -e trace=connect`. Mede o criterio 5 do
#               §4 ("o codigo saiu da maquina?") por CONTAGEM DE SOCKETS, nao por
#               declaracao. `--metrics=off` e uma flag; uma flag nao e uma medicao.
#   --sem-rede  a MESMA corrida dentro de um namespace de rede sem interface externa
#               (`unshare -rn`). Controlo positivo: se a saida for byte a byte igual
#               a do modo --limpo, a corrida provou que nao precisou de rede nenhuma.
#
# Uso: braco-a-semgrep.sh <S1|S2|S3> <--limpo|--strace|--sem-rede>
set -uo pipefail

SUJ="${1:?uso: braco-a-semgrep.sh <S1|S2|S3> <--limpo|--strace|--sem-rede>}"
MODO="${2:---limpo}"

export PATH="$HOME/.local/bin:$PATH"
# O version-check do semgrep e uma chamada de rede que NAO e coberta por --metrics=off.
# Desligado pela variavel de ambiente e nao pela flag `--disable-version-check` porque
# essa flag faz o frontend OCaml delegar em pysemgrep — trocaria o motor a meio da
# experiencia. A variavel nao troca o motor. De qualquer forma, quem decide se saiu
# alguma coisa e o strace do modo --strace, nao esta linha.
export SEMGREP_ENABLE_VERSION_CHECK=0

REPO="/mnt/c/Users/Paulo Loureiro/frugal-ab-braco-a"
REGRAS="$REPO/_handoff/ab-audit/regras-semgrep"
LISTA="$REPO/_handoff/ab-audit/ambito-$SUJ.txt"
OUT="$HOME/ab-braco-a"; mkdir -p "$OUT"

# §2.2 — a raiz de cada sujeito e a que o ambito-MANIFESTO.json declara. S1 e lido
# em MODO SO-LEITURA a partir da worktree que gerou a lista; nao se escreve la nada.
case "$SUJ" in
  S1) RAIZ="/mnt/c/Users/Paulo Loureiro/frugal-ab-audit" ;;
  S2) RAIZ="/mnt/c/Users/Paulo Loureiro/ab-audit-subjects/fastify" ;;
  S3) RAIZ="/mnt/c/Users/Paulo Loureiro/ab-audit-subjects/hono" ;;
  *)  echo "sujeito desconhecido: $SUJ" >&2; exit 64 ;;
esac

[ -f "$LISTA" ] || { echo "lista de ambito em falta: $LISTA" >&2; exit 66; }
[ -d "$RAIZ" ]  || { echo "raiz do sujeito em falta: $RAIZ" >&2; exit 66; }

mapfile -t FICHEIROS < "$LISTA"
N_LISTA="${#FICHEIROS[@]}"

# --no-rewrite-rule-ids: sem isto o semgrep prefixa cada check_id com o caminho do
# ficheiro de regras, e a "classe" (§3 do pre-registo: uma classe = um check_id)
# passaria a conter o nome de utilizador do Windows e o caminho da worktree. Isso
# (a) mete o caminho da maquina no artefacto entregue, (b) torna as classes
# irreproduziveis noutra maquina, (c) parte a comparacao com os bracos B e C, que
# tem de ver os MESMOS rotulos de classe. Medido: com e sem a flag o numero de
# achados, de erros e de ficheiros varridos e identico — so o rotulo muda.
COMUM=(
  --config "$REGRAS/p-javascript.yaml"
  --config "$REGRAS/p-typescript.yaml"
  --config "$REGRAS/p-security-audit.yaml"
  --config "$REGRAS/p-nodejs.yaml"
  --metrics=off
  --no-git-ignore
  --no-rewrite-rule-ids
  --json
)

cd "$RAIZ" || exit 70

case "$MODO" in
  --limpo)
    JSON="$OUT/braco-a-$SUJ.json"; ERR="$OUT/braco-a-$SUJ.stderr"
    T0=$(date +%s.%N)
    semgrep scan "${COMUM[@]}" --output "$JSON" -- "${FICHEIROS[@]}" >/dev/null 2>"$ERR"
    RC=$?; T1=$(date +%s.%N)
    PAREDE=$(awk "BEGIN{printf \"%.3f\", $T1-$T0}")
    ;;
  --strace)
    JSON="$OUT/braco-a-$SUJ.strace.json"; ERR="$OUT/braco-a-$SUJ.strace.stderr"
    TRACE="$OUT/braco-a-$SUJ.connect.trace"
    T0=$(date +%s.%N)
    strace -f -qq -e trace=connect -o "$TRACE" \
      semgrep scan "${COMUM[@]}" --output "$JSON" -- "${FICHEIROS[@]}" >/dev/null 2>"$ERR"
    RC=$?; T1=$(date +%s.%N)
    PAREDE=$(awk "BEGIN{printf \"%.3f\", $T1-$T0}")
    # NOTA: este tempo NAO e o tempo reportado. O strace intercepta cada syscall e
    # inflaciona a parede. O tempo da tabela vem sempre do modo --limpo.
    ;;
  --sem-rede)
    JSON="$OUT/braco-a-$SUJ.semrede.json"; ERR="$OUT/braco-a-$SUJ.semrede.stderr"
    T0=$(date +%s.%N)
    unshare -rn -- bash -c '
      ip link set lo up 2>/dev/null
      export PATH="$HOME/.local/bin:$PATH" SEMGREP_ENABLE_VERSION_CHECK=0
      cd "$1" || exit 70; shift
      JSON="$1"; shift
      # --output TEM de vir antes do `--`; depois do `--` o semgrep le-o como alvo.
      semgrep scan --output "$JSON" "$@" >/dev/null
    ' _ "$RAIZ" "$JSON" "${COMUM[@]}" -- "${FICHEIROS[@]}" 2>"$ERR"
    RC=$?; T1=$(date +%s.%N)
    PAREDE=$(awk "BEGIN{printf \"%.3f\", $T1-$T0}")
    ;;
  *) echo "modo desconhecido: $MODO" >&2; exit 64 ;;
esac

# RECIBO. O tempo de parede e os sha nao passam por maos humanas: quem os escreve
# e a corrida que os produziu. O §10.10 do pre-registo diz "numero nao medido =
# n/d"; um numero medido e depois copiado a mao para um relatorio e um numero de
# que ja ninguem sabe se foi mesmo medido.
META="${JSON%.json}.meta.json"
sha() { sha256sum "$1" 2>/dev/null | cut -d' ' -f1; }
REGRAS_CORRERAM=$(grep -aoE 'Rules run: *[0-9]+' "$ERR" | grep -oE '[0-9]+' | tail -1)
: "${REGRAS_CORRERAM:=null}"
cat > "$META" <<META_JSON
{
  "sujeito": "$SUJ",
  "raiz": "$RAIZ",
  "modo": "${MODO#--}",
  "rc": $RC,
  "parede_s": $PAREDE,
  "ficheiros_na_lista": $N_LISTA,
  "regras_correram": $REGRAS_CORRERAM,
  "semgrep": "$(semgrep --version 2>/dev/null | tail -1)",
  "uname": "$(uname -sr)",
  "corrido_em": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "sha256_lista_ambito": "$(sha "$LISTA")",
  "sha256_regras": {
    "p-javascript.yaml": "$(sha "$REGRAS/p-javascript.yaml")",
    "p-typescript.yaml": "$(sha "$REGRAS/p-typescript.yaml")",
    "p-security-audit.yaml": "$(sha "$REGRAS/p-security-audit.yaml")",
    "p-nodejs.yaml": "$(sha "$REGRAS/p-nodejs.yaml")"
  },
  "sha256_json": "$(sha "$JSON")"
}
META_JSON

echo "sujeito=$SUJ modo=$MODO rc=$RC parede_s=$PAREDE ficheiros_na_lista=$N_LISTA json=$JSON meta=$META"
exit $RC
