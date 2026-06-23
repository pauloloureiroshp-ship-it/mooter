# Arranque noturno (1x antes de dormir) — 1 escritor, headless

## 1. Limpar a colisao (restaura 1 escritor)
pm2 delete all
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force

## 2. Resolver o branch (o working tree saltou para pilar/site)
cd "C:\Users\Paulo Loureiro\frugal"
git stash -u            # guarda o que estiver solto (instrumentos untracked sobrevivem na mesma)
git checkout wave-autopilot-loop   # ou a branch que queres como base; o W2 esta em wave-council-w2
git stash pop           # (se precisares do que guardaste; ignora se der conflito trivial)

## 3. Apontar o loop ao objetivo noturno + arrancar UM headless
Remove-Item _handoff\loop\STOP -ErrorAction SilentlyContinue
node _handoff\loop\start-loop.mjs        # pega a proxima wave da QUEUE (WN1 fica no topo)
# (ou, se preferires o servico: pm2 start _handoff\loop\loop-runner.mjs --name mooter-loop --update-env)

## 4. Pre-aprovar o meu lado (1x)
Scheduled tasks -> cowork-loop-evaluator -> Run now (aprova os tools dele).

A partir daqui: eu (cada 10 min) leio o bus, respondo o operacional + a tua politica, e deixo MORNING_DECISIONS.md (+ notificacao) so para o irreversivel/novo. Tu dormes.
