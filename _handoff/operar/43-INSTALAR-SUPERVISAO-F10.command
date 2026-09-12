#!/bin/zsh
# 43 — supervisao do F10 (roadmap G1). Duplo-clique no Finder.
#
# Instala UM LaunchAgent que mantem o endpoint F10 vivo: se ele morrer, o
# launchd levanta-o outra vez; ao arrancar a sessao, sobe sozinho.
#
# O QUE ISTO **NAO** FAZ, E DE PROPOSITO:
#   · nao toca no runner — o loop que gasta GPU continua a exigir o teu ▶;
#   · nao apaga o STOP;
#   · nao instala nada em mais nenhuma maquina.
#
# Falha FECHADO: se nao conseguir provar que o node, o servidor e o repo
# existem, aborta antes de escrever seja o que for. Um agente instalado a apontar
# para um caminho errado nao se queixa — simplesmente nunca arranca, e isso e
# pior do que nao o ter, porque parece instalado.
#
# Log: ~/.mooter/f10-launchd.log   ·  Remover: correr com  --remover

set -u
cd "$(dirname "$0")/../.."
REPO="$(pwd)"
export PATH="$HOME/.local/node/bin:/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"

LABEL="ai.mooter.f10"
MOLDE="$REPO/tools/ops/moo/launchd/${LABEL}.plist"
ALVO="$HOME/Library/LaunchAgents/${LABEL}.plist"
F10="$REPO/tools/cockpit/runner/f10-server.mjs"
LOG="$HOME/.mooter/f10-launchd.log"

abort() { print -r -- "  ABORTADO: $*"; print -r -- ""; read -k1 "?  (carrega numa tecla)"; exit 1; }

print -r -- ""
print -r -- "  ── supervisao do F10 · ${LABEL} ─────────────────────────────"
print -r -- "  repo:    $REPO"

if [ "${1:-}" = "--remover" ]; then
  launchctl unload "$ALVO" 2>/dev/null
  rm -f "$ALVO"
  print -r -- "  removido: $ALVO"
  print -r -- "  (o F10 que ja esteja a correr continua vivo ate ser fechado)"
  read -k1 "?  (carrega numa tecla)"; exit 0
fi

[ "$(uname -s)" = "Darwin" ] || abort "isto e um LaunchAgent — so faz sentido no macOS (aqui: $(uname -s))"
[ -f "$MOLDE" ] || abort "molde ausente: $MOLDE"
[ -f "$F10" ]   || abort "servidor ausente: $F10"

NODE="$(command -v node)" || abort "node nao esta no PATH"
# Um LaunchAgent nao tem perfil de shell: um node do nvm resolve-se agora e
# desaparece no arranque. E o mesmo cuidado que `autostart.mjs:92` ja tinha de ter.
case "$NODE" in
  */.nvm/*) abort "o node vem do nvm ($NODE) — o launchd nao o encontra no arranque. Instala um node do sistema (brew) e volta a correr." ;;
esac
print -r -- "  node:    $NODE"
print -r -- "  f10:     $F10"

mkdir -p "$HOME/.mooter" "$HOME/Library/LaunchAgents" || abort "nao consegui criar as pastas"

# Substituicao dos quatro campos por-maquina. `|` como separador porque os
# valores sao caminhos e trazem `/`.
sed -e "s|__NODE__|$NODE|g" \
    -e "s|__F10__|$F10|g" \
    -e "s|__REPO__|$REPO|g" \
    -e "s|__LOG__|$LOG|g" \
    "$MOLDE" > "$ALVO" || abort "nao consegui escrever $ALVO"

grep -q '__NODE__\|__F10__\|__REPO__\|__LOG__' "$ALVO" \
  && { rm -f "$ALVO"; abort "ficou um marcador por substituir — nao instalo um plist meio feito"; }

plutil -lint "$ALVO" >/dev/null 2>&1 || { rm -f "$ALVO"; abort "o plist gerado nao e valido (plutil)"; }

launchctl unload "$ALVO" 2>/dev/null      # idempotente: correr duas vezes e seguro
launchctl load  "$ALVO" || abort "launchctl load falhou — ve $ALVO"

sleep 3
PORTA="${MOO_PORT:-4290}"
if curl -fsS --max-time 4 "http://127.0.0.1:${PORTA}/fleet.json" >/dev/null 2>&1; then
  ESTADO="  ✅ o F10 responde em 127.0.0.1:${PORTA}"
else
  ESTADO="  ⚠️  instalado, mas o F10 ainda nao responde em 127.0.0.1:${PORTA} — ve $LOG"
fi

print -r -- "  instalado: $ALVO"
print -r -- "$ESTADO"
print -r -- "  ledger:    http://127.0.0.1:${PORTA}/ledger"
print -r -- "  painel:    http://127.0.0.1:${PORTA}/panel"
print -r -- "  log:       $LOG"
print -r -- "  remover:   este mesmo ficheiro com  --remover"
print -r -- ""
read -k1 "?  (carrega numa tecla)"
