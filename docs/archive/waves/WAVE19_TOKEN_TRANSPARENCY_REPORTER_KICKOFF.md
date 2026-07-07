# Wave 19 — Token Transparency Reporter

> **Goal**: tornar visíveis em tempo real os **tokens consumidos por tier** (T0/T1/T2/T3)
> + LLM usado por operação + razão da escolha + quantization state + LoRA evolution.
> "Token is the new oil" — vibe coders precisam saber não só **$ saved** mas
> **quantos tokens passaram por cada tier** e porquê.
>
> **Trigger**: Paulo flagged 2026-06-05 — "Toda task que faz o count de tokens em
> tempo real, eu preciso saber qual tier esses tokens foram usados. Como token is
> the new oil, é muito importante além do $ saved, é saber quantos tokens foram
> utilizados por tier. Ao final de uma task, precisa ter um relatório de qual LLM
> foi utilizada por operação, tokens por tier, o motivo de qual LLM foi utilizada
> pelo Mooter e se teve mais quantização e LoRA evolution."
>
> **Strategic value**: este é **o** showcase feature que mostra Mooter NÃO é black
> box — é routing inteligente com explicabilidade total. Diferencia de
> claude-code-router (proxy mudo).
>
> **Scope**: ~3-4 sub-features. Tag esperada `v1.10.0-token-transparency`.
> Sequenciar **APÓS Wave 16-18 Day 2 Tier B+C complete** (não polui Tier B/C).
>
> **Non-negotiables**:
> - `classify.js` byte-identical (P11)
> - Zero PII em token logs
> - Backwards-compat statusline (existing chips intactos)
> - Zero hub touch (token tracking é local-only)

---

## 0. Estado actual vs alvo

| Feature | Pre-Wave-19 | Pós-Wave-19 |
|---|---|---|
| `🐮 saved $X today` chip | ✅ existe | ✅ mantido |
| Token count per tier visible | ❌ não existe | ✅ NEW |
| LLM used per operation | ❌ não rastreado granular | ✅ NEW |
| Choice reason per call | 🟡 `via <subagent>` parcial | ✅ NEW expandido |
| Quantization state visível | ✅ Q4_K_M chip | ✅ mantido + state per-model |
| LoRA evolution metrics | ❌ adapter chip hardcoded idle (Wave 17 finding) | ✅ wired + metrics |
| End-of-task report | 🟡 Stop digest Wave 13 (count subagents only) | ✅ FULL breakdown |

---

## 1. Sub-features (4)

### 19.A — Token Counter per Tier (statusline + tracker)

**O quê**:
Novo módulo `tools/router/token_tracker.js`:
- State-machine session-scoped (mimic Wave 13 `subagent_tracker.js` pattern)
- Por cada decision: `{ tier: T0|T1|T2|T3, llm: 'qwen3:30b'|'haiku'|'sonnet'|'opus', tokens_in, tokens_out, ts }`
- Backed por `os.tmpdir()/mooter-tokens-<session>.json` (file-backed para cross-invocation hooks)
- API: `trackCall(tier, llm, tokens_in, tokens_out)`, `snapshot()` returns `{ T0: {calls, tokens}, T1: {...}, T2: {...}, T3: {...} }`

**Statusline chip novo** (linha 2 statusline-multi.js):
```
🪙 T0:13.3k · T1:0 · T2:24.2k · T3:0
```

(only show non-zero tiers para minimizar visual noise)

**Source de captura**:
- PostToolUse hook (`post_tool_badge.js` já existe Wave 10) → adicionar `trackCall(...)`
- Subagent completion (subagent_tracker.js) → adicionar tokens_in/tokens_out passthrough
- Direct Claude Code parent calls (Opus): hook into messages count

**Anti-pattern**: NÃO contar tokens de tool calls (read/grep) — só LLM inference tokens.

### 19.B — Per-Operation LLM + Reason logging

**O quê**:
Expand decisions.log + new structured field `decisions_v2.jsonl`:
```json
{"ts":"2026-06-05T10:30:00Z","op":"summarize_file","tier":"T0","llm":"qwen3:30b","tokens_in":1200,"tokens_out":300,"reason":"file_size<10kb && classify_score=0.85 T0","via":"local-summarizer"}
```

Reasons possíveis:
- `classify_score=X` (hint engine confidence)
- `force_T0_via_env` (MOOTER_FORCE_LOCAL)
- `Pastor_adapter_active` (post-Wave-19 Pastor wire)
- `safety_boost_<reason>` (Wave 2.5 provenance)
- `fallback_<reason>` (Ollama down → T1)

`mooter trail` CLI lê decisions_v2.jsonl + pretty-prints.

### 19.C — Quantization + LoRA state visible

**O quê**:
- Q4_K_M chip statusline (Wave 12 PR-F) — ✅ JÁ EXISTE — mantido
- Adapter chip: wire `getAdapterStatus()` (Wave 17 finding #2) — depende de Wave 16-18 Tier C ship
- New metrics chip (optional, env-gated): `📐 Q4_K_M · adapter:react-pro@v3 · +2.1pp`

**Anti-pattern**: NÃO inventar `+2.1pp` benchmark — só mostrar se benchmark data confirmed.

### 19.D — End-of-Task Report (Stop digest expansion)

**O quê**:
Replace simple Stop digest (Wave 13: `🐮 Moos that worked the session · local-summarizer × 3 · avg 6s`) with FULL breakdown:

```
🐮 Mooter session report — 12m 17s

  TOKENS BY TIER
  T0 (local ollama qwen3:30b)   13,320 tokens · 4 calls · $0.00
  T1 (haiku-4-5)                     0 tokens · 0 calls · $0.00
  T2 (sonnet-4-6)                24,200 tokens · 2 calls · $0.36
  T3 (opus-4-7)                  72,580 tokens · 1 call  · $3.62

  CHOICE REASONS
  4× T0 → classify_score>0.80 (delegated to local-summarizer)
  2× T2 → reasoning_depth_required (sonnet)
  1× T3 → arch_decision Paulo override

  HARDWARE STATE
  Model: qwen3:30b · Quantization Q4_K_M (18GB · -72% vs FP16)
  Adapter: baseline (no LoRA active this session)
  GPU peak: RTX 4090 · 51% VRAM peak

  HERD
  local-summarizer × 4 · avg 6s · peak concurrent: 3

  SAVINGS
  Total saved vs all-Opus: $2.77 (76% reduction)
  Total spent: $3.98
```

This is the **showcase output**. When friend ends Claude Code session, they see THIS.

**Anti-pattern**: NÃO mostrar reasons que requerem privacy disclosure (e.g. "T2 due to prompt content X"). Reasons são metadata only.

---

## 2. Source of truth — token count integrations

### Onde vêm os números

| Source | Tokens captured | How |
|---|---|---|
| Ollama qwen3:30b T0 | Inference tokens in/out | Ollama API response `eval_count` + `prompt_eval_count` |
| Claude API T1/T2/T3 | `usage.input_tokens` + `usage.output_tokens` | Anthropic SDK response headers |
| Claude Max session T3 | Estimate from session quota (already in Wave 10 budget tracker) | `claudeMaxQuota` estimate (already exists, Wave 17 finding #3: "local estimate, not real Anthropic quota") |

**Anti-pattern**: NÃO call Anthropic API só para tracking. Use response headers from existing calls.

---

## 3. Recon comandos

```bash
# Locate Ollama API call sites
grep -rn "/api/generate\|/api/chat\|ollama" tools/router/

# Locate Claude API call sites
grep -rn "claude\|anthropic" tools/router/ packages/cli/

# Locate decisions.log writer
grep -rn "decisions\.log\|decisions_log" tools/router/

# Locate PostToolUse hook
ls tools/router/post_tool_badge.js
ls tools/router/subagent_tracker.js

# Verify classify.js byte-identical
sha256sum tools/router/classify.js
```

---

## 4. Sequência (4 sub-features, ~3-4 dias CC)

### Day 1 — 19.A token tracker + statusline chip (~1 dia)
- Module `token_tracker.js`
- PostToolUse hook integration
- statusline-multi.js renderTwoLine adds 🪙 chip
- 2 tests (T0 only / mixed tiers)
- PR squash→dev tag `v1.9.7-token-tracker-dev`

### Day 2 — 19.B decisions_v2.jsonl + mooter trail (~1 dia)
- Schema decisions_v2.jsonl
- Migrate decisions.log writer to write both
- `mooter trail` CLI command pretty-prints
- 2 tests
- PR squash→dev tag `v1.9.8-decisions-v2-dev`

### Day 3 — 19.D Stop digest expansion (~4-6h)
- Stop hook reads tokens_v2 + tier breakdown
- Format Full breakdown report
- Integration tests com Wave 13 herd visibility
- PR squash→dev tag `v1.9.9-task-report-dev`

### Day 4 — 19.C adapter wiring + closure (~1 dia)
- Wave 16-18 Tier C ships `getAdapterStatus()` real wiring (dependency)
- 19.C metrics chip
- Closure + promote all 4 to prod `v1.10.0-token-transparency`

---

## 5. Definition of Done

1. ✅ `tools/router/token_tracker.js` module with state machine + tests
2. ✅ Statusline `🪙 T0:Xk · T1:Y · T2:Z · T3:W` chip live (only non-zero tiers)
3. ✅ `decisions_v2.jsonl` populated for each LLM call with tokens + reason
4. ✅ `mooter trail` shows per-call breakdown
5. ✅ Stop digest expanded: full per-tier breakdown + reasons + hardware + herd + savings
6. ✅ Adapter chip wired to real `getAdapterStatus()` (Wave 16-18 Tier C dependency)
7. ✅ Tests router + 8 new
8. ✅ classify.js byte-identical
9. ✅ Tag prod `v1.10.0-token-transparency`

---

## 6. Anti-patterns

- ❌ NÃO call extra Anthropic API for token counting — usar response headers
- ❌ NÃO inventar `+N pp` LoRA metrics sem benchmark
- ❌ NÃO mostrar reasons que vazem prompt content
- ❌ NÃO partir statusline existing chips
- ❌ NÃO hub push tokens (zero hub touch — local only)
- ❌ NÃO sync decisions_v2.jsonl com hub (privacy: stays local)
- ❌ NÃO scope into Tier B (statusline honesty) — Wave 19 é depois

---

## 7. Master prompt para CC (paste APÓS Wave 16-18 Day 2 complete)

```
Inicia Wave 19 Token Transparency Reporter conforme docs/strategy/WAVE19_TOKEN_TRANSPARENCY_REPORTER_KICKOFF.md.

Pré-flight: Wave 16-18 Day 2 (Tier A+B+C) shipped + prod. Wave 19 é **showcase feature** — token-per-tier visible em real-time + per-operation LLM + reason + quantization + LoRA evolution.

Scope: 4 sub-features sequential (~3-4 dias). 19.A token tracker + statusline chip. 19.B decisions_v2.jsonl + mooter trail. 19.D Stop digest expansion full report. 19.C adapter wiring (depende Tier C).

Lê PRIMEIRO:
  - docs/strategy/WAVE19_TOKEN_TRANSPARENCY_REPORTER_KICKOFF.md inteiro
  - tools/router/statusline-multi.js (chip render pattern)
  - tools/router/subagent_tracker.js (state machine pattern)
  - tools/router/post_tool_badge.js (PostToolUse hook)
  - tools/router/classify.js (P11 sha256 7b01eb86...87762)
  - packages/cli/feedback.ts (Anthropic SDK response inspection)

Non-negotiables:
  - classify.js byte-identical
  - Zero PII em token logs (só metadata: tier, llm, tokens, reason, ts)
  - Backwards-compat statusline existing chips
  - Zero hub touch (tokens local-only)
  - NO extra Anthropic API calls — usar response headers existing

Sequência:
  Day 1: 19.A token_tracker.js + 🪙 chip statusline + PostToolUse hook + 2 tests + PR v1.9.7-token-tracker-dev
  Day 2: 19.B decisions_v2.jsonl + mooter trail CLI + 2 tests + PR v1.9.8-decisions-v2-dev
  Day 3: 19.D Stop digest expansion full report (tier breakdown + reasons + hardware + herd + savings) + integration tests + PR v1.9.9-task-report-dev
  Day 4: 19.C adapter metrics chip + Wave 19 closure + promote prod v1.10.0-token-transparency

Per PR: final-reviewer T2 Sonnet. Cowork merge cada PR. Paulo Gate único antes de promote prod.

Reporta WAVE19_DAY_X_FINDINGS.md se houver decisões para Paulo.
```

---

**Composed by Cowork, 2026-06-05 morning. Wave 19 = showcase feature de transparency.
"Token is the new oil" — quantos por tier + qual LLM + porquê. Showcase angle: nenhum
competitor faz isto. 3-4 dias CC autonomous. Tag v1.10.0-token-transparency. APÓS
Wave 16-18 Day 2 complete (não bloqueia).**
