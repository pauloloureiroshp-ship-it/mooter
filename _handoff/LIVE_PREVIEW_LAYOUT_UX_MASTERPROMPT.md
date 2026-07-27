# ⇄ COWORK→CC · FRENTE LAYOUT+UX · Do caos de 4 colunas ao layout Lovable-grade (3 zonas)

> **Diagnóstico ao vivo (Cowork navegou o plugin 2026-07-08):** o MOTOR funciona (cross-check
> provado — o agente lê canonical-metrics.ts via contexto pré-computado; edições $0; $22.95 ok;
> Director's Cut com abas). MAS a EXPERIÊNCIA é um caos: a toolbar in-canvas TAPA o preview e
> colide com elementos do próprio site; há 4 colunas concorrentes (Cockpit · Preview+toolbar ·
> Seleção/Brain/DC · um CHAT separado); o layout 3-zonas pedido não existe; a resposta do agente
> está escondida. O Lovable ganha-nos na LIMPEZA, não no motor. Esta frente arruma a moldura.
> **⚠️ Sobe a prioridade nº1** — é o que faz o Paulo sentir "nada funciona". R1–R6. classify FROZEN.
> **Regra-mãe:** não tocar no motor (Context Engine/cerca/agente); só a APRESENTAÇÃO.

## 0. Fase 0 · Confrontar a API de layout do VS Code (read-only, primeiro — NÃO prometer antes)
O pedido "Cockpit esq · Preview meio · Director's Cut dir" pode não ser trivial: um webview não
controla o layout do editor. Investigar e escrever `_handoff/LAYOUT_RECON.md`:
- Onde vive cada peça HOJE: Cockpit (webview view na activity bar?), Live Preview (editor-area
  webview panel?), toolbar in-canvas (overlay dentro do iframe? shadow DOM do tap?), Director's
  Cut (empilhado no mesmo webview do preview?), o "CHAT RESUMIR TEXTO" (o que É isto? extensão
  externa? Claude Code agent window? — identificar e decidir se fica).
- O que a API permite: `WebviewViewProvider` na sidebar (esq/dir), editor-group webview panel
  (preview grande ao centro), mover views entre containers. Confirmar se dá para 3 zonas nativas
  OU se o Director's Cut tem de ser uma tab/split dentro do webview do preview.
- Decidir o desenho REAL possível (não o ideal impossível) e reportar ao Paulo antes de construir.

## 1. Os problemas a resolver (por ordem de dor)
1. **A toolbar tapa o preview + colide com o site.** É o pior. A toolbar in-canvas não pode
   cobrir o conteúdo que se está a editar nem confundir-se com elementos da landing.
2. **Fragmentação de 4 colunas.** Consolidar em 3 zonas coerentes; matar/absorver o que sobra.
3. **Layout 3-zonas ausente.** Cockpit esq · Preview limpo meio · Director's Cut dir.
4. **Resultado do agente escondido.** O "uau" (leu canonical-metrics.ts) tem de ser óbvio.
5. **O "CHAT RESUMIR TEXTO"** confunde — identificar e integrar OU remover da superfície.

## 2. O desenho alvo (a validar na Fase 0 contra a API)
- **ZONA ESQUERDA — Cockpit** (activity bar + painel): Cockpit/Mission Control/Project Command/
  Arquitectura, fleet, sessões. Já existe; só garantir que não compete visualmente com o resto.
- **ZONA CENTRO — Preview LIMPO** (editor area): o site, grande, sem nada sobreposto por defeito.
  A **toolbar de edição** aparece SÓ ao pin, ancorada ao elemento com offset inteligente que
  **nunca cobre o elemento nem o hero** (flip acima/lado; compacta por defeito, "▾ mais" para o
  avançado — já existe na LP-4.9, só falta o posicionamento não-tapante). Um chip 🐮 minimizado
  quando não está em uso.
- **ZONA DIREITA — Director's Cut + resposta** (sidebar dir): o feed/lentes (Stream/Dia/LLM/Fleet)
  E a **resposta do agente** (o cross-check) num lugar fixo e legível — não escondida. Quando o
  agente responde, esta zona ganha destaque (não um painel perdido no meio).
- **Distinção site vs ferramenta:** a UI do plugin (toolbar, chips) tem de ser visualmente
  DISTINTA da landing (moldura/sombra/tokens --vscode-*) para nunca se confundir com o site.

## 3. Constrangimentos DUROS (não partir o que funciona)
Webview concat-only (fn.toString, sem backticks/${}/require), CSP nonce, sem charting lib, esc()
free-var, prefers-reduced-motion, fail-soft, honesty-first. O motor (Context Engine, cerca, agente,
tree-gate) INTACTO — só a camada de apresentação/layout muda. Aditivo, faseado, adversarial focada.

## 4. Skills de design a usar (o Paulo pediu "melhores skills")
`design:design-critique` (avaliar cada iteração contra o Lovable), `design:design-system-management`
(tokens/consistência --vscode-*), `design:accessibility-review` (WCAG 2.2: foco, target size 24px,
contraste, motion), `design:ux-writing` (rótulos honestos e claros). O desenho passa por elas; a
implementação continua hand-rolled.

## 5. Faseamento (cada fase = prova viva antes de aterrar; screenshots antes→depois)
- **F0** recon da API de layout → `LAYOUT_RECON.md` → PÁRA, alinha o desenho possível com o Paulo.
- **F1** toolbar não-tapante (offset inteligente + compacta + chip minimizado) — mata a dor nº1.
- **F2** 3 zonas: mover o Director's Cut + resposta do agente para a sidebar direita; preview limpo.
- **F3** distinção visual site↔ferramenta + destaque da resposta do agente.
- **F4** resolver o "CHAT RESUMIR TEXTO" (integrar ou remover).
- **F5** design-critique + a11y WCAG 2.2 + ux-writing — o polish final, comparado lado-a-lado com o Lovable.
Cada fase: worktree própria off origin/main · classify FROZEN · screenshots antes→depois como prova
(regra "prova, não afirmes") · push só da branch · PÁRA para OK do Paulo.

## ✅ GATE por fase
Screenshot antes→depois no dev server real · a toolbar NÃO tapa o preview/hero · 3 zonas coerentes ·
resposta do agente visível e legível · site distinto da ferramenta · testes verdes · sha frozen ·
motor intacto (Context Engine/cerca/agente byte-idênticos). O "melhor que o Lovable" mede-se por
design-critique lado-a-lado, não por vibes.

## 6. Fonte
Diagnóstico: navegação Cowork do plugin 2026-07-08 (toolbar sobreposta, 4 colunas, chat órfão).
Barra Lovable: limpeza (1 site, 1 ferramenta óbvia), draw-annotation, version history — cf.
LIVE_PREVIEW_FABLE5_MASTER_HANDOFF §3/§5. Constrangimentos webview: DIRECTORS_CUT_V2_HANDOFF §3.
