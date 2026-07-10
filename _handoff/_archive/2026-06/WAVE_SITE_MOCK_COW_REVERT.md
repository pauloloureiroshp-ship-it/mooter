# Wave — Site = Claude Design mock + classic cow + rose palette (EXTENDS PR #179)

> Cola numa sessão fresca de Claude Code no repo. Estende o branch do PR #179
> (`wave60_design_redesign`). **NÃO mergear o #179 primeiro** — um só PR coerente.

## Objectivo (a visão do Paulo)
1. O **site** (`landing/`) passa a ter a cara do **último mock do Claude Design** — layout, secções e as
   **animações simuladas**, em todas as páginas que o mock define.
2. **Vaca clássica** em todo o lado: cabeça cinza/branca + focinho **rosa**, olhos escuros com catch-light.
   **REVERTER** a vaca geométrica cream (#F5EDD4) + laranja (#FF6B35) introduzida no PASSO 0.
3. **Look-and-feel de cores do modelo antigo**: warm dark + **rosa #E8888A** como accent.
   **REMOVER o laranja #FF6B35** que entrou com a vaca canónica.
4. **Plugin**: alinhar o visual do webview ao cockpit do mock (já ~feito na v0.12.0) + aplicar a vaca
   clássica e o rosa; tirar o laranja.

## Branch & estratégia
- Trabalha em `wave60_design_redesign` (= PR #179, já com o redesign completo + /compare a 1.39.0).
- Constrói POR CIMA. Não mergear ainda. Commits atómicos. Push actualiza o #179.

## Fonte de verdade do visual do site
- O mock está exportado em `_handoff/mock/` (index + outras páginas + cockpit + assets).
  É o **ALVO VISUAL**. **Porta** o design e as animações para o Next.js real (`landing/`),
  reaproveitando os tokens do `globals.css`. NÃO colar o HTML do mock cru — re-implementar no stack.
- ⚠️ Se `_handoff/mock/` não existir, **PÁRA e avisa** — não inventes o mock.

## Invariantes (partir = falhar a wave)
- `tools/router/classify.js` FROZEN (sha CI). Pacotes do motor frozen. Sem deps npm novas.
- Selective git add — nunca `git add -A`. Contrato CLI intacto. CSP/nonce do webview intactos.
- PT-PT em conversa, EN no código/UI.
- **Excepção de honestidade (não-negociável):** o mock tem "Same prompts. **Same results.** One bill is
  47% smaller". **NÃO** shippar "Same results" (claim banido). Mantém a redação honesta já no site
  ("comparable quality on routine tasks"). Números sempre sourced (47% / 658 / $25.95).
- Mantém o trabalho de honestidade/versão do #179: versão única **1.39.0**, `/compare` a 1.39.0,
  sem placeholders.

## Reverter a vaca (desfazer o PASSO 0 só na parte da vaca/cor)
- A vaca clássica está no git ANTES do commit `c4c5da1` ("PASSO 0 — canonical cow assets").
  Recupera os assets de lá, ex.:
  `git show c4c5da1^:landing/public/mooter-logo.svg > landing/public/mooter-logo.svg`
  (e equivalentes para favicon, nav, e os assets do plugin).
- Aplica a vaca clássica em TODOS os caminhos:
  - `landing/public/mooter-logo.svg` · favicon · logo do nav
  - `packages/vscode-extension/media/cow.svg` (mono, `currentColor`, inline/mask — nunca `<img src>`)
  - `packages/vscode-extension/media/icon.png` (rasterizar 512×512 da vaca clássica, fundo lift #1C1A17)
- **Cor:** procurar `#FF6B35` (laranja) e a paleta cream da vaca em `landing/` e
  `packages/vscode-extension/` e substituir pelo accent rosa **#E8888A**. Accent único = rosa.

## Site (`landing/`)
- Adoptar o layout, secções e animações do mock para todas as páginas que ele define.
- Animações leves e performantes (transform/opacity), `prefers-reduced-motion`, pausar off-screen.
- Responsivo <768px sem overflow horizontal. A11y AA, `:focus-visible` rosa.

## Plugin (`packages/vscode-extension`)
- Vaca clássica + rosa; remover laranja. Manter o cockpit alinhado ao mock.
- Bump de versão + entrada no CHANGELOG. Sem React/bundler; CSP/nonce intactos.

## Gate (tudo verde antes de "done")
1. `cd landing && npm test` + `npm run build` (sem erros novos).
2. `cd packages/vscode-extension && npm test`.
3. `classify.js` sha intacta · `git diff` só nos ficheiros esperados · zero deps novas.
4. Deploy de preview READY do HEAD — confirma o URL.
5. **PAUSA para revisão visual** antes do merge.

## Processo
- Lê primeiro: `_handoff/mock/`, `landing/app/globals.css`, `landing/app/page.tsx`,
  `packages/vscode-extension/src/extension.js`.
- Mostra o plano (ficheiros a tocar) antes de editar.
