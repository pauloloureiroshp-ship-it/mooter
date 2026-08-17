#!/bin/bash
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO" || exit 1
echo "═══ a reiniciar o runner (prompt novo) ═══"
# marca onde o ledger está agora, para medir só o que vier depois
wc -l < "$HOME/.mooter/runner-ledger.jsonl" > "$HOME/.mooter/marca-prompt-novo.txt"
echo "marca no ledger: $(cat "$HOME/.mooter/marca-prompt-novo.txt") recibos"
pkill -f "tools/cockpit/runner/moo-runner.mjs" 2>/dev/null && echo "→ runner antigo terminado" || echo "→ nenhum runner a correr"
rm -f "$HOME/.mooter/runner.lock"
sleep 2
nohup "$REPO/moo-runner.command" >/tmp/runner-restart.log 2>&1 &
sleep 6
echo "→ novo runner: $(pgrep -f 'moo-runner.mjs' | head -1)"
echo "✅ reiniciado com o prompt novo. Deixa correr ~5 min e mede."
echo "(janela 20s)"; sleep 20
