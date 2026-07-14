#!/bin/bash
# ============================================================
# Mooter · Probe cross-device do Live Preview (MacBook)
# Como correr no Mac: abre o Terminal e corre:
#   bash ~/frugal/_handoff/probe-mac.command
# (ou duplo-clique se o Finder permitir). O resultado fica em
# ~/Desktop/mooter-probe-result.txt — cola-o no Cowork.
# Read-only: nao altera nada no repo.
# ============================================================
OUT=~/Desktop/mooter-probe-result.txt
{
  echo "=== Mooter Mac probe $(date) ==="
  REPO="$HOME/frugal"
  if [ ! -d "$REPO" ]; then
    echo "VEREDICTO: repo ~/frugal nao existe neste Mac -> causa C2 (onboarding/launcher), nao casing."
    exit 0
  fi
  if ! command -v node >/dev/null 2>&1; then
    echo "VEREDICTO: node nao instalado no Mac -> causa C2 (ambiente). Instala node e re-corre."
    exit 0
  fi
  if [ ! -d "$REPO/landing" ]; then
    echo "VEREDICTO: ~/frugal/landing nao existe -> arvore incompleta (C2)."
    exit 0
  fi
  SR=$(cd "$REPO/landing" && node -e "console.log(require('fs').realpathSync(process.cwd()))")
  WS=$(cd "$REPO" && node -e "console.log(require('fs').realpathSync(process.cwd()))")
  echo "servedRoot (landing) = $SR"
  echo "wsReal (repo)        = $WS"
  node -e '
    const path = require("path");
    const [sr, ws] = process.argv.slice(1);
    const within = (a, b) => { const r = path.relative(a, b); return !!r && !r.startsWith("..") && !path.isAbsolute(r); };
    const ok = sr === ws || within(ws, sr) || within(sr, ws);
    console.log("CONFIRMED =", ok);
    console.log(ok
      ? "VEREDICTO: gate passaria -> o problema do Mac NAO foi casing (C1); foi C2 (launcher/dev server nunca arrancou)."
      : "VEREDICTO: gate BLOQUEIA -> C1 (casing) CONFIRMADO. O fix _canonRoot do CROSSDEVICE_RECON secao 4 aplica-se.");
  ' "$SR" "$WS"
  echo "=== fim — cola este ficheiro no Cowork ==="
} 2>&1 | tee "$OUT"
