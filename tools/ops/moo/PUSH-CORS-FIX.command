#!/bin/bash
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
GH="$HOME/.local/bin/gh"; [ -x "$GH" ] || GH="$(command -v gh)"
cd "$REPO" || exit 1; BR="$(git branch --show-current)"
echo "═══ testes antes de empurrar ═══"
OUT=$(node --test tools/cockpit/runner/runner-core.test.mjs tools/cockpit/runner/fleet-state.test.mjs tools/cockpit/runner/cockpit-ux.test.mjs tools/cockpit/runner/skill-moo-pilot.test.mjs 2>&1)
echo "$OUT" | grep -E "^# (pass|fail)"
FAIL=$(echo "$OUT" | grep -oE "^# fail [0-9]+" | grep -oE "[0-9]+$")
if [ "$FAIL" != "0" ]; then echo "❌ vermelho — abortado"; sleep 25; exit 1; fi
git add tools/cockpit/runner/f10-server.mjs
git commit -m "fix(security): F10 deixa de responder CORS wildcard no GET

O primeiro achado do proprio moo-pilot a virar fix. O servidor respondia
'Access-Control-Allow-Origin: *' em todas as respostas, o que deixava qualquer
site que o dono visitasse LER o fleet.json (nome do device, branch, contagens de
recibos, GPU%). Os verbos de controlo ja estavam guardados por originAllowed(),
por isso o kill-switch nunca esteve exposto — a falha era divulgacao de leitura.

Agora corsHeaders(origin) so ecoa a origem quando o hostname e 127.0.0.1,
localhost ou ::1; 'null' (file:// e iframes sandboxed) e qualquer outra origem
nao recebem cabecalho nenhum.

Verificado adversarialmente na maquina: GET local nao quebrou; origem maliciosa
nao recebe cabecalho; POST /stop com origem maliciosa continua 403; /panel serve
200. Revisto tambem pelo moo local (qwen2.5-coder:14b, \$0, 12s), que confirmou.
Trade-off assumido: um painel aberto por file:// deixa de ler o endpoint — o
caminho canonico e http://127.0.0.1:4290/panel.

Co-Authored-By: Claude <noreply@anthropic.com>" 2>&1 | tail -3
git push https://github.com/pauloloureiroshp-ship-it/mooter.git "$BR" 2>&1 | tail -3
echo "🏁 fix de seguranca empurrado em $BR."; echo "(janela 25s)"; sleep 25
