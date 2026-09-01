#!/bin/zsh
# 47 — renovacao horaria do beacon (roadmap G3). Duplo-clique no Finder.
#
# O PROBLEMA que isto resolve, medido a 2026-09-01 nesta frota:
#
#     desktop-j26409q — assinatura expirada (553768s > 86400s)
#     paulo-desktop   — assinatura expirada (496375s > 86400s)
#
# Dois computadores teus, apagados do painel. A assinatura de um beacon vale
# 24 h de proposito, e o beacon so se reescreve quando o loop corre uma ronda —
# por isso uma maquina parada desaparece da frota ao fim de um dia.
#
# O QUE ISTO FAZ: de hora a hora, LE o beacon desta maquina e, se a assinatura
# ja passou de metade da validade, volta a assinar O MESMO CONTEUDO.
#
# O QUE ISTO **NAO** FAZ, E DE PROPOSITO:
#   · nao muda um unico campo do beacon — a hora do device fica onde estava,
#     por isso uma maquina parada continua a aparecer como parada;
#   · nao toca no runner nem no STOP;
#   · nao publica nada se tu nao tiveres ligado MOO_PUBLICAR_BEACON=1;
#   · nao instala nada em mais nenhuma maquina.
#
# Falha FECHADO: sem provar que o node, o script e o repo existem, aborta antes
# de escrever seja o que for. Um agente a apontar para um caminho errado nao se
# queixa — nunca arranca, e isso e pior do que nao o ter, porque parece instalado.
#
# Log: ~/.mooter/beacon-renew.log   ·  Remover: correr com  --remover

set -u
cd "$(dirname "$0")/../.."
REPO="$(pwd)"
export PATH="$HOME/.local/node/bin:/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"

LABEL="ai.mooter.beacon-renew"
MOLDE="$REPO/tools/ops/moo/launchd/${LABEL}.plist"
ALVO="$HOME/Library/LaunchAgents/${LABEL}.plist"
RENEW="$REPO/tools/cockpit/runner/beacon-renew.mjs"
LOG="$HOME/.mooter/beacon-renew.log"

abort() { print -r -- "  ABORTADO: $*"; print -r -- ""; read -k1 "?  (carrega numa tecla)"; exit 1; }

print -r -- ""
print -r -- "  ── renovacao do beacon · ${LABEL} ───────────────────────────"
print -r -- "  repo:    $REPO"

if [ "${1:-}" = "--remover" ]; then
  launchctl unload "$ALVO" 2>/dev/null
  rm -f "$ALVO"
  print -r -- "  removido: $ALVO"
  print -r -- "  (o beacon que ja esta em disco fica; deixa e de ser renovado)"
  read -k1 "?  (carrega numa tecla)"; exit 0
fi

[ "$(uname -s)" = "Darwin" ] || abort "isto e um LaunchAgent — so faz sentido no macOS (aqui: $(uname -s))"
[ -f "$MOLDE" ] || abort "molde ausente: $MOLDE"
[ -f "$RENEW" ] || abort "script ausente: $RENEW"

NODE="$(command -v node)" || abort "node nao esta no PATH"
case "$NODE" in
  */.nvm/*) abort "o node vem do nvm ($NODE) — o launchd nao o encontra no arranque. Instala um node do sistema (brew) e volta a correr." ;;
esac
print -r -- "  node:    $NODE"
print -r -- "  script:  $RENEW"

# Uma corrida A SECO antes de instalar. Um agente que so falha daqui a uma hora,
# num log que ninguem le, e um agente que parece instalado e nao esta.
print -r -- ""
print -r -- "  ── prova a seco ──"
"$NODE" "$RENEW" || abort "a renovacao falhou a seco — nao instalo um agente que ja se sabe partido"

mkdir -p "$HOME/.mooter" "$HOME/Library/LaunchAgents" || abort "nao consegui criar as pastas"

sed -e "s|__NODE__|$NODE|g" \
    -e "s|__RENEW__|$RENEW|g" \
    -e "s|__REPO__|$REPO|g" \
    -e "s|__LOG__|$LOG|g" \
    "$MOLDE" > "$ALVO" || abort "nao consegui escrever $ALVO"

grep -q '__NODE__\|__RENEW__\|__REPO__\|__LOG__' "$ALVO" \
  && { rm -f "$ALVO"; abort "ficou um marcador por substituir — nao instalo um plist meio feito"; }

plutil -lint "$ALVO" >/dev/null 2>&1 || { rm -f "$ALVO"; abort "o plist gerado nao e valido (plutil)"; }

launchctl unload "$ALVO" 2>/dev/null      # idempotente: correr duas vezes e seguro
launchctl load  "$ALVO" || abort "launchctl load falhou — ve $ALVO"

print -r -- ""
print -r -- "  instalado: $ALVO"
print -r -- "  cadencia:  le de hora a hora, escreve ~2x por dia (metade da janela de 24h)"
print -r -- "  log:       $LOG"
print -r -- "  remover:   este mesmo ficheiro com  --remover"
print -r -- ""
print -r -- "  ⚠️  ISTO SO TRATA DESTA MAQUINA. Os outros devices da frota so param"
print -r -- "      de expirar quando correres este mesmo ficheiro em cada um deles."
print -r -- ""
read -k1 "?  (carrega numa tecla)"
