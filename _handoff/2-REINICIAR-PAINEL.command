#!/bin/zsh
# Reinicia SO o painel (f10-server em :4290) para carregar codigo novo.
# O loop dos pilares (moo-runner) NAO e tocado. Uso: duplo-clique no Finder.
cd "$(dirname "$0")/.."
export MOO_PUBLICAR_BEACON=1
export VAULT_PATH="$HOME/paulo-vault"
{
  echo "=== reiniciar-painel $(date) ==="
  PIDS=$(lsof -ti tcp:4290 -sTCP:LISTEN)
  echo "f10 em :4290: ${PIDS:-nenhum}"
  if [ -n "$PIDS" ]; then kill $PIDS; sleep 2; fi
  node tools/cockpit/runner/launch.mjs --no-open
  sleep 3
  echo "--- /fleet.json apos reinicio ---"
  curl -s --max-time 10 http://127.0.0.1:4290/fleet.json | node -e '
    let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
      try { const j=JSON.parse(s); const f=j.frota||{};
        console.log("remoto:", JSON.stringify(f.remoto||null));
        for (const d of (f.frota||[])) console.log(" ", d.device, d.self?"(self)":"", "via="+d.via, d.frescura.estado, d.frescura.idade_s+"s");
      } catch(e) { console.log("fleet.json ilegivel:", e.message, s.slice(0,200)); }
    })'
  echo "=== fim $(date) ==="
} >> _handoff/reiniciar-painel.log 2>&1
