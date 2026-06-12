# Wave 58 — Day 0 Recon (Dynamic Agents + UI + TES)

> Doctrina V4 #2 (Honest > Forced): verificar cada premissa do brief contra o repo vivo
> antes de escrever código. Produzido 2026-06-12 no branch `wave58-agents-dynamic-ui`
> (fresh from `main`, v1.37.0, Wave 56 já merged). Síntese de 5 probes read-only.
> Companion: nenhum — este doc é o deliverable Phase 0. Todas as linhas de código/handlers
> citadas foram lidas pelos probes; este sintetizador reconfirmou os claims load-bearing
> (ficheiros-alvo, `cost.ts`, snapshot de preços, multiplexers, statusline wired, `claude` CLI).

## State of the world (verificado)

| Item | Check | Resultado |
|---|---|---|
| `classify.js` sha | sha256 | ✅ `427d8c0b…364bc48f` — **INTACT** (confirmado pelo orquestrador) |
| Branch base | git | ✅ `wave58-agents-dynamic-ui` = clean `origin/main` (v1.37.0, Wave 56 merged) |
| **Wave 57 (admin UI)** | `git log` / main | ⚠️ **NUNCA construída** — não está em `main`. O Wave 58 NÃO pode assumir nenhuma infra de Wave 57. |
| Plataforma | `node -e process.platform` | `win32` (MINGW64_NT-10.0-26200) — relevante para Phase E |
| Multiplexers | `command -v tmux/zellij/wezterm` | ❌ **os três AUSENTES** (exit 1) — Phase E re-scope |
| `claude` CLI | `command -v claude` | ✅ `…/AppData/Roaming/npm/claude` — transport A.17 disponível |
| 7 ficheiros-alvo `packages/router/src/` | filesystem | ✅ **todos ausentes** — slate limpo, zero conflitos |
| `tsconfig.json` em `packages/router/` | filesystem | ❌ ausente (só `tools/router` tem) |
| Pricing snapshot | `data/pricing-snapshot-2026-05-27.json` | ⚠️ só **3 cloud models** (opus-4-7, sonnet-4-6, haiku-4-5) + 7 ollama |
| Chart lib / HTML parser / PTY / ink em landing+cli+router | grep package.json | ❌ nenhum (`recharts`/`cheerio`/`jsdom`/`node-pty`/`ink` ausentes nesses três) |
| Statusline wired | `~/.claude/settings.json` | ⚠️ aponta para **`frugal/tools/router/gsd-statusline.js`** (outro repo!), não `frugal-wave56` |

## Refutations (P1–P6)

| ID | Claim (predição do brief) | Verdict | Evidence |
|---|---|---|---|
| P1 | spawn-orchestrator emite eventos hook PreToolUse/PostToolUse | **FALSE** | Grep em todo `packages/spawn-orchestrator/src/` → zero matches para `PreToolUse`/`PostToolUse`/`SubagentStop`. É um *pure subprocess spawner* (classify → worktree → bwrap sandbox → `child_process.spawn`). Os eventos hook são emitidos pelo **Claude Code**, não por este package; `post_tool_badge.js` (hook separado) intercepta-os e chama `subagent_tracker.js`. **FALSE non-alarming**: Phase E faz-se via path existente (post_tool_badge + subagent_tracker) ou polling de `listRecords()`. |
| P2 | heartbeat do worktree-conductor tem `agent_id`, `task_name`, `tokens_total`, `phase` | **PARTIAL** | Writer e schema existem e são localizáveis: `writeHeartbeat()` em `packages/worktree-conductor/src/heartbeat.ts`, schema em `types.ts:15-27` com **10 campos** (session_id, terminal_name, worktree_path, branch, intent, last_heartbeat, last_heartbeat_ms, active_locks, pending_intents, pid). **Nenhum** dos 4 campos-alvo (nem `task_category`/`phases[]`/`current_phase`/`durations`) existe. A.10 tem de **EXTENDER** o `Heartbeat` interface com campos opcionais + atualizar `writeHeartbeat()` e o reader `tools/router/sessions-status.js`. Schema confirmado real; não reutilizável as-is. |
| P3 | Wave 13 `subagent_tracker` conta done/total por workflow | **PARTIAL** | `tools/router/subagent_tracker.js` existe e É uma state machine (tmp file `mooter-herd-<session>.json`), conta **active/cumulative agents** — mas o conceito de done/total **por workflow não existe lá**. Isso vive separado em `~/.mooter/workflows/active-run.json` (Wave 28 `ActiveRunSnapshot`, `agents_done/agents_total`), lido por `packages/sessions-orchestrator/src/workflow-chip.ts:readActiveWorkflow()`. Dois sistemas independentes. A.1 deve reutilizar `progressDots()` + `WorkflowProgress`. |
| P4 | Wave 14 `token_tracker` tem breakdown per-agent | **PARTIAL** | `tools/router/token_tracker.js` existe e captura tokens reais, mas o breakdown é **per-TIER** (T0/T1/T2/T3), NÃO per-agent. `trackSubagentTranscript()` (L136) usa `agentId` só para dedup (`_subagent_done`) e funde tokens nos buckets de tier, descartando a identidade do agente. Snapshot é `{T0,T1,T2,T3}` com `{calls,tokens_in,tokens_out}` — sem `agent_name`. Phase C precisa de novo bucket `_by_agent` ou log paralelo (additivo, não rewrite). |
| P5 | integração tmux via `tmux send-keys` API | **FALSE (re-scope trigger)** | tmux, zellij e wezterm **todos ausentes** nesta máquina Windows (`command -v` → exit 1; reconfirmado). Zero matches para tmux/send-keys/pty/pseudo-terminal em todo o repo. `vram_detect.js:47` mostra o padrão Win32-null estabelecido. **Phase E como "tmux send-keys" é inviável neste box**; o único fallback é `child_process.spawn` com `stdio:'pipe'` (sem capacidade PTY). `node-pty` exigiria native addon não presente. |
| P6 | Wave 55 `agent-focus-status` chip mostra o agente corrente | **TRUE** | `tools/router/agent-focus-status.js` (Wave 53 B.3) existe e é testado (`agent-focus-status.test.js`). Lê `subagent_tracker.snapshot().active`, renderiza o agente active mais antigo como `🤖 <name> [+N] (<model_or_tier>, <dur>)` (ex.: `🤖 model-reasoner (sonnet, 8s)`). **Mas** NÃO mostra tokens nem custo — essa augmentação é scope Wave 58 (C). |

**Veredicto global (regra ">=3/6 FALSE → re-scope as fases afetadas"):**
Contagem estrita: **2 FALSE (P1, P5), 3 PARTIAL (P2, P3, P4), 1 TRUE (P6)** — abaixo do gatilho de 3 FALSE.
Interpretação sensata do brief: os PARTIAL **confirmam infra parcial presente** (heartbeat writer, subagent_tracker, token_tracker existem; só faltam campos/dimensões a adicionar — net-new aditivo, não surpresa). P1 FALSE é non-alarming (path existente serve). **Apenas P5 é um re-scope-trigger verdadeiro**: infra assumida-presente (multiplexer) é absent E a Phase E como desenhada não procede em Windows. Logo: **re-scope cirúrgico da Phase E**, restante PROCEED.

## Wave 57 finding (premissa do brief refutada)

O brief de Wave 58 pode assumir que a "admin UI" de Wave 57 já existe. **NÃO existe.** Wave 57 nunca
foi construída e não está em `main` (confirmado pelo orquestrador). Em `main` (Wave 56) o que existe é a
**admin data layer** (hub `/v1/admin/*` + migração 019 + `audit_admin_views` na D1) e o painel admin do
**landing** (`landing/app/(app)/admin/page.tsx`, 5 tabs, Wave 6.5) com gate por email allowlist
(`paulo.loureiro.shp@gmail.com`). Qualquer feature de Wave 58 que dependa de UI admin construída em Wave 57
tem de a **construir net-new** ou apontar para o que Wave 56 deixou. Isto afeta A.13 (MatrixPanel admin-only):
o gate admin existe (email hardcoded client-side em `layout.tsx:10` + rotas `/api/admin/*` com auth server-side),
mas nenhum widget de matrix foi pré-construído.

## Allowlist plan (CLAUDE.md) — e se o CI realmente gateia

**O "Update CLAUDE.md allowlist FIRST" do brief é um *process gate editorial*, NÃO um requisito de CI.**
O único hash-check de CI é para `tools/router/classify.js` (`.github/workflows/test.yml` L74-90: lê
`classify.js.sha256`, corre `sha256sum`, exit 1 em mismatch). **Não existe** workflow que faça checksum de
`packages/router/src/*.ts` nem que bloqueie modificações a `packages/*`. A "freeze" de `CLAUDE.md` L16-17 é
**convenção documental**. O que adicionar 7 `.ts` novos a `packages/router/src/` dispara é o `security.yml`
(`npm audit`, HIGH-blocking), **não** um freeze gate. (`install-reliability.yml` só dispara se mudar
`packages/cli/**` ou `packages/router/src/classify_domain.ts` especificamente — adicionar ficheiros novos não
o triggera.)

**Edit exacto a aplicar em `CLAUDE.md` ANTES de criar qualquer ficheiro** (substituir L16-17):

```
- **Frozen engine packages**: `packages/*` shipped in waves 28-34.5 stay untouched unless the
  current wave brief explicitly allowlists specific files.
  Wave 58 allowlisted additions to `packages/router/src/`:
  `specialization-matrix.ts`, `decide-agent.ts`, `task-categories.ts`,
  `adaptive-learner.ts`, `tes-calculator.ts`, `benchmark-fetcher.ts`, `fable-5-routing.ts`.
```

Os 7 ficheiros estão **todos ausentes** (reconfirmado) → slate limpo, sem conflitos. O edit sinaliza intenção
e impede um agente over-eager de recusar a tarefa; não há enforcement de CI a satisfazer além do `npm audit`.

## Pricing gaps (TES não computa sem isto)

`packages/router/src/cost.ts` exporta `computeCostMicros(model, tokensIn, tokensOut)` (integer microUSD,
**retorna 0 graciosamente para modelos desconhecidos** — nunca lança), `isLocalModel()`, `providerForModel()`,
`pricingSnapshotVersion()`. **NÃO existe `getPricing()`** (o brief refere-o; a correção é `computeCostMicros`).
Campos do snapshot são **`input_per_mtok`/`output_per_mtok`**, NÃO `in_per_1m`/`out_per_1m`.

`data/pricing-snapshot-2026-05-27.json` tem só **3 cloud models**: `claude-opus-4-7` ($5/$25), `claude-sonnet-4-6`
($3/$15), `claude-haiku-4-5` ($1/$5), + 7 `ollama_models` (free/local: qwen3:30b, qwen2.5:3b, qwen2.5-coder:14b/7b,
deepseek-r1:7b, gemma3:12b, gemma4:e4b).

**9 dos 12 brief models AUSENTES** do snapshot:

| Model | No snapshot | Nota |
|---|---|---|
| claude-opus-4-6 | **MISSING** | só opus-4-7 presente |
| claude-opus-4-7 | ✅ presente | $5/$25 |
| claude-opus-4-8 | **MISSING** | — |
| claude-sonnet-4-6 | ✅ presente | $3/$15 |
| claude-haiku-4-5 | ✅ presente | $1/$5 |
| claude-fable-5 | **MISSING** | T5 opt-in |
| gpt-5 | **MISSING** | — |
| gpt-5-3-codex | **MISSING** | — |
| gpt-oss | **MISSING** | — |
| gemini-3.1-pro | **MISSING** | — |
| deepseek-v3.2 | **MISSING** | (deepseek-r1:7b é local) |
| minimax | **MISSING** | — |
| qwen3.6 / qwen3-30b (cloud) | **MISSING como cloud** | qwen3:30b existe como `ollama_models` (free/local) |

**Handling recomendado:** estender o **SSOT** (`data/pricing-snapshot-2026-05-27.json`) — é o single source of
truth que `computeCostMicros` consome; não duplicar constantes de preço noutro lado. Os 9 modelos cloud em falta
têm de ser adicionados ao bloco `models` com `input_per_mtok`/`output_per_mtok` **ANTES** de escrever
`tes-calculator.ts`, ou TES retorna 0 silenciosamente (cost por design não-throwing) e fica errado. Como os preços
de gpt-5/gemini-3.1/deepseek-v3.2/minimax não vivem no repo, isto **exige decisão do Paulo**: (a) fornecer os
valores corretos para o snapshot, ou (b) autorizar um fallback estimado documentado. A skill `pricing-correto-2026`
existe e deve ser a fonte canónica para esses números.

## Buildability por fase (honesto, foco nas mais arriscadas)

### Phase E — multiplexer/PTY bridge: **NEEDS RESCOPE (P5)**
tmux/zellij/wezterm **todos ausentes** neste box Windows; zero integração no repo. "tmux send-keys" como desenhado
**não procede**. Colapsa para fallback `child_process.spawn` com `stdio:'pipe'` (cross-platform, sem PTY). Isto
**ainda é valioso**: já existe `packages/spawn-orchestrator/runner.ts` (`runSandboxed` + `child_process.spawn`) e
`subagent_tracker.js` para tracking de fan-out — Phase E pode entregar fan-out + tracking via pipe stdio sem PTY.
**Re-scope recomendado:** (1) escopar a camada multiplexer para non-Windows (padrão Win32-null como `vram_detect.js:47`),
(2) no Windows usar `child_process.spawn` pipe como o único backend, (3) NÃO adicionar `node-pty` (native addon,
não está no repo, decisão do Paulo se quiser PTY real). **Caveat adicional:** `createSpawn()` no spawn-orchestrator
lança `SandboxUnavailableError` sem bubblewrap (Linux-only) — `mooter spawn` real é não-funcional no Windows; Phase E
no Windows fica limitado a tracking/UI sobre spawns simulados ou ao path de subagents do Claude Code, não a launches reais sandboxed.

### A.16 — benchmark scraping: **NEEDS PAULO DECISION (dep guardrail)**
`benchmark-fetcher.ts` precisa de fazer fetch+parse de HTML de leaderboards. **Nenhum HTML parser** (`cheerio`/`jsdom`/
`node-html-parser`) está em `packages/router` nem em mais lado nenhum dos três package.json verificados. Adicionar `cheerio`
é uma **dependência nova** → toca `package.json` → guardrail (CLAUDE.md + doutrina pessoal: deps = T3/decisão). Dispara
`security.yml npm audit`. **Decisão do Paulo necessária:** (a) autorizar `cheerio` (ou `node-html-parser`, mais leve), ou
(b) escopar A.16 para consumir uma **API JSON** de benchmarks (sem parser) ou ficheiros estáticos commitados. Sem decisão,
A.16 fica bloqueado — não inventar a dep autonomamente.

### A.17 — self-judge: **BUILDABLE (reuse path confirmado)**
`packages/router/scripts/wave2-benchmark/lib/judge.ts` tem a implementação completa: rubric de 5 campos
(correctness/completeness/relevance/actionability/hallucination), `seededOrder()`, `parseScores()` (L107-129, reutilizável
verbatim), `judgePrompt()`. Dois transports: (1) SDK (`anthropic-client.ts`, exige `ANTHROPIC_API_KEY` — pode estar ausente),
(2) **`claude --print --model sonnet` subprocess** — usa quota Claude Max, sem API key. **`claude` CLI confirmado on PATH**
(`…/AppData/Roaming/npm/claude`). Recomendação (alinhada com Wave 54 R3): A.17 usa o transport CLI subprocess, reutilizando
rubric+parse de `judge.ts`. **A.17 implementer deve confirmar transport (CLI vs SDK) antes de codar**, mas o path existe e é viável.

### A.13 / A.15 — dashboard charts: **NEEDS PAULO DECISION (dep) ou DIY**
**Nenhuma chart lib** em `landing/package.json` (deps: @sentry/nextjs, cmdk, next, react, react-dom, simple-icons, zod).
Visualizações atuais são DIY: CSS-bar (`<div style={{width:'${pct}%'}}>` em `page.tsx:2192`) e SVG inline. A.15 (evolution chart)
e A.13 (MatrixPanel) têm duas opções: **(a)** seguir o padrão DIY existente (CSS bars / inline SVG, zero dep, consistente,
recomendado para overnight autónomo), ou **(b)** adicionar `recharts` (toca `landing/package.json`, +bundle, guardrail). A.13
admin-gate: o `is_admin` é comparação de email client-side (`layout.tsx:10`); MatrixPanel deve chamar `/api/admin/*`
(auth server-side) com uma nova rota tipo `/api/admin/matrix`, não confiar só no flag client. **Recomendação:** DIY CSS/SVG
para não bloquear; só pedir `recharts` ao Paulo se o brief exigir gráficos complexos (multi-série, eixos).

### B — CLI interactive agent list: **BUILDABLE (build from scratch)**
`packages/cli` tem **zero runtime deps** e **nenhum** componente de lista selecionável ↑/↓/Enter. `ink` está só em
`packages/workflow` (não cli). Importar `ink` adicionaria runtime dep ao bundle zero-deps do cli (decisão). O padrão a reutilizar
é o raw-mode stdin loop de `dashboard.ts:415-467` (`setRawMode` + `stdin.on('data')` + alternate screen). **Recomendação:**
construir a lista from scratch com raw-mode (zero nova dep), seguindo `workflow.ts` (subcommand dispatch) e `init.ts` (InitIO
injetável para testes). Testes em `node:test` via `tsx --test`, **NÃO vitest**.

### A.1 / A.5 (chips & statusline): **BUILDABLE com correção de target**
**O statusline WIRED é `frugal/tools/router/gsd-statusline.js` (repo `frugal`, não `frugal-wave56`)** — `~/.claude/settings.json:160`.
A.5 "7-line unification" precisa de **clarificar o ficheiro-alvo**: estender `gsd-statusline.js` (a cópia canónica em
`frugal-wave56` é v1.37.1, 2203 linhas) afeta o output visível; `statusline-multi.js` (1672 linhas, mais rico mas NÃO wired)
não afeta nada visível a menos que seja wired. Reutilizar chips existentes: pastor (🧠), quant (📦), user (👤) — todos existem
e testados. **VRAM chip (🎮) está morto em Win32** (`vram_detect.js:47` retorna null) — qualquer teste a afirmar presença de
VRAM falha neste box; escopar para non-Windows ou adicionar path Win32 (nvidia-smi/wmic). A.4 emoji map: estender
`docs/EMOJI_GUIDE.md` (Wave 53), não definir glyphs ad-hoc (`tools/lint/emoji_lint.js` enforce a forbidden list).

## Reuse map (extends, não duplicar)

| Need (Wave 58) | Reusar | Ficheiro |
|---|---|---|
| A.1 progress chip | `progressDots()` + `WorkflowProgress` + `readActiveWorkflow()` | `packages/sessions-orchestrator/src/workflow-chip.ts` + `types.ts` |
| A.10 heartbeat extend | EXTENDER `Heartbeat` interface (campos opcionais) + `writeHeartbeat()` | `packages/worktree-conductor/src/{types.ts,heartbeat.ts}` + reader `tools/router/sessions-status.js` |
| Phase E fan-out tracking | `listRecords()`/`readRecord()`/`patchRecord()` + `spawnSummary()`/`spawnChip()` | `packages/spawn-orchestrator/src/{state.ts,chip.ts,types.ts,runner.ts}` |
| Phase E / C agent identity | `snapshot().active[]` (`agent_name`,`tier`,`model`,`started_at`) | `tools/router/subagent_tracker.js` |
| C per-agent tokens | injetar `_by_agent` no ponto de dedup `agentId` (L141); reusar `modelToTier()` | `tools/router/token_tracker.js` |
| A.9 cost-perf writer | `priceTurn(modelKey, in, out)` (SSOT custo USD) — chamar, não duplicar | `tools/router/pricing.js` |
| A.9 injection point | append per-agent cost a `~/.mooter/cost-perf-log.jsonl` após `trackSubagentTranscript()` (L150) | `tools/router/subagentstop_hook.js` |
| C chip augment | augmentar `buildAgentFocusChip()` com token/cost annotation (sem quebrar formato) | `tools/router/agent-focus-status.js` |
| A.17 self-judge | rubric 5-campos + `parseScores()` + `seededOrder()` verbatim; transport via `claude --print --model sonnet` | `packages/router/scripts/wave2-benchmark/lib/{judge.ts,models.ts}` |
| TES cost | `computeCostMicros(model,in,out)` (NÃO `getPricing()`); estender snapshot SSOT primeiro | `packages/router/src/cost.ts` + `data/pricing-snapshot-2026-05-27.json` |
| specialization policy | `applyGeneralFallback`/`applyTierEscalation`/`assertTierBounds`/`maxTier` | `packages/router/src/policy.ts` |
| A.13 MatrixPanel | padrão satellite-module (helpers puros + JSX fino, exported p/ vitest) | `landing/app/(app)/dashboard/_phase_c.tsx` + `_state.ts` |
| A.13 tab registo | append a `DASH_TABS` (L2228-2236) + render condicional (L2291-2297) | `landing/app/(app)/dashboard/page.tsx` |
| A.13 admin API | nova rota `/api/admin/matrix` seguindo padrão cookie-auth | `landing/app/api/admin/stats/route.ts` |
| B CLI interactive | raw-mode stdin loop (setRawMode + alternate screen) | `packages/cli/src/commands/dashboard.ts:415-467` |
| B/D command pattern | `CmdResult`, subcommand dispatch, `parseArgs()`, lazy engine import, InitIO injetável | `packages/cli/src/commands/{explain.ts,workflow.ts,init.ts}` + registo em `index.ts` |
| A.4 emoji | estender, não inventar; linter enforce | `docs/EMOJI_GUIDE.md` + `tools/lint/emoji_lint.js` |

## Blockers (hard stops vs decisões)

**Hard stops (ANTES de Phase A — o Paulo tem de greenlight):**
1. **Pricing SSOT incompleto (A.8/A.14 BLOCKER):** 9 dos 12 modelos ausentes do snapshot; TES computa 0 silenciosamente.
   Estender `data/pricing-snapshot-2026-05-27.json` **antes** de `tes-calculator.ts`. Os preços de modelos não-Anthropic
   (gpt-5/gemini/deepseek/minimax) **não vivem no repo** → Paulo fornece valores ou autoriza fallback estimado documentado
   (fonte: skill `pricing-correto-2026`).
2. **A.16 dep guardrail:** scraping precisa de HTML parser (`cheerio`?) ausente → toca `package.json`. Paulo decide:
   autorizar dep OU escopar A.16 para API JSON / ficheiros estáticos.
3. **A.13/A.15 chart dep:** sem chart lib em `landing`. Paulo decide: DIY CSS/SVG (recomendado, zero dep) OU autorizar `recharts`.

**Re-scope obrigatório (não-stop, mas o build TEM de honrar):**
4. **Phase E (P5):** multiplexer absent no Windows → colapsar para `child_process.spawn` pipe; multiplexer-layer scoped a
   non-Windows; sem `node-pty`. Plus: `mooter spawn` real é não-funcional no Windows (bubblewrap Linux-only).
5. **A.5 statusline target:** o wired é `gsd-statusline.js` (repo `frugal`), não `statusline-multi.js`. Clarificar alvo
   ou estender o errado = zero efeito visível.
6. **VRAM chip (🎮) morto em Win32:** testes que afirmem presença falham neste box; escopar non-Windows.

**Correções de API/processo (não bloqueiam, mas têm de ser respeitadas):**
7. Brief refere `getPricing()` → não existe; usar `computeCostMicros()`. Campos `input_per_mtok`/`output_per_mtok`.
8. `npm install` em **ambos** `packages/cli` E `packages/router` antes de testes (cli fornece `tsx`).
9. **Sem `tsconfig.json` em `packages/router`** — se ficheiros novos usarem TS-strict, criar tsconfig ou aceitar gaps de type-check.
10. CLAUDE.md allowlist edit FIRST (process gate editorial, não CI) — incluir os 7 ficheiros.
11. `classify.js` permanece **FROZEN** — nada nesta wave lhe toca.

## Recommendation: **PROCEED_WITH_RESCOPE**

Construir conforme planeado **com**: (1) edit do allowlist CLAUDE.md FIRST; (2) Phase E re-scopada para
`child_process.spawn` pipe (multiplexer scoped a non-Windows, sem PTY); (3) A.5 a apontar para o statusline wired
correto; (4) chips DIY CSS/SVG para A.13/A.15 por default. **Greenlight explícito do Paulo necessário em 3 pontos
antes/durante Phase A:** (a) os 9 preços em falta no snapshot (ou autorização de fallback) — BLOQUEIA TES; (b) dep
de HTML parser para A.16 (ou re-scope para API JSON); (c) chart dep para A.13/A.15 (ou aceitar DIY). Tudo o resto
— specialization-matrix, decide-agent, task-categories, adaptive-learner, fable-5-routing, A.1/A.10 chips, A.17
self-judge, B/D CLI commands — é **buildable as-written** ou com reuse aditivo, e pode avançar overnight sem decisão
adicional. O único re-scope-trigger genuíno foi P5 (Phase E); P1 é non-alarming, P2/P3/P4 são infra parcial a estender.
