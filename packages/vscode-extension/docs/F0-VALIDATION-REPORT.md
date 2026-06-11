# F0 Validation Report — Mooter for VS Code

**Data:** 2026-06-11 · **Executado por:** Claude (Cowork, autónomo via computer use + .command) · **Device:** MacBook Pro (b14321f5)
**Veredicto: 🟢 10/10 checks PASS — F0 completa, F1 desbloqueada sem incógnitas de dados.**

---

## Resultados

| # | Check | Resultado | Evidência |
|---|---|---|---|
| 1 | Integridade pós-teste (settings.json) | ✅ | 1× inject_context, 0× instrumentação residual, JSON válido |
| 2 | mooter doctor v1.35.0 | ✅ | "Healthy with 2 warnings" (opt-ins: init, sync, API key) |
| 3 | **Path real das decisões** | ✅ | `~/.claude/tools/router/decisions.log` (v1, rico) + `decisions_v2.jsonl` (v2, compacto) — **não** em `~/.mooter` |
| 4 | Schema JSONL nativo Claude Code | ✅ | `message.usage` com input/output/cache tokens + `model` — fonte de custo real confirmada |
| 5 | Benchmark parse | ✅ | 86MB/s · extrapolado **116ms/10MB** (budget 500ms — folga 4×) |
| 6 | savings-tracker :7821 | ✅ | **Vivo (v0.7.0)** — 12 endpoints mapeados |
| 7 | Ollama T0 | ✅ | 4 modelos (qwen2.5:3b, qwen2.5-coder:14b, gemma4:e4b, nomic-embed) |
| 8 | Toolchain | ✅ | node v25.8.1 · npm 11.11.0 · VS Code 1.115.0 · ext claude-code 2.1.173 |
| 9 | Repo branch F0 | ✅ | `feat/vscode-extension-f0` = origin (6f95fd0), 7 docs versionados |
| 10 | Latência hook | ✅ | 160-447ms/prompt (cold→warm); `<router-hint>` com 10+ campos |

## Schemas confirmados (F0.2 fechada)

**`decisions.log` (v1 — fonte primária do Decisions feed):**
`ts, event, session_id, prompt_len, prompt_preview, tier, task_category, recommended_backend, recommended_model, confidence, escalation_rule, quality_intent, cache_hit…`

**`decisions_v2.jsonl` (v2 — compacto):** `ts, op, tier, llm, tokens_in, tokens_out, reason, via`

**Tracker endpoints (DataService liga directo, zero parsing de texto excepto /summary):**

| Endpoint | Uso na UI |
|---|---|
| `/health` | doctor check (ok, pid, version) |
| `/metrics` (JSON) | **Cockpit hero completo**: saved_pct 70.2%, real $0.6331 vs naive $2.127, by_tier, by_model, last_turn_cost_usd, avg_saved_per_prompt |
| `/last` (JSON) | **Status bar**: tier, model_full, confidence, cascade_path, latency_ms |
| `/me` (JSON) | prompts_today/30d, tier_distribution, peak_hours, top_categories |

**`<router-hint>` (hook stdout):** task_category, risk_level, tier, recommended_backend/model, suggested_subagent, confidence, max_tier, suggested_providers, codex_quota, anthropic_quota → campos do expand "why" no feed.

## Achados para o core (issues a abrir, não bloqueiam F1)

1. 🟡 `/summary` do tracker ainda diz **"frugal"** (branding stale pós-rebrand)
2. 🟡 Inconsistência: `/me.saved_usd_30d = 0` vs `/metrics.saved = 1.4939` — reconciliar antes de expor os dois na UI
3. 🟡 Doctor: "classify.js doctrine sha — router not located (running outside the repo?)" — check falha fora do repo
4. ⚠️ Versão da extensão: binário reportou 2.1.153 no teste P0, listagem mostra 2.1.173 — auto-update entre testes; DataService não deve assumir path fixo da extensão
5. Nota: testes de latência geram entradas em decisions.log (session_id `validate-test`) — o parser da extensão deve poder filtrar sessões de teste

## Decisões de implementação derivadas (vincula F1/F2)

- DataService: **tracker JSON endpoints primário** (`/metrics`, `/last`, `/me`), `decisions.log` v1 como fonte do feed (mais rico que v2), JSONL nativos para custo real por sessão. Fallback: tracker off → ler logs directamente.
- Status bar: poll leve a `/last` (ou fs.watch no decisions.log) — latência <2s garantida.
- Doctor da extensão reusa `mooter doctor` (output já estruturado e legível).

**F0: COMPLETA.** Próximo: MASTERPROMPT F1 (Cockpit MVP) — sem incógnitas de dados pendentes.
