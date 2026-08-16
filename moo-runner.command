#!/bin/bash
# ============================================================================
# moo-runner.command — duplo-clique no Finder para pôr este Mac a trabalhar.
#
# Isto é um SHIM FINO. Toda a lógica vive no repo, em tools/cockpit/runner/,
# com testes (`npm run test:cockpit-runner`). Nada de comportamento aqui, para
# que o que corre na máquina seja exactamente o que está revisto no git.
#
# Garantias que o código canónico impõe (não este ficheiro):
#   - $0 duro: o motor só pode ser o Ollama de loopback (assertLocalEngine).
#   - fail-closed: o STOP sobrevive a reinícios; só `--play` o levanta.
#   - evidência: cada recibo leva um veredicto conferido contra o disco.
# ============================================================================
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNNER="$REPO/tools/cockpit/runner/moo-runner.mjs"
ENDPOINT="$REPO/tools/cockpit/runner/f10-server.mjs"

if ! command -v node >/dev/null 2>&1; then
  echo "[moo-runner] node nao encontrado no PATH — fail-closed, nao arranca."
  exit 1
fi
if [ ! -f "$RUNNER" ]; then
  echo "[moo-runner] $RUNNER nao existe — o repo esta incompleto."
  exit 1
fi

if lsof -nP -iTCP:4290 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "[moo-runner] endpoint F10 ja vivo na 4290."
else
  node "$ENDPOINT" >"$HOME/.mooter/f10.log" 2>&1 &
  echo "[moo-runner] endpoint F10 no ar (PID $!) em 127.0.0.1:4290."
fi

# `--play` levanta um STOP anterior, porque um duplo-clique É o gesto do dono.
# Um agendador não é gesto nenhum: se o LaunchAgent ou o Task Scheduler
# chamassem este ficheiro, o STOP deixaria de sobreviver a um reboot. Daí a
# guarda — e daí o autostart.mjs invocar o runner directamente.
if [ "${MOOTER_AUTOSTART:-}" = "1" ]; then
  echo "[moo-runner] arranque automatico — nao levanto o STOP (o ▶ e do dono)."
  exec node "$RUNNER" "$@"
fi
exec node "$RUNNER" --play "$@"
