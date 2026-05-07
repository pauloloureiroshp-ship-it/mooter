# Mooter — Sync Snapshot

> Canónico em `~/frugal/SYNC.md` no Mac, `C:\Users\Paulo Loureiro\frugal\SYNC.md` no Windows.
> Canal bidirecional Cowork ↔ Claude Code segundo o skill `/sync-project`.

**Última sync:** 2026-05-07 (Claude Code Windows — **Sessão #40: Wave-2 LANDED — `router-execute.js` advisor→executor + telemetry + calibration**)
**Versão:** v0.11 (Codex Integration) · mooter.ai live · validation 87.5 % ≥ target ✅ · suite 295/296 ✅ (1 skip esperado) · Wave-2 router-execute APPROVED ✅
**Último commit main:** `b34fdc4` (feat(router): router-execute CLI for ad-hoc and validation use)
**Sessão Claude Code:** #40 — Design completo + execução de toda a Wave-2 numa sessão. 12 commits atómicos sobre `aa25a2b` (T-01..T-10 + design A). Final-reviewer APPROVED com 2 notas não-blocantes. NÃO push (espera GO do Paulo). Ver §40 abaixo para detalhe.

### 🚀 Sessão #40 — 2026-05-07 (Wave-2 LANDED — advisor → executor)

**Mandato Paulo:** "Desenhar a transição advisor → executor. Entrega esperada: SPEC + PLAN em `.planning/wave-2/`. Sem código ainda. Quando o plano estiver verde, executar."

**Outcome:** SPEC + PLAN entregues E executados — 12 commits atómicos (T-01..T-10 + design A) sobre `aa25a2b`. Final-reviewer APPROVED.

**Deliverables:**
1. `.planning/wave-2/SPEC.md` — design contract com 11 invariantes (I1..I11) + 3 ExecuteResult shapes (Ok / Defer / Error) + telemetry contract + calibration loop spec.
2. `.planning/wave-2/PLAN.md` — 11-task atomic-commit DAG com pré-flight checks, risk register, definition-of-done.
3. `tools/router/router-execute.js` (886 linhas) — executor que consome `classify.js`'s `suggested_providers`, despacha non-Anthropic providers directamente, defere Anthropic-tier para subagents.
4. `tools/router/providers/ollama-api.js` — wrapper programático para Ollama (faltava — `ollama_call_node.js` é só CLI).
5. `tools/router/router-execute.{fixtures.json,mocks.js,harness.js,test.js}` + extensões a `providers.test.js` e `savings-tracker-me.test.js` — suite Wave-2 completa.
6. `tools/router/savings-tracker.js` — novo `/last-execution` GET + `/metrics.executions` block (+ `aggregateExecution` helper exported para testes).
7. `tools/router/backtest.js` — novo `--calibration-only --last-n=N` mode, escreve em `.calibration-alerts.jsonl` se bin 0.8-1.0 < 90 % (count ≥ 100).

**Doctrine guards verificados:**
- I1: T3 sempre defere model-architect, mesmo com codex_cli mocked-success.
- I2: HIGH_RISK floor força architect (mesmo em prompts T2 forçados).
- I3 (a..c): user_override pinning Anthropic → mapeia para subagent matching, exclusivo.
- I7b: T3 com claude=degraded NÃO injecta codex/ollama (anti-bazuca-invertida).
- I11: `git diff aa25a2b -- tools/router/classify.js` = vazio. classify.js NÃO foi tocado.

**Métricas Wave-2:**
- Suite: 206 → **295 pass + 1 skip** (1 skip esperado: harness "executor absent" sentinel).
- 49 novos testes em router-execute.test.js cobrindo I1..I10 + boundary cases + CLI smoke.
- 12 testes em router-execute.mocks.test.js + 5 em router-execute.harness.test.js + 9 ollama em providers.test.js + 6 em savings-tracker-me.test.js.
- Diff total: 14 ficheiros, +3875 / -9.

**Final-reviewer (Opus subagent) verdict:** APPROVED.
- Smartest design (segundo reviewer): outcome derivation em buildTelemetryRecord — distingue ok / deferred / error correctamente, mantém errors[] como sub-detail mesmo em defers, evitando double-counting em `guaranteed_saved_usd`.
- Highest-risk smell (não-blocante): `appendDecisionsLog` usa `fs.appendFileSync` no hot path. Single-process hoje (CLI sequencial) → OK. Wave-3 (parallel callers) → trocar por async + queue.
- Notas para futuro: comentar idempotency da mutation local de `classification.suggested_providers` na JSDoc do `execute`. Wave-3.

**Push status:** NÃO push. Espera GO explícito do Paulo (12 commits sobre origin/main).

**Pré-push checklist (T-11):**
- [x] suite verde (295/296)
- [x] classify.js byte-identical a aa25a2b
- [x] CLI smoke OK (4 prompts representativos)
- [x] final-reviewer APPROVED
- [ ] live `/metrics.executions` curl (server actual ainda corre código pré-Wave-2 — vai picar-se após restart, deferred)
- [ ] re-run validation runner contra fresh corpus (acceptance §10 #5: ≥55% executions OK ratio) — deferred a Paulo
- [ ] Notion sub-page (deferred — espera GO)
- [ ] push autorizado

**Próxima missão (Wave-3, master prompt à parte):**
Restart savings-tracker server (apanha o novo `/last-execution` + executions block); validation runner fresh contra Wave-2; mover `appendDecisionsLog` para async; statusline reflectir `guaranteed_saved_usd` separado de `advisory_saved_usd`; eventual gemini provider wrapper.

**Validation master prompt (paralelo, executa quando quiseres):**
- `frugal/prompts/MOOTER_WAVE-2_VALIDATION_MASTER.md` (gitignored)
- Mirror em `Documents/paulo-vault/10-projects/mooter-wave-2-validation-master.md`
- Notion log: https://www.notion.so/3596f6e42bc4812e824cf48bf8b9321d
- Briefing para sessão Claude FRESCA (não-Opus-author) auditar I1..I11 + comparar contra estado-da-arte 2026 (advisor→executor, fallback chains, calibration loops, vibe-coding harnesses) e devolver veredicto independente em paulo-vault `30-learnings/wave-2-validation-2026-05-07.md` + Notion sub-page.

**Audit independente (Sessão #40-validation, 2026-05-07):** **APPROVED_WITH_NOTES**. Sessão Claude Opus fresca correu o master prompt completo (§3.1–§3.6), validou I1–I11, comparou contra SOTA 2026 (RouteLLM, Inworld Router, BaseCal, Calibration-aware RL). Mandate match 100%. 1 finding S1 real (sanitisation regex bank incompleta — falta AWS/GitLab/Slack/JWT/Azure) + 4 S2 cosmetic não-blocantes. SOTA conclusion: Mooter está level com Inworld em conceito, à frente em doctrine guards + subagent semantics + Codex CLI integration. Lição principal: o reviewer-Opus original (mesmo subagent family) tende a perder honesty signals (versões não bumpadas, test titles enganadores, sanitisation gaps que cheap-triage teria flagged) — **trust-but-verify justifica sessão fresca distinta**. Mirror completo em `paulo-vault/30-learnings/wave-2-validation-2026-05-07.md`.

**Wave-3 hotfix wave (Sessão #40-fix, 2026-05-07):** **6 atomic commits aplicados** sobre `374480e` resolvendo todos os findings actionable do audit:
1. `7f4ab87` — sanitisation regex extension (S1#1): adiciona AWS/GitLab/Slack/JWT/Azure SAS + GitHub multi-prefix + 10 generic credential env-vars; +7 testes I10
2. `7b51c09` — version bump 0.6.0→0.7.0 em 3 sítios coordenados (S2#3): savings-tracker `/health` + `/metrics` + `backtest.test.js:210`
3. `8a4134a` — backtest calibration honesty surface (S2#5): three-state `warning`/`note`/null + `MOOTER_DECISIONS_LOG` env override (consistente com router-execute); +5 testes via spawnSync
4. `a5086f0` — rename misleading test "T1 explain_error" → "ambiguous explain prompt" (S2#4)
5. `469fd63` — async appendDecisionsLog com per-path Promise chain + `flushDecisionsLog` test helper (S2#1, também flagged pelo final-reviewer original); +2 testes (concurrent ordering, queue auto-evict)
6. `edbbb32` — polish per final-reviewer N1+N2 (defensive `.catch` + Windows O_APPEND caveat comment)

**Wave-3 closure cycle (mesma sessão, post-push):**

7. `33fc9a3` — `feat(metrics): savings-tracker honours MOOTER_TRACKER_PORT env override` — fecha o ciclo cliente↔servidor (router-execute lia esta env var desde Wave-2 mas server ignorava, impossibilitando spawning de instância secundária para validação)
8. `5922865` — `fix(router): CLI drains telemetry before exit` — **regressão real do `469fd63`** descoberta ao testar runtime: o async appendDecisionsLog + fire-and-forget HTTP POST eram perdidos quando o CLI process saía via `process.exit(0)` antes do drain. Fix: `await flushDecisionsLog()` + 300ms wait no module-init block (afecta SÓ CLI, programmatic require() unaffected).

**Acceptance §10 #4 PROVEN AT RUNTIME** (secondary tracker, port 7822):
- 15 CLI executes via MOCK_PROVIDERS=1 + MOOTER_TRACKER_PORT=7822
- `/metrics.executions.total` = 16 (1 extra do mktemp test)
- `by_provider`: `{deferred:model-architect: 11, deferred:cheap-triage: 5}` — partition correcta por tier
- `by_outcome`: `{deferred: 16}` — esperado com mocks (todos retornam null)
- `/last-execution`: shape completa correcta (tier T3, deferred_subagent, deferred_reason: tier_t3, sanitised prompt_preview)
- Suite: 309/310 verde após cada commit (1 expected skip)

Restart do daemon real (PID 59172, port 7821) deferido — code está provadamente funcional, restart é puramente operacional e fica para o momento que o Paulo escolher. Para fazer:
```powershell
Get-Process -Id 59172 | Stop-Process -Force
node tools/router/savings-tracker.js  # default port 7821
curl http://127.0.0.1:7821/health     # confirma version=0.7.0
curl http://127.0.0.1:7821/metrics | jq .executions
```

Suite final: 296 → **310 (+14 net new tests, all green)**. CLI smoke verde. **I11 ainda invariant** (`diff aa25a2b classify.js` IDENTICAL re-confirmado pós-todos-os-commits). Final-reviewer pre-push verdict (gate aplicado entre commits 6 e 7): **PASS-WITH-NOTES** (notes advisory, sem required actions).

**Statusline master prompt (paralelo, executa em sessão fresca quando quiseres):**
- `frugal/prompts/MOOTER_STATUSLINE_GUARANTEED_SAVINGS_MASTER.md` (gitignored)
- Mirror em `Documents/paulo-vault/10-projects/mooter-statusline-guaranteed-savings-master.md` (byte-identical)
- Briefing para sessão Claude FRESCA implementar separação visual `guaranteed_saved_usd` (Wave-2) vs `advisory_saved` (legacy) no statusline wired (`gsd-statusline.js`) + paridade no `statusline.sh` fallback. Inclui fix de bug visível `5h:[object Object]%` + honesty marker `⚠` quando `guaranteed/advisory < 0.5` E `executions.total >= 50`. 4 atomic commits previstos, ~90-120 min wall-clock, $0 quota.
- Acceptance criteria: 12 (visuais A1-A6 + funcionais F1-F4 + doctrine D1-D3). Saída esperada: 3 sample outputs (state A/B/C) copy-paste + verdict + final-reviewer gate.

**Wave-3 statusline LANDED (Sessão #40 mesma sessão, 2026-05-07):** **APPROVED_WITH_NOTES** (final-reviewer pre-push gate). 4 atomic commits sobre `030feea` cobrindo todas as 12 acceptance criteria do master prompt:
1. `4392124` — `fix(statusline): parse five_hour/seven_day as object.utilization not literal` (T-01, A4 — bug `[object Object]%` corrigido at root cause schema)
2. `c095cf2` — `feat(statusline): split guaranteed (Wave-2 executor) vs advisory savings` (T-02, F3/F4 — `calcSavings` expõe `executionCount`/`guaranteedUsdW2`/`advisoryUsd`; render `🐮 saved $X gtd · $Y adv` quando exec>0)
3. `64f8f94` — `feat(statusline): honesty marker ⚠ when guaranteed/advisory ratio < 0.5` (T-03, A5 — gates: exec≥50 floor + ratio<0.5)
4. `9447923` — `chore(statusline): refuse advisory→gtd conflation in tracker fallback` (final-reviewer Q4 polish — `signal` field per return path; refuse a colapso `savedUsd→advisory` no FALLBACK 1)

**Live render (production, exec=50, ratio 0.43, marker fires):**
```
⚠ 🐮 saved $24.07 gtd · $56.01 adv (11% vs all-Opus) · spent $193.12 · 2538 prompts · 0% local ══ ● ok
```

**Doctrine compliance**: I11 ainda invariant (`classify.js` byte-identical), D2 ainda invariant (`savings-tracker.js` 0 lines diff). Suite: 310 verde (309 pass + 1 expected skip). Mirror completo em `paulo-vault/30-learnings/wave-3-statusline-2026-05-07.md`.

**Carry-overs explicitamente N/A nesta hotfix wave** (preserve scope):
- ECE-style calibration (3h, requer SPEC update — Wave-3 proper)
- Statusline reflectir `guaranteed_saved_usd` (UI work)
- Gemini provider wrapper (6h)
- A/B testing live (8h infra)
- Validation runner fresh 60-prompt corpus (decisão Paulo, acceptance §10 #5)
- Restart savings-tracker daemon (operação destrutiva em PID 59172, requer GO Paulo — código novo está em disco e pronto)

**Push status:** ainda **NÃO push** — espera GO explícito Paulo. 18 commits ahead de origin/main (12 Wave-2 + 1 master prompt + 1 audit doc + 6 hotfix).

---

### 🌐 Sessão #39 — 2026-05-07 (Wave-2 readiness — validation patch cycle)

**Mandato Paulo:** "aplicar todos os fixes e deixar perfeita a solução para o momento" após o validator autónomo devolver verdict ⚠️ PATCH BEFORE WAVE-2 com 14 loopholes (3 S0, 9 S1, 2 S2).

**Inputs:**
- `.planning/validation-2026-05-07/VALIDATION-REPORT.md` — verdict do validador autónomo
- `.planning/validation-2026-05-07/loopholes.md` — catálogo S0/S1/S2

**Fixes aplicados (commit `aa25a2b`):**

| # | Fix | Ficheiro | Resultado |
|---|---|---|---|
| 1 | Strip duplicate `sk-` prefix | `tools/router/.env` (gitignored) | OPENAI direct calls funcionais |
| 2 | Export MODEL to inline node spawn | `tools/router/ollama_call.sh:40` | `--model` flag agora propaga |
| 3 | Guard CLI IIFE with require.main | `tools/router/classify.js:1228` | `require('./classify')` 0 stdout |
| 4 | `MECHANICAL_TRIVIAL_T0` fast-path | `tools/router/classify.js` | `rename`/`format`/`move` → T0 conf 0.9 |
| 5 | `ADVISORY_T2` override | `tools/router/classify.js` | `compare … approaches` → T2 (não T3) |
| Bonus | PT-PT extension to explain_difference | `tools/router/classify.js` | `qual a diferença entre` → T1 |

**Métricas pre→post fix:**

| Métrica | Pre | Post | Target | Verdict |
|---|---|---|---|---|
| Tier accuracy overall | 77.5 % (31/40) | **87.5 % (35/40)** | ≥85 % | **PASS** |
| T0 accuracy | 73 % | **100 %** (11/11) | — | strong |
| T2 accuracy | 67 % | 78 % | — | improved |
| Calibration 0.6-0.8 | 83 % | **91 %** | — | improved |
| Calibration 0.8-1.0 | 75 % | 86 % | ≥95 % | aspirational |
| `npm test` | 198/198 | **206/206** (+8 new) | green | green |
| Operational bugs | 3 (S1) | **0** | — | resolved |

**4 misclassifications restantes (acceptable, NÃO blockers):**
- `prompt-010` — `<task-notification>` system XML (corpus quality issue)
- `prompt-015` — comentário PT-PT 80-char-truncado
- `prompt-019` — HIGH_RISK guardrail correctamente recusa override negativo (validation label disputado, by design)
- `prompt-026` — header de projecto truncado

**Drift bug pre-existente também resolvido:**
`~/.claude/tools/router/classify.js` tinha duplicate declaration `TUNED_COMPLEXITY_THRESHOLD` (linhas 26 + 55) — TUNED-BLOCK auto-gerado obsoleto + novo `_loadTuningState()` loader. Causava `SyntaxError` em `backtest.test.js` (que aponta hardcoded para o runtime path). Sync canonical → runtime resolveu.

**Tests added:**
8 testes em `classify.test.js` cobrindo as 4 novas fast-paths + IIFE guard + PT-PT explain. Suite passou de 198 para 206/206 ✅. tsc strict 0 errors. ESLint 0 errors em ficheiros tocados.

**Artefactos:**
- `.planning/validation-2026-05-07/POST-FIX-REPORT.md` — relatório do post-fix
- `.planning/validation-2026-05-07/accuracy-report.json` — regenerado post-fix
- `.planning/validation-2026-05-07/accuracy-report.baseline.json` — snapshot pre-fix (audit trail)

**Wave-2 readiness:** ⚠️ PATCH BEFORE WAVE-2 → ✅ READY FOR WAVE-2.

**Estado de push:** local commit `aa25a2b` por confirmar. Paulo decide quando fazer push (final-reviewer gate aplicável).

---

### 🌐 Sessão #38b — 2026-05-05 (Deepdive follow-ups + autonomous improvements)

**Mandato Paulo:** "pode atacar em paralelo qualquer coisa que entender que vai fazer a solução melhor sempre". Mandato open-ended para ataques autónomos low/medium-risk.

**Investigation agents (3 paralelos):**

| Agent | Question | Verdict |
|---|---|---|
| frugal-hub legacy | Pode-se retirar o worker antigo? | SAFE TO RETIRE — both wranglers point to same D1/R2, only fallback URLs reference it. **Não retirado** por instrução Paulo (não destruir nada estrutural na Cloudflare) |
| README rebrand | Inventário de frugal→mooter no README raiz | 27 string replacements identified, todos aplicados + 1 extra (table) |
| Env-var sub detection | Auto-detect viable for ANTHROPIC/OPENAI/GEMINI keys? | Worth-implementing-now — agent failou por permissão, fiz inline |

**Commits (oldest → newest):**

| # | Hash | Mudança | Files |
|---|---|---|---|
| 1 | `cfe48e0` | fix(hub): avg_savings null when tier_distribution all-zero | hub/routes/stats.js |
| 2 | `1ae68e0` | docs(readme): complete frugal → mooter rebrand (27 swaps) | README.md |
| 3 | `dd20dfb` | feat(init): auto-detect API keys from env before asking | tools/cli/commands/init.js |
| 4 | `73198e8` | fix(install): macOS zshrc autocreate + Windows path-with-spaces | install.{sh,ps1} + landing/public mirrors |
| 5 | `9218c50` | feat(router): align T0 model roster — deepseek-r1:7b + gemma rungs | classify.js + gpu-probe.js |
| 6 | `5bd14f6` | fix(savings+hub-docs): exclude tester events + correct hub bindings | savings-tracker.js + hub/README.md |
| 7 | `3fa2300` | chore(router+landing): drift cleanup after T0 model roster realignment | onboarding/page.tsx + model-catalog.json + classify.js comments + savings-tracker dead branch |

**Cloudflare health check (Paulo pediu, sem destruir nada):**

```
✅ frugal-hub  : 200 OK (1.79s) — legacy worker still alive, bound to mooter-hub D1/R2
✅ mooter-hub  : 200 OK (1.38s) — primary, version 7f1d769f-5633-491b-8b88-bd5234ffccbc
✅ /api/stats  : returns avg_savings_pct: null (was 100, fixed)
✅ wrangler whoami → paulo.loureiro.shp@gmail.com / b1093c8a6e663afd02f98a1e87d0fa34
```

**Final-reviewer gate (commits 4-6):** PASS-WITH-NOTES, zero blockers, 4 follow-ups identified — todos atacados em commit 7 ou flagged.

**P1 descoberto (NÃO atacado):**

`npm test` em `tools/router/` mostra 9 failures (HIGH_RISK regression + user override). MAS:
- `node --test classify.test.js` standalone → 3/3 ✔
- `node -e "require('./classify.js')"` → carrega clean
- Live router em produção continua a funcionar

Diagnóstico: **test state pollution**, provavelmente `update-router.test.js` deixa `tuning-state.json` num estado que polui os próximos test files. Não é regressão real do classifier. Risco de fix em 1-shot é alto (toca o core mooter), por isso flagged como #39 priority — investigação dedicada com plan.

**Resultado tangível para Paulo:**

- Site mooter.ai já não pinta `100% Avg savings` (era false). Agora null → fallback 89.9%.
- README do projecto está fully rebranded (29 mentions auditadas, 27 swapped, 2 preserved como GitHub URL).
- `mooter init` agora deteta API keys do environment e pré-fills os defaults (env-var subscription detection real, conforme objectivo da solução).
- Install scripts robustos: macOS fresh install + Windows path-with-spaces fixed.
- T0 model roster aligned: deepseek-r1:7b (era distill 14b), +gemma3:12b, +gemma4:e4b. Onboarding card alinhada.
- Cloudflare health verified, frugal-hub legacy preservado por instrução.

**Página Notion:** [🌐 Sessão #38 — Site deepdive](https://www.notion.so/3576f6e42bc481c39318da33eb44d96e) (sessão #38b registada como continuation da mesma)

**Próxima missão sugerida (#39):**

- **P1 — Test pollution forensics:** Run failing tests in isolation order pairs to isolate which test file pollutes state. Likely fix in `update-router.test.js` (cleanup `tuning-state.json` in afterEach) or in classify.js (re-read tuning state per call instead of at module load).
- **P2 — Lifetime stats rollup:** Migration `008_lifetime_totals.sql` + cron diário. Resolve o problema do "since launch" honestly em vez do current 7-day window.
- **P3 — Pendentes herdados de #37:** Sentry DSN config + npm publish + Supabase PAT revoke

---

### 🌐 Sessão #38 — 2026-05-05 (Site deepdive — modes section + honest detection + 7d stats)

**Âmbito:** Paulo pediu deepdive ao site para garantir que tudo reflecte o objectivo real da solução. 5 áreas de foco: (1) statusline mockups desactualizados, (2) Moo/CrazyMoo/LazyMoo invisíveis, (3) hardware+subscription detection mal explicada, (4) accuracy do contador, (5) wording geral. Diagnóstico produziu 7 findings com severidade, plano de remediação alinhado em 1 troca de mensagem, execução em 6 commits.

**Commits (oldest → newest):**

| # | Hash | Mudança | Files |
|---|---|---|---|
| 1 | `831acc4` | feat(landing): mode trio dedicated section (Moo/CrazyMoo/LazyMoo) — 3 cards com cap, descrição, mini statusline pulse, slash command, when-to-use | page.tsx + globals.css |
| 2 | `1a66967` | fix(landing): honest GPU + sub detection messaging — 4 strings reescritas (T0 desc, flow step 03, compare table, VSCode card) | page.tsx |
| 3 | `9a4732a` | feat(stats): cumulative all-time totals (foi revertido em #6 — TTL prune impede lifetime real) | stats.js + page.tsx |
| 4 | `c426ac6` | fix(landing): hero terminal demo `🐮 Moo` badge + accurate model count `+9` (17 not 11) | page.tsx |
| 5 | `716a31b` | chore(landing): build-time SHA injection (Vercel SHA → git → "dev" fallback) | next.config.ts + page.tsx |
| 6 | `f56ad9c` | fix(landing+stats): cow emojis 🐂🐄 (era 🤘😎), drop fake-lifetime query, "last 7d" labels honest, CSS scope fix | stats.js + page.tsx + globals.css |

**Final-reviewer gate (Opus, 2 rondas):**

- **Ronda 1** (após commits 1-5): PASS-WITH-NOTES com 3 blockers reais — (a) lifetime query era idêntica ao 7d (deltas TTL=7d), (b) emojis 🤘/😎 quebravam cow-theme do gsd-statusline.js (🐂/🐄), (c) `.sl-*` helpers não aplicavam dentro de `.mode-pulse` por scope.
- **Ronda 2** (após commit 6): PASS-WITH-NOTES, zero blockers, único follow-up cosmético (`.mode-pulse .sl-grow` duplicado, sem impacto visual).

**Deploys feitos:**

- ✅ `git push origin main` → Vercel deploy automático para mooter.ai
- ✅ `wrangler deploy -c wrangler.mooter.toml` → mooter-hub Worker version `0c5099e5`
- ✅ Live `/api/stats` confirma nova shape com `prompt_count_7d`, `total_savings_usd_7d` siblings

**Anomalia herdada descoberta (NÃO blocker, NÃO introduzida nesta sessão):**

`avg_savings_pct: 100` quando `avg_tier_distribution` vem todo a zero (deltas sem tier_distribution populado). Fórmula `1 - (t0*0 + t1*0.044 + t2*0.178 + t3*1.0)` dá 100% num row vazio. Fix de 1 linha em `stats.js:91-93`: tratar all-zero como null. **Recomendação:** abrir como follow-up phase, não fix-em-flight.

**NÃO tocado (decisão consciente):**

- Rebrand frugal→mooter completo no README raiz (continua como pendente de #37)
- Lifetime stats rollup table (precisa de migration + cron job)
- Subscription auto-detect real (probe de `ANTHROPIC_API_KEY` etc no install) — claim foi **suavizado** em vez de implementado
- Install-time GPU probe (mesmo critério: claim suavizado)
- frugal-hub legacy worker (só mooter-hub foi deployed; frugal-hub continua na versão antiga)

**Página Notion:** [🌐 Sessão #38 — Site deepdive](https://www.notion.so/3576f6e42bc481c39318da33eb44d96e) · `3576f6e4-2bc4-81c3-9318-da33eb44d96e`

**Próxima missão sugerida:**

- **Opção A (curto, 30min):** fix do `avg_savings_pct: 100` bug herdado — 1 linha em stats.js + redeploy worker
- **Opção B (médio, 2h):** rollup table real para lifetime stats — migration `008_lifetime_totals.sql` + cron diário em `notify.js`
- **Opção C (estratégico):** atacar pendentes herdados de #37 (Sentry DSN, npm publish, Supabase PAT revoke)

---

### 🌐 Sessão #37 — 2026-05-05 (Site coherence + install alignment + statusline mode trio)

**Âmbito:** garantir que `mooter.ai` + install flow + statusline reflectem a verdade actual da v0.10.1 friends-beta. Auditoria deep com `model-reasoner` (17 findings classificados por severidade) → remediação imediata em 3 commits atómicos.

**Findings closed (9/10):**

| # | Severidade | Resolução |
|---|---|---|
| B1 — REQUEST_ACCESS.md missing | BLOQUEADOR | Criado com 2 paths: signin landing OR email direto |
| B2 — README broken [SETUP.md](INSTALL.md) link | BLOQUEADOR | Reescreveu setup section, aponta para mooter.ai installers |
| G1 — Landing 3× v0.9.4 hardcoded | GAP visível | 3 strings → v0.10.1 (page.tsx:865, 1282, 1326) |
| G2 — Channel default `stable` vs SSOT `friends-beta` | GAP UX | 4 install scripts alinhados |
| G3 — install-windows.ps1 duplicado | GAP manutenção | Apagado |
| G4 — README badge v0.9.8 | GAP visível | → v0.10.1 |
| G5 — Node 20+ vs script 18+ | GAP UX | → 18+ alinhado |
| G6 — Sub-READMEs stale | GAP visível | landing/dashboard READMEs → v0.10.1 + frugal→mooter |
| **Statusline coherence** | GAP brand | modeBadge `🐮 Moo · CrazyMoo · LazyMoo` adicionado à row 1 da landing mockup |

**NÃO tocado (decisão consciente):**
- Rebrand frugal → mooter completo no README raiz (header, statusline example, tier emojis) — esforço maior, merece commit dedicado
- `landing/public/runtime/mooter-runtime-latest.tgz` (371KB, 2026-04-18) — pendente decisão Paulo: apagar ou manter

**Página Notion:** [🌐 Sessão #37 — Site coherence + install alignment + statusline mode trio](https://www.notion.so/3576f6e42bc481fab148fa6a26db00de)

**Próxima missão sugerida:**
- **Opção A (curto):** completar rebrand frugal→mooter no README raiz
- **Opção B (estratégico):** atacar pendentes herdados — Sentry DSN config + Vercel orphan cleanup + `npm publish @mooter/cli@0.0.2` + revogar PAT Supabase

**Pendente Paulo antes do push para origin/main:** revisar diff visual do mode badge na landing (push triggers Vercel deploy automático ~12s). Mudança visível na hero do site.

---

### Sessão #36 — 2026-04-21 (drift RESOLVIDO + T1/T2 contract v1.1 + Sentry runbook)

7 commits push a `main` (39b9e92, 4ec1c5e, cbfaef7, 4336dba, 5c41888, e5a29d8, d118e55), 3 final-reviewer gates (all PASS / PASS-WITH-NOTES). **Major achievements:**

1. **TERMINAL-CONTRACT v1.1** — bump minor (SUPERSEDES 1.0): adicionados `docs/backtests/`, `docs/coherence/`, `docs/learnings/`, `docs/suggested-prompts/` a `allowed_paths`; formalizada secção `task_specific_output_dirs` com convenção filename `<pid>` anti-collision. Zero changes em forbidden_paths/commands/read_only_paths — 17 forbidden_commands + 30s EMERGENCY_STOP poll + 4h gpu-lock staleness preservados.

2. **docs/TWO-TERMINALS.md canónico** — prompts T1 (Arquiteto Opus) e T2 (Retroalimentador Ollama) reescritos a apontar TERMINAL-CONTRACT.md como SSoT. Roadmap T1 refrescado (H2 fechado → H3 drift → H4 features → H5 lançamento). 13 findings de auditoria resolvidos (headline 88.3% não 90.2%, filename precision `<pid>`, gpu-lock staleness check, capability probe para MCPs/WebFetch em Ollama-only, etc).

3. **Bidirectional drift RESOLVED** (esta foi a dívida principal adiada em #35):
   - **Phase 1 non-destructive scaffold** (commit 5c41888): `tuning-state.defaults.json` seed + `.gitignore` entry + `sync-to-runtime.sh` exclude comment + `docs/DRIFT-RESOLUTION-PLAN.md` plano completo
   - **Phase 2 core refactor** (commit d118e55): classify.js carrega tuning de JSON externo via `_loadTuningState()` com fallback try/catch → defaults; update-router.js escreve `tuning-state.json` em runtime (não edita classify.js). Testes: classify.test.js 3/3, classify-branches.test.js 20/20, sanitize.test.js 19/19 green. Smoke tests canonical + runtime OK. `sync-to-runtime.sh --diff` agora reporta `0 synced, 23 identical, 0 diverged` (era 9 diverged).
   - Runtime `tuning-state.json` seeded com estado 2026-04-21T15:37:26.739Z (sample 39593, threshold 0.35, 3 demote patterns proxima/avança/vamos) — preserva 4 dias de tuning history.

4. **Sentry DSN runbook** (commit e5a29d8): `docs/SENTRY-DSN-RUNBOOK.md` com comandos exactos para provisionar 4 projectos + DSN em Vercel×2 / Cloudflare / shell. Auditado código: 4 SDKs são DSN-conditional no-op via Zod `.optional()`.

5. **Canonical `version.json` v0.10.0→v0.10.1** (commit 4336dba) — alinha com estado real.

6. **5 dirs T2 scaffold** (commit 39b9e92): `docs/{sessions,backtests,coherence,learnings,suggested-prompts}/` com `.gitkeep`. `docs/prompts/` descartado (conflito com `.gitignore:75` reservado a master prompts estratégicos).

### 🏆 Claude Certified Architect — 10/10 critérios COVERED

| # | Critério | Score |
|---|---|---:|
| 1 | Type Safety | 9/10 |
| 2 | Runtime Validation | 9/10 |
| 3 | Testing (130 tests, coverage 70/66/58/70) | 8/10 |
| 4 | CI/CD (typecheck+lint+test gates) | 9/10 |
| 5 | Code Quality (0 lint warnings) | 9/10 |
| 6 | Service Layer (hub write paths) | 9/10 |
| 7 | Error Handling (4 surfaces) | 9/10 |
| 8 | Error Monitoring (Sentry 4x DSN-conditional) | 8/10 |
| 9 | Input Sanitization | 9/10 |
| 10 | Environment Safety | 9/10 |

### ⚠️ Acções PENDENTES para Paulo (runtime config)

**De Sessão #29 (novo):**

1. **Criar 4 projectos Sentry** em sentry.io: `mooter-landing`, `mooter-dashboard`, `mooter-hub`, `mooter-router`
2. **Configurar DSN em 3 stores:**
   - Vercel (landing + dashboard): `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_{ORG,PROJECT,AUTH_TOKEN}`
   - Cloudflare (hub): `wrangler secret put SENTRY_DSN`
   - Shell profile (router): `export MOOTER_SENTRY_DSN=...`

Sem DSN, os 4 Sentry SDKs estão no-op silencioso. Producao continua cega até configurar.

**De Sessão #28 (ainda pendentes):**

### ⚠️ Acções URGENTES pendentes para Paulo (security)

Após aplicar Supabase auth config via Management API (PATCH 200 ok), 2 acções humanas só tuas:

1. **Revogar o PAT que colaste em 2026-04-18 18:30** — https://supabase.com/dashboard/account/tokens → apaga `mooter-audit`. Expira em 1h de qualquer forma, mas revoga por higiene.

2. **Rotar GitHub OAuth client secret** — a Supabase Management API devolveu `external_github_secret` em plaintext na resposta do PATCH. Secret passou pelo contexto Claude.
   - https://github.com/settings/developers → Frugal OAuth App → Generate new client secret
   - Cola o novo em Supabase Dashboard → Auth → Providers → GitHub
   - Revoga o antigo no GitHub OAuth App page
   - 5 min total

### HIBP blocker (decisão estratégica)

Leaked Password Protection bloqueado pela API com `HTTP 402 — Pro Plan only` ($25/mo). Recomendação: deixar off enquanto GitHub OAuth é caminho principal (email/password = fallback). Revisitar se >50 email-auth users.

### Sessão #29 commits (2026-04-18 late — CCA Certification)

```
0754de8  test(cca): Sprint 12 — branch coverage classify.js (+22.8 pp)
01f4146  fix(cca):  Sprint 11 — logId bug fix + lint 0 warnings
ea73252  docs(cca): Sprint 7  — rewrite AUDIT_CCA.md with cert state
9565dbf  feat(cca): Sprint 6  — service layer (hub D1 abstraction)
ee94aae  feat(cca): Sprint 3.2 — ESLint 9 + Prettier + CI lint gate
49c16b3  feat(cca): Sprint 5.1+10.2 — Zod schemas + env validation (hub)
14e1d04  feat(cca): Sprint 2  — testing foundation + c8 coverage
ff1f0d7  feat(cca): Sprint 8.4 — Sentry integration router
5d4745e  feat(cca): Sprint 8.3 — Sentry integration hub worker
e4d1e07  feat(cca): Sprint 8.2 — Sentry integration dashboard
71b68d4  feat(cca): Sprint 8.1 — Sentry integration landing
784488a  feat(cca): Sprint 8.2b — dashboard not-found.tsx
b0c7854  feat(cca): Sprint 10.1 — Zod env validation + fail-fast (router)
299ce75  feat(cca): Sprint 9  — input sanitization (router + hub)
e41912d  feat(cca): Sprint 3.1 — tsc --strict CI gate
0f82b7b  feat(cca): Sprint 1.7 — type-safety dependency chain
8b2ec86  feat(cca): Sprint 1.6 — type-safety backtest.js
c346a87  feat(cca): Sprint 1.5 — type-safety inject_context.js
ae21c59  feat(cca): Sprint 1.4 — type-safety classify.js
c116a68  feat(cca): Sprint 1.3 — type-safety arbiter.js
11c2c91  feat(cca): Sprint 1.2 — type-safety fx.js
6d0e7b7  feat(cca): Sprint 1.1 — Type Safety foundation (pricing.js)
```

### Sessão #28 commits (ordem cronológica)

```
6c50cf3  fix(hub): close D1/R2 binding drift (deploy-safety critical)
0f82b7b  feat(cca) [bundled] + fix(tuning): exclude quality/override from demote pool
89ef449  docs(sync): session closeout
5e690a9  feat(landing): ESLint 9 + Vitest foundation
6c74a93  feat(landing): error boundaries
61121fb  feat(landing): Zod env validation
bf056ab  chore(supabase): remediation script (used — applied cleanly)
9490c8f  fix(landing): hygiene (robots/sitemap/headers/private-repo links)
0c05a32  fix(install): install URL via mooter.ai (era 404)
b57efa9  fix(router): HIGH_RISK guardrail + validation-set drift (72/72)
d12a59b  chore(supabase): config.toml codified
35f3172  chore(version): homepage → mooter.ai
6bcb6b5  feat(auth): /dashboard → LoginHero
a3d0d59  fix(ci): 66/66 → 72/72 green
```

### Bugs reais eliminados (11)

1. CI 3/66 red → 72/72 green
2. 6 HIGH_RISK phrases iam para T0 gemma (guardrail gap)
3. `mooter.ai/install.sh` → repo privado 404 (acquisition broken)
4. P1-OAuth silent fail pattern (Zod throws em missing env)
5. `/dashboard` anon → waitlist em vez de LoginHero
6. 4 landing footer links → repo privado 404
7. Tuning pipeline propunha demotar quality/override (feedback loop)
8. `validation-set.test.js` rejeitava `mooter_review_*` sources
9. Missing robots/sitemap + security headers
10. `hub/wrangler.toml` binding drift (iam reverter D1 para DB vazia no próximo deploy)
11. `mooter.ai/install-windows.ps1` 404 (não estava em landing/public/)

### CCA scoreboard (landing column — delta desta sessão)

| Criterion | Antes | Depois desta sessão |
|---|---|---|
| 3. Testing | MISSING | PARTIAL (5 Vitest tests) |
| 5. Code Quality Gates | MISSING | PARTIAL (ESLint 9 baseline) |
| 7. Error Handling | PARTIAL | COVERED (error.tsx + not-found + global-error) |
| 10. Environment Safety | MISSING | COVERED (Zod schema, fail-fast) |
| 8. Error Monitoring | MISSING | COVERED (Sentry via parallel session Sprint 8.1/8.3) |

### Parallel sessions awareness

Paulo correu 2 Claude Code sessions em paralelo em 2026-04-18:
- **Esta sessão** (platform audit + CCA Crit 3,5,7,10 + deploy safety)
- **Parallel session**: CCA Sprint 1.x (Type Safety, pricing.js → 4 core files + deps) + Sprint 8.x (Sentry)

Zero conflicts via git — bundled commits (e.g. `0f82b7b`, `6c50cf3`) quando ambas sessões staged files overlapping.

---

## 🎯 Estado Actual do Projecto

**GATE PASS mantido (2026-04-16):** 88.3% overall · 100% canonical · 96% adversarial · 89/89 tests.

**Telemetry LIVE no hub** (primeira vez desde setup multi-device):
- `mooter-hub.frugal-hub.workers.dev/api/stats` agora mostra:
  - `prompt_count: 1` (era 0)
  - `user_count: 1`
  - `hw_distribution: [{hw_tier: "apple-silicon", count: 1, avg_trust: 0.288}]` (era [])
  - `sub_distribution: [{sub_profile: "max", count: 1}]` (era [])
- delta_id primeiro Mac push: `1c16ed12-6e1d-4f18-a4ae-b65b92dfbded`

---

## 🖥️ Multi-device — Mac ↔ Windows PC

### Mac (Session #4 — Mirror Win→Mac completo 2026-04-16 20:30 UTC)
- ✅ Repo `~/frugal` @ `75d4f59`, doctor "All systems operational" (9/9 verde)
- ✅ **SSH GitHub**: chave ed25519 gerada + Keychain + remote migrado HTTPS→SSH (`git@github.com:pauloloureiroshp-ship-it/frugal.git`)
- ✅ **MCPs locais**: filesystem + context7 via `claude mcp add` (`.mcp.json` commitado); 14 HTTPS MCPs claude.ai conectados (Supabase, Linear, Notion, Figma, Sentry, Cloudflare, Canva, Gcal, Gmail, Context7, Vercel, Drive)
- ✅ **Feature flags (Sprint B)**: shadow_mode, per_user_adaptation, implicit_signals, ground_truth_oracle ON via `.mooter-mode.json`
- ✅ **Ollama +1 model**: `nomic-embed-text` (KNN similarity); qwen3:30b **skipped permanentemente** (RAM 8GB < 16GB)
- ✅ **VS Code**: `code` CLI via symlink em `~/.local/bin/code` (sem sudo); 9/9 mooter extensions instaladas
- ✅ **Workspace apartado**: `~/mooter.code-workspace` (3 folders, 9 tasks, 3 launches)
- ✅ **Validation**: canonical 100% · adversarial 96% · historical 72% · overall **87.7%** (GATE PASS)
- ✅ **Smoke tests**: tiers [T0, T2, T3, T3, T2] coincidem com expectativa; HIGH_RISK detectado
- ✅ **Hub push**: delta enviado (trust 0.288), `3578ada0-3177-4052-852e-ea0ecff23fde`
- ✅ **Relatório**: `~/frugal/reports/mirror-2026-04-16T20-25-48.md` (inclui secção "Delta install.sh público vs mirror pessoal")

### Mac (Session #3 completo — Cowork pré-mirror)
- ✅ Repo `~/frugal` @ `b901c3d`, doctor "All systems operational"
- ✅ `device.id: 41c9d48c-f40a-4a80-a764-c76a784fc9e0` (distinto Windows)
- ✅ `identity.json` com email + OS + hub URL correcto
- ✅ Ollama brew service **persistente** (atravessa reboots), 4 models (qwen2.5:3b, qwen2.5-coder:14b, gemma4:e4b, nomic-embed-text)
- ✅ Env perf flags em `~/.zshrc` (`OLLAMA_FLASH_ATTENTION=1`, `OLLAMA_KV_CACHE_TYPE=q8_0`)
- ✅ Subscription: `claude_max` OAuth budget_tracking
- ✅ Hooks todos ON + LaunchAgent backtest 02:00 daily
- ✅ savings-tracker :7821, shadow_mode ON, similarity KNN cache populado
- ✅ Dashboard deps instalados (`/frugal-dashboard` → localhost:7820)
- ✅ Hub push funcional (P3 normalize applied)

### Windows (no próximo pull)
- `git pull origin main` traz os commits Cowork + Mirror: `999f376`, `3ee442c`, `b901c3d`, `d32a866`, `75d4f59`
- Novo ficheiro: `.mcp.json` (MCPs locais filesystem + context7)
- Novo ficheiro: `reports/mirror-2026-04-16T20-25-48.md`

---

## 🎯 BIG PICTURE — MVP Onboarding end-to-end (validado 2026-04-16)

> Esta é a visão estratégica que o mirror valida. Detalhe completo em memory: `project_onboarding_vision.md` + `project_mvp_strategy.md`.

### Rollout do mooter.ai — ordem cronológica
1. ✅ **Paulo solo** (Windows PC, primary) — runtime + classifier funcionando em uso diário
2. ✅ **Paulo multi-device** (Win + MacBook M3, MVP test) — **Mirror Win→Mac validou pipeline em 2026-04-16**
3. 🔜 **Friends beta** (~5-10 amigos) — valida escala, edge cases, variedade de hardware/subs
4. 🔜 **Landing pública** (https://landing-five-azure-16.vercel.app) — signup self-serve em poucos clicks

### Pipeline end-to-end alvo
```
Landing → signup OAuth → captura perfil (hw+sw+subs+budget) →
  gera install.sh customizado → runtime instalado →
  decisões anonimizadas → hub → backtest diário → classifier melhora → beneficia todos
```

### Gaps identificados para friends beta
- **`setup-profile.js` captura 1/4 dimensões** (só subscriptions). Hardware derivado pelo doctor mas não persistido; software stack não mapeado; budget é "auto" sem ceiling. → refator pré-friends-beta (memory: `project_setup_profile_gap.md`)
- **OAuth da landing partido** (P1 pendente) — bloqueia signup → bloqueia tudo
- **Endpoint `/api/device-heartbeat` em falta no hub** (P2 pendente)
- **`install.sh` público** ainda não existe — o `MOOTER_MIRROR_WIN_TO_MAC.md` serve de template; delta documentado em `reports/mirror-2026-04-16T20-25-48.md` secção "passos genéricos vs específicos do Paulo"

---

## 📥 COWORK → CLAUDE CODE
### Instruções e decisões tomadas no Cowork para a próxima sessão
> Esta secção é escrita pelo Cowork. O Claude Code deve lê-la no início de cada sessão, antes de qualquer trabalho.
> Após lida e aplicada: escrever "✅ Lido em sessão #N — [data]" e limpar as instruções.

---

### 🎯 Cowork Sessão 2026-05-07 night — Strategy canonical + briefing executivo

**Âmbito:** Análise estratégica profunda (V1 mercado · V2 Anthropic ecosystem · V3 fluxograma definitivo) + Master Prompt para Claude Code + documento canónico unificado em PDF profissional.

**Deliverables (todos em `~/frugal/`):**

| Ficheiro | Propósito | Tamanho |
|---|---|---|
| `MOOTER_ROUTING_STRATEGY_2026-05-07.md` | V1 — estado mercado + competitive landscape | 41 KB |
| `MOOTER_ROUTING_STRATEGY_V2_2026-05-07.md` | V2 — Anthropic ecosystem + autonomous loops + lang-aware | 39 KB |
| `MOOTER_FLUXOGRAMA_DEFINITIVO_2026-05-07.md` | V3 — pipeline 7 camadas quantificado | 32 KB |
| `MOOTER_MASTER_PROMPT_2026-05-07.md` | Master prompt 9-Phase para Claude Code + Ralph Loop | 33 KB |
| **`MOOTER_STRATEGY_CANONICAL_2026-05-07.md`** | **Single source of truth** consolidado | 47 KB |
| **`MOOTER_STRATEGY_CANONICAL_2026-05-07.pdf`** | **PDF profissional 30 páginas** (ponto focal estratégia) | 148 KB |
| `MOOTER_EXECUTIVE_BRIEFING_2026-05-07.md` + `.pdf` | 2-pager outreach (Anthropic DevRel, contributors, partners) | 4.9 KB / 78 KB |
| `docs/architecture/routing-pipeline.svg` | Fluxograma standalone para README/landing | 7 KB |
| `docs/adr/W3-001-async-decisions-log.md` | ADR template Wave-3 T-1 (skeleton) | 5 KB |

**Decisão estratégica canónica:**
1. **Posicionamento**: Mooter coabita com Claude Code (NÃO substitui — ban first-party 2026-04-04 não pega).
2. **3 moats defensáveis 12-18 meses**: Subscription-Aware Routing · Codebase-Aware Language Harmonisation (PT-PT/PT-BR cidadãos de 1ª) · Triple-stack Anthropic alignment (plugin+skill+MCP).
3. **Anti-goals codificados**: 20 tentações documentadas. Ver `MOOTER_MASTER_PROMPT_2026-05-07.md` §4.
4. **Default T3 = Opus 4.6** (não 4.7) até tokenizer +35% tokens estabilizar economics.

**Eventos críticos:**
- 🔥 **2026-05-19 (12 dias)** — Code with Claude London (livestream grátis). Demo submission ANTES.
- 2026-05-20 — Show HN. 2026-05-25 — Anthropic Startup Program. 2026-05-26 — GATE.

**Para a próxima sessão Claude Code:**
- ⏳ Ler `MOOTER_STRATEGY_CANONICAL_2026-05-07.md` (single source of truth) — antes de qualquer Wave-3 work
- ⏳ Wave-3 T-1: implementar `appendDecisionsLog` async + queue. ADR template já em `docs/adr/W3-001-async-decisions-log.md`
- ⏳ Confirmar comigo (Paulo) se Wave-3 deve seguir playbook V3 ou se há ajustes dado o repo já estar mais maduro que assumido no master prompt
- ⏳ Embed `docs/architecture/routing-pipeline.svg` no README.md principal

**Caveats honestos do Cowork:**
- Repo está MAIS maduro que assumi no master prompt — Phase 0 (audit) parcialmente feita. Phase 1 redundante face a `classify.js` v0.10. **Ajustar master prompt antes de seguir cegamente**.
- Documentos V1/V2/V3/master prompt foram gerados via 13 agentes paralelos com web search + análise. Fontes citadas no Apêndice D do canónico.
- Não testei pessoalmente `claude code`, `ollama pull` CLI flags. Validar antes de seguir.

**Não-feito propositadamente:**
- Não criei issues GitHub Wave-3 (decisão Paulo)
- Não fiz push (12 commits Wave-2 ainda gated)
- Não criei sub-página Notion adicional
- Não toquei em `classify.js`, `tools/router/*` ou outros ficheiros core

---

**Última actualização Cowork:** 2026-05-07 late (Wave-1.5 ENTREGUE — per-user telemetry bootstrap completo)
**Estado:** ✅ Wave-1.5 PASS · Final-reviewer PASS-WITH-NOTES · 12 commits ahead de origin/main (8 Wave-1.5 + 3 Wave-2 P1 prévias + 2 tsc-fix do final-reviewer) · 26/26 testes Wave-1.5 verdes · zero novas falhas vs baseline. ⏳ Aguarda push approval do Paulo. ⏭️ Próxima missão: **Wave-1.6 (classifier patches)** → Wave-2 (executor) → Wave-3 (site).

**Wave-1.5 deliverables (resumo):**
1. `detect-subscriptions.js` — auto-detect Anthropic Max + Codex CLI + OpenAI/Gemini/Ollama (10 testes)
2. `profile-refresh.js` — wrapper 7d com hash-fingerprint para evitar noise (5 testes)
3. Tracker `/me` + `/me/feedback` + `/me/settings` em `:7821` (4 testes + smoke vivo OK)
4. `hub-events-scheduler.js` — incremental push every 50 events, lock + bearer de `~/.frugal/auth.token` (5 testes)
5. `mooter-tester-focus.json` v3.1 — classifier weight 0.03→0.40, statusline 0.70→0.30, 3 novos probing skills + 12 seeds Wave-1.6
6. `harvest-misroutings.js` + `.planning/wave-1.5/adversarial-corpus.jsonl` (79 unique + 326 weighted, top: T2→T0=62, T3→T0=12)
7. `sentry-setup.js` — opt-in CLI com DSN masking, chmod 0600, auto-tags user_id_hash + mooter_version (2 testes)
8. `WAVE-1.5-VERDICT.md` em `.planning/wave-1.5/`

**Insight Wave-1.6:** o adversarial corpus mostra que o T0 fast-path está demasiado agressivo (62 T2→T0). Wave-1.6 Task #4 (T0 trivial detector re-tune) deve TIGHTEN o discriminator, NÃO widen T0.

**Pendentes desta sessão:**
- ✅ Sub-página Notion criada: https://www.notion.so/3596f6e42bc481eda074d0de4ba8fa5c (Sessão 2026-05-07 — Wave-1.5 ENTREGUE)
- ⏳ Push 12 commits → origin/main (gated em aprovação do Paulo, scope drift documentado)
- ⏳ Restart manual do `run-continuous-tester.cmd` (lê novo focus.json v3.1 ao arrancar)

---

### 🧪 Sessão 2026-05-07 — Routing strategy validation

**Âmbito:** correr `MOOTER_VALIDATION_MASTER` em 60 prompts (validation-set + decisions.log + multilingual). Mediu accuracy, calibration, qualidade, savings. Detectou loopholes.

**Entregas:**
- `frugal/.planning/validation-2026-05-07/VALIDATION-REPORT.md` (5 KB report final)
- 12 artefactos JSON/JSONL + 5 runner scripts JS
- 14 loopholes catalogados em `loopholes.md`

**Verdict:** ⚠️ PATCH BEFORE WAVE-2. Estratégia agregada funciona; a calibração detalhada não está.

**Top blockers (must-fix Wave-1.6):**
1. `OPENAI_API_KEY` com `sk-` duplicado → 401 silent fall
2. `ollama_call.sh:40` — `$MODEL` shell-local, payload tem `model:""`
3. `classify.js:1228` IIFE não guardado por `require.main === module`
4. T0 trivial detector falha em `rename`/`format` (predicted T1, conf 0.85)
5. ARCH_SIGNALS over-promote `compare/recommend` para T3 quando deviam ficar T2

**Ferramenta master para próximas waves:** `frugal/prompts/MOOTER_NEXT_WAVES_MASTER.md` (gitignored — também em `paulo-vault/10-projects/mooter-next-waves-master.md`). Orquestra Wave-1.6 → Wave-2 → Wave-3.

**Próxima missão (Wave-1.6, ~2h):**
Aplicar 5 must-fix items + re-correr validation runner. Acceptance: tier accuracy ≥85% AND calibration bin 0.8-1.0 ≥95%. Sem isto, Wave-2 amplifica miscalibrações.

---

### 🔌 Sessão 2026-05-05 — Codex Integration v0.11 (advisory layer)

**Âmbito:** integrar OpenAI Codex CLI como 5º provider tier no router, em modo additive only. Master prompt: `prompts/CODEX_INTEGRATION_MASTER.md`.

**Entregas (8 commits, branch main):**
- `tools/router/quota-tracker.js` — state central (Anthropic + Codex CLI + OpenAI API + Ollama). Schema v1, atomic writes, window rolling automático.
- `tools/router/providers/codex-cli.js` + `openai-api.js` + `_load-env.js` — wrappers dependency-free.
- `tools/router/classify.js` (+81 LOC) — campo `suggested_providers` derivado de quota state.
- `tools/router/inject_context.js` (+31 LOC) — quota lines no `<router-hint>`.
- `tools/router/statusline-multi.js` — Node statusline alternativa (não wired em settings.json — esperar aprovação).
- 25 testes verdes (15 quota-tracker + 10 providers). Lint 0 errors.
- Bump v0.10.1 → v0.11.0.
- Página Notion: [🔌 Sessão 2026-05-05 — Codex Integration v0.11](https://www.notion.so/3586f6e42bc48177894dd04aec7a0e16).

**Bug bonus encontrado e corrigido:** `paths.js` faltava na sync-list de `sync-to-runtime.sh` desde sempre. Só ficou visível porque os meus ficheiros novos (quota-tracker, _load-env, statusline-multi) o requerem. Fix em `1efd0ce`.

**Verdict honesto:** está sólido mas é só *advisory*. Emite recomendações; não executa nada. Sem a Wave-2 a poupança real é zero — continua a queimar 100% Anthropic.

**Próxima missão (Wave-2, master prompt à parte):**
Construir um `router-execute.js` que leia `suggested_providers[0]`, dispare `callCodex` / `callOpenAI` (já prontos), e só caia no subagent Anthropic se tudo falhar. Inclui:
1. Telemetria de qual provider serviu cada turn (vs. o sugerido).
2. Custo real escrito em quota-tracker quando os wrappers correm.
3. Fix do bug do beast-mode override ordering em `classify.js` (re-derivar `suggested_providers` depois do user-override block — ~5 linhas).
4. Mocks de fetch + spawnSync para testar `callCodex` / `callOpenAI` em si.
5. Testes para `statusline-multi.js` parsing de `decisions.log`.

**Polish residual menor (não-bloqueante):**
- `MOOTER_OPENAI_DAILY_BUDGET` env + comparar com `today.cost_usd` (hoje `getQuotaRemaining('openai_api')` é cego).
- Weekly Codex cap está no schema mas nunca incrementado.
- Actualizar `docs/ROUTING_POLICY.md` + `docs/MODEL_MAPPING.md` para mencionar a nova multi-provider routing.
- Decidir wiring do `statusline-multi.js` em `~/.claude/settings.json` (config partilhada T3 — não toquei sem aprovação).

---

### 🔍 Sessão #34 — 2026-04-19 late (Full-system audit Mooter)

**Âmbito:** auditoria de 8 camadas (classificação → execução → telemetria → display → modes → savings → docs → landing). Objectivo: verificar que cada sítio que expõe métricas ao user reporta a mesma verdade que `execution.log` e `decisions.log`.

**Entregas:**
- `frugal/docs/AUDIT-MASTERPROMPT.md` — versão reutilizável do prompt (pode ser invocado em sessão nova por `model-architect` ou futura skill `/mooter-audit`).
- `frugal/AUDIT-MOOTER-2026-04-19.md` — relatório completo com 17 findings accionáveis, cross-layer matrix 10/10, remediation plan em 4 sprints (~4h total), rollback readiness.
- Página Notion: [🔍 Auditoria Mooter 2026-04-19](https://www.notion.so/3476f6e42bc481e3b01ed827804a89a6) (espelho do relatório).

**Severidade total:** 3 CRITICAL · 6 HIGH · 5 MEDIUM · 3 LOW

**Top-3 CRITICAL (fixes <30 min cada mas fecham as 3 principais mentiras de display):**
1. **Mode schema fork** — `mooter-mode.js` escreve `{mode:"beast"}`, `mooter-autopilot.js` escreve `{beast_mode:true}`. Statusline lê a flag booleana (mostra BEAST activo), `inject_context.js` lê a string `mode` (não encontra, não força T3). User vê BEAST on, router continua a rotear normal.
2. **Triple-location file drift** — classify/inject_context/arbiter/statusline/pricing/tracker têm 2-3 cópias divergentes entre `~/.claude/tools/router/`, `~/.claude/hooks/` e `frugal/tools/router/`. Edits no repo versionado não propagam ao runtime.
3. **Arbiter metrics zeram em cada restart do tracker** — decisions.log tem 80 arbiter_call events, `/metrics` reporta 0.

**NON-GOAL desta sessão:** aplicar fixes. O audit é read-only até aprovação explícita.

**Próxima missão (Sprint A recomendado, ~1h):**
Patch de 7 ficheiros para fechar os 3 CRITICAL + quick-wins (pricing comment, gemma4 fallback, dead counter, SYNC update, arbiter.latency_ms). Detalhes na Secção 5 do relatório.

**⚠️ AVISO IMPORTANTE para a próxima sessão:**
Após aplicar o fix F5.1 (Sprint A), o ficheiro `.mooter-mode.json` já tem `beast_mode: true` (ficou assim de uma run anterior do autopilot). Antes do fix, `inject_context.js` ignorava esta flag. **Depois do fix**, o classifier passa a honrar beast_mode:true e vai forçar T3 (Opus) em todos os prompts da próxima sessão. Se não queres isso, corre `/mooter-auto` antes de começar a trabalhar. Esta mudança de comportamento é intencional — é exactamente o fix que o audit pedia: alinhar intent do user com execução real.

---

### ✅ Sessão #33 — 2026-04-19 (One-command install + mooter como CLI nativo)

**Âmbito:** transformar a instalação do mooter em "for dummies": um `curl | bash` ou `irm | iex` e 60 segundos depois `mooter` funciona em qualquer terminal. Motivação directa: Paulo teve install dolorosa no Mac e precisamos zero-friction antes de marketing público.

**Análise prévia (4 research agents em paralelo):**
1. Mapa do projecto — 114 scripts em `tools/router/`, deps reais, background services
2. Claude Code install deep-dive — `~/.local/bin/claude` + zero admin + auto-update
3. Benchmarks best-in-class — **uv venceu** como template (XDG-compliant, PowerShell simétrico)
4. Landing audit — "not ready for public traffic": install enterrado na secção 5, sem OS toggle, 403 em mooter.ai

**Commits (3 atómicos):**
1. `b835128` — `feat(cli): new cross-platform mooter CLI binary` (683 linhas, 11 ficheiros em `tools/cli/`)
2. `fe0e992` — `feat(install): streamlined one-liner installers (uv-style)` (install.sh -56%, install.ps1 -41%)
3. `05d8192` — `feat(landing): hero install command block + refreshed install section`

**Entregas:**
- `mooter` como comando de shell nativo com 7 subcomandos: default (spawn claude), doctor (10 checks com fix), init (wizard), update, uninstall, dashboard, --version/--help
- Install em `~/.local/bin/mooter` (XDG, zero admin em Mac/Win/Linux)
- Windows PATH via .NET API (NUNCA `setx` — trunca a 1024 chars)
- Mac/Linux env-file pattern (rustup-style, idempotente)
- Ollama + API key opcionais (graceful degradation, nunca hard-fail)
- Legacy preserved em `install-legacy.{sh,ps1}`
- Landing: hero com install command + OS tabs (auto-detect via userAgent) + prereq explícito

**Gotchas resolvidos:**
- PowerShell 5.1 lê UTF-8 sem BOM como ANSI → install.ps1 é ASCII-only
- `setx` Windows corrompe PATH → .NET API `SetEnvironmentVariable('Path', ..., [User])`
- Pipe install (`curl | sh`) precisa de fonte → installer detecta e git-clone para temp dir
- Hook registration duplicada nos 2 installers → factored out para `tools/cli/lib/register-hooks.js`

**Smoke test local passou:** `node tools/cli/mooter.js doctor` → 9/10 ✓ + 1 ⚠ (ANTHROPIC_API_KEY opcional).

**Pendentes (próxima sessão):**
- Testar em VM Mac limpa + VM Windows 11 limpa (o gate real antes de marketing público)
- Resolver 403 em mooter.ai (audit detectou o fetch falhar)
- Fase 2 landing: statusline GIF no hero + GitHub stars badge + MIT badge + v0.10 badge
- Distribuição tarball privada (R2) vs repo público stub — decisão pendente
- Homebrew tap + WinGet manifest (Fase 3)
- .exe signing para evitar SmartScreen

**Página Notion:** [🚀 Sessão 2026-04-19 — One-command install](https://www.notion.so/3476f6e42bc48124a4dee39b75c514cb)

**Addendum — audit + simulação + npm rewire (+5 commits):**

Depois da entrega inicial fez-se audit completo da landing + simulação end-to-end + ship dos loose ends:

- `995e9b1` — `fix(install): audit findings` (fix crítico do `git clone` de repo inexistente → agora imprime friends-beta message; fix do footer github URL; `< 5 min setup` → `60-second install`; demos `$ claude` → `$ mooter`)
- `8e523e2` — `chore(npm): rewire @mooter/cli stub for friends-beta reality` (`@mooter/cli@0.0.1` está publicado no npm; package bumped para 0.0.2 com URLs correctas + index.js imprime access message = paridade com install.sh pipe)
- `feba86f` — `test(install): regression smoke test + fix PS1 DryRun honesty` (tests/install-smoke.sh + README; fix do `[OK] PATH updated` false message em dry-run)

**Simulação Docker passou 100%** em fresh Linux container:
- Prereq gate (sem Claude Code → exit 3 friendly)
- Happy path (91 scripts router + 5 hooks + settings.json merge + device.id + shell profile injection)
- Friends-beta pipe path (zero disk writes)
- `mooter` commands (version/help/doctor/default/uninstall)

**PowerShell DryRun** validou parsing + detecção do ambiente real do Paulo.

### ✅ DEPLOY CONFIRMADO (2026-04-19 sessão addendum)

Push para origin/main (commit `acbb022`) → Vercel auto-deploy em ~12s → produção verde em todos os endpoints:

| URL | Antes | Depois |
|---|---|---|
| `mooter.ai` | 200 (Next.js `landing/`) | **200** ✓ |
| `mooter.ai/install.sh` | 200 (legacy) | **200** (nova versão) ✓ |
| `mooter.ai/install.ps1` | **404** ❌ | **200** ✓ |
| `mooter.ai/install-windows.ps1` | 200 (legacy) | **200** (alias mantido) ✓ |

**Pipe behavior verificado live**: `curl -fsSL https://mooter.ai/install.sh | bash` num Mac/Linux imprime friends-beta message com zero disk writes. `irm https://mooter.ai/install.ps1 | iex` em Windows idem.

**Descoberta durante deploy**: `landing/` (Next.js) **é o canónico** servido em mooter.ai (projectId `prj_2aZMQagzjYOtLyvofeWPnEA0mM1b`), apesar do seu `package.json` description dizer "Legacy... will be deprecated". O `mooter-landing/` (estático, projectId `prj_GLyS0L3q0Fc8Yd842o92addKZAGu`) é um **segundo projecto Vercel orphan** — ambos auto-deploy em push mas só o Next.js responde em mooter.ai. **Acção para Paulo**: decidir se delete `mooter-landing/` ou re-aponta a `mooter-landing` Vercel project para um preview/staging domain.

### ⏭ ACÇÕES PENDENTES (estratégicas, já não bloqueantes)

1. **Vercel dashboard cleanup** — `mooter-landing/` já foi removido do repo (commit abaixo). O **Vercel project `mooter-landing` (`prj_GLyS0L3q0Fc8Yd842o92addKZAGu`)** ainda existe no dashboard e vai falhar o próximo deploy (rootDirectory não encontrado). Acção: https://vercel.com/dashboard → project `mooter-landing` → Settings → Delete Project. 2 cliques. Se quiseres preservar como preview domain em vez de deletar, aponta-o para um novo repo stub.

2. **`cd mooter-package && npm publish`** para publicar o `@mooter/cli@0.0.2`. Até lá, `npx @mooter/cli` continua a puxar v0.0.1 com URLs quebradas.

3. **Testar em VM Mac limpa + Windows 11 limpa**. Docker proxia Linux mas Mac tem `launchctl` + `sysctl hw.memsize` não exercitados; Windows só testámos via DryRun.

4. **Distribuição v1.0**: tarball assinado em CDN (R2/S3) + `paulo-loureiro/mooter` público stub com install scripts — permite `curl | bash` real para general public.

---

### ✅ Sessão #32 — 2026-04-19 (Statusline v6.8 — ═ filler + coherence audit)

**Âmbito:** executar a probe agenda 8-12 deixada pela sessão #31, fazer coherence audit backend↔statusline, e shipping v6.8 quando todos os acceptance criteria passassem. Os 5 probes foram corridos em terminais VS Code frescos — **todos** renderaram 4 linhas. Descoberta chave: `═` (U+2550) está no mesmo bloco Unicode que o banido `─` (U+2500) mas NÃO partilha a East Asian Width pathology — render limpo, density muito mais próxima do v6.4 reference que o `-` ASCII do v6.7.

**Commits:**
1. `76eca09` — `feat(statusline): v6.8 prep — probes 8-12, 0% local always-show, coherence audit`
2. `e779895` — `docs(mooter-launcher): update doc comment to v6.7 flat multi-line reality`
3. `7e3ed57` — `feat(statusline): v6.8 — ═ filler chosen (probe 9), probes 1-12 cleaned`

**Probe resultados (todos ✅ 4 linhas):**
- Probe 8 — ASCII pseudo-corners `+---`
- **Probe 9 — `═` U+2550 DOUBLE HORIZONTAL** ← **escolhido para flatLine**
- Probe 10 — `▁` U+2581 lower-one-eighth block
- Probe 11 — `-` + single close-corners `╮┤╯`
- Probe 12 — no filler + trailing `\n`

**Entregas:**
- `flatLine()` agora usa `═` (com `MOOTER_FILLER` env override para debug)
- `tierCounts` fallback cumulativo na dispatch de `renderMultiLine` → `0% local` sempre renderiza em terminais frescos
- Coherence audit: 8 pills com source-of-truth comments citando variável + ficheiro (modeBadge, tierLegendPill, ctxPill, savedHero, effPart, sparkline, recBadge, localRow)
- `MOOTER_PROBE` switch mantido como escape hatch (corpo vazio + doc comment explica como adicionar probes novos); probes 1-12 payloads removidos (-121 linhas)
- `mooter.ps1` header comment actualizado para v6.7 flat multi-line reality

**Acceptance criteria (todos cumpridos):**
- [x] Pelo menos um probe 8-12 landed closer-to-`─` filler survived multi-line (probe 9 `═`)
- [x] Probes 1-7 removidas de produção; `MOOTER_PROBE` machinery preservada (probes 8-12 também removidas — serviram o propósito da sessão)
- [x] Coherence audit: cada pill com source-of-truth comment
- [x] `0% local` sempre visível quando `tierCounts.total > 0`
- [x] `ctx XX%` sempre visível quando Claude Code fornece `remaining_percentage`
- [x] `mooter.ps1` doc reflecte v6.7 reality

**Página Notion:** [🐮 Sessão 2026-04-19 v6.8](https://www.notion.so/3476f6e42bc4810888e3e64204721c85)

**Addendum — Mooline polish (mesma sessão, +2 commits):**
- `1d13fd1` — `feat(statusline): v6.8 refine — Moo default, pace sentiment, monthly label`
- `28db65c` — `feat(statusline): v6.8 polish — honest 'all-Opus session' + 5h sentiment`

Três dores concretas reportadas + visão de "mooline como storytelling" → escolhida variante Refine mínima + 2 polimentos extra:

1. **L1 default badge** — `routerMode.mode === null` deixou de ser silencioso. Render `🐮 Moo` em dim-rose. Trio completo: Moo (auto) / CrazyMoo (beast) / LazyMoo (zen).
2. **L2 all-Opus session** — quando `savingsPct == 0`, L2 agora escreve `🐮 all-Opus session` em vez do confuso `saved $0.00 (0%∅ vs all-Opus)`. Glyph `∅` removido. `parseFloat` gate para savedStr evitar `'0.00'` (string truthy).
3. **L3 pace sentiment** — `1%↓` substituído por palavra: `relaxed` / `on pace` / `burning` / `critical` (threshold pace_ratio).
4. **L3 5h sentiment** — `5h 27%` agora é `5h 27% cold` (ou warm/hot/throttling conforme used_pct).
5. **L3 monthly label** — `quota $X/Y` renomeado para `$X/$Y month` (período explícito).
6. **L3 ordem narrativa** — reordenado para `name → budget mensal → 5h → pace → sparkline`, lê como frase.

Zero logic/data changes — só apresentação. Single-line path (non-MOOTER_MODE) intacto por disciplina de blast-radius.

**Pendentes próxima sessão (#33) — candidatos a v6.9:**
1. **Probes 13-14 — combinar U+25xx elementos nunca testados juntos:**
   - Probe 13: `═` filler + single close-corners `╮┤╯` (probe 9 + 11 combo)
   - Probe 14: `═` + full box corners `╭╮├┤╰╯` (full v6.4 recovery attempt)
2. Se probe 14 render 4 linhas, recuperamos o look boxed v6.4 completo dentro do prompt do Claude Code — golden outcome.
3. Detectar terminal width real via input JSON do Claude Code (substitui o cap hardcoded de 90 cols).
4. Stretch: `MOOTER_LITE` env var (collapse para v6.5 single-line em terminais ~70 cols); `MOOTER_ASCII_ONLY=1` theme (swap emojis para `[mooter]`, `[T3]`).

---

### ✅ Sessão #31 — 2026-04-19 (Statusline v6.7 multi-line resurrected)

**Âmbito:** ressuscitar a statusline multi-linha v6.4 (que v6.5 tinha colapsado a 1 linha por suposta limitação do Claude Code). Confirmou-se via 7 probes que multi-linha É suportado — só `─` (U+2500) e cantos `╭├╰` partem o parser (wide-char width-overflow). Filler `-` ASCII rose viabiliza 3-row layered dashboard dentro do prompt do Claude Code, sem janelas externas.

**Commit:** `d8b596f` — `feat(statusline): v6.7 — multi-line resurrected inside Claude Code prompt`

**Entregas:**
- `tools/router/gsd-statusline.js` (+114 LOC): `flatLine()`, opt `flat` em `renderSubscriptionRow`/`renderLocalRow`/`renderMultiLine`, dispatch `MOOTER_MODE` vs `MOOTER_FORCE_MULTILINE`, fallback cumulativo de tier counts, `MOOTER_PROBE` switch (probes 1-7).
- `tools/router/mooter.ps1` (73 → 37 LOC): zero janelas externas. Set `$env:MOOTER_MODE='1'` + `& claude`. Mesma terminal.
- `tools/router/mooter-dashboard.js` (+5 LOC): `\x1B[3J` clear-scrollback fix (dashboard pane externo já não appenda).
- `docs/MASTER_PROMPTS/MOOTER_STATUSLINE_V6_7_MASTER_PROMPT.md` (NEW): handoff doc para sessão #32.

**A/B vivo:**
- `claude` → single-line v6.5 (conservador)
- `mooter` → 3-row layered (identity / savings / Claude Max + sparkline)

**Página Notion:** [Sessão 2026-04-19 v6.7](https://www.notion.so/3476f6e42bc48132814cd4fbdbafa7af)

**Pendentes próxima sessão (#32):**
1. Probes 8-12 (cantos ASCII `+|+`, filler `═`, anchors solo, trailing `\n` per line) — tentar chegar mais perto da `─` rose original.
2. Coherence audit — cada pill ganha source-of-truth comment.
3. Cleanup probes 1-7 — manter `MOOTER_PROBE` machinery como escape hatch.
4. Always-show `0% local` + `ctx 0%` quando data existe.
5. Detectar terminal width real via input JSON do Claude Code.

---

### ✅ Sessão #30 — 2026-04-19 (Mooter Performance — B4 shipped)

**Âmbito:** primeira entrega do `MOOTER_PERFORMANCE_MASTER_PROMPT.md`. B1 abandonado após inspecção (threshold Haiku 2048 tok > arbiter system prompt 320 tok — zero caching gain). B11 documentado condicional. Sessão arranca em B4.

**Commit:** `9929ccc` — `perf(mooter): B4 — implicit signal weight boost`

**B4 · Implicit signal weight boost**

- `tools/router/backtest.js` (+224 LOC): `analyze(decisions, opts)` aceita `{ boost }`. `sampleWeight(d, {boost, repeats})` retorna `1` quando boost=off (byte-identical pré-B4), `10` em correcção (/mooter-bad, honored upgrade override), `5` em shadow_demote, `0.5` em accepted feedback. Repeat 7d ×5 (capped ×50). Novo flag CLI `--weighted --dry-run`.
- `tools/router/backtest.test.js` (+171 LOC): 14 testes novos. 86/86 passa. Full suite 130+ tests green.
- `tools/router/classify.js`: INTACTO (git diff --stat vazio).
- Feature flag: `IMPLICIT_SIGNAL_WEIGHT_BOOST=1|true|on|yes`. Default OFF.
- Gold-labels replay: 96.4% (baseline preservado).
- Dry-run output: 26245 prompts no corpus actual, 0 corrections activas (esperado — flag OFF por default; ROI valida após 48h de feedback real com /mooter-bad e @opus overrides).

**Próxima sessão (Sessão #31, após 48h observação):**

1. B2 · Conectar Sprint B signals ao classifier (3 flags toggláveis: PROFILE_ADJUST_LOCAL, _RIGOR, _BUDGET)
2. B3 · Confidence thresholds por categoria
3. Correr `analyze-arbiter-accuracy.js` (a criar) para decidir se B11 activa
4. NÃO avançar antes de confirmar que router-tuning.json não regride accuracy

---

### ✅ Sessão #29 — 2026-04-18 late (Claude Certified Architect)

**22 commits CCA shipped em ~6h.** Score 19/100 → **87/100 CERTIFICADO** (PASS em final-reviewer Opus 4.7). Página Notion da certificação: [🏆 Mooter CCA (2026-04-18)](https://www.notion.so/3466f6e42bc481dfbe28fad9a9e71d33). Log de sessão: [Sessão #29](https://www.notion.so/3466f6e42bc481e49038fb619d0f2ad5).

**Missão próxima sessão (se Paulo pedir continuar CCA):**
1. Configurar Sentry DSN em Vercel/Cloudflare/shell — observability cega enquanto DSN ausente
2. Coverage ratchet 55 → 70 → 80 (alvo: fx.js, backtest.js)
3. ESLint zero-tolerance (promover warn → error)
4. Service layer read-only routes (stats, models, version)
5. Husky + lint-staged pre-commit
6. Audit 1-a-1 dos 3 commits landing out-of-scope

**Missão alternativa:** v1.0 Friends Beta próximas features (conforme ROADMAP.md).

---

---

### ✅ Sessão #25 — 2026-04-17 (post-crash recovery + router deep fixes)

**Contexto da sessão:** PC crashou; tester offline há 3h. Paulo pediu restauro + ataque a todos os problemas acumulados.

**Commits desta sessão:**
- `0184bee` fix(router+hub): tester reliability pass + installed_fleet telemetry

**Entregas:**

| # | Task | Status | Nota |
|---|---|---|---|
| 1 | Token telemetry pipeline partido | ✅ | `update-metrics.js` criado em `~/.claude/tools/router/`; 5.04M tokens agora visíveis; saved real $33.96 (69.8%) — bem menos que os $1360 inflacionados do dashboard antigo |
| 2 | Misrouting backlog (100 pending) | ✅ | 20/28 falsos positivos eliminados (null expected_tier skip + meta-prompt filter reforçado) |
| 3 | Tester 5/6 Ollama models a 98-100% errors | ✅ (código) | `callOllama` patch: +keepalive 15m, timeout 120→180s, ANSI strip, stderr capture. Warmup pass adicionado. Activa a próximo restart |
| 4 | T1 accuracy 41% | ✅ | Root cause: `generateOllamaPrompts` confiava em labels Ollama não-fiáveis. Fix: self-consistency check com classify.js |
| 5 | P1 OAuth landing | ⏳ aguarda Paulo | Código verificado OK; falta adicionar env vars em Vercel + redeploy (ver secção abaixo) |
| 6 | P2 device-heartbeat | ✅ (código) | Endpoint + migration 007 já existiam. Adicionado `installed_fleet` a `/api/stats` (queries `device_heartbeats` directo). Aguarda deploy |
| 7 | Dashboard v2 | ✅ | `/mooter-summary` reescrito: separa uso real de synthetic tester, mostra 6 novas secções (tester lab, tier accuracy, model performance, A/B wins, optimizer, backlog) + Health Alerts automáticos |

**Ficheiros tocados:**
```
~/.claude/tools/router/update-metrics.js              (novo)
~/.claude/tools/router/mooter-summary-full.js         (novo)
~/.claude/skills/mooter-summary/SKILL.md              (reescrito)
~/frugal/tools/router/mooter-continuous-tester.js     (5 patches, commit 0184bee)
~/frugal/hub/routes/stats.js                          (+installed_fleet, commit 0184bee)
```

**Problemas revelados pelo dashboard v2 (estavam escondidos):**
1. Token telemetry pipeline simplesmente não existia (`update-metrics.js` em falta)
2. 89.6% dos "prompts all-time" eram synthetic tester, inflacionando savings reais 10×
3. Misrouting counter contava `expected=null` como T0 → falsos positivos
4. `generateOllamaPrompts` gerava labels não-fiáveis → T1 accuracy artificialmente baixa

### ✅ Sessão #25-continued — 2026-04-17 (Claude Code Windows, CLI via Vercel + Wrangler)

**Recap:** CLI Vercel + Wrangler foram instaladas nesta sessão (login OAuth já existia). Todos os pendentes manuais foram executados daqui.

| Passo | Status | Evidência |
|---|---|---|
| P1 Vercel env vars | ✅ feito | `vercel env ls production` mostra NEXT_PUBLIC_SUPABASE_URL + ANON_KEY correctas (valores iguais ao `.env.local`) |
| P1 Vercel redeploy | ✅ feito | Deploy `landing-chng0plr1` Ready, aliased a mooter.ai, 16:05 UTC-3 |
| P1 OAuth validação browser | ✅ confirmado | Paulo chegou a `/onboarding` via GitHub OAuth |
| P2a CF D1 migration 007 | ✅ feito | `wrangler d1 execute mooter-hub --file migrations/007_device_heartbeats.sql --remote` aplicou tabela `device_heartbeats` |
| P2b CF Worker deploy | ✅ feito | `wrangler deploy -c wrangler.mooter.toml` → https://mooter-hub.frugal-hub.workers.dev · Version 1083105c-ac10-4f00-af56-88eea2e5ae37 |
| P2c Validação end-to-end | ✅ feito | POST `/api/device-heartbeat` → `{ok:true}` · GET `/api/stats` → `installed_fleet.total_devices: 1` |
| Onboarding fix | ✅ feito | Botão Next estava silenciosamente disabled; adicionado `• required` marker no hardware + dynamic button label + estimated impact card. Commit `8592d73`, deploy `landing-chng0plr1` |
| Tester restart | ⏳ pendente Paulo | Janela cmd aberta: Ctrl+C → seta-cima → Enter para activar patches (callOllama, warmup, misrouting skip, self-consistency) |

**Notion session pages:**
- Sessão #25: https://www.notion.so/3456f6e42bc4810099aae0b5d1ede30e
- Sessão #25-continued (ship session): atualizar no próximo wrap
- Sessão #26 v2.1 (auth polish + Ollama factual fix): https://www.notion.so/3456f6e42bc48199b3dadda0023576e3

### ✅ Sessão #26 — 2026-04-17 (auth area polish — login hero + onboarding intelligence)

**Recap:** Paulo feedback pós-#25 — "a página após sign in ficou muito simples e pouco profissional; falta análise do setup e integração com providers; look&feel tem de bater com landing". Resposta: 3 commits atómicos, deploy imediato.

| Fase | Ficheiro | Commit | Mudança |
|---|---|---|---|
| A — Login hero | `app/(app)/layout.tsx` | `1a4c4e4` | Substituiu bloco `!user` (60 palavras) por `<LoginHero/>`: headline com accent `Haiku can do`, strip de live stats (prompts routed · avg savings · community USD) puxado do hub `/api/stats`, CTA GitHub proeminente em `--accent`, trust microcopy ("keys stay local"). Sem links repo públicos (doutrina). +210/-44 |
| B — HW auto-detect | `app/onboarding/page.tsx` | `26a86e5` | Probe browser: `navigator.userAgent` + `hardwareConcurrency` + `deviceMemory` + WebGL `UNMASKED_RENDERER_WEBGL`. Card "We detected your machine" com OS / CPU / GPU / RAM + botões "This looks right" / "Pick manually". Pré-selecciona chip hw automaticamente. Fallback silencioso se WebGL bloqueado. +190/-1 |
| C — Providers + Ollama | `app/onboarding/page.tsx` | `ec6e36e` | Relabel "subscriptions" → "providers" + microcopy privacy ("keys stay local after install"). Card recomendação Ollama condicional ao hw: `qwen2.5-coder:14b` para NVIDIA high-end (RTX 30/40/50/A/H100), `qwen2.5-coder:7b` para M-series + NVIDIA médio, `qwen2.5:3b` para AMD. Cloud/other não mostra card. +118/-1 |

**Deploy:** `vercel --prod` → `dpl_3ZhAJmcGHa3RRLyC5i5iTZDaRccJ` Ready, aliased a `mooter.ai` em 2 min.

**Risco mitigado:**
- WebGL pode retornar genérico em Firefox/Safari strict → fallback para chip manual
- `deviceMemory` só Chrome → render condicional
- Nenhuma mudança em `/api/me`, `/api/profile`, `generate-frugal-config.ts`, Supabase schema

**Pendente teste browser:** Paulo abrir `mooter.ai` em incognito, sign in → verificar novo hero + confirmar que auto-detect acerta hardware real (Windows PC → deve detectar GPU NVIDIA e suggerir `windows_nvidia`).

### ✅ Sessão #26 v2.1 — 2026-04-17 (polish pós review)

**Feedback Paulo:** "ainda não está no padrão da landing, não tem o logo que montamos, cores não estão corretas, informações de modelo local não convencem".

**Diagnóstico:** login v2 ainda usava 🐮 emoji em vez do `MooterLogo` SVG da landing; título não batia com canonical "Route smarter. Ship faster."; provider icons estavam ausentes; recomendação Ollama inventava `qwen2.5-coder:7b` com sizes fabricados — **não alinha com os modelos que o router real (`classify.js`) usa**.

| Commit | Mudança |
|---|---|
| `9e5cd22` | `layout.tsx` — inline `MooterLogo` 104px (SVG idêntico ao `page.tsx:300` e `public/mooter-logo.svg`: cream head+ears `#F5EDD4`, orange muzzle `#FF6B35`, dark eyes `#1C1209`, eye gleams). Wrapper com float animation + 40px orange drop-shadow mirror de `.hero-logo-mark`. Título canónico landing "Route smarter. Ship faster." com accent phrase. CTA laranja sólido com `boxShadow: 0 10px 30px rgba(255,107,53,0.28)` + color `#000` matching `.hero-cta`. Provider icons row "routes to: Ollama/Anthropic/OpenAI/Gemini/Qwen/DeepSeek" duplicados inline (boundary client-component preservada, zero blast na landing). +125/-63 |
| `6958c5c` | `onboarding/page.tsx` — reescreve `recommendOllamaModel` para devolver `{ baseline, optional[], note }` alinhado com classify.js real: `qwen2.5:3b` baseline (~1.9 GB), `qwen2.5-coder:14b` (~9 GB) code, `deepseek-r1-distill-qwen:14b` (~9 GB) math, `qwen3:30b` (~18 GB) heavy reasoning. Card UI passa a mostrar baseline row ("installer pulls") + optional rows ("ollama pull"). Mac M-series e NVIDIA high-end recebem stack completa; AMD só baseline+coder (ROCm caveat); cloud/other não mostra card. +149/-51 |

**Deploy:** `dpl_Huz2UMPZYhqjZspZPsmejnaASDrA` Ready, aliased a `mooter.ai`.

**Validação factual router models (ground truth):**
```
classify.js:107-112:
  ollama_terse:   qwen2.5:3b                    (legacy alias + default)
  ollama_reason:  qwen3:30b
  ollama_code:    qwen2.5-coder:14b
  ollama_math:    deepseek-r1-distill-qwen:14b
```
Nota: `generate-frugal-config.ts:49` ainda usa `isMac ? 'qwen2.5:3b' : 'qwen2.5:7b'` — `qwen2.5:7b` não existe no router. **Loophole pequeno para próxima iteração** (não afecta onboarding UI directamente, só o `frugal_config` JSON guardado em DB).

### 🔴 ÚNICO PENDENTE MANUAL (Paulo)

**Restart do tester** para activar patches já commitados:
- Vai à janela cmd preta onde o `mooter-continuous-tester` está a correr
- `Ctrl+C` (pára limpo) → seta-para-cima → Enter (repete o comando)
- Activa: callOllama keepalive/timeout fix, warmup pass, misrouting null-skip, ollama-gen self-consistency

### Após restart, deixa correr 10-15 min e depois:
```
/mooter-summary
```
Esperado: Health Alerts de 10 → 0-2. Se algum modelo Ollama ainda falhar, stderr real é agora capturado e diagnosticável.

### ✅ Sessão #27 — 2026-04-18 (review #11 + counters data layer)

**Recap:** `/mooter-review` review #11 (6277 eventos novos desde 2026-04-17 20:25). 0 misroutings. T0 delta caiu para 61% vs 69.8% all-time — diagnosticado via `model-reasoner` como **artefacto histórico**, não regressão (264 events do mesmo cluster pré-fix `bc4f84f` a re-aparecer no replay; classificador *actual* devolve T0 correctamente). Paulo decidiu: investigar + garantir counters live (prompts, tokens, savings) para alimentar landing v11 que Claude Design vai construir a seguir.

**Commits desta sessão:**

| Commit | Ficheiro | Mudança |
|---|---|---|
| `418776a` | `tools/router/mooter-review.js` + `tools/router/mooter-continuous-tester.js` | Counters data layer completo: `tokens_used` (sum `runs × avg_tokens` em `model_performance`), `savings_usd_cumulative` (de `savings-tracker.computeMetrics`), `cost_usd` real (via `pricing.PRICES × tokens`, deixa de ser hardcoded 0). Nova flag `--write-counters <path>` que escreve JSON sem avançar watermark. `total_tokens_cumulative` exposto em `mooter-tester-stats.json`. **Zero blast em UI** — só data layer. |

**Output live (counters block):**
```json
{
  "prompts_tested": 12556,
  "tokens_used": 281602,
  "savings_usd_cumulative": 37.3377,
  "cost_usd": 0,
  "ab_tests_run": 158,
  "optimizer_tests": 95,
  "misroutings_found": 47,
  "embeddings_built": 260,
  "reviews_completed": 11
}
```

**Pendente Claude Design (próxima sessão):**
- Wirear consumer da landing para `counters.json`. Para alimentar o ficheiro basta agendar (cron 5min ou dentro do tester loop):
  ```bash
  node tools/router/mooter-review.js --write-counters mooter-landing/counters.json
  ```
- Decidir: static file (cron writes) ou Vercel API route (chama `mooter-review.js --counters` on-demand)?

**Pendentes secundários:**
- T1 cumulativa em 45.4% (baixa) — próxima review analisar se misroutings T1 são tuning-friendly.
- Focus rebalance: `statusline` está em 18.5% do tester volume. Considerar `/mooter-focus` para distribuir.
- `generate-frugal-config.ts:49` ainda usa `qwen2.5:7b` (não existe no router) — herdado de #26 v2.1, não bloqueante.

---

### Instruções originais (referência histórica)

---

**Contexto:** 3 sessões Cowork Mac consecutivas (2026-04-16 14:21→19:30 UTC) instalaram o Mooter no MacBook Pro, resolveram 3 bugs P0/P3/P4, e confirmaram o Mac como novo device no hub global. Duas prioridades críticas ficam para Claude Code atacar.

### 🔴 PRIORIDADE #1 — P1 OAuth fix no Friends Beta landing

**Root cause CONFIRMADO via Chrome DevTools + source code analysis:**

O botão "Sign in" em `landing-five-azure-16.vercel.app` chama `loginWithGitHub()` (linha 12 de `landing/app/page.tsx`). A função bailha silenciosamente se `process.env.NEXT_PUBLIC_SUPABASE_URL` estiver vazio:

```typescript
function loginWithGitHub() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return;  // ← BAILS HERE (silent, no error)
  ...
}
```

Click físico em production produz **zero network requests** (confirmado via `read_network_requests` tool). Next.js substitui `NEXT_PUBLIC_*` em build time — se missing no momento do build, o string fica `undefined` no bundle → `return`.

Session Notion MP-7 (2026-04-12) documentou OAuth a funcionar. Regressão desde então. Provável: deploy posterior sem as env vars, ou as env vars foram removidas do Vercel.

**Fix steps:**
1. `vercel env ls --environment production` (CLI) OU Vercel dashboard → Settings → Environment Variables
2. Verificar/adicionar:
   - `NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...`
3. `vercel --prod` (trigger rebuild) OR Vercel dashboard → Redeploy
4. Validar: clicar Sign in → deve redirecionar para GitHub OAuth authorize

**Acceptance criteria:**
- Click em Sign in dispara redirect para `github.com/login/oauth/authorize?client_id=Ov23liKacZ4JUyjV0GLo&...`
- Após authorize, volta para `/auth/callback` com código
- `/dashboard` renderiza autenticado (não mais redirect para `/#access`)
- `frugal-doctor --sync` no Mac upserta em Supabase (`auth.token` criado em `~/.frugal/`)

### 🟠 PRIORIDADE #2 — P2: Adicionar endpoint `/api/device-heartbeat` no hub

**Status actual:** `curl -X POST .../api/device-heartbeat -d '{...}'` → `{"error":"not found"}`.

`install-mooter.command` do Cowork já tenta chamar este endpoint após install (linha que faz `curl -X POST ... /api/device-heartbeat`). Actualmente falha silenciosamente.

**Schema proposto** (consistente com `/api/delta` que funciona):
```typescript
POST /api/device-heartbeat
Body: {
  device_id: string (uuid),
  email?: string,
  os: 'macos' | 'windows' | 'linux',
  arch: string,
  hw_tier?: string,
  origin?: string,
  ts: string (ISO)
}
Response: { accepted: true, device_count_total: number }
Side effects: upsert em D1 `devices` table
```

**Benefício:** heartbeat permite popular `hw_distribution` em `/api/stats` **imediatamente após install** (hoje só aparece após primeiro backtest/hub-push, i.e. 24h + cooldown OU manual `--force`).

### ✅ Bugs RESOLVIDOS nesta sessão Cowork (não tocar; referência)

| Bug | Resolução | Commit |
|-----|-----------|--------|
| P0 classifier misroute | `ARCH_SIGNALS` guard threshold ≥2 matches → T3 | `3ee442c` |
| P3 hub-push schema | `strip "claude_" prefix + validate enum` | `b901c3d` |
| P4 hw-capability outdated | `recommended_t0 → qwen2.5-coder:14b` (installed) | local runtime |
| Hub URL stale | `frugal-hub` → `mooter-hub` em 24 ficheiros | `999f376` |

### 📋 Pendentes herdados (lower priority)

- [ ] Pull `qwen2.5-coder:7b` se quiser cobrir o range T0-code pequeno (optional)
- [ ] Correr validation-set completo no Mac para medir delta accuracy vs Windows
- [ ] Statusline redesign Sprint C (6 segmentos v0.9 spec)
- [ ] Multi-Model V2 (GPT/Gemini/Grok providers no classify.js)
- [ ] L10 self-healing `/mooter-review`
- [ ] Cleanup dos 15 subagents `gsd-*` velhos (de outra ferramenta, ocupam espaço)

### 🔧 Discoveries úteis para referência

1. **Hub enum para sub_profile:** só aceita `"max"` na versão testada (2026-04-16). Outros valores (`"pro"`, `"free"`, `"api"`, `"team"`, `"claude_max"`, `"claude_pro"`) retornam `{"error":"invalid sub_profile"}`. Talvez seja transitório durante beta; verificar quando Friends Beta abrir a mais users.

2. **`gemma4:e4b` IS um nome Ollama válido** (vs o que eu duvidei inicialmente). Pull funciona, modelo responde.

3. **`deepseek-r1-distill-qwen:14b` NÃO existe** no registry (manifest 404). O `hw-capability.json` tinha este como `recommended_t0` — actualizei para `qwen2.5-coder:14b` (installed). Alternativa pull-able: `deepseek-r1:14b` (se quiser).

4. **`hub-push.js` tem `PUSH_COOLDOWN_MS = 24h`** — usar `--force` para testar.

---

## 🏁 Sprints

| Sprint | Nome | Estado |
|--------|------|--------|
| v0.9.9 | INFRA.md + deploy | ✅ Shipped (2026-04-13) |
| Rebrand | frugal → Mooter | ✅ Shipped (2026-04-14) |
| Sprint B | METHODOLOGY + Shadow + Closed Loop | ✅ Shipped (2026-04-16) |
| Review #1 | Context-aware overrides + 48 TUNED | ✅ Shipped (2026-04-16, #22) |
| MacBook bootstrap | 3 Cowork sessions — install + 3 bugs fixed | ✅ Shipped (2026-04-16) |
| Sprint C | Statusline redesign + Multi-Model V2 | ⏳ Pendente |
| Full Rebrand | frugal → mooter em toda a app shell (dashboard, onboarding, setup, admin, settings, OG, APIs) | ✅ Shipped (2026-04-17, #24) |
| OAuth verification | Env vars OK, OAuth 302 OK, waitlist RLS fix, mooter.ai domain verified | ✅ Shipped (2026-04-17, #24) |
| v1.0 | Public OSS launch | 🔵 Roadmap |

## 📊 Stats actuais
| Métrica | Valor |
|---------|-------|
| Overall accuracy | 88.3% (GATE PASS) |
| Tests passing | 89/89 |
| Gold labels | 84+ |
| Patterns | 114+ (48 TUNED_PROMOTE_T0 + 7 ARCH_SIGNALS novos) |
| Mac savings-tracker | saved 69.2% ($0.24 over 4 prompts) |
| Hub global | 1 user, 1 prompt (Mac), 1 hw (apple-silicon), 1 sub (max) |

## 🧱 Stack técnica
| Camada | Tecnologia |
|--------|------------|
| Classifier | `classify.js` v0.10+ (regex, ~47KB, 11-pass + ARCH_SIGNALS guard) |
| Arbiter | Haiku 4.5 via Anthropic SDK |
| Hooks | UserPromptSubmit + PostToolUse + Stop |
| T0 Local | Ollama brew service (qwen2.5:3b/14b, gemma4:e4b, nomic-embed-text) |
| T1-T3 | Claude Haiku 4.5 / Sonnet 4.6 / Opus 4.6 |
| Telemetry | savings-tracker :7821 + hub Cloudflare + D1 |
| Landing | `mooter.ai` (public waitlist) + `landing-five-azure-16.vercel.app` (Friends Beta) |

## 🔗 Links

| Recurso | URL |
|---------|-----|
| Notion HQ | https://www.notion.so/33d6f6e42bc4816b977afe84bbe912c9 |
| Notion Sessão #4 — Mirror Win→Mac | https://www.notion.so/3446f6e42bc4818d8b40f023b3ed758f |
| MacBook Install Playbook | https://www.notion.so/3446f6e42bc48156a7a7fab59fa87ac5 |
| Sessão 2026-04-16 — Review #1 + Multi-device | https://www.notion.so/3446f6e42bc4819eb313fa21cf15765d |
| Sessão 2026-04-17 — Review #2 + Classifier Detox | https://www.notion.so/3456f6e42bc4812e81e3dac67cb73b3f |
| Sessão 2026-04-17 — Landing Redesign + Reviews | https://www.notion.so/3456f6e42bc481d3b8fccacf8ed8a56b |
| Sessão 2026-04-17 — Post-crash Recovery + Router Deep Fixes (#25) | https://www.notion.so/3456f6e42bc4810099aae0b5d1ede30e |
| Sessão 2026-04-17 — Cowork Ship (#25-continued) | https://www.notion.so/3456f6e42bc481f991f0c9538438417e |
| Sessão 2026-04-18 — Review #11 + Counters data layer (#27) | https://www.notion.so/3466f6e42bc481c99569cb216e748c5f |
| Sessão 2026-04-18 — Mooter Review #16 (classifier limpo) | https://www.notion.so/3476f6e42bc4810b9ad6e7c605acccad |
| Sessão 2026-04-19 — /doctor fix (MCP Windows + HOME env) | https://www.notion.so/3476f6e42bc481a1a3ffc682d7fcdc1f |
| Sessão #35 2026-04-21 — H2 hygiene + bidirectional drift | https://www.notion.so/3496f6e42bc4814286b1d4d41c1a658e |
| Sessão 2026-05-05 — Codex Integration v0.11 (advisory layer) | https://www.notion.so/3586f6e42bc48177894dd04aec7a0e16 |
| Sessão #37 2026-05-05 — Site coherence + install alignment + statusline mode trio | https://www.notion.so/3576f6e42bc481fab148fa6a26db00de |
| Sessão #39 2026-05-07 — Wave-2 readiness (5 patches → 87.5% accuracy) | https://www.notion.so/3596f6e42bc4818caaf2e3b18dd7a581 |
| Sessão #40 2026-05-07 — Wave-2 router-execute LANDED + Validation Master Prompt | https://www.notion.so/3596f6e42bc4812e824cf48bf8b9321d |
| Sessão #40-validation 2026-05-07 — Wave-2 Independent Audit (APPROVED_WITH_NOTES) | https://www.notion.so/3596f6e42bc481b9a9e4c80086087885 |
| GitHub repo (privado) | https://github.com/pauloloureiroshp-ship-it/frugal |
| Landing público | https://mooter.ai |
| Friends Beta (private) | https://landing-five-azure-16.vercel.app |
| Hub Cloudflare | https://mooter-hub.frugal-hub.workers.dev/api/stats |
| npm | https://www.npmjs.com/package/@mooter/cli |

---

*Cowork Mac working surface: `~/Documents/Claude/Projects/Mooter.ai (macOS)/` com logs, dumps, mapa operacional HTML, e este SYNC.md.*
