# ⇄ HANDOFF Cowork→Cowork · Director's Cut v2 — do feed ao cockpit vivo do vibe coder

> **Para quê:** o Director's Cut ficou bom (feed vivo honesto), mas o Paulo quer o salto: breakdown
> por dia · por LLM/operação · por Fleet em paralelo · animações de trabalho · auto-journal local ·
> comunicação cruzada perfeita · UX/UI de topo. **Tudo sem quebrar nada e em harmonia com o resto
> do plugin VS Code do Mooter.** Este handoff é o desenho + masterprompt faseado. Nasce de auditoria
> do código real (2026-07-08) — cada fonte de dados existe; a magia é cruzá-las e mostrá-las.
> **Régra de ouro do Mooter que atravessa tudo:** *honestidade primeiro — todo campo nullable,
> ausente → n/d, NUNCA fabricar.* Qualquer melhoria que minta parte o produto.

## 0. Boot (ler antes de tocar)
- Paulo: founder pós-exit, não-dev, sabbatical técnica. **PT-PT** ("ficheiro/ecrã/actualizar"), "tu",
  founder-pragmatic, tabelas>prosa, marcadores ✅🔜🟡⚠️❌🔥. Nunca hype vazio, nunca inventar números.
- Vault `~/Documents/paulo-vault` (Johnny-Decimal). Repo `~/frugal` (⚠️ pode estar em `wave/honest-controls`,
  não `main` — confirmar nativo antes de construir). Invariantes CI: `classify.js` sha frozen, packages
  frozen, sem `.md` novos na raiz, PT-PT chat/EN código, sem push/merge sem OK do Paulo.

## 1. A visão — Director's Cut passa de "stream" a "cockpit de 4 lentes + magia viva"
Hoje: um feed flat, session-scoped, do file-bus. Amanhã: um cockpit com **lentes** (Stream · Dia ·
LLM · Fleet), **animações de trabalho** (o 🐮 a editar/tarefar ao vivo), e **auto-journal local $0**
que torna cada sessão auditável e o handoff perfeito. É o "director's cut" de quem construiu — quem
trabalhou, em quê, com que modelo, quanto custou, e a beleza de ver acontecer.

## 2. As 7 melhorias pedidas (cada uma mapeada à sua fonte REAL — §4)
1. **Breakdown por dias** — buckets por `ts`/`ts_ms` (dado existe, bucketing ausente).
2. **Breakdown por LLM × operação** — `execution.log` (model por Bash) + `decisions.log` (recommended_model).
3. **Breakdown por Fleet em paralelo** — `_handoff/fleet/fleet-heartbeat.json` (running[]) + STATE.json/pilar.
4. **Animações de trabalho** (edit/task/agente/…) — CSS inline, respeitando prefers-reduced-motion.
5. **Auto-journal via LLM local** — reinstaurar o writer qwen (`handoff-rollup.js`) já esperado pelo hook.
6. **Comunicação cruzada perfeita** — a lente cruza bus+decisions+execution+fleet+journal numa vista honesta.
7. **UX/UI de topo com as melhores skills** — design-critique + a11y + ux-writing + design-system (§7).

## 3. Constrangimentos DUROS do webview (quebrar = partir o plugin — NÃO negociável)
`packages/vscode-extension/src/live-preview-view.js` é um **módulo puro serializado via `fn.toString()`**:
- ❌ **SEM template literals, SEM backticks, SEM `${…}`** — só concatenação de strings (até comentários
  dentro das fns serializadas têm de ser concat-safe). É o que permite embeber no `getLivePreviewHtml`.
- ❌ **SEM `require`/Node/VSCode APIs** no módulo — todo o fs/agregação fica HOST-side em `extension.js`.
- 🔒 **CSP nonce**, `default-src 'none'`, `style-src 'unsafe-inline'` (CSS inline OK), **sem scripts
  externos, sem eval, SEM biblioteca de charting** (não há d3/recharts; a única "chart" é uma barra
  flex hand-rolled `.lpbr-mix`). Todo o visual novo = HTML+CSS inline, barras div-based.
- 🎨 **Contrato `esc()` free-var:** cada render fn nova ou usa o `esc()` do webview ou é self-contained
  com o seu próprio `esc` (padrão de `renderMissionControl`/`renderProjectCommand`).
- ♿ **prefers-reduced-motion:** já há guard global; qualquer animação nova TEM de o respeitar.
- 🩹 **Fail-soft:** módulo ausente → stub que devolve `""`. Nunca crashar o painel.
- Cores por tokens `var(--vscode-charts-*, #fallback)` / `--t0..--t5` (consistência de tema).

## 4. Fontes de dados REAIS (não reinventar — reusar estas)
| Precisas de | Fonte (file:path) | Nota honesta |
|---|---|---|
| Stream de eventos | `_handoff/live-preview/events.jsonl` via `hook-collector.js`/`parseBusJsonl` | tier/model/cost/local quase sempre **null** no bus |
| Modelo por operação | `~/.claude/hooks/execution.log` (`exec-logger.js`) — `model=` por Bash | **única** fonte ground-truth per-operation |
| Classificação/tier | `~/.claude/tools/router/decisions.log` via `data.js::readDecisions` | per-prompt: tier, recommended_model, session_id, ts. **Sem cost** |
| Custo + model-mix por turno | `gsd-turn-end.js` footer + `pricing.js::estimateTurnCost` | **estimativa tier-based (~$)**, NÃO token-exacto → rotular "~est." |
| Journal/ledger | `handoff-journal.js` (appendTurn/appendEvent/readSummary) | `kind:'decision'` carrega model/tier |
| Fleet paralelo | `_handoff/fleet/{fleet-heartbeat.json, fleet.json, <id>/STATE.json, fleet-ledger.jsonl}` | hoje `dry_run:true, running:[]` — mostrar honesto ("frota em repouso") |
| Motor LLM local | `host-extra.js::_ollamaGenerate/_ollamaGenerateStream/ollamaDoing/ollamaRecap` | keep-warm 30m; embeddings filtrados; **best-effort, nunca load-bearing** |
| Capacidade local | `tools/router/local-fleet.js` (lanes por HW) | o "🦙×N Moos locais" |

## 5. Arquitectura — Director's Cut v2 (4 lentes + animação + auto-journal)
**Padrão:** o HOST (`extension.js`) agrega tudo em `livePreviewSnapshot()` (estender, não substituir) e
passa buckets prontos ao render; as render fns (puras, concat-only, self-contained esc) só desenham.
- **Lente STREAM** (existe) — feed vivo; ADICIONAR animação de "a decorrer" (§ animação).
- **Lente DIA** (nova) — `groupByDay(events+decisions+exec)` host-side → por dia: nº edits, nº tasks,
  model-mix (barra hand-rolled), custo ~est, % local. Cabeçalho "Hoje / Ontem / <data>".
- **Lente LLM** (nova) — por modelo × operação: de `execution.log`+`decisions.log`. Barra por modelo
  (T0 local $0 · Haiku · Sonnet · Opus · Fable), contagem de operações, custo ~est, poupança vs all-Opus.
- **Lente FLEET** (nova) — swimlanes dos moos em paralelo de `fleet-heartbeat.running[]`+STATE.json:
  pilar · estado (idle/drafted/proven/gated) · round · $0 local. Se `dry_run` → banner honesto.
- **Navegação:** chips/tabs no topo do Director's Cut (padrão das outras lentes do cockpit — reusar).
- **Animação de trabalho** — quando um evento `kind:'file'|'task'` é o mais recente e a sessão está viva:
  pulso/spinner no 🐮 + realce da linha "a decorrer…"; ao chegar `Stop`/`SubagentStop` → "✓". CSS inline
  keyframes + `@media (prefers-reduced-motion)` desliga. Vocabulário vibe-coding: "a editar", "a
  tarefar", "a rotear", "a pensar (local $0)", "pronto".
- **Auto-journal local $0** — reinstaurar `tools/router/handoff-rollup.js` (o writer qwen que o
  `gsd-turn-end` já tenta spawnar detached mas está AUSENTE neste branch): resume a sessão a cada
  ≥90s/≥5 turnos para `summaryPath(sid)`; o Director's Cut lê via `readSummary` e mostra "resumo local
  · <ts>". Auditoria constante, $0, nunca no hot path.

## 6. Faseamento (5 waves aditivas, gate humano entre cada — nada de mega-wave)
- **F1 · Dados (host, read-only, invisível):** estender `livePreviewSnapshot()` com `byDay`, `byModel`,
  `fleet` agregados de decisions.log/execution.log/pricing.js/fleet JSON. Testes de agregação. Zero UI. Gate.
- **F2 · Lentes (render concat-only):** renderDayBreakdown/renderModelBreakdown/renderFleetLanes
  (self-contained esc, barras div) + tabs. Cada uma fail-soft com "sem dados ainda". Gate.
- **F3 · Animações:** keyframes inline + prefers-reduced-motion + vocabulário vibe-coding. Gate visual.
- **F4 · Auto-journal:** reinstaurar handoff-rollup.js (qwen best-effort, throttled, detached, fail-soft);
  Director's Cut mostra o resumo. Gate.
- **F5 · UX/UI polish:** design-critique + a11y WCAG 2.2 + ux-writing dos rótulos + consistência de tokens. Gate.
Cada wave: worktree própria off origin/main · classify frozen · adversarial focada · push só da branch · PÁRA.

## 7. Skills a usar (o "melhores skills abertas p/ o plugin")
- `design:design-critique` + `design:design-system-management` — desenhar as lentes coerentes com o
  cockpit e os tokens `--vscode-*`.
- `design:accessibility-review` — WCAG 2.2 AA (contraste das barras, foco, motion, target size).
- `design:ux-writing` — os rótulos honestos ("~est.", "frota em repouso", "resumo local").
⚠️ Estas skills informam o DESENHO; a implementação continua **concat-only hand-rolled** (sem libs).

## 8. Harmonização (não partir o resto do plugin)
O Director's Cut vive no mesmo webview do Live Preview + Live Edit (toolbar LP-4.9) + Brain + tabs
Cockpit/Mission Control/Project Command/Arquitectura. As lentes novas são **tabs dentro do Director's
Cut**, não tocam nas outras superfícies. `getLivePreviewHtml` serializa por `fn.toString()` — cada fn
nova segue o contrato esc/concat. O snapshot é estendido (novos campos nullable), nunca reestruturado —
os consumidores antigos continuam a ler o que liam. Fail-soft garante que uma lente sem dados não
derruba as outras.

## 9. Onde está tudo
Render: `packages/vscode-extension/src/live-preview-view.js` (Director's Cut+Brain) · host/serialização
`extension.js::getLivePreviewHtml`/`livePreviewSnapshot`/`readBusTail`. Produtores: `hook-collector.js`,
`tools/router/live-preview-tap.js` (⚠️ o tap pode não estar wired — bus vazio é estado válido, mostrar
honesto). Rich data: `gsd-turn-end.js`, `data.js`, `exec-logger.js`, `pricing.js`, `handoff-journal.js`.
Fleet: `_handoff/fleet/*`. LLM local: `host-extra.js`. Capacidade: `local-fleet.js`.

## 10. Régua de ouro
Cruzar > inventar. Honesto > bonito (n/d, ~est., frota em repouso — nunca um número fabricado). Aditivo
> reescrita (estende o snapshot e adiciona fns; não partas o que já serializa). Uma wave, um gate, uma
prova viva. E lembra: o Director's Cut é a **prova de que o Mooter não mente** — se ele fabricar um custo
ou um modelo, mata a tese toda. A magia é mostrar a verdade, linda.
