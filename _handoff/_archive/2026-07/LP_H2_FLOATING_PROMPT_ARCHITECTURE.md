# LP-H2 · Floating Prompt ancorado à seleção — Nota de Arquitetura

> **TL;DR:** O "floating prompt ancorado à seleção, nível Lovable/Cursor" que a wave H2 pedia
> **já está construído e shippado no PR #246** (wave COH-01…19, camadas LP-4.5/4.8/4.9 + COH-07/13/14).
> Nenhum backend novo, nenhuma caixa nova é necessária. Este documento existe para que **nenhuma sessão
> futura redescubra** o que já foi provado em FASE 0 (2026-07-12). Suite: 1162/1162 verde, intacta.

## 1. O componente — onde vive

O prompt flutuante é a **in-canvas toolbar** `#lp-ctb` (classe `.lp-ctb`), gerada dentro do HTML da
webview do Live Preview em [extension.js](../../../packages/vscode-extension/src/extension.js).

| Peça | id/símbolo | Local |
|---|---|---|
| Overlay click-through (fence) | `#lp-ctb-ov` (`pointer-events:none`) | `extension.js:3656` |
| Caixa flutuante ancorada | `#lp-ctb` (`role="toolbar"`) | `extension.js:3657`, CSS `3355-3358` |
| Header (grip/ajuda/minimizar/fechar) | `#lp-ctb-hd` | `extension.js:3660` |
| Corpo (populado por seleção) | `#lp-ctb-body` | `extension.js:3666` |
| Estado minimizado | `#lp-ctb-chip` (🐮) | `extension.js:3675` |

A toolbar **vive na webview de confiança (o pai), NUNCA é injetada no iframe cross-origin** — o CSS/JS
do site não lhe chega (defesa adversarial L1). Comentário canónico em `extension.js:3652-3655`.

## 2. Mecanismo de coordenadas reusado — **overlay do webview pai + rect relay**

Não há segundo sistema de posicionamento. O que já existe:

1. O utilizador seleciona um elemento no iframe → o tap in-page posta `lp-select` **com o
   `getBoundingClientRect()` do elemento** (`m.rect`), origin-locked. Handler: `extension.js:5201`.
2. A webview guarda `lpSelection` (inclui `rect`) e chama `renderSelection(sel)` (`extension.js:4461`).
3. `renderSelection` popula `#lp-ctb-body`, mostra `#lp-ctb` e posiciona-a via
   `placeCanvasToolbar(sel.rect)` → `positionCanvasToolbar` (`extension.js:4240-4278`).
4. A decisão de colocação é **pura e testada**: `chooseToolbarPlacement` em
   [lp-toolbar-geom.js](../../../packages/vscode-extension/src/lp-toolbar-geom.js) (COH-02) — nunca cobre o pin;
   quando nada encaixa, auto-minimiza para o chip ou docka, **nunca por cima do nó**. Prova geométrica
   com rectângulos reais em `lp-toolbar-geom.test.js`.

> **D-A já tinha validado a viabilidade** (anti-redescoberta):
> `LP_COHERENCE_AUDIT_REPORT.md:35` — *"O floating prompt não esbarra hoje numa injecção dentro do iframe:
> vive na webview pai, sobre o iframe"* · `:98` — *"nenhuma injecção no iframe é necessária"* · `:382` —
> *"D-A: H2 CONFIRMADA"*.

## 3. Ligação ao pipeline real (Ask→Apply · COH-07)

A caixa compõe as **mesmas** mensagens que o resto do Live Edit já usava — zero handler host novo:

```
[input #lp-box-in] ──submit──▶  lp-ask   (intent "Perguntar")  ──▶ host _ask*  ─▶ resposta no painel
                                          + CTA "▶ Aplicar com o agente" (#lp-ask-apply, extension.js:4908)
                                                   │
                                                   └─ lp-ask-apply {askId} ─▶ _askApply (extension.js:2899)
                                                                                    └─▶ _taskRun (2735/2913)
[input #lp-box-in] ──submit──▶  lp-task  (intent "Editar")     ──▶ _taskRun  (extension.js:1777)
```

Routing das mensagens: `extension.js:1777` (`lp-task`) e `1781` (`lp-ask-apply`). O host **revalida o
lease** e a webview envia apenas o `askId` (COH-07).

## 4. Requisitos H2 → onde já estão satisfeitos

| Requisito da wave H2 | Prova (extension.js) |
|---|---|
| Ancorado ao pin, flutuante | `3355`, `3656-3678`, `4240-4278` |
| Visível **no instante da seleção** (autofocus) | `5201` → `renderSelection` → `4564` (`#lp-box-in` focus) |
| Vista mínima prompt-first (intent · input · send) | `4513-4527` |
| Breadcrumb root→leaf | `4470-4480` |
| Chips de tier (local $0 · Haiku · Sonnet · Opus · @fable) | `4532-4533`, `3421` |
| Botão enviar | `4527` (`#lp-box-b`) |
| Indicador de estado (state machine única) | COH-14: `4290-4348` (idle/blocked/working/success/warning/error) |
| Desaparece no unpin / troca de origem | `4465` (`renderSelection(null)`→`hideCanvasToolbar`), `3896` (origin change) |
| Dicionário de tier único 🐮⚡🎼🧠🌟 | COH-13 |
| `prefers-reduced-motion` respeitado | `3372`, `3384`, `3401` |

## 5. H2.2 ("Cockpit desativado quando há seleção") — **moot por design**

A H2.2 assumia uma caixa de **comandos livres** persistente (modelo mental Lovable/Cursor) que seria
desativada com razão honesta quando houvesse seleção. **Essa caixa não existe** — e é intencional:

- Design **pin-first, fail-closed**: *"NO prompt path talks to the LLM before ANY element is pinned this
  session"* (`extension.js:1333`); *"the honest webview already hides the one-box until an element is
  pinned"* (`2758`); gate `_selectionMissing()` default-deny (`1576`, `2516`, `2759`).
- Sem pin, a toolbar de topo mostra só `📍 sem seleção` + `🎯 Selecionar` (`extension.js:3620`) — **não há
  prompt algum** para desativar.

Ou seja, a "fonte única de verdade quando há seleção" que a H2.2 queria **já é o invariante por
construção**: a caixa ancorada é o único caminho de prompt, sempre. Nada a implementar.

## 6. Prova de que **nunca vaza para produção** (P0)

`git grep` de `lp-ctb` / `lp-box-in` / `placeCanvasToolbar` em `landing/` (o site Next.js de mooter.ai) =
**0 matches**. Os símbolos existem só em `extension.js` (webview) + `live-preview-runtime.test.js` +
`webview-syntax.test.js`. O que existe em `landing/` é o `lp-error-tap.ts` (HMR error tap) e o
`code-inspector-plugin` em `next.config.ts` — este último é o stamper **dev-only** de `data-insp-path`
(consumido host-side em `extension.js:1841`, aceite só se resolver dentro da árvore servida). A caixa
flutuante vive no VS Code, **nunca é servida a um visitante real de mooter.ai**.

## 7. Estado da wave

- **Veredicto FASE 0 (2026-07-12):** plano H2 já entregue no PR #246. Wave fechada sem PR de código redundante.
- classify.js sha `427d8c0b…4bc48f` — intacta. COH-01…19 intactos. Suite 1162/1162.
- Se surgir um gap comportamental concreto (um breakpoint que parte, um estado que não abre), tratar como
  delta isolado tests-first contra `.lp-ctb` — **não** reconstruir uma caixa paralela.
