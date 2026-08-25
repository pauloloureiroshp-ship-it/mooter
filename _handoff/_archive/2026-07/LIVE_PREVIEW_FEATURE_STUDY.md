# Live Preview — Estudo de Paridade & Roadmap (Mooter vs Lovable/Bolt/v0/Replit)

> **Objetivo:** garantir que o Mooter · Live Preview atinge (e ultrapassa) o nível de features + UX/UI do
> preview das ferramentas de vibe coding, sem trair o objetivo do Mooter (local-first, $0, honest-copy).
> **Base:** pesquisa competitiva 2025-2026 (3 frentes, ~35 fontes) + estado real do MP2 já construído.
> **Data:** 2026-07-04. **Séries irmãs:** `LIVE_PREVIEW_SUPER_MASTERPROMPT.md` · `LIVE_PREVIEW_HOTRELOAD_TEST.md`.

---

## 0. Veredicto em 6 linhas

1. O preview-iframe é **commodity** (a Microsoft dá grátis). Não é aí que se ganha.
2. As queixas nº1 da indústria são todas de **confiança**: *preview stale*, *blank screen sem explicação*, *"o preview mente" (≠ deploy)*, *não vejo os erros no painel*, *o agente adivinha e queima créditos*.
3. O Mooter tem **três fossos estruturais** que atacam essas queixas de raiz — e que os hosted **não podem copiar** sem terem primeiro um router local e telemetria $0: **(A) preview fiel** (dev server real, não WebContainer/sandbox), **(B) click-to-code real** (elemento → ficheiro:linha no VS Code), **(C) edições determinísticas $0** (sem round-trip ao LLM).
4. Paridade table-stakes que ainda falta: **device toggle, error/console strip in-panel, state-preserving reload, open-in-new-tab, click-to-edit**.
5. O "de outro mundo" alinhado ao Mooter: **o loop agent-watches-preview mas LOCAL e $0** — um moo local navega o preview, apanha o erro, alimenta o CC e auto-cura, tudo auditável no Director's Cut. É o benchmark do Replit Agent 3 **sem a fatura**.
6. Anti-scope: não competir na robustez do iframe genérico, não WebContainers, não virar host de deploy.

---

## 1. O que o Mooter · Live Preview JÁ tem (MP2 — baseline provado 2026-07-04)

| Capacidade | Estado |
|---|---|
| Iframe do **dev server local real** (`localhost:7819`) | ✅ — já é o **fosso #A (preview fiel)** por construção |
| Detetor de porta em cascata (`probe · porta ativa`) | ✅ honesto (degraded/stale explícitos) |
| Hot-reload (Next Fast Refresh) | ✅ provado (`Got a Moo? → LIVE` ao vivo) |
| Override manual de URL + re-detect | ✅ |
| **Brain** — routing/tier/custo $0 ao vivo da sessão | ✅ **único** (nenhum concorrente tem) |
| **Director's Cut** — eventos das sessões de agentes | ✅ **único** |
| CSP `frame-src http://localhost:*` + `X-Frame-Options` dev-only | ✅ |

O MP2 já resolve, de graça, a queixa mais grave do mercado (**"o preview mente"**): como o iframe aponta ao **dev server real**, o que vês É o que corre. Lidera com isto.

---

## 2. Inventário competitivo por capacidade (o que eles entregam)

### 2.1 Edição visual & inspeção
- **Select-to-edit (click elemento → instrução → LLM reescreve):** todos têm. Lovable "Select elements", Bolt "Select", v0 select icon, Replit Element Selector, Cursor/Windsurf. **Queixa estrutural: queima créditos/tokens** (um caso $20→$340/mês). Cada tweak que passa pelo LLM é imposto de custo+latência.
- **Property panel determinístico (SEM LLM, $0):** o diferenciador de valor. **v0 "Design Mode"** é o mais completo (tipografia, cor texto/fundo, margin/padding por lado, border, opacity, radius, shadow, texto — patch imediato, zero tokens). Replit Visual Editor (texto/cor/spacing direto sem créditos). Lovable inline text (100/dia grátis). **Elogiado precisamente por evitar credit-burn.**
- **Click-to-code (elemento → ficheiro:linha):** **ponto fraco em TODOS os hosted** — abstraem o código. Cursor tem inspect mas "click-to-source" é *feature request* aberto. **← É exatamente o fosso #B que um plugin VS Code local-first domina.**
- **Toggles edit/preview:** Lovable 4 modos (Annotate/Select/Edit text/Comment), v0 Design Mode switch.
- **Drag/drop in-canvas:** Replit Canvas, Cursor "drag elements" — nicho, gripes de UX ("weird things all over the screen").

### 2.2 Viewport / device
- **Device toggle:** Lovable (desktop/tablet/mobile — mas default desktop, bugs mobile passam despercebidos), **Bolt** (frames reais iPhone/Pixel/Galaxy + escala fluida — o mais granular), v0 "responsive by default" (propriedade do código, não do preview), Replit fraco. **Table-stakes que o Mooter não tem.**

### 2.3 Diagnóstico (erros / console / rede)
- **Error overlay + auto-fix:** Lovable "Try to Fix" (~60% em casos simples, **queima créditos, error loops**), Bolt auto-deteta erros de build no chat (mas **falha runtime/white-screen**), Replit Agent 3 self-test autónomo.
- **Console + rede in-panel:** **ninguém entrega DevTools-grade no preview.** Todos caem no browser real (copy-paste da consola → chat). **← GAP da indústria = diferenciador claro.**
- **Runtime error → agente (loop fechado):** **Replit Agent 3** é o benchmark — browser preview com cursor visível a clicar, testa botões/forms/APIs, auto-cura, ~$0.20/sessão, decide quando testar. Caça "Potemkin interfaces".

### 2.4 Partilha / publicação
- Lovable Publish (`*.lovable.app`, modelo *snapshot* — confunde: "porque não está live?"), Bolt deploy Netlify (env-vars não migram → "funciona no preview, crasha live"), **v0** deploy Vercel + **Git panel** (branch-por-chat, PRs, deploy-on-merge — o pipeline mais "real"). **Nota:** partilha é onde o local-first tem menos vantagem natural (precisa de túnel); baixa prioridade.

### 2.5 Screenshot / captura
- **v0** upload screenshot → gera UI (~72% fidelidade; perde animações/spacing). **Screen-record/GIF do preview: ninguém nativo** (gap pequeno).

### 2.6 Navegação / chrome do preview
- URL bar + back/forward/refresh + open-in-new-tab + full-screen: **sub-enfatizado em todos** (implícito via app a correr). Pages dropdown (Lovable). Open-in-new-tab é a "válvula de escape" para a DevTools real.

---

## 3. Padrões de UX/UI a respeitar (o consenso do mercado)

- **Layout triptico split-pane:** chat à esquerda, toggle **Code | Preview** à direita, **preview é o objeto primário**, código secundário.
- **Thin toolbar acima do preview:** refresh · open-in-tab · URL/path · **device toggle**.
- **Preview como superfície de input, não só output:** erros, elementos e screenshots **fluem de volta** ao chat/agente como contexto anexável.
- **Hot-reload que preserva estado:** a dor real é **perder route/scroll/estado no reload** (Lovable teve de corrigir "refresh muda o path" + "loops de redirect"). Preservar estado é onde os WebContainer-based tropeçam.
- **Discoverability:** o botão do preview do Mooter é hoje um **ícone minúsculo** — o Paulo não o achou. Tem de ser proeminente (é o cartão de visita).

---

## 4. Matriz de paridade (feature × mercado × Mooter × prioridade)

Legenda custo: 🟢 barato · 🟡 médio · 🔴 caro. Prioridade: P0 table-stakes · P1 fosso · P2 wow · P3 opcional.

| Feature | Quem tem | Mooter | Prio | Custo | Nota |
|---|---|---|---|---|---|
| Preview do dev server real (fiel) | — (todos usam sandbox) | ✅ | — | — | **fosso #A, já ganho** |
| Hot-reload | todos | ✅ | — | 🟢 | provado |
| Brain (routing/custo $0 live) | ninguém | ✅ | — | — | **único** |
| Director's Cut (agentes a construir) | ninguém | ✅ | — | — | **único** |
| **Device/responsive toggle** | Lovable/Bolt | ❌ | **P0** | 🟢 | frames + escala (estilo Bolt) |
| **Open-in-new-tab / full-screen** | todos | ❌ | **P0** | 🟢 | válvula p/ DevTools real |
| **Error/console strip in-panel** (auto-captura blank screen) | ~ninguém | ❌ | **P0** | 🟡 | mata queixa nº2; **gap da indústria** |
| **State-preserving reload** (route+scroll) | ~ninguém bem | parcial | **P0** | 🟡 | iframe persistente já ajuda |
| **Click-to-edit** (elemento → anexa à sessão CC) | Lovable/Bolt | ❌ | **P1** | 🟡 | reusar `code-inspector-plugin` (MIT) |
| **Click-to-code** (elemento → ficheiro:linha no VS Code) | ~ninguém (feature-req) | ❌ | **P1** | 🟡 | **fosso #B** — só o local-first faz |
| **Property panel determinístico $0** (texto/cor/spacing/radius) | v0/Replit | ❌ | **P1** | 🔴 | **fosso #C** — anti-credit-burn, alinha doctrine |
| Screenshot / record do preview | v0 (clone) | ❌ | P2 | 🟡 | record é gap de mercado |
| **Agent-watches-preview LOCAL $0** (self-test+heal) | Replit (pago) | ❌ | **P2** | 🔴 | **o "de outro mundo"** — ver §6 |
| Share/publish (túnel) | Lovable/Bolt/v0 | ❌ | P3 | 🔴 | fraca vantagem local; adiar |
| Multiplayer preview + comments | Lovable | ❌ | P3 | 🔴 | fora do foco solo-founder |

---

## 5. Roadmap priorizado (MP3 → MP7)

**MP3 — Chrome & Viewport (P0, 🟢, ~table-stakes).** Toolbar decente e descoberta: botão do preview proeminente; **device toggle** (desktop/tablet/mobile + escala, estilo Bolt); **open-in-new-tab / full-screen**; refresh explícito; URL/path bar polida. *Gate: eyeball mobile num clique; abrir no browser real num clique.*

**MP4 — Diagnóstico honesto in-panel (P0, 🟡, o maior salto de confiança).** **Error/console strip** que auto-captura o runtime error (mata o blank-screen), com "enviar à sessão CC" num clique; distinguir build-error vs runtime; **state-preserving reload** (preserva route+scroll — o iframe persistente do MP2 já é a fundação). *Gate: partes o site → o painel diz-te o quê e onde, sem abrir DevTools.*

**MP5 — Click-to-code + Click-to-edit (P1, 🟡, fosso #B).** Reusar `code-inspector-plugin` (MIT): clicar num elemento do preview → **abre o ficheiro:linha real no VS Code** (o que nenhum hosted faz) e/ou **anexa o elemento à sessão CC** como contexto. *Gate: clico no hero → o `page.tsx` abre na linha certa.*

**MP6 — Property panel determinístico $0 (P1, 🔴, fosso #C).** Escopo v0-Design-Mode/Replit: texto, cor, spacing, radius, shadow — **patch direto ao source, zero LLM**. É a materialização visual da doctrine "$0 quando não precisa de cloud". *Gate: mudo uma cor sem gastar 1 token; o Director's Cut mostra "edit determinístico $0".*

**MP7 — Moo Guardião do Preview (P2, 🔴, o WOW).** Ver §6.

Ordem defensável: **MP3+MP4 primeiro** (confiança = a queixa nº1 do mercado, e barato), depois **MP5** (fosso barato-médio e muito "local-first"), depois **MP6/MP7** (caros, diferenciação máxima).

---

## 6. O "de outro mundo" — Moo Guardião do Preview (MP7)

O benchmark de 2026 é o **Replit Agent 3**: um agente que **vê e testa o seu próprio preview** (cursor visível a clicar, apanha erros, auto-cura). O mercado inteiro está a mover-se de *"shoulder-surfing o preview"* para *"confiar no loop"* (o agente verifica-se a si próprio). **Mas o Replit cobra por isso** (~$0.20/sessão, e a queixa é o credit-burn dos loops).

O Mooter pode entregar **o mesmo loop, local e $0**, e é o único que pode:

1. Um **moo local** (qwen na 4090) navega o preview real (click-through de botões/forms), apanha o **runtime error** do error-strip (MP4).
2. Alimenta o erro + o `file:line` (MP5) à sessão CC — **self-heal** — com **gate humano** no irreversível.
3. Tudo **auditável no Director's Cut** e **medido no Brain** ($0 local vs o que custaria no cloud).
4. Honest-copy: se o moo não conseguiu, diz "não curei — vê aqui"; nunca finge (ataca directamente a queixa "o agente diz que corrigiu e não corrigiu").

Isto funde os três fossos (preview fiel + click-to-code + $0) com o benchmark do mercado, **sem a fatura** — e é impossível de copiar sem ter primeiro o router local e a telemetria $0 que só o Mooter tem. É a resposta à pergunta de 2026: *"que ferramenta encurta a distância entre output da IA e output em que confias?"*

---

## 7. Anti-scope (o que NÃO fazer — poupar foco)

- ❌ Competir na robustez do iframe genérico (a Microsoft tem equipas; é poço sem fundo).
- ❌ WebContainers / sandbox no browser (é a fraqueza deles; a tua força é o dev server real).
- ❌ Virar host de deploy/publish (não é o negócio; túnel/share é P3).
- ❌ Multiplayer/colaboração (fora do foco solo-founder por agora).
- ❌ Promover o preview a feature-estrela: é o **megafone** da proposta local-first, não o core (router+economia).

---

## 8. Fontes (seleção)
Lovable Visual Edits/Preview Toolbar/Publish/Troubleshooting · Bolt device-preview/inspector/Netlify/tokens · v0 Design Mode/Deployments/Screenshots/"preview≠deploy" (Vercel Community) · Replit Agent 3 self-testing/Element Editor/Canvas/"round in circles" · Cursor Browser visual-editor + click-to-source feature-request · Anthropic 2026 Agentic Coding Trends. (URLs completos nos handoffs de pesquisa desta sessão.)
