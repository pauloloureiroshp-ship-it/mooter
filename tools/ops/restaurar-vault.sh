#!/usr/bin/env bash
#
# restaurar-vault.sh — o ensaio de restauro do vault. E, pela mesma corrida, o
# ensaio do ONBOARDING: o que um device novo tem de fazer para existir e
# exactamente isto — clonar e provar que o que chegou serve.
#
# ── O QUE ESTE SCRIPT NAO FAZ ───────────────────────────────────────────────
#
# Nao toca no vault real. Nunca. Clona para uma pasta temporaria e trabalha la;
# se o destino coincidir com `$VAULT_PATH` (ou com o `~/paulo-vault`), recusa-se
# a comecar. Um teste de restauro que possa estragar o original nao e um teste
# de restauro, e um segundo modo de perder tudo.
#
# Nao empurra, nao commita, nao configura remotos. So le.
#
# ── PORQUE EXISTE ───────────────────────────────────────────────────────────
#
# Medido a 2026-08-25: o vault tem UM remoto (`origin` → GitHub) e mais nada.
# Um backup que nunca foi restaurado nao e um backup — e uma suposicao com
# 14 MB. Este script transforma a suposicao numa medicao, e diz o que o
# restauro NAO traz de volta, que e a metade que costuma ficar por dizer.
#
# Uso:
#   tools/ops/restaurar-vault.sh                 # clona do origin, valida, limpa
#   tools/ops/restaurar-vault.sh --manter        # nao apaga o clone (para inspeccao)
#   tools/ops/restaurar-vault.sh --de <caminho>  # ensaia a partir de OUTRA fonte
#                                                # (um espelho, um disco externo)
#
# Saida: 0 = restauro valida. 1 = falhou (e diz em que passo).

set -uo pipefail

MANTER=0
FONTE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --manter) MANTER=1; shift ;;
    --de) FONTE="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "argumento desconhecido: $1" >&2; exit 1 ;;
  esac
done

VAULT_REAL="${VAULT_PATH:-$HOME/paulo-vault}"

# A fonte por omissao e o remoto do vault real — lido DELE, nunca escrito nele.
if [ -z "$FONTE" ]; then
  if [ ! -d "$VAULT_REAL/.git" ]; then
    echo "ERRO: nao encontrei um vault em $VAULT_REAL para ler o remoto." >&2
    echo "      usa --de <url-ou-caminho> para ensaiar a partir de outra fonte." >&2
    exit 1
  fi
  FONTE="$(git -C "$VAULT_REAL" remote get-url origin 2>/dev/null || true)"
  if [ -z "$FONTE" ]; then
    echo "ERRO: o vault em $VAULT_REAL nao tem remoto 'origin'." >&2
    echo "      isso e, por si so, o achado: nao ha de onde restaurar." >&2
    exit 1
  fi
fi

# `${TMPDIR}` no macOS ja acaba em `/`, e o `mktemp` nao normaliza: sem o `%/`
# o destino saia `.../T//ensaio-...`. A barra dupla nao e cosmetica — o
# `retrieve.js` decide se e o modulo principal comparando
# `pathToFileURL(process.argv[1])` com `import.meta.url`, e essas duas nao batem
# com uma barra a mais. O retriever corria, saia 0, e nao imprimia nada.
TMP_BASE="${TMPDIR:-/tmp}"; TMP_BASE="${TMP_BASE%/}"
DESTINO="$(mktemp -d "$TMP_BASE/ensaio-restauro-vault-XXXXXX")"

# O guarda que torna este script seguro de correr as cegas.
canonico() { (cd "$1" 2>/dev/null && pwd -P) || echo "$1"; }
if [ "$(canonico "$DESTINO")" = "$(canonico "$VAULT_REAL")" ]; then
  echo "ERRO: o destino do ensaio e o vault real. Abortado antes de tocar em nada." >&2
  exit 1
fi

limpar() {
  if [ "$MANTER" = "1" ]; then
    echo ""
    echo "clone mantido em: $DESTINO"
    echo "(apaga-o a mao quando acabares: rm -rf \"$DESTINO\")"
  else
    rm -rf "$DESTINO"
  fi
}
trap limpar EXIT

FALHAS=0
passo() { printf '  %-46s' "$1"; }
ok()    { echo "OK${1:+ — $1}"; }
mau()   { echo "FALHOU${1:+ — $1}"; FALHAS=$((FALHAS + 1)); }

echo "=== ensaio de restauro do vault ==="
echo "  fonte:   $FONTE"
echo "  destino: $DESTINO  (temporario, apagado no fim)"
echo "  o vault real ($VAULT_REAL) NAO e tocado."
echo ""

# ── 1. o clone ──────────────────────────────────────────────────────────────
passo "clone da fonte"
if git clone --quiet "$FONTE" "$DESTINO/vault" 2>"$DESTINO/clone-erro.txt"; then
  ok "$(git -C "$DESTINO/vault" rev-list --count HEAD) commits"
else
  mau "$(head -2 "$DESTINO/clone-erro.txt" | tr '\n' ' ')"
  echo ""
  echo "sem clone nao ha restauro para validar. A parar."
  exit 1
fi
# CANONICO, nao o caminho como o `mktemp` o escreveu.
#
# No macOS o `$TMPDIR` vive em `/var/folders/...` e `/var` e um symlink para
# `private/var`. O `retrieve.js` do vault decide se e o modulo principal com
#   `import.meta.url === pathToFileURL(process.argv[1]).href`
# e o `import.meta.url` ja vem com o caminho RESOLVIDO. Atraves do symlink as
# duas nunca batem: o bloco de CLI nao corre, o processo sai 0, e nao imprime
# NADA. Aqui isso e ruido do ensaio; la fora e um defeito com consequencia — ver
# o passo "retriever atraves de symlink" mais abaixo.
CLONE="$(cd "$DESTINO/vault" && pwd -P)"

# ── 2. o canon chegou ───────────────────────────────────────────────────────
# Nao basta contar ficheiros: conta-se o que um agente LE no arranque. Se o
# `00-core/` nao vier, o vault restaurado e uma pasta de markdown sem bussola.
passo "canon 00-core presente"
N_CORE=$(find "$CLONE/00-core" -name '*.md' 2>/dev/null | wc -l | tr -d ' ')
if [ "${N_CORE:-0}" -ge 5 ]; then ok "$N_CORE ficheiros"; else mau "so $N_CORE ficheiros em 00-core/"; fi

passo "contagem de ficheiros bate com a origem"
N_CLONE=$(git -C "$CLONE" ls-files | wc -l | tr -d ' ')
if [ -d "$VAULT_REAL/.git" ]; then
  N_REAL=$(git -C "$VAULT_REAL" ls-files | wc -l | tr -d ' ')
  # O clone e do REMOTO; o vault real pode ter commits locais por empurrar. Uma
  # diferenca aqui nao e corrupcao — e trabalho que ainda so existe numa maquina,
  # que e precisamente o que um DR tem de saber dizer.
  if [ "$N_CLONE" = "$N_REAL" ]; then
    ok "$N_CLONE ficheiros"
  else
    ok "$N_CLONE no remoto vs $N_REAL em disco (delta = trabalho por empurrar)"
  fi
else
  ok "$N_CLONE ficheiros (sem original para comparar)"
fi

# ── 3. o indice do 3rd-brain reconstroi-se ──────────────────────────────────
# E o teste que interessa: o indice e DERIVADO e esta no .gitignore de proposito
# (versiona-lo prendeu o vault 24 h em 2026-08-19). Portanto o restauro so vale
# se o gerador vier com ele e correr no clone.
passo "3rd-brain: gerador presente"
if [ -f "$CLONE/.claude/3rd-brain/build-index.js" ]; then ok; else mau "build-index.js nao veio no clone"; fi

passo "3rd-brain: indice reconstroi no clone"
if [ -f "$CLONE/.claude/3rd-brain/build-index.js" ]; then
  if VAULT_PATH="$CLONE" node "$CLONE/.claude/3rd-brain/build-index.js" >"$DESTINO/index.txt" 2>&1; then
    if [ -f "$CLONE/.claude/3rd-brain/index.json" ]; then
      N_DOCS=$(node -e "try{const j=require('$CLONE/.claude/3rd-brain/index.json');console.log(Array.isArray(j)?j.length:Object.keys(j.docs||j.entries||j).length)}catch(e){console.log(0)}")
      if [ "${N_DOCS:-0}" -gt 0 ]; then ok "$N_DOCS entradas"; else mau "indice escrito mas vazio"; fi
    else
      mau "correu sem escrever index.json"
    fi
  else
    mau "$(tail -1 "$DESTINO/index.txt")"
  fi
else
  mau "sem gerador"
fi

passo "3rd-brain: retriever responde"
if [ -f "$CLONE/.claude/3rd-brain/retrieve.js" ]; then
  RETR="$DESTINO/retriever.txt"
  if VAULT_PATH="$CLONE" node "$CLONE/.claude/3rd-brain/retrieve.js" "mooter" >"$RETR" 2>&1; then
    # Exit 0 NAO chega. Este passo ja passou a mentir uma vez: o retriever saiu
    # 0 e escreveu ZERO bytes, e o guarda chamou-lhe OK. Um retriever que nao
    # devolve nada e um vault restaurado que nenhum agente consegue consultar —
    # que e precisamente a falha que este ensaio existe para apanhar.
    # `grep -c` sozinho: o `|| echo 0` de um `grep -c` que ja imprimiu `0` da
    # DUAS linhas ("0\n0") e rebenta o `[ -gt ]` a seguir. Conta-se com o grep
    # a nao falhar o script (`|| true`) e le-se a primeira linha.
    N_HITS=$(grep -cE '^[[:space:]]+[0-9]' "$RETR" 2>/dev/null | head -1 || true)
    N_HITS=${N_HITS:-0}
    N_BYTES=$(wc -c <"$RETR" | tr -d ' ')
    if [ "$N_HITS" -gt 0 ] 2>/dev/null; then
      ok "$N_HITS resultados para \"mooter\""
    else
      mau "saiu 0 mas nao devolveu resultado nenhum ($N_BYTES bytes)"
    fi
  else
    mau "$(tail -1 "$RETR")"
  fi
else
  mau "retrieve.js nao veio no clone"
fi

# ── 3b. o retriever atraves de um SYMLINK ───────────────────────────────────
#
# Nao e uma curiosidade do ensaio. O `AGENTS.md` manda TODO o agente arrancar
# com `node "$VAULT_PATH/.claude/3rd-brain/retrieve.js" "<topico>"` e ler o que
# vier. Se o `VAULT_PATH` de alguma maquina atravessar um symlink — um vault
# montado por link, um `/tmp`, um `$TMPDIR` do macOS — o guarda de CLI do
# `retrieve.js` nao reconhece o proprio ficheiro como principal, sai 0 e NAO
# ESCREVE NADA. O agente le zero linhas, nao recebe erro nenhum, e segue em
# frente convencido de que o vault nao tinha nada sobre o assunto.
#
# Isto AVISA, nao falha: o defeito e do `retrieve.js` (repo do dono, gate dele),
# nao do restauro. O que nao se faz e deixar de o dizer.
passo "retriever atraves de symlink"
LINK_BASE="$DESTINO/via-link"
if ln -s "$CLONE" "$LINK_BASE" 2>/dev/null && [ -f "$LINK_BASE/.claude/3rd-brain/retrieve.js" ]; then
  VIA="$DESTINO/retriever-link.txt"
  VAULT_PATH="$LINK_BASE" node "$LINK_BASE/.claude/3rd-brain/retrieve.js" "mooter" >"$VIA" 2>&1 || true
  N_LINK=$(grep -cE '^[[:space:]]+[0-9]' "$VIA" 2>/dev/null | head -1 || true)
  if [ "${N_LINK:-0}" -gt 0 ] 2>/dev/null; then
    ok "$N_LINK resultados — o guarda de CLI resolve symlinks"
  else
    echo "AVISO — 0 resultados pelo symlink, $N_HITS pelo caminho real"
    echo "         └ defeito em .claude/3rd-brain/retrieve.js: o guarda de CLI compara"
    echo "           import.meta.url (resolvido) com pathToFileURL(process.argv[1])"
    echo "           (nao resolvido). Sai 0 sem imprimir. Correccao: comparar com"
    echo "           fs.realpathSync(process.argv[1]). Repo do dono — gate dele."
  fi
else
  echo "AVISO — nao consegui criar o symlink de teste (sistema de ficheiros?)"
fi

# ── 4. os beacons sao legiveis ──────────────────────────────────────────────
passo "beacons da frota legiveis"
N_BEACON=0; N_MAU=0
for b in "$CLONE"/50-fleet/*.json; do
  [ -e "$b" ] || continue
  N_BEACON=$((N_BEACON + 1))
  node -e "
    const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));
    // O trusted-devices.json e um REGISTO, nao um beacon: nao tem device/ts.
    if (process.argv[1].endsWith('trusted-devices.json')) process.exit(0);
    if (!j.device || !j.ts) process.exit(1);
  " "$b" 2>/dev/null || N_MAU=$((N_MAU + 1))
done
if [ "$N_BEACON" -eq 0 ]; then
  mau "nenhum beacon no clone — a frota nao sobrevive ao restauro"
elif [ "$N_MAU" -eq 0 ]; then
  ok "$N_BEACON ficheiros, todos parseaveis"
else
  mau "$N_MAU de $N_BEACON ilegiveis"
fi

# ── 5. o que o restauro NAO traz ────────────────────────────────────────────
#
# A metade que costuma ficar por dizer, e a unica com consequencia real. Um
# ficheiro ignorado nao esta no remoto; se a maquina morrer, morre com ela.
echo ""
echo "  o que este restauro NAO recupera:"
SEM_VOLTA=0
if [ -d "$VAULT_REAL/.git" ]; then
  while IFS= read -r linha; do
    rel="${linha#\!\! }"
    [ -n "$rel" ] || continue
    case "$rel" in
      .claude/3rd-brain/index.json)
        echo "    · $rel — DERIVADO, e o passo 3 acabou de o reconstruir. Sem consequencia." ;;
      *)
        echo "    · $rel — ignorado pelo git: NAO esta no remoto."
        SEM_VOLTA=$((SEM_VOLTA + 1)) ;;
    esac
  done < <(git -C "$VAULT_REAL" status --ignored --short 2>/dev/null | grep '^!!' || true)
  [ "$SEM_VOLTA" -eq 0 ] && echo "    (nada insubstituivel)"
else
  echo "    n/d — sem o vault real montado nao se pode listar o que ele ignora."
fi

echo ""
if [ "$FALHAS" -eq 0 ]; then
  echo "restauro VALIDA — $FALHAS falhas."
  [ "$SEM_VOLTA" -gt 0 ] && echo "AVISO: $SEM_VOLTA ficheiro(s) nao sobrevivem a perda desta maquina (ver acima)."
  exit 0
else
  echo "restauro FALHOU em $FALHAS passo(s). Nao contes com este backup ate isto ficar verde."
  exit 1
fi
