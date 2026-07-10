# WAVE 30 — Mega Synthesis (Quality + Validation + Continuous Infra)

**Composto:** 2026-06-07 ~14h BRT, Cowork
**Sequência:** Wave 29 SHIPPED (`v1.17.0-synthesis-ultimate` em `3e79ebe`, hub deployed LIVE 422 OK) → **Wave 30 Mega**
**Tag esperada:** `v1.18.0-mega-synthesis`
**Estimate:** ~30h CC autonomous (ultracode + dangerous)
**Owner:** Paulo observador + CC autonomous

---

## 🎯 Mega-wave rationale

Esta wave combina **3 propostas anteriores num único merge atomic** para máxima coerência:

- Wave 29.5 (Continuous Validation Infrastructure, ~10h)
- Wave 30 (Quality + Security original, ~18h)
- Benchmark v2 execution (em paralelo Phase L, ~4h reusing workflow)

**Por que mega vs split:** evita 3 PRs separados, mantém doctrine atomicity, aproveita Wave 29 LIVE (especialmente L14/L15/L16.1) para alimentar features novas, e shippa mission B6d aplicada em landing/README.

---

## 📋 Brief base (LER PRIMEIRO)

Master strategic context:
- `docs/strategy/MOOTER_ULTIMATE_VISION.md` — visão V5 16 layers, 60+ sources
- `docs/strategy/MOOTER_STRATEGIC_SYNTHESIS.md` — research foundation
- `docs/strategy/MOOTER_BIG_PICTURE_AUDIT.md` — 10 critérios scoring + gaps mapeados
- `docs/strategy/WAVE29_SYNTHESIS_KICKOFF.md` — Wave 29 base (SHIPPED)

Wave 28 Workflow Engine LIVE em `packages/workflow/` — use as primitives. **Não modificar.**

---

## 🛡️ NÃO QUEBRAR — Lista oficial (gate verification obrigatória)

| Componente | Razão |
|---|---|
| `tools/router/classify.js` sha `7b01eb86…87762` | Doctrine gate test obrigatório |
| `tools/router/inject_context.js` hook UserPromptSubmit | Path crítico routing |
| 6 subagents existentes (`.claude/agents/`) | Auto-learning depende |
| `subagentstop_hook.js` | Wave 22 foundation |
| `mooter sync` (Wave 26) | Production LIVE |
| `packages/workflow/` (Wave 28) | LIVE em prod, reusar não modificar |
| `packages/synthesis/` (Wave 29) | LIVE em prod, reusar não modificar |
| Statusline linhas 1-2 byte-idênticas | UI contract |
| 345 baseline tests + 74 Wave 29 tests | Todos pass após PR |
| Hub routes existentes (delta/events/feedback/heartbeat/models/stats/sync_events/version/workflows/pastor-v2/federated) | LIVE, apenas ADICIONAR `/v1/wave-status` |
| D1 migrations 001-014 | INTOCADAS — apenas adicionar 015 |

---

## 📐 Arquitectura proposta (zero modificação de existing)

### Novos packages / módulos / endpoints

```
packages/validation/                    # NOVO — Wave 30 mega
├── src/
│   ├── index.ts                        # Entry point
│   ├── bandit/                         # L16.2 Bandit Learner
│   │   ├── thompson-sampling.ts        # Thompson Sampling per (prompt_class × hardware × subscription)
│   │   ├── posterior-store.ts          # Bayesian state SQLite local
│   │   ├── reward-fn.ts                # outcome_accepted × (1/cost × latency_penalty)
│   │   └── doctrine-guardrail.ts       # classify.js hard guardrail honored
│   ├── adversarial/                    # Workflow Engine quality
│   │   ├── reviewer.ts                 # Adversarial reviewer (qwen3:30b)
│   │   ├── voter.ts                    # Convergence vote across reviewers
│   │   └── primitives-bridge.ts        # bridge para packages/workflow primitives
│   ├── benchmark/                      # MOOTER_SHOWCASE_BENCHMARK_v2
│   │   ├── runner.ts                   # 24 tasks × 5 models × 3 runs
│   │   ├── task-loader.ts              # Loads tasks from audit/BENCHMARK_v2_TASKS.json
│   │   ├── judge.ts                    # LLM-as-judge blinded (Opus 4.8 + GPT-5 + Gemini 2.5)
│   │   ├── mlwr.ts                     # Mooter Locality Win Rate calculation
│   │   └── reporter.ts                 # Output JSONL + Markdown + chart spec
│   ├── ci/                             # CI integration
│   │   ├── pr-comment.ts               # GitHub PR comment with MLWR delta
│   │   └── regression-detect.ts        # Block merge if MLWR drops >5pp
│   ├── threat-model/                   # Security
│   │   └── runtime-checks.ts           # Runtime threat vector probes
│   ├── cost-cap/                       # L8 guardrails
│   │   ├── limits-enforcer.ts          # Cost cap + anomaly detection
│   │   └── limits-config.ts            # Read ~/.mooter/limits.toml
│   └── recovery/                       # UX recovery flows
│       ├── error-catalog.ts            # 7 cenários documented
│       └── auto-recover.ts             # ollama-down, hub-offline, etc.
└── tests/

packages/cli/src/commands/              # NOVOS subcomandos (delegate only)
├── wave.ts                             # mooter wave {start, status, ship}
├── dogfood.ts                          # mooter dogfood log
├── state.ts                            # mooter state get
├── benchmark.ts                        # mooter benchmark run
└── recovery.ts                         # mooter recovery audit

packages/synthesis/src/state/           # NOVO em packages/synthesis (Wave 29 base)
└── central-state.ts                    # ~/.mooter/state.json single source of truth

packages/mcp-server/                    # NOVO — Mooter MCP server EARLY (movido de Wave 35)
├── src/
│   ├── index.ts                        # MCP entry point
│   ├── tools/
│   │   ├── status.ts                   # mooter_status
│   │   ├── dogfood-log.ts              # mooter_dogfood_log
│   │   ├── workflow-create.ts          # mooter_workflow_create
│   │   ├── ecosystem-recommend.ts      # mooter_ecosystem_recommend
│   │   ├── pastor-hint.ts              # mooter_pastor_hint
│   │   └── notion-auto-write.ts        # mooter_notion_write (per-wave SHIPPED)
│   ├── server.ts                       # MCP protocol server
│   └── manifest.json                   # MCP server manifest
└── tests/

.github/workflows/                      # NOVO CI
└── benchmark.yml                       # Per-PR: subset benchmark, post MLWR delta

hub/routes/
└── wave-status.js                      # NOVO — POST /v1/wave-status (cross-session sync)

hub/migrations/
└── 015_wave_events.sql                 # NOVO — track wave shipping events

.claude/skills/
├── workflows/                          # JÁ EXISTE
└── continuous-validation/              # NOVO
    ├── SKILL.md                        # Validation skill docs
    └── examples/

audit/
├── BENCHMARK_v2_TASKS.json             # NOVO — 24 tasks curated, 8 segments
├── BENCHMARK_v2_RUBRIC.md              # 5-criterion rubric
├── BENCHMARK_v2_RESULTS.jsonl          # OUTPUT (gerado por Phase L)
├── BENCHMARK_v2_REPORT.md              # OUTPUT
└── FRIENDS_LAUNCH_DMS_v6.md            # NOVO — pitch B6d-aligned

docs/
├── decisions/                          # NOVO directory
│   ├── 2026-06-07-mission-statement.md     # B6d decidida
│   ├── 2026-06-07-pricing-pending.md       # placeholder pricing
│   └── ADR-template.md                     # Architecture Decision Record template
├── security/
│   └── THREAT_MODEL.md                 # NOVO — formal threat model 7 vectors
├── ux/
│   ├── ERROR_CATALOG.md                # NOVO — 7 recovery scenarios
│   └── RECOVERY_FLOWS.md               # NOVO — user-facing recovery UX
└── architecture/
    └── MOOTER_MCP_TOOLS_SPEC.md        # NOVO — MCP server surface area spec
```

### NOT TOUCHED

- `tools/router/classify.js` (sha hard gate)
- `tools/router/inject_context.js`
- `tools/router/subagentstop_hook.js`
- `packages/workflow/` (Wave 28 LIVE)
- `packages/synthesis/src/lingua/`, `lora/`, `setup/`, `ecosystem/`, `quality/` (Wave 29 LIVE)
- Existing hub routes
- D1 migrations 001-014
- Statusline linhas 1-2

---

## 🔍 Phase A — Day 0 Honest Recon (T0/T1, 30min) 🔥

**ANTES de qualquer commit:**

1. **Confirm Wave 29 estado:**
```bash
git log --oneline main | head -10
git tag | grep v1.17.0
sha256sum tools/router/classify.js | head -c 16
```

Esperado: `v1.17.0-synthesis-ultimate` tag, sha `7b01eb86…`.

2. **Existing tests baseline:**
```bash
cd packages/cli && npm test 2>&1 | tail -5
cd ../workflow && npm test 2>&1 | tail -5
cd ../synthesis && npm test 2>&1 | tail -5  # Wave 29 ship
cd ../../hub && npm test 2>&1 | tail -5
```

Esperado: tudo pass.

3. **Hub LIVE confirm:**
```bash
curl -s -X POST https://mooter-hub.frugal-hub.workers.dev/v1/pastor-v2 -H 'Content-Type: application/json' -d '{}'
curl -s -X POST https://mooter-hub.frugal-hub.workers.dev/v1/federated -H 'Content-Type: application/json' -d '{}'
```

Esperado: 422 (validation rejection) ou 401 (auth required), não 404.

4. **Ollama LIVE:**
```bash
curl -s http://localhost:11434/api/tags | head -200
```

Esperado: JSON com 8 models.

5. **Pastor LoRA state:**
```bash
ls ~/.mooter/pastor/ 2>/dev/null
```

Esperado: pastor-v1.gguf ou similar.

**Output obrigatório:** `docs/strategy/WAVE30_DAY0_FINDINGS.md` com:
- Wave 29 SHIPPED confirmed
- Hub endpoints LIVE
- Existing tests baseline
- Premissas brief validadas/refutadas
- Path forward final

Se uma premissa core falhar, PARA e reporta.

---

## 📋 Phases B-O (14 phases, executar pela ordem)

### Phase B — Mission B6d apply (T0/T1, 1h)

Apply mission statement em:
- `README.md` (header h1 + tagline)
- `landing/app/page.tsx` (hero h1 + subtitle)
- `landing/app/_components/HeroSection.tsx` (se existe)
- `tools/router/glyphs.js` ou similar (CLI banner)

Apenas substituições text. Zero feature change.

**Gate:** mission "Your LLM router. Local-first. Learns forever." aparece em README.md + landing hero.

### Phase C — Decision logs + ADR (T0, 1h)

Cria `docs/decisions/`:
- `2026-06-07-mission-statement.md` (B6d decidida, rationale, alternatives considered)
- `2026-06-07-pricing-pending.md` (3 candidates: A acquihire, E híbrido OSS+SaaS+Enterprise, D marketplace; decisão Paulo pending)
- `ADR-template.md` (template para future decisions)

**Gate:** 3 ficheiros commited, ADR template tem placeholder structure.

### Phase D — `mooter wave` CLI + state.json (T2, 4h)

Implementa:
- `packages/synthesis/src/state/central-state.ts` — read/write `~/.mooter/state.json`
- `packages/cli/src/commands/wave.ts`:
  - `mooter wave start <number>` — automated branch + checklist + Day 0 recon
  - `mooter wave status` — current phase + tests + sha verify
  - `mooter wave ship` — automated PR + tag + Notion (via MCP em Phase K)
- Tests: unit + integration

**Gate:** `mooter wave status` outputs JSON valid; `~/.mooter/state.json` updated; existing tests pass.

### Phase E — `mooter dogfood log` (T1, 2h)

Implementa:
- `packages/cli/src/commands/dogfood.ts`:
  - `mooter dogfood log "friction description"` — append to `~/.mooter/dogfood.jsonl`
  - `mooter dogfood digest` — daily digest stats
- Pastor signal: friction patterns alimentam Pastor (opt-in)
- Statusline chip (linha 3): `🍖 5 friction logged today`

**Gate:** logs persistem, digest funcional, statusline chip opcional.

### Phase F — CI Benchmark GitHub Actions (T2, 3h)

Cria `.github/workflows/benchmark.yml`:
- Triggered on push to dev or PR to main
- Runs subset (3 tasks × 5 models × 1 run) ~~~5 min
- Compares MLWR delta vs main baseline
- Posts PR comment with delta table
- Blocks merge if MLWR drops >5pp (configurable)

`packages/validation/src/ci/`:
- `pr-comment.ts` — formats markdown table for PR comment
- `regression-detect.ts` — fails CI if regression

**Gate:** workflow runs on a test PR, posts comment, exits 0/1 correctly.

### Phase G — L16.2 Bandit Learner (T3, 5h) 🔒 CRÍTICO

`packages/validation/src/bandit/`:
- `thompson-sampling.ts` — Thompson Sampling per (prompt_class × hardware_class × subscription_tier)
- `posterior-store.ts` — Bayesian state em SQLite local (`~/.mooter/bandit-state.db`)
- `reward-fn.ts` — `outcome_accepted × (1 / cost_usd × latency_penalty)`
- `doctrine-guardrail.ts` — classify.js wins bandit (princ. 5 V4)

Integration ponto: `tools/router/inject_context.js` opcionalmente consulta bandit ANTES de classify.js (bias dentro do tier, nunca substituir classify decision).

**Gate:** unit tests pass (Thompson Sampling math); doctrine guardrail test (bandit cannot force lower tier when classify says T3); reward function deterministic.

### Phase H — Adversarial Review (T3, 4h)

`packages/validation/src/adversarial/`:
- `reviewer.ts` — adversarial reviewer agent (qwen3:30b local OR Sonnet 4.6 cloud opcional)
- `voter.ts` — convergence vote across N reviewers
- `primitives-bridge.ts` — usa `packages/workflow` primitives

Integration: Workflow Engine pode opcionalmente add adversarial review phase entre workers e synthesis.

Demo: `mooter workflow create "audit X" --adversarial` invoca review phase.

**Gate:** review primitive funcional contra mock; demo real com Ollama 3-reviewer cluster.

### Phase I — Threat model + supply chain audit (T2, 3h)

`docs/security/THREAT_MODEL.md`:
- 7 vectors mapped (prompt injection, supply chain, hub token, LoRA poisoning, federated poisoning, sandbox escape, wrangler persistence)
- Severity + mitigation atual + mitigation proposed
- Action items

CI:
- `.github/workflows/security.yml` — `npm audit` + Snyk scan on schedule
- Block merge if HIGH severity in deps

**Gate:** doc commited, CI workflow runs successfully, `npm audit` baseline saved.

### Phase J — Cost cap + anomaly detection (T2, 2h)

`packages/validation/src/cost-cap/`:
- `limits-config.ts` — read `~/.mooter/limits.toml`
- `limits-enforcer.ts` — runtime enforcement

Default limits (`~/.mooter/limits.toml`):
```toml
[limits]
max_workflow_cost_usd = 5.00
max_session_cost_usd = 50.00
max_t3_calls_per_5min = 30
max_concurrent_workflows = 3

[anomalies]
detect_unusual_spend = true
detect_lora_regression = true
detect_provider_outage = true
```

Integration: `agent()` em Workflow Engine consulta limits-enforcer antes de spawn. Se limit hit → throw + statusline alert.

**Gate:** limit hit triggers correctly em test; anomaly detection logs event; statusline chip aparece.

### Phase K — Mooter MCP server EARLY (T2, 4h)

`packages/mcp-server/`:
- `index.ts` + `server.ts` — MCP protocol server (stdio + SSE)
- Tools expostos:
  - `mooter_status` — current wave/phase/tests/sha
  - `mooter_dogfood_log` — log friction
  - `mooter_workflow_create` — create workflow from prompt
  - `mooter_ecosystem_recommend` — recommendations per setup
  - `mooter_pastor_hint` — latest Pastor hint
  - `mooter_notion_write` — auto-write Wave SHIPPED to Notion HQ
- Manifest JSON para MCP registry

CLI:
- `mooter mcp serve` — starts MCP server
- `mooter mcp install` — installs in Claude Code config

**Gate:** MCP server connects to Claude Code; tools listáveis; `mooter_notion_write` test triggers Notion API call.

### Phase L — Benchmark v2 execution (T2/T3, 4h) — em paralelo Phase K

`packages/validation/src/benchmark/`:
- `task-loader.ts` — loads `audit/BENCHMARK_v2_TASKS.json` (24 tasks, 8 segments)
- `runner.ts` — orchestrates 24 × 5 models × 3 runs = 360 calls
- `judge.ts` — LLM-as-judge BLINDED (3 judges: Opus 4.8, GPT-5, Gemini 2.5 Pro), median taken
- `mlwr.ts` — calcula Mooter Locality Win Rate per tier
- `reporter.ts` — JSONL + Markdown + chart spec

**Note:** Phase L pode rodar Workflow Engine recursivamente (`mooter workflow run benchmark-v2`).

**Outputs:**
- `audit/BENCHMARK_v2_RESULTS.jsonl` (raw, publishable)
- `audit/BENCHMARK_v2_REPORT.md` (analysis, blog draft)
- `audit/BENCHMARK_v2_HERO_CHART.png` spec

**Gate:** 360 runs complete (allow API failures gracefully); MLWR calculated per tier; report Markdown valid.

### Phase M — Recovery UX + responsive audit (T1/T2, 3h)

`docs/ux/ERROR_CATALOG.md` — 7 cenários:
- Ollama down → `mooter setup repair`
- Hub unreachable → local queue + statusline chip
- Subscription quota exhausted → bias local hard
- Workflow crash → resume cmd
- LoRA adapter incompat → fallback baseline
- Disk space low → pre-flight `mooter setup audit`
- Network slow → auto-degrade tier

`packages/validation/src/recovery/`:
- `error-catalog.ts` — TypeScript types per cenário
- `auto-recover.ts` — automated recovery flows

Responsive audit:
- Run Impeccable skill `npx skills add pbakaus/impeccable`
- Audit landing mobile + tablet
- Fix obvious responsive issues em `landing/app/`

**Gate:** error catalog doc commited; auto-recover tests pass; landing responsive em iPhone Safari simulator.

### Phase N — Statusline integration (T1, 2h)

Adicionar chips para linha 3 (opt-in default OFF):
- `🍖 5 friction logged today` (dogfood)
- `📊 MLWR 68% local` (benchmark snapshot)
- `🔒 limits OK` (cost cap status)
- `🔄 Wave 30 Phase X/N` (wave status)
- `💡 1 recommendation` (pastor hint)

NÃO modificar linhas 1-2 (byte-idênticas).

**Gate:** chips cycle correctly; linhas 1-2 unchanged.

### Phase O — Final-reviewer + PR + merge + tag (T3, 1h)

1. `final-reviewer` (Opus) sobre branch `wave30-mega-synthesis`
   - Zero HIGH severity
   - classify.js sha intacta
   - Existing 345 + 74 Wave 29 = 419 tests pass
   - New tests (target 80+) pass
   - Doctrine 8/8 compliance
2. PR `wave30-mega-synthesis` → `dev`
3. CI verde (incluindo NOVO benchmark CI + security CI)
4. PR `dev` → `main` (--merge)
5. **Tag DEPOIS do merge:**
   ```bash
   git fetch origin && git tag -f v1.18.0-mega-synthesis <new main HEAD>
   git push --force origin v1.18.0-mega-synthesis
   ```
6. **Hub deploy:**
   ```bash
   cd hub && npx wrangler d1 migrations apply mooter-hub --remote --config wrangler.mooter.toml
   npx wrangler deploy -c wrangler.mooter.toml
   ```
7. **Notion auto-write** via `mcp` tool `mooter_notion_write` (testing the new MCP server)

---

## 🎯 Sucesso (gate critérios)

- [ ] classify.js sha intacta (`7b01eb86…`)
- [ ] 345 + 74 = 419 existing tests pass
- [ ] 80+ new tests pass
- [ ] `mooter wave {start, status, ship}` LIVE
- [ ] `mooter dogfood log` LIVE
- [ ] CI benchmark workflow runs em PR test
- [ ] Bandit Learner Thompson Sampling unit tests pass
- [ ] Adversarial Review demo funcional
- [ ] Threat model doc commited + supply chain CI
- [ ] Cost cap limits.toml enforced em runtime
- [ ] Mooter MCP server installable + Notion auto-write smoke test
- [ ] Benchmark v2 RESULTS.jsonl gerado (360 runs)
- [ ] MLWR metric calculated per tier
- [ ] Error catalog doc + auto-recover flows
- [ ] Mission B6d aparece em README + landing hero
- [ ] final-reviewer SHIP zero HIGH 8/8 doctrine
- [ ] Tag `v1.18.0-mega-synthesis` em main HEAD
- [ ] Hub deployed + migrations 015 applied
- [ ] Notion sub-page auto-created via MCP

---

## 📊 Reporting

Per phase:
```
✅ Phase X SHIPPED | commit <hash> | tests <N> pass | notes: <findings>
```

Final:
```
🐮 WAVE 30 MEGA SHIPPED | tag v1.18.0-mega-synthesis em <hash>
- Mission B6d applied
- mooter wave/dogfood CLI LIVE
- L16.2 Bandit Learner (Thompson Sampling)
- Adversarial Review demo
- CI benchmark workflow + security
- Threat model + cost cap + recovery UX
- Mooter MCP server EARLY (Notion auto-write smoke OK)
- Benchmark v2 executed: MLWR T0=100% T1=X% T2=Y% T3=Z% overall=N%
- Score 10 critérios: 80 → 92/100
- Hub deployed migrations 015
- classify.js sha intact: 7b01eb86…
- All 419 + N tests pass
- Next: Wave 31 — Pastor v2 LORAUTER + Obsidian vault-sync
```

---

## 🛡️ Doutrina não-negociável (consolidada)

1. classify.js sha INTACTA até ao fim
2. Existing tests TODOS ainda passam
3. Wave 28 + Wave 29 packages INTOCADOS — apenas usar
4. Statusline linhas 1-2 byte-idênticas
5. Pastor v1 schema PRESERVADO
6. Privacy first — DP + k-anonymity ≥50 em qualquer agregado
7. Tag SÓ depois do merge dev→main (lição 10 waves consecutivas)
8. Mission B6d apply early (Phase B)
9. Doctrine wins bandit (princ. 5 V4)
10. MCP server testado via Notion auto-write smoke

---

*Brief composto pelo Cowork pós-Wave 29 SHIPPED. Mega-wave combina Wave 29.5 + Wave 30 + Benchmark v2 num único merge atomic.*
