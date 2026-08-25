# ⇄ COWORK → CC · Deck Polish Pass — aproximar o CTO Command Deck do mock (7 refinamentos)

> O deck (W15) está **instalado e a funcionar** (vsix 0.16.48, em `main`): inbox por exceção, lentes Economics/Brain/
> Foundations honestas, handoff flow, Mooter Score. Confronto visual do Cowork (2026-07-04, deck real vs mock) revelou
> que **~60% dos "gaps" são empty-states + ordem + tabs**, e só ~40% são detalhe — logo isto é um **POLISH pass aditivo,
> NÃO um rebuild**. `classify.js` FROZEN, só `packages/vscode-extension/**`, honest-copy, sem merge sem OK do Paulo.

## 🎯 GOAL
Que o deck instalado bata o mock: NOW destacado, tabs colapsadas, hardware/pipeline sempre visíveis (empty states que
vendem), lentes densas, Score no sítio certo, handoff a correr. Cada refinamento **provado com preview HTML** dos estados
(vazio + rico) sob os 3 temas — o gate final é **visual e humano** (o Paulo valida antes de mergear).

## 📍 WHERE
Worktree `../frugal-deck-polish` · branch `feat/deck-polish` · from `main` (deck 0.16.48). Corre em **Sonnet**.

## ▶ DO — 7 refinamentos (cada um com ficheiro-âncora + gate)
1. **Tabs → priority-collapse** (`host-extra.js`, procura `tab-`). Hoje: 7 tabs planas. Alvo: 3-4 principais visíveis (Cockpit · Mission · Arch) + **overflow `···`** (Setup/Agents/Decisions/Doctor) que colapsa por prioridade quando o painel estreita (padrão GitLens). **Gate:** ≤5 tabs visíveis · overflow abre o resto · nada perde acesso.
2. **NOW → barra destacada** (`extension.js`, o bloco `Inbox — gestão por exceção` ~L1324). Hoje: 2 chips tímidos. Alvo: uma **barra proeminente** no topo (warning tint) onde `🙋 your turn (N sessões à tua espera)` é o **sinal mais alto** (acima do merge gate). Calm quando vazio (tela calma), loud quando há your-turn. **Gate:** a linha your-turn domina quando existe; o NOW lê-se como "o que precisa de mim".
3. **Hardware strip + Pipeline SEMPRE visíveis** (`extension.js`, `Deck Phase 4 · Vida` ~L1398). Hoje: condicionais → desaparecem idle. Alvo: **sempre presentes** com empty states honestos — hardware `🎮 GPU livre · cabem +N moos · CPU X%` (real do allocator/nvidia-smi; `n/d` se ausente, nunca fabricar); pipeline `🏁 spec→plan→exec→review→ship · sem sessão ativa` (as 5 etapas visíveis mesmo a zero). **Gate:** ambos visíveis no estado idle · zero número fabricado.
4. **Floor com empty state convidativo** (Floor/Fleet Console). Hoje: some sem sessões. Alvo: empty state que convida — `nenhuma sessão ativa · ★ New CC para começar`. **Gate:** Floor sempre visível.
5. **Densidade das lentes** (Economics/Brain/Foundations — `host-extra.js`/`row-renderer.js`). Hoje: `label: valor`. Alvo: **chips + mini-barras** como o mock (ex: savings com barra por tier; tier split; Pastor/Adapters como chips). Mais denso, mais elegante, mesma honestidade. **Gate:** densidade aproximada do mock no preview.
6. **Mooter Score → colapsável / mover** (o bloco `MOOTER SCORE 8/14`). Hoje: 6 itens + `fix` roubam o cockpit principal. Alvo: **colapsado por default** (um chip `🎯 Score 8/14 ⌄` que expande) OU mover para o tab **Setup**. **Gate:** não domina o cockpit; o setup continua acessível.
7. **Handoff flow animado** (o rio Cowork→CC→moos→Ledger). Alvo: a **partícula a correr** (CSS-only, `prefers-reduced-motion` desliga). **Gate:** partícula visível · reduced-motion mata-a.

## 🧪 MÉTODO DE VALIDAÇÃO (obrigatório — não mergear às cegas)
Gera `_handoff/deck-polish-preview.html` com os **estados lado a lado (idle/vazio + rico com sessões)** sob os **3 temas** (Dark/Light/HC), embebendo o CSS real do cockpit. É isto que o Paulo abre e valida — o gate humano. Sem este preview, não há OK.

## 🔒 GUARD
`classify.js` FROZEN (prova a sha `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`) · **polish aditivo** (só `packages/vscode-extension/**`, sem tocar engine) · **honest-copy** (empty states nunca fabricam: "GPU livre" é real, "cabem +N" vem do allocator, `n/d` quando não há fonte) · CSP-safe (sem handlers inline, o padrão da Fase 5) · WCAG AA + `prefers-reduced-motion` · selective `git add` · **sem push/merge sem OK do Paulo** · PT-PT conversa / inglês código.

## ✅ GATE global
Os 7 refinamentos feitos · `deck-polish-preview.html` mostra os estados nos 3 temas · testes verdes (não regride os 490) · `classify.js` sha intacta · zero número fabricado nos empty states · CSP + reduced-motion respeitados. Rebuild do vsix é o passo manual do Paulo.

## 📋 BACK
Branch (git-write worktree) · `git --no-pager diff --stat main..HEAD` (só adições em `packages/vscode-extension`) · o `deck-polish-preview.html` para o Paulo abrir · testes · sha intacta. `uncommitted` é o alerta vermelho. **Nada de merge — o Paulo autoriza o irreversível.**
