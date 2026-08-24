#!/bin/zsh
# Reinicia painel (:4290) E loop dos pilares para carregarem codigo novo.
# O runner sai limpo com SIGTERM (liberta o lock); o launch.mjs relanca os dois.
cd "$(dirname "$0")/../.."
export MOO_PUBLICAR_BEACON=1
export VAULT_PATH="$HOME/paulo-vault"
{
  echo "=== reiniciar-cockpit $(date) ==="
  RPID=$(cat "$HOME/.mooter/runner.lock" 2>/dev/null)
  echo "runner.lock: ${RPID:-nenhum}"
  if [ -n "$RPID" ] && kill -0 "$RPID" 2>/dev/null; then kill -TERM "$RPID"; for i in 1 2 3 4 5 6 7 8 9 10; do kill -0 "$RPID" 2>/dev/null || break; sleep 1; done; fi
  kill -0 "$RPID" 2>/dev/null && echo "AVISO: runner $RPID ainda vivo apos 10s" || echo "runner parado"
  PIDS=$(lsof -ti tcp:4290 -sTCP:LISTEN); echo "f10 em :4290: ${PIDS:-nenhum}"
  if [ -n "$PIDS" ]; then kill $PIDS; sleep 2; fi
  node tools/cockpit/runner/launch.mjs --no-open
  sleep 45
  echo "--- beacon local apos reinicio ---"
  node -e 'const b=require("'"$HOME"'/paulo-vault/50-fleet/'"$(node -e 'console.log(require("os").hostname().replace(/\.local$/i,"").toLowerCase().replace(/[^a-z0-9._-]/g,"-"))')"'.json"); console.log(b.ts, "| branch", b.branch, "| codigo", JSON.stringify(b.codigo), "| sig", b.sig ? b.sig.alg : "SEM ASSINATURA")'
  echo "=== fim $(date) ==="
} >> _handoff/reiniciar-cockpit.log 2>&1
