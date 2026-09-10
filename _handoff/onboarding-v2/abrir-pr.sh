#!/bin/zsh
# abrir-pr.sh — abre o PR de UMA onda do onboarding v2. Nao funde, nao faz force.
#
# PORQUE E UM SCRIPT, e nao tres comandos escritos a mao no fim de cada onda:
# a regra R3 do kickoff exige "PR aberto por script gh-gated" em TODAS as sete
# ondas. Um gesto repetido sete vezes a mao diverge sete vezes; e o `gh` nao
# esta no PATH de todos os processos desta maquina (ver tools/cockpit/runner/
# gh-bin.mjs — o launchd corre com PATH=/usr/bin:/bin:/usr/sbin:/sbin e o `gh`
# vive em ~/.local/bin). Este script resolve o binario da mesma forma.
#
# O PUSH E IRREVERSIVEL DO LADO DE FORA. Por isso exige o ✓ explicito do dono:
#   MOOTER_OK_DONO=1 ./abrir-pr.sh <branch> <titulo> <corpo> [base]
# Sem essa variavel imprime o que FARIA e sai 0. Nunca `--force`, nunca merge.
#
# A `base` e o 4.o argumento e nao uma constante `main`. As ondas W0..W6 sao
# SEQUENCIAIS e nenhuma esta fundida quando a seguinte comeca: um PR de W1 com
# base `main` mostra o diff de W0 e W1 juntos, e quem revê nao consegue separar
# o que esta a aprovar. Aprendido a serio — o PR #492 nasceu com base errada e
# teve de ser reapontado a mao com `gh pr edit --base`.

set -u
setopt PIPE_FAIL 2>/dev/null || true

BRANCH="${1:-}"
TITULO="${2:-}"
CORPO="${3:-}"
BASE="${4:-main}"
REPO_URL="https://github.com/pauloloureiroshp-ship-it/mooter"

if [ -z "$BRANCH" ] || [ -z "$TITULO" ] || [ -z "$CORPO" ]; then
  echo "uso: MOOTER_OK_DONO=1 $0 <branch> <titulo> <ficheiro-de-corpo> [base]" >&2
  exit 2
fi
[ -f "$CORPO" ] || { echo "❌ corpo do PR nao existe: $CORPO" >&2; exit 2; }

# ── onde esta o `gh` (sem `which`: ele proprio precisa do PATH) ────────────
GH=""
for c in "$(command -v gh 2>/dev/null)" "$HOME/.local/bin/gh" /opt/homebrew/bin/gh /usr/local/bin/gh; do
  [ -n "$c" ] && [ -x "$c" ] && { GH="$c"; break; }
done
if [ -z "$GH" ]; then
  echo "❌ n/d — o \`gh\` nao esta nesta maquina nem nos sitios conhecidos."
  echo "   Abre a mao: $REPO_URL/compare/$BRANCH?expand=1"
  exit 1
fi
"$GH" auth status >/dev/null 2>&1 || {
  echo "❌ \`gh\` sem login (\`gh auth login\`). Link manual: $REPO_URL/compare/$BRANCH?expand=1"
  exit 1
}

# ── o branch tem de existir localmente e ter commits sobre main ───────────
git show-ref --verify --quiet "refs/heads/$BRANCH" || { echo "❌ branch local ausente: $BRANCH" >&2; exit 1; }
N=$(git rev-list --count "$BASE..$BRANCH" 2>/dev/null || git rev-list --count "origin/$BASE..$BRANCH" 2>/dev/null || echo 0)
[ "$N" -gt 0 ] || { echo "❌ $BRANCH nao tem commits sobre $BASE — nada a abrir" >&2; exit 1; }
SUJO=$(git status --porcelain --untracked-files=no | wc -l | tr -d ' ')

echo "=== abrir-pr · $(date '+%Y-%m-%d %H:%M') ==="
echo "branch:   $BRANCH ($N commit(s) sobre $BASE)"
echo "base:     $BASE"
echo "titulo:   $TITULO"
echo "corpo:    $CORPO ($(wc -l < "$CORPO" | tr -d ' ') linhas)"
echo "por commitar (tracked): $SUJO"
echo "gh:       $GH"

if [ "${MOOTER_OK_DONO:-}" != "1" ]; then
  echo ""
  echo "🔒 ENSAIO — nada foi empurrado. O push precisa do ✓ do dono."
  echo "   Para executar a serio:"
  echo "   MOOTER_OK_DONO=1 $0 \"$BRANCH\" \"$TITULO\" \"$CORPO\" \"$BASE\""
  exit 0
fi

set -e
git push -u origin "$BRANCH"          # nunca --force
EXIST=$("$GH" pr list --head "$BRANCH" --json number --jq '.[0].number' 2>/dev/null || true)
if [ -n "$EXIST" ]; then
  echo "PR ja existe: #$EXIST"
  "$GH" pr view "$EXIST" --json url --jq .url
  exit 0
fi
"$GH" pr create --base "$BASE" --head "$BRANCH" --title "$TITULO" --body-file "$CORPO"
"$GH" pr view --json url,number,state --jq '"#\(.number) \(.state) \(.url)"'
