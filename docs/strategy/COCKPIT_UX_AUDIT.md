# Cockpit UX/UI Audit — Fase A (read-only)

> Branch `wave/cockpit-ux-audit` · 2026-06-27 · auditoria do `packages/vscode-extension` (extension.js
> webview + `row-renderer.js` + `host-extra.js` + `mode-registry.js` + `cowork-waiting.js`).
> **Read-only**: nenhum controlo foi corrigido nesta fase. As correcções vivem na Fase B (commits atómicos).

## Método

Para **cada** controlo do cockpit foram respondidas 5 perguntas:

1. **Handler?** — existe um `m.cmd` no `onDidReceiveMessage` (ou wiring puro no webview) que o serve?
2. **Faz o que o rótulo diz?** — o efeito real corresponde ao texto/ícone?
3. **Feedback imediato (<150ms percebido)?** — ou há um estado "a processar"?
4. **Onde está o feedback?** — no painel (junto ao controlo) ou só na status-bar?
5. **Acessível?** — aria/role/focus-visible/contraste.

Severidade: 🔴 bloqueante (controlo morto ou desonesto) · 🟡 fricção (lento / feedback fraco / nit) · 🟢 ok.

---

## Inventário de controlos

### Cabeçalho / globais

| # | Controlo | Handler | Faz o que diz? | Feedback <150ms | Onde | A11y | Sev |
|---|---|---|---|---|---|---|---|
| 1 | `modeBadge` (Moo/Lazy/Crazy) | `mode` → `setMode`+refresh | sim | **não** — texto só muda após refresh round-trip | status-bar | role=button, Enter/Space, tabindex | 🟡 |
| 2 | `scoreBadge` → tab | webview `goTab` | sim | sim | — | — | 🟢 |
| 3 | intent ask (`intentGo`) | `intent` → postMessage | sim | sim ("🐮 thinking…") | painel | input focável | 🟢 |
| 4 | Tabs (5) | webview `goTab` | sim | sim | — | role=tablist/tab, setas, Home/End | 🟢 |
| 5 | pin-next selector | `pinNext` → `writePinNext`+refresh | sim | parcial — `<select>` muda nativo; estado pin só pós-refresh | status-bar | `:focus-visible` | 🟡 |
| 6 | budget input | `budget` → `writeBudget`+refresh | sim | **não** | status-bar | input number | 🟡 |
| 7 | effort control | `effort` → `effortSet`+refresh | sim | **não** | status-bar | — | 🟡 |
| 8 | ledger scope (session/all) | webview `wireLedgerToggle` | sim | sim (re-render local) | painel | role=button, Enter/Space | 🟢 |
| 9 | collapse de secções (`data-collap`) | webview, persistido | sim | sim | painel | role=button, tabindex, Enter/Space | 🟢 |
| 10 | rate stars (feedback Pastor) | `rate` → `rateSpan` | sim | **não** (só status-bar) | status-bar | spans clicáveis | 🟡 |

### Por-sessão (drawer `renderRow`)

| # | Controlo | Handler | Faz o que diz? | Feedback <150ms | Onde | A11y | Sev |
|---|---|---|---|---|---|---|---|
| 11 | mode segmentado 💤🐮⚡ | `setMode` → `MR.set`+refresh | sim | **não** — `.on` só salta após refresh | — | role=toolbar, title | 🟡 |
| 12 | model `<select>` | `setModel` → `MR.set`+refresh | sim | parcial — select nativo muda; persistência pós-refresh | — | title | 🟡 |
| 13 | auto toggle | `setAuto` → `MR.set`+refresh | sim | **não** | — | title | 🟡 |
| 14 | loop toggle 🔁 | `setLoop` → `MR.setLoop`+refresh | sim (degradação honesta "armado") | **não** (o `.on` só após refresh; status-bar tem texto) | status-bar | `:focus-visible`, aria-label | 🟡 |
| 15 | slash picker ⌘ | `pickSlash` → clipboard+`setNextSlash` | **sim e honesto** (copia, não finge injectar) | sim (status-bar imediata) | status-bar + chip `next ▶` | aria-label | 🟢 |
| 16 | **chip Notion** | **NENHUM** | **NÃO — span `role=img`, parece clicável, não faz nada** | — | — | role=img | **🔴** |
| 17 | **chip Obsidian** | **NENHUM** | **NÃO — span `role=img`, morto** | — | — | role=img | **🔴** |
| 18 | chip worktree ⌥ | — (informativo) | sim (só info, title) | n/a | — | title | 🟢 |
| 19 | ↺ refresh integrations | `refreshIntegrations` → `MR.touchSync` | **NÃO honesto** — só carimba timestamp; toast diz "integrations refreshed" (implica sync real) | sim (status-bar) | aria-label, `:focus-visible` | 🟡 |
| 20 | archive ✕ | `archiveSession` → `MR.archive`+refresh | sim (reversível) | parcial (status-bar; linha some no refresh) | status-bar | aria-label, `:focus-visible` | 🟢 |
| 21 | Commit & Push ⎇ | `gitFlow` (host-side completo) | **sim, exemplar** (preview→sha-guard→commit selectivo→push gated, nunca `add -A`/`--force`) | sim (modal imediato) | aria-label, `:focus-visible` | 🟢 |
| 22 | Handoff ⇄ | `handoff` → painel inline + clipboard + stream | sim | **sim** (painel 'ready' + copiado antes de qualquer await LLM) | painel inline + status-bar | aria-label | 🟢 |
| 23 | 📋 Copiar (handoff) | `hoffCopy` | sim | sim (label "✓ Copiado" instantâneo) | painel + status-bar | aria-label | 🟢 |
| 24 | row click → abrir sessão | `openSession` | sim | sim | — | role=button, tabindex | 🟢 |

### Group header + cockpit-level

| # | Controlo | Handler | Faz o que diz? | Feedback | Sev |
|---|---|---|---|---|---|
| 25 | Handoff do projecto ⇄ | `projHandoff` → board inline | sim | painel inline + clipboard | 🟢 |
| 26 | group collapse | webview | sim | sim | 🟢 |
| 27 | 🧹 clear done | `clearDoneSessions` → bulk archive | sim (conjunto seguro) | status-bar | 🟢 |
| 28 | All sessions row | `selectSession('all')` | sim | sim | 🟢 |

---

## Auditoria do que foi shipado (regressão / honestidade)

| Feature | Estado | Veredicto |
|---|---|---|
| **Live Context Accumulator** (journal + rolling summary) | leitores `readRollingSummary`/`readJournalLast` correctos; usados **só** dentro do texto do handoff | **honesto, sem regressão.** Lacuna: o estado do moo local **não é visível por-sessão** fora do handoff → **B4** |
| **Handoff v3 (factos)** `gitSnapshot`/`vaultFreshness`/`deltaTurns` | computados uma vez, partilhados entre esqueleto e enriquecido | 🟢 honesto, sem duplo `git read` |
| **F1 — espelho do título Cowork** | `coworkTitle` lidera o nome; cai para 1º prompt; proveniência preservada como subline+tooltip; `null` salvo se o produtor escreveu | 🟢 honesto (não fabrica) |
| **F2 — streaming do handoff** | chunks `handoff-stream` → painel ao vivo; fallback `composeHandoff`; `handoff-done` dispara **sempre** | 🟢 nunca fica preso em "a gerar" |
| **F4 — `generateProjectHandoff`** | DUP/active/AMBIENTE honestos; **mas** linha `NEXT FOR COWORK` é **incondicional** (diz "resolver DUP · commit · push" mesmo com 0/0/sem-DUP) e o total ambiente aparece **2×** (na OVERALL e na linha AMBIENTE) | 🟡 **B5** |

---

## Backlog priorizado (entra na Fase B)

### 🔴 ALTA — controlos mortos / desonestos

- **B2 · Integrações Notion/Obsidian reais (#16, #17, #19).** Hoje os chips Notion/Obsidian são `span role=img`
  sem handler — parecem accionáveis e não fazem nada. O ↺ só carimba `touchSync` (timestamp local) mas o toast
  diz "integrations refreshed" (implica sync). **Não existe bus de sync real** (confirmado: `touchSync` só faz
  `set(sid,{<field>SyncedAt})`; nenhum writer popula `notionPageId`/`obsidianPath` no código). Fix honesto:
  - chip Notion clicável → `openUrl` para a página **se** `notionPageId`/URL existir; senão informativo (sem fingir).
  - chip Obsidian clicável → abre o ficheiro **se** `obsidianPath` existir (`openFile` host-side); senão informativo.
  - ↺ → rótulo honesto **"marcar visto"** (é o que faz). Zero controlo morto, zero sync falso.

### 🟡 ALTA — velocidade percebida

- **B1 · Feedback óptimista nos toggles (#1, #5, #7, #11, #12, #13, #14).** `setMode`/`setModel`/`setAuto`/
  `setLoop`/`effort`/`mode`(badge) aplicam `MR.set`+`refresh(true)` — o estado visual só muda quando o snapshot
  volta. Clicar parece morto. Fix: o webview aplica o novo estado **já** (óptimista: `.on` salta no clique) +
  micro-indicador "a aplicar…" se demorar; o refresh reconcilia. Feedback **no painel**, não só status-bar.

### 🟡 ALTA — densidade

- **B3 · Declutter (#27 e board).** Com 20+ sessões o board não cabe nem hierarquiza. Fix: colapsar idle/done por
  defeito (expansível), agrupar por estado (🟡 needs-you / 🟢 active / ✅ idle), filtro/procura rápido, modo
  compacto vs detalhado. Manter archive/clearDone. O que precisa de ti no topo.

### 🟡 MÉDIA-ALTA — observabilidade do moo local

- **B4 · Vista viva por-sessão do moo local.** Sub-vista expansível: último `<sid>.summary.txt` + nº entradas do
  journal + "a actualizar…" (honesto: journalN > rollup.turns) e, no Handoff, o streaming ao vivo (reusa F2).
  Read-only, $0, nunca bloqueia; sem dados → "sem actividade local ainda".

### 🟡 BAIXA — nits do F4

- **B5 · `generateProjectHandoff`.** `NEXT FOR COWORK` condicional às flags (não dizer "resolver DUP/commit/push"
  com 0/0/sem-DUP); **AMBIENTE sem duplicar** (o total ambiente aparece na OVERALL **e** na linha dedicada).

### Notas menores (fora de scope imediato; registadas)

- #6 budget, #10 rate stars: feedback só na status-bar (mesmo padrão do B1 — beneficiariam do mesmo tratamento óptimista; não bloqueante).
- #20 archive: a linha desaparece só no refresh seguinte; um fade óptimista seria mais suave (nice-to-have).

---

## Invariantes a preservar na Fase B

- `classify.js` **FROZEN** (sha `427d8c0b…364bc48f`) — não tocar.
- `renderRow`/`renderGroupHeader` **concat-only** (sem template-literals — a fonte é embebida no webview via
  `fn.toString()`; `webview-syntax.test.js` evalua o getHtml() real).
- Não partir: painel inline do handoff, handoff v3/streaming (F2), espelho Cowork (F1), hooks do acumulador (só LÊ).
- `git add` selectivo; commits atómicos; sem push.
