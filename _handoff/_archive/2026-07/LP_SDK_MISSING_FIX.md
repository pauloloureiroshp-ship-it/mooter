# ⇄ COWORK→CC · LP-COERÊNCIA-DEMO · Investigar e resolver "sem SDK"

> Cola isto na mesma sessão do CC. O painel Live Preview mostra 🔴 "sem SDK" com botão "como instalar" —
> cliquei nele via computer-use e nada visível aconteceu (pode ter aberto browser externo, que não vejo).

## FAZER
1. Localiza no código o que exatamente esta luz verifica — grep por `sem SDK`/`bridgeStatus`/`sdk-bridge-missing`/
   termos parecidos em `packages/vscode-extension/src`. Confirma: é o Claude Agent SDK (`@anthropic-ai/*` ou
   equivalente) que falta como dependência instalada, ou é uma sessão/autenticação que falta, ou outra coisa?
2. Se for uma dependência instalável (npm/global) e não exigir segredos/API keys/login novo: instala-a.
   Reporta exatamente o que instalaste e onde (worktree local vs global).
3. Se exigir autenticação/login/API key: NÃO tentes contornar — reporta exatamente que credencial falta e
   onde normalmente se configura (para o Paulo decidir, é ele quem tem as chaves).
4. Depois de resolver (ou de confirmar que não é resolvível sem o Paulo), verifica se isto é o que bloqueia
   o passo "Aplicar" do pipeline Ask→Apply (ou seja: mesmo com o clique humano, falharia sem isto).

## GUARD
Não mexer em `classify.js`. Não commitar/pushar. Se envolver instalar algo global no sistema do Paulo,
documenta claramente o quê e como reverter.

## BACK
```
⇄ CC→COWORK · LP-SDK-FIX · <resolvido | bloqueado em: <razão>>
O que a luz verifica: <ficheiro:linha>
Causa: <dependência em falta | auth em falta | outro>
Ação tomada: <instalado X | nada, precisa de Y do Paulo>
Impacto no Ask→Apply: <bloqueia o Aplicar sem isto? sim/não, prova>
```
