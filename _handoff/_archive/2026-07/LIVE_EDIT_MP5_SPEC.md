# Live Edit (MP5) — Select-to-Edit Cirúrgico, Router-Native · Spec + Auditoria + Masterprompts

> **Visão (do Paulo, 2026-07-05):** dentro do Live Preview, o utilizador **seleciona uma parte** (um elemento
> **ou uma área desenhada** — quase um "print") e manda o CC ajustar **só aquilo**, escrevendo um prompt
> **dentro do preview** e **escolhendo o LLM**. O Mooter entende o que foi selecionado e edita **apenas o
> selecionado, com perfeição**. Objetivo: passar o Lovable — de outro mundo, local-first, $0 no caso comum.
> **Base de pesquisa:** auditoria do código real + 2 frentes técnicas/UX (2026, ~40 fontes). Séries irmãs:
> `LIVE_PREVIEW_FEATURE_STUDY.md`, `LIVE_PREVIEW_MP4_DIAGNOSTICS_MASTERPROMPT.md`.

---

## 0. TL;DR — os 3 fossos que ninguém ocupa (e só o Mooter pode)

1. **Chip de modelo router-native.** Nenhum editor visual (Lovable/Bolt/v0/Replit/Cursor/Onlook) deixa escolher o modelo **na seleção**. Todos ensinam a doutrina "edit trivial → modelo barato; complexo → caro" mas obrigam o humano a escolher, no chat errado. O Mooter **auto-roteia por dificuldade da edição** (texto → T0 local $0; layout → T2; lógica → T3) e mostra um **chip que se pode override**. Impossível de copiar sem ser router.
2. **Seleção de ÁREA (marquee).** Todos selecionam **um elemento** (nó DOM). Ninguém no tier de builders faz **região desenhada → screenshot recortado + nós DOM contidos + instrução**, raciocinada como conjunto ("este bloco de cards está desalinhado"). Água aberta.
3. **Edições determinísticas $0.** ~80% das edições (texto/cor/spacing/classe Tailwind) são **mutação de AST**, sem LLM — regression-proof por identidade do nó. É a doutrina "$0 quando não precisa de cloud" feita visual. Lovable/Onlook fazem-no; nós fazemo-lo **local-first**.

---

## 1. Auditoria honesta — o que o Live Preview entrega HOJE

| Capacidade | Estado | Ficheiro:símbolo |
|---|---|---|
| Deteção dev-server (portas 7819/3000/5173…, parse config, origin-lock localhost) | ✅ main | `lp-stage.js::resolveStage/normalizeStageUrl` |
| Estado honesto (porta ativa / stale / offline / degraded) | ✅ main | `lp-stage.js::renderStageStatus` |
| Polling visibility-aware | ✅ main | `extension.js::LivePreviewPanel._wire` |
| **Brain** (tier/modelo/custo/%local/GPU, `n/d` honesto) | ✅ main | `live-preview-view.js::buildBrainData/renderBrain` |
| **Director's Cut** (feed de eventos, sessão-scoped honesto) | ✅ main | `live-preview-view.js::renderDirectorsCut` |
| **⏰ BUG timezone** — `clock(ts)` faz `slice(11,19)` do ISO = **sempre UTC** | 🐞 main | `live-preview-view.js::clock` (~L154) |
| iframe do site (App Stage) | ⚠️ **confirmar camada** — auditoria leu comentário "no iframe yet (MP2)" no main, mas o iframe **renderizou** com o vsix da lp-diag → o iframe vive no MP4 WIP, não no MP2 landed. **Verificar e consolidar em main.** | `extension.js::getLivePreviewHtml` |
| Error-strip (runtime/promise/console/overlay, origin-lock, "abrir ficheiro"/"enviar à CC") | 🟡 WIP lp-diag | `lp-diagnostics.js` + `lp-error-tap.ts` |
| Preserva route+scroll (client) | 🟡 WIP lp-diag | `lp-error-tap.ts §5` |
| **Multi-page nav** (navegar entre abas/rotas do site) | ❌ só *restore*, sem UI de navegação | — |
| **Select-to-edit / click-to-code** | ❌ zero | — |
| Captura erros **server-side** (SSR/API) | ❌ (gap MP4.1) | — |

**Leitura:** a espinha (deteção + Brain + Director's Cut) é sólida e honesta. Falta: consolidar o iframe em main, o fix do relógio, a navegação multi-página, e o grande — o Live Edit.

---

## 2. MP3 — Fixes de confiança (P0, barato, primeiro)

### MP3.1 · Relógio na timezone do utilizador (o teu comentário)
`clock(ts)` assume UTC. Fix: `new Date(ts).toLocaleTimeString(undefined, { hour12:false })` (usa a tz local do SO) — e se o `ts` não fôr parseável, `n/d` honesto (nunca uma hora inventada). Aplicar ao Director's Cut e a qualquer outro timestamp. Teste: um evento às 08:29 SP mostra `08:29`, não `11:29`.

### MP3.2 · Consolidar o iframe em main
Confirmar em que camada vive o `<iframe src=localhost:PORT>` (parece estar no WIP da lp-diag). Trazer para main de forma limpa, com CSP `frame-src http://localhost:*` (dev) e `X-Frame-Options` só-dev (já existe o padrão no `next.config`). Sem isto, o App Stage não é reproduzível a partir de main.

### MP3.3 · Multi-page navigation (ver o site TODO, não só a home)
Hoje o iframe mostra a home e só *restaura* rotas; não há como **navegar**. Adicionar:
- **Barra de endereço funcional** (o campo URL já existe visualmente) — Enter navega o iframe para `localhost:PORT/<rota>`.
- **Sync de navegação:** quando o utilizador clica um link dentro do site, o tap (`lp-error-tap.ts §5` já capta `popstate`) emite `lp-nav {path}` → o host mostra a rota atual + breadcrumb. Back/forward.
- **Descoberta de rotas (nice-to-have):** ler `landing/app/**/page.tsx` → dropdown de rotas conhecidas (`/`, `/install`, `/benchmark`…). Assim vês "todas as abas do site" num seletor.

---

## 3. MP5 — Live Edit (o grande): arquitectura

O caminho técnico está **provado pela pesquisa** (Onlook, code-inspector, Lovable fazem-no assim). Cinco órgãos:

### 3.1 · Source mapping — a verdade DOM→código é um atributo compilado
- **`code-inspector-plugin`** (MIT, de-facto 2026) carimba no build `data-insp-path="ficheiro:linha:coluna:tag"` em cada elemento JSX. Sobrevive ao **React 19** (que removeu `_debugSource` — fiber-walking é beco sem saída) e aos **Server Components** (a verdade está no DOM, não no fiber).
- Wiring **Next ≥15.3**: `turbopack.rules = codeInspectorPlugin({ bundler:'turbopack' })` (dev-only). *(Alternativa sem dependência: transform SWC/Babel próprio a emitir `data-mooter-src` — decidir no MV0.)*
- Tailwind/shadcn: irrelevantes ao mecanismo; cuidado só com `asChild`/Slot (o atributo cai no host concreto — `closest('[data-insp-path]')` resolve na mesma).

### 3.2 · Agente in-app (dev-only) — quem lê o DOM é o próprio site
Cross-origin: o host (`vscode-webview://`) **não pode** tocar o DOM do iframe (`localhost`). Padrão universal: um **script dev-only injetado dentro da app** faz hover/click/marquee e `postMessage` das coords-fonte ao host. Mecânica:
- **Hover:** listeners `capture:true`, `document.elementFromPoint(x,y)`, highlight `position:fixed` + `pointer-events:none` (obrigatório) num **shadow DOM** (sem bleed de CSS).
- **Click:** `capture` + `preventDefault` + `stopImmediatePropagation` (o site não reage) → `closest('[data-insp-path]')` → parse `file:line:col`.
- **Reusar o `lp-error-tap.ts`** (já é o agente dev-only injetado no `layout.tsx`, já faz postMessage origin-locked) → **o Live Edit é uma extensão do tap do MP4**, não um órgão novo do zero.

### 3.3 · Seleção de ÁREA (o fosso nº2) — marquee sobre a app viva
- **Marquee:** `pointerdown` (âncora + overlay `pointer-events:none`) → `pointermove` (normaliza rect com `Math.min/max`, live-highlight) → `pointerup`.
- **Resolver box → elementos:** `getBoundingClientRect()` de cada `[data-insp-path]` + teste AABB (`sel.left<el.right && sel.right>el.left && sel.top<el.bottom && sel.bottom>el.top`). Exato, resolution-independent. Cache dos rects no `pointerdown`, throttle a `requestAnimationFrame` (evitar layout thrash).
- **Box → range de código:** mesma-file → `range.commonAncestorContainer` (LCA via `Range`); span de files → `file:[minLinha..maxLinha]` por ficheiro + nome do componente-âncora.
- **Screenshot da região (multimodal):** CDP `Page.captureScreenshot({clip})` (pixel-perfeito) ou `html2canvas` (in-page). **Enviar AMBOS** — imagem recortada + ranges-fonte — ao modelo. Ninguém funde área+DOM+screenshot+routing: é a nossa land grab.

### 3.4 · Prompt inline + chip de modelo (o fosso nº1)
Ao concluir a seleção, abre um **mini-prompt DENTRO do preview** (ancorado à seleção):
- Campo de instrução ("torna este cartão mais compacto").
- **Chip de modelo router-native:** o classifier do Mooter classifica a dificuldade **desta edição** e mostra o tier escolhido — ex: *"Moo faz isto local por $0 · [subir p/ Sonnet]"*. Override manual (o utilizador pode forçar T2/T3/@fable). É o `classify.js` (frozen) + o router a decidir, **exposto na seleção** — o que nenhum concorrente estrutural consegue.
- Honest-copy: o chip nunca mente o custo; se subir para cloud, di-lo.

### 3.5 · Aplicação two-speed — determinístico $0 vs LLM cirúrgico
Roteia por **tipo de edição** (a doutrina Lovable/Onlook, mas local-first):
- **Determinístico ($0, sem LLM, regression-proof):** texto, cor, spacing, classe Tailwind, radius → parse o ficheiro (Babel/recast, que **preserva formatação**) → `traverse` ao nó exato por identidade (`data-insp-path`) → muta só o `className`/texto → reimprime → diff só nas linhas tocadas → HMR. **~80% das edições, zero tokens, correção garantida.**
- **LLM (estrutural):** "adiciona um carousel", refactor → a **seleção É o escopo**; passa o snippet exato + screenshot da região ao CC via **SEARCH/REPLACE (fail-closed)** ou **unified-diff** (nunca formato com nºs de linha, que driftam). O grammar limita o blast-radius, não uma promessa no prompt.
- **Guardrails anti-regressão (a queixa nº1 do mercado — "over-editing/doom loop"):** escopo pela seleção + "tocou só estas linhas" visível + **rollback atómico** se o gate falhar.

### 3.6 · Visual diff antes de aplicar (leapfrog)
Mostrar **before/after renderizado** (não só diff de código) + accept/reject bloco-a-bloco antes de gravar. Claude Code/Cursor/Cline mostram diff de *código*; um diff **visual** da UASSA renderizada passa-os a todos.

---

## 4. Faseamento (do barato-essencial ao de-outro-mundo)

| Fase | Entrega | Custo |
|---|---|---|
| **MP3** | Relógio tz local · consolidar iframe em main · multi-page nav (address bar + sync + rotas) | 🟢 |
| **MP4.1** | Fechar o gap server-side do error-strip (escutar HMR websocket do Next) + aterrar o MP4 | 🟡 |
| **MP5.0** | `code-inspector-plugin` wired + `data-insp-path` no build dev; click-to-code (elemento → abre `file:line` no VS Code) | 🟡 |
| **MP5.1** | Select-to-edit **determinístico $0** (texto/cor/spacing via AST) + chip de modelo | 🔴 |
| **MP5.2** | Prompt inline → **CC** para edições estruturais (SEARCH/REPLACE, escopo=seleção) + visual diff before apply | 🔴 |
| **MP5.3** | **Seleção de ÁREA** (marquee → screenshot+DOM+multimodal) — o fosso | 🔴 |

Ordem defensável: **MP3 + MP4.1 primeiro** (confiança, barato), **MP5.0** (click-to-code, fosso barato), depois **MP5.1→MP5.3** (o Live Edit completo).

---

## 5. Masterprompts

### 5.1 · ⇄ COWORK→CC · MP3 Fixes (relógio + iframe + multi-page nav)
```
Worktree ../frugal-mp3 from main. Sonnet.
DO:
1. Fix relógio: em packages/vscode-extension/src/live-preview-view.js, a função clock(ts)
   passa a usar new Date(ts).toLocaleTimeString(undefined,{hour12:false}); n/d honesto se
   ts inválido. Aplica a todos os timestamps do Director's Cut. Teste unitário: tz local != UTC.
2. Confirma onde vive o <iframe src=localhost:PORT> (parece no WIP da lp-diag). Consolida em
   main de forma limpa: CSP frame-src http://localhost:* (dev), X-Frame-Options só-dev.
3. Multi-page nav: barra de endereço funcional (Enter navega o iframe) + sync via lp-nav
   {path} do tap (popstate) + dropdown de rotas lendo landing/app/**/page.tsx.
GUARD: classify.js FROZEN (sha 427d8c0b…) · honest-copy · sem push sem OK · PT-PT · selective add.
GATE: relógio mostra hora local · iframe reproduzível de main · navego entre rotas e vejo todas
as abas do site · testes verdes · sha intacta.
```

### 5.2 · ⇄ COWORK→CC · MP5.0+MP5.1 · Click-to-code + Select-to-edit determinístico $0
```
Worktree ../frugal-liveedit from main (depois de MP3). Arquitectura Opus, código Sonnet.
Lê _handoff/LIVE_EDIT_MP5_SPEC.md §3.
DO:
1. Wire code-inspector-plugin em turbopack.rules (Next ≥15.3), DEV-ONLY → data-insp-path.
   (Ou transform próprio data-mooter-src se preferires zero-dep — decide e documenta.)
2. Estende o lp-error-tap.ts (o agente dev-only já injetado) com modo "select": hover-highlight
   (capture:true, elementFromPoint, shadow DOM, pointer-events:none), click → closest(
   '[data-insp-path]') → postMessage {type:'lp-select', file, line, col, rect} origin-locked.
3. Host: recebe lp-select, valida origin==localhost:PORT, botão "abrir no editor" (showTextDocument
   file:line) = click-to-code.
4. Edit determinístico $0: painel inline com texto/cor/spacing/classe → o host aplica via AST
   (Babel parse + recast reimprime, muta só o nó por data-insp-path) → grava → HMR. ZERO LLM.
5. Chip de modelo: mostra o tier que o classify.js atribui a esta edição (override manual).
GUARD: classify.js FROZEN · edits determinísticos NÃO tocam LLM · rollback atómico · honest cost ·
sem push sem OK · code-inspector só em dev (dead-code em prod). GATE: clico num elemento → abre o
file:line certo; mudo uma cor → patch AST $0 sem tokens, HMR mostra; chip diz "local $0".
```

### 5.3 · MP5.2+MP5.3 (estrutural + área) — só depois do MP5.1 provado
Prompt inline → CC com SEARCH/REPLACE escopado à seleção + visual diff before apply (MP5.2);
marquee de área → getBoundingClientRect AABB sobre [data-insp-path] + screenshot CDP recortado →
multimodal (MP5.3). Detalhe no §3.3/§3.5/§3.6.

---

## 6. Guard / Anti-scope
- ❌ Não fiber-walking (React 19 matou `_debugSource`) — só `data-*` compilado.
- ❌ Não WebContainers (Onlook usa cloud sandbox — nós somos local-first, é a vantagem).
- ❌ Não promover à feature-estrela antes do MP3/MP4.1 (confiança primeiro).
- 🔒 `classify.js` FROZEN · edits determinísticos $0 nunca tocam LLM · rollback atómico · honest-copy no chip de custo · code-inspector dev-only (nunca em prod) · sem merge/push sem OK do Paulo.
- 🎯 Dogfood no próprio `mooter.ai` (landing).

## 7. Fontes (seleção)
code-inspector-plugin (`data-insp-path`, wiring Next 15.3) · React 19 removeu `_debugSource` (facebook/react#32574) · Onlook architecture (Penpal + OID + AST class-rewrite) · Lovable Visual Edits (AST $0) · Aider SEARCH/REPLACE + unified-diff · elementsFromPoint / getBoundingClientRect AABB · Replit Cartographer (component→file:line) · Vibe Annotations (zoned screenshot + batch) · v0 Design Mode (before/after) · CDP captureScreenshot clip. URLs completos nos handoffs de pesquisa desta sessão.
```
