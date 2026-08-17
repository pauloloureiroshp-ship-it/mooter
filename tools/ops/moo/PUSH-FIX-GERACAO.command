#!/bin/bash
GH="$HOME/.local/bin/gh"; [ -x "$GH" ] || GH="$(command -v gh)"
cd "$HOME/frugal" || exit 1; BR="$(git branch --show-current)"
echo "═══ testes antes de empurrar ═══"
node --test tools/cockpit/runner/runner-core.test.mjs tools/cockpit/runner/fleet-state.test.mjs tools/cockpit/runner/cockpit-ux.test.mjs 2>&1 | grep -E "^# (pass|fail)"
FAIL=$(node --test tools/cockpit/runner/runner-core.test.mjs tools/cockpit/runner/fleet-state.test.mjs tools/cockpit/runner/cockpit-ux.test.mjs 2>&1 | grep -oE "^# fail [0-9]+" | grep -oE "[0-9]+")
if [ "$FAIL" != "0" ]; then echo "❌ testes vermelhos — abortado"; sleep 25; exit 1; fi
git add tools/cockpit/runner/context-pack.mjs tools/cockpit/runner/runner-core.test.mjs
git commit -m "fix(runner): o gerador exige defeito REAL e recompensa SEM ACHADO

O prompt antigo mandava 'escolhe UMA linha e diz porque' — forcava um achado por
ronda. Medicao ao fim de 860 achados: 27% citavam .md, 14% citavam comentarios ou
cercas de codigo, ~65% eram nitpick ('pode confundir o utilizador'); so ~15% eram
acionaveis. Forcar um achado nao produz vigilancia, produz ruido.

Agora: exige sintoma+QUANDO+ENTAO, proibe citar comentarios/linhas vazias/markdown,
bane por escrito as frases-nitpick medidas, e trata SEM ACHADO como resposta certa.
Teste de contrato atualizado com o porque medido (nao apagado).

Medido em rondas reais pos-fix: comentarios 14%->0%, .md 27%->0%, nitpick 65%->0%,
forma sintoma-condicao-impacto 0%->80%, SEM ACHADO 0%->16%. Amostra pequena (n=6).

Co-Authored-By: Claude <noreply@anthropic.com>" 2>&1 | tail -3
git push https://github.com/pauloloureiroshp-ship-it/mooter.git "$BR" 2>&1 | tail -3
echo "🏁 fix da geracao empurrado em $BR."; echo "(janela 25s)"; sleep 25
