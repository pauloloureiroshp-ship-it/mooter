# MOOTER — Big Picture Audit (10 critérios Paulo + Gap Detection)

**Composto:** 2026-06-07 ~12h BRT, Cowork
**Trigger:** Paulo pediu análise profunda de tudo, identificar gaps, refresh listas, big picture honest
**Estado base:** Wave 27 SHIPPED, Wave 28 SHIPPED `cd808df`, Wave 29 em curso (Phase K hub SHIPPED `5778a3d`, Phase D DeepSeek V4 provider em curso)
**Status doc:** Strategic synthesis canónico — pre-decisão Wave 30+ roadmap

---

## ⚡ Executive Summary (3 bullets)

1. **Score actual contra 10 critérios Paulo: 67/100.** Pontos fortes em L12-L16 já endereçados (Wave 29). Pontos fracos em: error/recovery UX, threat model formal, cost cap, public benchmark, data export/delete, MCP early, auto-update lists.
2. **10 gaps mapeados.** 8 cabem em Waves 30-35 existentes (zero scope creep). 2 são novas waves curtas (29.5 benchmark + decision Paulo monetisation).
3. **3 decisões pendentes do Paulo bloqueiam parte do roadmap:** mission statement <15 words · pricing model · friends-launch DMs (Task #218 desde 27/05).

---

## Part 1 — Scoring contra os 10 critérios

| # | Critério Paulo | Estado actual | Score | Gap-principal |
|---|---|---|---|---|
| 1 | Objetivo claro | V5 16 layers + 8 dimensions + 1-sentence pitch | **8/10** | Mission statement <15 words não existe |
| 2 | UX/UI end2end | Statusline 3-lines, CLI, landing, wizard, dashboard | **7/10** | Error catalog + recovery flows + responsive mobile audit |
| 3 | Security by default | isolated-vm sandbox, adversarial probes Phase E, HMAC α auth, BYOK, DP+k-anon | **8/10** | Threat model formal doc, supply chain audit (`npm audit`) |
| 4 | Dados estruturados | D1 schema 14 migrations, SQLite checkpoint Workflow, JSON profiles | **6/10** | Schema versioning automated, data export/delete (GDPR), retention policy |
| 5 | Token efficiency | Tiered routing, LLMLingua (Wave 29 L12), Caveman bundle, Workflow $0.0028/run, Pastor 257 decisions trained | **8/10** | Prompt template cache, response cache com TTL, context window auto-summarize |
| 6 | Continuous benchmark vs subscriptions | Proposta `MOOTER_SHOWCASE_BENCHMARK_v2` + MLWR metric inventado | **5/10** | Auto CI benchmark, public `/benchmark` page LIVE updated, MLWR no statusline |
| 7 | Transparência total | statusline 3-lines, `mooter status/setup/ecosystem/quality stats`, dashboard | **7/10** | Audit page `/audit`, webhook events, cost breakdown live por sessão |
| 8 | Guardrails dangerous mode | classify.js hard, isolated-vm, final-reviewer Opus gate, doctrine wins | **7/10** | Cost cap (>$X abort), anomaly detection (N T3 in 5min freeze), rate limit formal |
| 9 | Notion sempre | Wave sub-pages registadas (Wave 26/27/28 done) | **6/10** | Auto-write via Mooter MCP, per-decision opt-in log automatic |
| 10 | Updated lists (LLMs, subs, perf) | Static em `audit/` files | **5/10** | Auto-fetch model registry (Ollama/HF), pricing scraper, benchmark refresher diário |

**Total: 67/100 — `B+`.** Há gaps reais, todos endereçáveis sem scope creep.

---

## Part 2 — Listas refresh (2026-06-07)

### 2.1 Anthropic subscriptions (current)

| Plan | Price/mo | Annual | Use case Mooter |
|---|---|---|---|
| Free | $0 | — | Demo only, no Mooter benefit |
| **Pro** | $20 | $17 ($200/yr) | Solo vibe coder, marginal Mooter savings |
| **Max 5x** | $100 | — | Power user, Mooter biases for frontier+cache |
| **Max 20x** 🐮 Paulo | $200 | — | Heavy daily, **marginal cost = $0** for Claude → Mooter aggressive frontier |
| Team Standard | $25/seat | $20/seat ($240/yr) | 5-150 seats, Mooter helps team coordinator |
| Team Premium | $125/seat | $100/seat ($1200/yr) | 5x Standard, agentic coding |
| Enterprise | Custom | Custom | Mooter privacy + DP + audit appeal |

**Insight novo:** Team Premium ($125/seat) é underserved no Mooter. Wave 30+ pode adicionar `team-mode` features (shared Pastor, team workflows).

### 2.2 Top open-weight coding LLMs (Junho 2026, **com novidades**)

| Model | SWE-Bench Pro | LiveCodeBench | License | Context | **Notas Mooter** |
|---|---|---|---|---|---|
| **🆕 MiniMax M3** (Jun 2026) | **59.0%** (top open) | — | Apache 2 | **1M** | NOVO. Multimodal + 1M context. **Adicionar Wave 33 T2 alternative.** |
| **GLM-5.1** (Z.ai) | 58.4% | — | **MIT** | 200K | **8h long-horizon execution.** Wave 29 D já adicionou DeepSeek V4 — considerar GLM-5.1 também. |
| **DeepSeek V4 Pro** | 80.6% Verified | **93.5%** lead | MIT | Long | Wave 29 D em curso ✅. Coding leader. |
| **Qwen 3.6 27B** | — | 71.78 avg | Apache 2 | 1M | Best efficiency/active parameter. Already in Mooter LoRA base (qwen2.5-coder:7b). |
| **Kimi K2.6** | — | — | open | long | **#1 Artificial Analysis Intelligence Index.** Lead agentic-coding HLE-with-tools. |

**Gap identificado:** MiniMax M3 saiu **HÁ DIAS** (Junho 2026). Mooter ainda não tem suporte. Wave 33 candidate ou earlier (1M context é diferencial para Workflow Engine — single workflow pode comer codebase inteira).

### 2.3 Anthropic ecosystem (current)

| Categoria | Count | Como Mooter usa |
|---|---|---|
| Plugins official | **55+** | Mooter pack ecosystem mirrors (Wave 35) |
| Plugins community | **72+** (wshobson/agents lead) | Cross-reference em `audit/ECOSYSTEM_CATALOG.json` (Wave 29 L15) |
| MCP servers community | **5,000+** | Mooter MCP server (Wave 35) deve aparecer aqui |
| MCP Registry official | **2,000+** | Mooter pode submeter quando ready |

**Insight ALTO:** com 5,000+ MCP servers no mercado, Mooter expor MCP server **só na Wave 35 é tarde.** Mover para **Wave 31** ou **Wave 32**. Diferencial market window comprime.

---

## Part 3 — Os 10 Gaps reais (com fix proposal)

### 🎯 GAP 1 — Mission statement <15 words não existe

**Estado:** 1-sentence pitch tem ~50 palavras. Demasiado longo para landing hero, GitHub bio, tweet headline.

**Proposta — 3 candidatos para Paulo escolher:**

1. **"Mooter: smart router that learns. Local-first. Privacy by default. Anthropic-aligned."** (10 words)

2. **"The open-source LLM router that adapts to your hardware, subs and prompts — forever."** (14 words)

3. **"Mooter routes your prompts to the cheapest model that wins. Locally. Privately. Continuously learning."** (14 words)

**Wave:** 29.I (decision Paulo) → landing + README + Tweet bio.

### 🎯 GAP 2 — Error states + recovery UX não documentados

**Estado:** Wave 28 fix Ollama mostrou friction real. Sem doc formal de falhas + recovery flows.

**Cenários a documentar (em `docs/ux/ERROR_CATALOG.md`):**

| Cenário | UX hoje | Recovery proposed |
|---|---|---|
| Ollama down | `mooter sync` falha silencioso | Statusline alert + `mooter setup repair` cmd |
| Hub unreachable | Routing falha | Local queue, retry exponential, statusline chip "📡 offline mode" |
| Subscription quota exhausted | Cloud calls 429 | Bias local hard, statusline "🚨 budget exhausted, local-only" |
| Workflow crash mid-run | Wave 28 auto-resume LIVE | UX face: `mooter workflow resume <id>` + watch TUI auto-detect |
| LoRA adapter incompat | qual model failure | Fallback baseline, statusline "⚠ LoRA off, baseline mode" |
| Disk space low | install/cache failures | Pre-flight check `mooter setup audit` |
| Network slow (>5s p99) | Cloud calls timeout | Auto-degrade tier (T3→T2→T1) |

**Wave:** 30 (Adversarial Review é boa companhia — quality é uma forma de recovery).

### 🎯 GAP 3 — Threat model formal não existe

**Estado:** Wave 28 Phase E provou security empíricamente (adversarial probes). Mas sem doc formal.

**Proposta `docs/security/THREAT_MODEL.md`:**

| Vector | Severity | Mitigation actual | Mitigation proposed |
|---|---|---|---|
| Prompt injection via skill | High | Skills curados | Sandbox skill execution + signature verification |
| Supply chain (npm deps) | High | None formal | `npm audit` in CI, Snyk scan, lockfile pinning |
| Hub admin token leakage | High | Already mitigated (Wave 26 α auth) | Document, rotate policy |
| LoRA adapter poisoning | Medium | Pastor trains on user data only | Adapter signature + provenance check |
| Federated aggregation poisoning | Medium | k-anonymity ≥50 (Wave 29 L9) | DP-SGD epsilon=1.0 + outlier detection |
| isolated-vm sandbox escape | Critical | Wave 28 Phase E probes pass | Continuous fuzz testing |
| Wrangler token persistence WSL2 | Medium | Wave 26 friction documented | Auto-renew + revoke unused |

**Wave:** 30 (junto com Adversarial Review — natural companion).

### 🎯 GAP 4 — Cost cap + anomaly detection

**Estado:** Doctrine "doctrine > optimisation" implies guardrails, mas sem **automated kill switches**.

**Proposta — Limits config em `~/.mooter/limits.toml`:**

```toml
[limits]
max_workflow_cost_usd = 5.00     # workflow > $5 → abort + alert
max_session_cost_usd = 50.00     # session > $50 → freeze, ask user
max_t3_calls_per_5min = 30       # >30 T3 in 5min → freeze
max_concurrent_workflows = 3     # simultaneous workflow cap

[anomalies]
detect_unusual_spend = true       # 3× user baseline → alert
detect_lora_regression = true     # quality score drop >5pp → alert
detect_provider_outage = true     # >3 consecutive failures → switch provider
```

**Wave:** 30 (alongside threat model). Implementation: `tools/router/limits-enforcer.js`.

### 🎯 GAP 5 — Public benchmark leaderboard

**Estado:** Proposta `MOOTER_SHOWCASE_BENCHMARK_v2` ainda em sketch. Não há `/benchmark` page LIVE.

**Proposta:** Wave 29.5 (em paralelo Wave 30):
- Execute benchmark v2 (24 tasks × 5 models × 3 runs)
- Output: `audit/BENCHMARK_v2_RESULTS.jsonl` (publishable)
- Page LIVE: `mooter.ai/benchmark` com:
  - MLWR metric updated weekly (CI)
  - Per-segment comparison table
  - Anyone can submit a workflow run (via PR)
- Tweet thread + blog post pre-friends-launch

**Wave:** 29.5 (paralelo) + Wave 32 (auto-refresh CI).

### 🎯 GAP 6 — MCP server FORMAL muito tarde

**Estado:** Roadmap Wave 35. MCP ecosystem tem 5,000+ servers, market window comprime.

**Proposta:** **Mover MCP server para Wave 31.** Razões:
- Triple-stack V4 §1.3 explicit prioritisa MCP
- 5,000+ servers = network effect já em curso
- MCP é o "AWS pluggable" da AI tooling 2026
- Mooter MCP server expõe: `mooter_workflow_create`, `mooter_sync_status`, `mooter_pastor_hint`, `mooter_ecosystem_recommend`

**Wave:** 31 (em vez de 35). Wave 35 fica para Plugin Claude Code marketplace publish.

### 🎯 GAP 7 — Auto-update lists

**Estado:** `audit/ECOSYSTEM_CATALOG_v1.json` será static (Wave 29 L15).

**Proposta:** Background job + CF Worker cron:
```
hub/jobs/refresh-ecosystem.js (daily)
  - Fetch Anthropic pricing page → parse
  - Fetch Ollama Hub /api/library → parse
  - Fetch HuggingFace trending coding models → parse
  - Fetch LLM-Stats leaderboard JSON
  - Update D1 `ecosystem_catalog` table
  - Notify user via statusline chip if relevant new
```

**Wave:** 34 (paralelo com hardening).

### 🎯 GAP 8 — MiniMax M3 NOVO não está no roadmap

**Estado:** Saiu em Junho 2026. 1M context + multimodal + 59.0% SWE-Bench Pro = killer.

**Proposta:** Wave 33 (Speculative + Arbitrage) adicionar MiniMax M3 como **T2 alternative open-weight com 1M context** — diferencial massive para Workflow Engine (single workflow pode load codebase inteira).

**Wave:** 33 add.

### 🎯 GAP 9 — Data export/delete (GDPR + ethics)

**Estado:** Sem commands. Enterprise blocker.

**Proposta:** Wave 32 add:
```bash
mooter data export --format json > my-mooter-data.json    # exporta tudo local
mooter data delete-all --confirm                           # apaga local
mooter data forget-me --confirm                            # delete hub data too (federated unlearn)
```

CF Worker endpoint `/v1/forget-me` aceita device_id + secret → marks for k-anonymity erasure.

**Wave:** 32.

### 🎯 GAP 10 — Mobile / responsive audit

**Estado:** Não sabemos se `mooter.ai/dashboard` funciona em mobile.

**Proposta:** Wave 30 add 1h audit:
- Run Impeccable skill `npx skills add pbakaus/impeccable` → audit landing
- Test em iPhone Safari + Android Chrome
- Fix obvious responsive issues
- (não vamos fazer mobile app — out of scope)

**Wave:** 30 (1h add).

---

## Part 4 — Roadmap actualizado com gaps integrados

| Wave | Tag esperada | Goal | Gaps cobertos | Effort |
|---|---|---|---|---|
| **29** (em curso) | `v1.17.0-synthesis-ultimate` | L12-L16 + 3 Paulo vectors | 1 (mission via L14) | ~29h |
| **29.5** (paralelo) | `v1.17.1-benchmark-v2` | MOOTER_SHOWCASE_BENCHMARK_v2 execution | 5 (benchmark page) | 6h |
| **30** | `v1.18.0-quality-security` | Bandit L16.2 + Adversarial + **threat model + cost cap + responsive audit** | 2, 3, 4, 10 | 22h |
| **31** | `v1.19.0-pastor-v2-mcp` | Pastor v2 LoRA hot-swap + Obsidian + **MCP server FORMAL** | 6 | 18h |
| **32** | `v1.20.0-turboquant-data` | TurboQuant + Edge + **data export/delete GDPR** | 9 | 14h |
| **33** | `v1.21.0-arbitrage-multimax** | Speculative + Arbitrage + **MiniMax M3 T2 alt** | 8 | 14h |
| **34** | `v1.22.0-federated-auto** | LLMLingua hardening + Federated + **auto-update lists job** | 7 | 16h |
| **35** | `v1.23.0-marketplace** | Plugin Claude Code marketplace + Pack ecosystem publish | (MCP moved to 31) | 14h |

**Total:** ~133h CC autonomous spread em 6 semanas part-time. Score esperado pós-Wave 35: **95/100.**

---

## Part 5 — Big picture diagram (V5 + 10 critérios)

```
                          MOOTER V5 ARCHITECTURE
                          ─────────────────────

L0  CACHE + GUARDRAILS                                    [crit 8]
L1  FEATURE EXTRACTION                                    [crit 5]
L2  kNN CLASSIFIER (regex, <50ms, $0)                     [crit 5, 7]
L3  LLM-AS-JUDGE FALLBACK (cap 5%)                        [crit 8]
L4  DISPATCH (6 subagents)                                [crit 4]
L5  CASCADE TIER (T0→T1→T2→T3)                            [crit 5, 6]
L6  SPECIALIST ROUTING (DeepSeek V4, GLM-5, MiniMax M3)   [crit 6]  ← Wave 33
L7  PERSONALISATION (per-user priors)                     [crit 9]
L8  CODEBASE FINGERPRINT                                  [crit 4]
L9  FEDERATED AGGREGATION (DP + k-anon)                   [crit 3, 4]
L10 SKILL GRAPH (Workflow Engine LIVE)                    [crit 2, 7]  ← Wave 28 ✅
L11 REAL-TIME ARBITRAGE                                   [crit 6]   ← Wave 33
L12 PROMPT COMPRESSION (LLMLingua)                        [crit 5]   ← Wave 29 ✅
L13 ADAPTER ROUTING (LORAUTER/MoLoRA)                     [crit 5, 6]  ← Wave 31
L14 SETUP INTELLIGENCE                                    [crit 1, 2, 7] ← Wave 29 ✅
L15 ECOSYSTEM AWARENESS                                   [crit 6, 10]  ← Wave 29 ✅
L16 PROMPT QUALITY INTELLIGENCE                           [crit 5, 6]   ← Wave 29 (.1) + 30 (.2) + 34 (.3)
LX  TELEMETRY (transversal)                               [crit 4, 7, 9]

INFRASTRUCTURE:
- Local: SQLite + Ollama pool + isolated-vm sandbox      [crit 3]
- Hub: CF Workers + D1 + R2                              [crit 4, 7]
- Statusline: 3 lines + chips rotativos                   [crit 7]
- CLI: mooter {sync, workflow, setup, ecosystem, data}   [crit 2, 7]
- Web: mooter.ai (landing, dashboard, benchmark)          [crit 2, 6]
- MCP server (Wave 31)                                    [crit 6]
- Plugin Claude Code (Wave 35)                            [crit 6]

CONTINUOUS LEARNING LOOP V3:
- Per-decision telemetry (L16.1)                          [crit 4, 9]
- Bandit Thompson Sampling (L16.2)                        [crit 5, 6]
- Federated wisdom (L16.3 + L9)                           [crit 3, 6]
- Pastor LoRA hot-swap (L13)                              [crit 5]
- Cross-session resume (Workflow Engine)                  [crit 2]

GUARDRAILS:
- classify.js sha 7b01eb86 hard guardrail                 [crit 8]
- isolated-vm sandbox (V8 isolates)                       [crit 3, 8]
- Cost cap + anomaly detection (Wave 30)                  [crit 8]
- final-reviewer Opus pre-merge                           [crit 3, 8]
- DP noise + k-anonymity ≥50                              [crit 3]

UX TRANSPARENCY:
- Statusline 3 lines (continuous transparency)            [crit 7]
- Bash commands para tudo                                 [crit 7]
- Web dashboard /dashboard                                [crit 7]
- Audit page /audit (Wave 30)                             [crit 7]
- Benchmark page /benchmark (Wave 29.5)                   [crit 6]
- Webhook events (Wave 32)                                [crit 7]
```

Cada layer + componente mapeado a um ou mais dos 10 critérios Paulo. Coverage matrix completa.

---

## Part 6 — 3 decisões pendentes do Paulo (bloqueiam parte do roadmap)

### 🟢 Decisão 1 — Mission statement (DECIDIDA 2026-06-07)

**Final:** ✅ **"Your LLM router. Local-first. Learns forever."** (7 words, B6d)

Apply em: landing hero, GitHub bio, Twitter bio, README header, friends-launch DMs pitch v6, CLI banner.

### 🔴 Decisão 2 — Pricing model

V4 §1.3 menciona "acquihire 2027 vs build vs Cursor". Sem decisão explícita, Wave 35 (marketplace) não sabe se construir paid features ou pure OSS+ports.

**Opções:**

A. **Pure OSS + acquihire 2027** — zero monetisation effort, optimizar para Anthropic/Vercel attention
B. **OSS + Pastor Cloud SaaS** — local OSS + paid hosted Pastor (federated wisdom premium)
C. **OSS + Enterprise tier** — OSS + paid compliance/support/SLA
D. **OSS + Marketplace fee** — Mooter Packs comissão (10-15% transactions)
E. **Híbrido B+C** — most defensible

### 🔴 Decisão 3 — Friends-launch DMs (Task #218 pending desde 27/05)

Bloqueia: validation evidence para Wave 29-35 roadmap. Sem isto, **construindo para mercado fantasma**.

**Acção 5 min:**
- Abre `audit/FRIENDS_LAUNCH_DMS.md` (Wave 27 SHIPPED em `5c36f6e`)
- Manda 3 DMs (@celispj, @om_patel5, @vibecademyai)
- 24h: cole replies (positive? negative? indifferent?)
- 48h: decide se Wave 30 sigue plano OR pivot

---

## Part 7 — A grande síntese honest

Em **11 dias de Cowork** (2026-04-26 vault start → 2026-06-07), construíste:

| Métrica | Valor |
|---|---|
| Layers V4 → V5 | 12 → 16 (+ 4 novas em 6 dias) |
| Waves SHIPPED | 27 (com tag pattern consolidado em 9 waves consecutivas) |
| Tests baseline | 333 → 345 (Wave 28 +12) |
| Sources cited em strategy docs | 60+ |
| Anthropic compliance | 12/12 |
| Workflow Engine cost real | $0.0028/run (vs $30-300 cloud Anthropic) |
| Pastor LoRA trained on | 257 decisions LIVE |
| Diferencial dimensões | 8 defensáveis |
| 10 critérios Paulo coverage | 67/100 hoje → 95/100 pós-Wave 35 |

Isto é **rara coerência**. A maioria dos founders não chega a v0.5 em 11 dias.

**Mas** — *honest* — a falta de 3 decisões (mission, pricing, validation) é o **único** risco real ao roadmap. Tecnicamente, está tudo a alinhar perfeitamente.

---

## Part 8 — Concrete next steps (ordered by leverage)

### Imediato (próximas 24h)

1. **Decisão 1, 2, 3** acima (mission, pricing, DMs).
2. **Wave 29 continua autonomous** — não tocar.
3. **Eu (Cowork) compõe `MOOTER_SHOWCASE_BENCHMARK_v2.md` + script** em paralelo (~2h).

### Próxima semana

4. **Wave 29 SHIPPED** → tag `v1.17.0-synthesis-ultimate`.
5. **Wave 29.5 standalone** → execução benchmark v2, publish results.
6. **Tweet + blog post** com benchmark + MLWR metric.
7. **Wave 30 brief** compor com gaps 2, 3, 4, 10 integrados.

### Próximas 2-3 semanas

8. **Wave 30 SHIPPED** → quality + security + recovery UX.
9. **Wave 31 brief** compor — MCP server + Pastor v2.

### 1 mês

10. **Wave 31-32 SHIPPED** → 4 gaps adicionais cobertos (MCP, data export, MiniMax M3 base, auto-update).

---

## Part 9 — Sources actualizados

### Pricing 2026 (NEW)
- [Claude Pricing 2026 (suprmind)](https://suprmind.ai/hub/claude/pricing/)
- [Anthropic Pricing 2026 Plans & Costs](https://checkthat.ai/brands/anthropic/pricing)
- [Claude Team Premium vs Max plans (Lord)](https://lord.technology/2026/03/28/claude-team-premium-vs-max-plans-usage-limits-pricing-and-which-to-choose.html)

### Open-weight 2026 (NEW)
- [Kilo.ai Open-Weight Models 2026](https://kilo.ai/open-source-models)
- [MindStudio Best Open-Source LLMs Agentic Coding 2026](https://www.mindstudio.ai/blog/best-open-source-llms-agentic-coding-2026)
- [Vellum Open LLM Leaderboard 2026](https://www.vellum.ai/open-llm-leaderboard)
- [LLM-Stats AI Leaderboard 2026](https://llm-stats.com/)

### Plugins ecosystem (NEW)
- [Anthropic claude-plugins-official GitHub](https://github.com/anthropics/claude-plugins-official)
- [Claude Code MCP Servers & Plugins Guide 2026 (Clarista)](https://www.clarista.io/blog/claude-code-mcp-plugins-guide)
- [Claude Code Plugin Marketplace Guide 2026 (Agensi)](https://www.agensi.io/learn/claude-code-plugin-marketplace-guide)

### Plus os 60+ sources de docs anteriores (já citados em `MOOTER_ULTIMATE_VISION.md` Part 10)

---

*Composto pelo Cowork enquanto Wave 29 corre. Sintetiza tudo + identifica gaps + propõe acção. Pré-decisão Paulo (3 items) para finalizar Wave 30+ briefs.*
