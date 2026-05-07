# Wave-2 — `router-execute.js` design contract

**Status:** DRAFT (design only — no code yet)
**Author:** Claude Code (Sessão #40, 2026-05-07)
**Predecessors:** validation-2026-05-07 + POST-FIX-REPORT (87.5 % accuracy, 206/206 tests, 0 ops bugs)
**Constraints:** must not modify `classify.js`, must preserve CLAUDE.md doctrine (`HIGH_RISK` floor + `user_override` semantics), tests-first.

---

## 1. Goal

Today the router is **advisor-only**: `classify.js` produces `{ tier, suggested_providers, ... }` and `inject_context.js` injects a `<router-hint>` for the Claude session to read. Nothing is *executed* — every Anthropic-tier turn still pays full Anthropic price because the cheap providers (Codex CLI, OpenAI API, Ollama) listed in `suggested_providers` are never actually called.

`router-execute.js` is the **dispatch layer** that consumes a classification result and *actually invokes* a provider, walking the suggested chain on failure, recording real telemetry, and feeding `/metrics` so production savings move from advisory to guaranteed.

Concretely, after Wave-2:

- A `T0` prompt routes to Ollama → executor returns text → no Anthropic turn fired.
- A `T1/T2` prompt with `codex_cli` first → executor calls Codex → on failure tries `haiku/sonnet`-via-subagent path → telemetry records who served the turn.
- A `T3` prompt → executor short-circuits with `defer_to_subagent: opus` (no cost-saving fallback for architecture work — doctrine).

The 73.7 % production *advisory* savings shown in `/metrics` becomes 73.7 % *real* savings.

---

## 2. Non-goals

- ❌ Not a classifier. `classify.js` is read-only here; we consume its output.
- ❌ Not an Anthropic API wrapper. Anthropic-tier calls (Haiku/Sonnet/Opus) keep going through the Claude harness subagent system — executor only signals which subagent to use. Direct Anthropic calls remain a `cheap-triage` / `final-reviewer` concern.
- ❌ Not a caching layer. Ollama Option-A pre-computation already lives in `inject_context.js`; executor only orchestrates calls.
- ❌ Not a budget engine. `quota-tracker.js` already enforces caps; executor consults but does not implement them.
- ❌ Not the calibration tuner. `backtest.js` and `update-router.js` already exist; executor *triggers* a calibration check, it does not modify `classify.js`.

---

## 3. Inputs

### 3.1 Classification result (consumed verbatim from `classify.js`)

```ts
type Classification = {
  tier: 'T0' | 'T1' | 'T2' | 'T3';
  confidence: number;                  // 0..1
  recommended_backend: string;         // e.g. 'claude_subagent'
  recommended_model: string;           // e.g. 'claude-haiku-4-5-20251001'
  suggested_providers: string[];       // ordered, e.g. ['codex_cli','haiku']
  task_category: string;               // e.g. 'mechanical_trivial'
  escalation_rule?: string;
  // doctrine signals — executor MUST honour these
  user_override?: { honored: boolean; refused?: boolean; model?: string };
  high_risk?: boolean;                 // present when HIGH_RISK regex fired
  quality_intent?: 'high' | 'normal';
};
```

### 3.2 Prompt + context

```ts
type ExecuteInput = {
  prompt: string;                      // the user prompt as classified
  classification: Classification;      // from classifyWithRetry()
  options?: {
    timeoutMs?: number;                // per-provider attempt timeout (default 90 000)
    maxTokens?: number;                // forwarded to provider (default 1024)
    providerStateOverride?: ProviderState;  // for tests
    skipCalibrationCheck?: boolean;    // tests
  };
};
```

### 3.3 Provider state (read-only from `quota-tracker.js` + `.providers-cache.json`)

```ts
type ProviderState = {
  claude: 'ok' | 'degraded' | 'down';
  ollama: 'ok' | 'down';
  gemini: 'ok' | 'off' | 'down';
  gpt:    'ok' | 'down';
  codex_cli: 'ok' | 'exhausted' | 'unavailable';
};
```

This is **already produced** by the existing `update-metrics.js` polling and cached in `tools/router/.providers-cache.json` with 60 s TTL. Executor reads, never writes.

---

## 4. Outputs

### 4.1 Successful execution (provider returned text)

```ts
type ExecuteResult_Ok = {
  ok: true;
  text: string;
  provider_used: 'ollama' | 'codex_cli' | 'openai_api';
  model_used: string;                  // resolved by provider wrapper
  fallback_chain: string[];            // ordered providers tried before success
  duration_ms: number;                 // wall-clock for the winning attempt
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;                    // 0 for ollama and codex_cli (subscription)
  classification_ref: { tier: string; confidence: number; task_category: string };
};
```

### 4.2 Defer to Claude harness subagent (Anthropic tier or user-override pinning Anthropic)

```ts
type ExecuteResult_Defer = {
  ok: false;
  defer_to_subagent: 'cheap-triage' | 'model-reasoner' | 'model-architect' | 'final-reviewer';
  reason:
    | 'tier_t3'                      // T3 doctrine guard
    | 'high_risk_floor'              // HIGH_RISK signal in classifier
    | 'user_override'                // user pinned an Anthropic model
    | 'anthropic_only_chain'         // resolved chain is all Anthropic-tier (no provider to dispatch)
    | 'all_non_anthropic_failed';    // tried every non-Anthropic provider, all returned null/threw
  fallback_chain: string[];          // providers tried before deferring (may be empty)
  classification_ref: { tier: string; confidence: number; task_category: string };
};
```

### 4.3 Hard failure (no provider available, harness subagent should still take over)

```ts
type ExecuteResult_Error = {
  ok: false;
  defer_to_subagent: 'cheap-triage' | 'model-reasoner' | 'model-architect';
  reason: 'all_providers_failed' | 'classification_invalid' | 'config_missing';
  errors: Array<{ provider: string; message: string; code?: string }>;
  fallback_chain: string[];
  classification_ref?: { tier: string; confidence: number; task_category: string };
};
```

The caller (a CLI script, a test, the autonomous tester, or a future Claude-session integration) inspects `ok` and either uses `text` or spawns the indicated subagent. Executor *never* throws across the boundary — every failure is a structured value.

---

## 5. Provider matrix

| Provider key | Wrapper module (already exists) | Executor calls? | Returns |
|---|---|---|---|
| `ollama` | `ollama_call.sh` (shell) + `ollama_call_node.js` | ✅ direct | text |
| `codex_cli` | `providers/codex-cli.js` (`callCodex`) | ✅ direct | text |
| `openai_api` | `providers/openai-api.js` (`callOpenAI`) | ✅ direct | text |
| `haiku` | (Anthropic API via Claude harness) | ❌ defer → `cheap-triage` | — |
| `sonnet` | (Anthropic API via Claude harness) | ❌ defer → `model-reasoner` | — |
| `opus` | (Anthropic API via Claude harness) | ❌ defer → `model-architect` | — |
| `gemini` | (not wired yet) | ❌ defer with `reason: config_missing` | — |

**Rationale for the Anthropic-defer split:** the CLAUDE.md doctrine routes Anthropic-tier work through the Claude harness subagent system, which guarantees the `model-architect` / `model-reasoner` / `cheap-triage` subagents come with the right system prompts and the harness records token usage automatically. Re-implementing direct Anthropic API calls in the executor would duplicate that and risk drift in cost accounting (`exec-logger.js` keys off the harness, not on a parallel API path).

---

## 6. Fallback chain semantics

### 6.1 Construction order (executor walks left-to-right)

1. Start with `classification.suggested_providers` verbatim. This already encodes:
   - tier defaults (T0→ollama, T1→haiku, T2→sonnet, T3→opus)
   - Codex preference when `tracker.shouldPreferCodex() && isCodeRelated`
   - `openai_api` appended when `anthropic_remaining_pct < 25`

2. **Degradation injection** (new in Wave-2):
   - If `providerState.claude === 'degraded'` and the chain leads with an Anthropic provider:
     - For tier T1/T2: prepend `codex_cli` if available, else `ollama` (only for T1).
     - For tier T3: do NOT prepend anything. Architecture work waits for Anthropic to recover (doctrine: bazuca-only-for-concrete).
   - If `providerState.codex_cli === 'exhausted'` and `codex_cli` is in the chain: drop it.
   - If `providerState.ollama === 'down'` and `ollama` is in the chain: drop it.

3. **Doctrine guards** (cannot be overridden by 6.1.1 or 6.1.2):
   - `classification.high_risk === true`: chain is locked to `[opus]`. Defer immediately to `model-architect`. Reason: `high_risk_floor`.
   - `classification.user_override?.honored === true && classification.user_override.model === 'opus'`: chain locked to `[opus]`. Defer to `model-architect`. Reason: `user_override`.
   - `classification.user_override?.honored === true && classification.user_override.model === 'haiku'`: chain locked to `[haiku]`. Defer to `cheap-triage`. Reason: `user_override`.
   - `classification.user_override?.refused === true`: chain unchanged from §6.1.1. The classifier already kept the high tier; executor just executes it.
   - Tier T3 (without override or high_risk): chain locked to `[opus]`. Defer to `model-architect`. Reason: `tier_t3`.

### 6.2 Per-attempt semantics

For each provider in the resolved chain:

- If provider is `ollama` / `codex_cli` / `openai_api`: invoke wrapper with `(prompt, { timeoutMs, maxTokens })`.
  - Wrapper returns `{ ok, text, ... }` → success: build `ExecuteResult_Ok`, return.
  - Wrapper returns `null` → record failure reason (`provider_returned_null`), append to `fallback_chain`, continue.
- If provider is Anthropic-tier (`haiku`/`sonnet`/`opus`): build `ExecuteResult_Defer` with the matching subagent and return immediately. We do not iterate further — the subagent IS the execution.
- If chain exhausts without a non-Anthropic success: build `ExecuteResult_Error` (`reason: 'all_providers_failed'`) and pick the best subagent for the original tier.

### 6.3 Last-resort subagent mapping

| Original tier | Defer subagent |
|---|---|
| T0 (Ollama down) | `cheap-triage` (Haiku — close-enough quality, low cost) |
| T1 | `cheap-triage` |
| T2 | `model-reasoner` |
| T3 | `model-architect` |

Pre-merge / pre-push / pre-deploy keywords detected upstream (`final-reviewer` gate) are NOT the executor's concern — they are emitted by `inject_context.js` as a sticky pre-tool hook and live independently of dispatch.

---

## 7. Telemetry contract

### 7.1 `decisions.log` line (JSONL)

Every `execute()` call appends ONE line to `~/.claude/tools/router/decisions.log`:

```json
{
  "ts": "2026-05-07T18:42:11.234Z",
  "event": "executed",
  "session_id": "<sid or null>",
  "prompt_preview": "<first 80 chars>",
  "tier": "T1",
  "task_category": "mechanical_trivial",
  "confidence": 0.9,
  "suggested_providers": ["codex_cli", "haiku"],
  "fallback_chain": ["codex_cli"],
  "provider_used": "codex_cli",
  "model_used": "gpt-5-codex",
  "outcome": "ok",
  "deferred_subagent": null,
  "duration_ms": 1820,
  "tokens_in": 124,
  "tokens_out": 412,
  "cost_usd": 0,
  "errors": [],
  "high_risk": false,
  "user_override_honored": false,
  "quality_intent": "normal"
}
```

For `defer` outcomes: `provider_used: null`, `deferred_subagent` populated, `cost_usd: 0` (the cost is accrued by the subagent later).

### 7.2 `/decision` POST (savings-tracker `:7821`)

Same JSON shape as 7.1 with `event: 'executed'`. The savings-tracker stores it as `LAST_EXECUTION` (new in-memory slot, mirroring the existing `LAST_DECISION`) and exposes it on a new `GET /last-execution` endpoint plus aggregates it into `/metrics` under a new key:

```jsonc
{
  "executions": {
    "total": 12 053,
    "by_provider": { "ollama": 6 421, "codex_cli": 1 144, "openai_api": 38, "deferred_anthropic": 4 450 },
    "by_outcome":  { "ok": 7 603, "deferred": 4 450, "error": 0 },
    "guaranteed_saved_usd": 91.40,    // sum over outcome=ok
    "advisory_saved_usd":  121.80     // unchanged (legacy estimate, all events)
  }
}
```

`guaranteed_saved_usd` is the **honest savings number** Paulo wants in the statusline post-Wave-2. `advisory_saved_usd` stays for backwards compatibility and statusline diff visibility.

### 7.3 `quota-tracker.recordUsage()` integration

Provider wrappers (`callCodex`, `callOpenAI`) **already** call `tracker.recordUsage(...)` internally — executor does not double-record. For `ollama` we need to add a `tracker.recordUsage('ollama', { tokens_in, tokens_out, cost_usd: 0, duration_ms })` call inside the executor's Ollama branch (the shell wrapper does not currently touch the tracker — see PLAN T-04).

### 7.4 No PII in telemetry

`prompt_preview` is the first 80 chars **after sanitisation by `sanitize.js`** (already enforced by inject_context.js — executor reuses the same sanitiser). Errors must not include raw stack traces with file paths beyond the wrapper module name.

---

## 8. Calibration loop

Wave-2 closes the validation loop noted in `VALIDATION-REPORT.md §8 #7`.

### 8.1 Trigger

Inside `execute()`, increment a process-local counter `EXEC_COUNTER`. When `EXEC_COUNTER % 1000 === 0` AND no calibration run happened in the last 24 h (timestamp persisted in `~/.claude/tools/router/.calibration-state.json`), spawn an out-of-band check:

```bash
node tools/router/backtest.js --calibration-only --last-n 1000
```

The check is **non-blocking** — `child_process.spawn` with `stdio: 'ignore'` and `unref()`. The current `execute()` call returns immediately to the caller.

### 8.2 What backtest.js produces (already supported, contract reaffirmed)

`backtest.js --calibration-only --last-n 1000` reads the most recent 1000 `executed` events from `decisions.log` paired with their original `classified` events (matched by `session_id` + nearest preceding timestamp) and outputs:

```jsonc
{
  "ts": "2026-05-07T19:05:00Z",
  "samples": 1000,
  "bins": {
    "0.6-0.8": { "count": 184, "correct": 167, "accuracy": 0.91 },
    "0.8-1.0": { "count": 816, "correct": 702, "accuracy": 0.86 }
  },
  "warning": "calibration_below_threshold",
  "threshold": 0.90
}
```

### 8.3 Alert fan-out

If `bins['0.8-1.0'].accuracy < 0.90`, append one line to `~/.claude/tools/router/.calibration-alerts.jsonl`. The next session-start hook reads the alerts file and surfaces the warning in the statusline / SYNC.md handoff. **No model is changed automatically by this loop** — the doctrine is "alert, then human-or-`/update-router` decides".

---

## 9. Invariants (testable)

| # | Invariant | Test fixture |
|---|---|---|
| I1 | T3 prompt always returns `defer_to_subagent: 'model-architect'`, regardless of provider state. | prompt with `tier: 'T3'`, mock all non-Anthropic providers as available → still defers. |
| I2 | `classification.high_risk === true` always defers to `model-architect` even when tier-numerics could allow a cheaper provider. | prompt with `high_risk: true, tier: 'T2'` (theoretically possible for forced-T3) → defers, reason `high_risk_floor`. |
| I3 | `user_override.honored && model: 'opus'` always defers, ignores `suggested_providers`. | prompt with override `opus`, suggested `[codex_cli, haiku]` → defers reason `user_override`. |
| I4 | A T1 prompt with chain `['codex_cli','haiku']` and Codex returning `null` defers to `cheap-triage` (NOT direct Haiku). | mock callCodex → null → executor returns defer with reason `all_non_anthropic_failed`. |
| I5 | A T1 prompt with chain `['codex_cli','haiku']` and Codex returning text returns `ok: true, provider_used: 'codex_cli'` and writes one `executed` line. | mock callCodex → ok. |
| I6 | A T0 prompt with chain `['ollama']` and Ollama returning text writes ONE `recordUsage('ollama', ...)` call (not zero, not two). | spy on tracker. |
| I7 | When `providerState.claude === 'degraded'` and tier is T2 with chain `['sonnet']`, the resolved chain is `['codex_cli','sonnet']` if Codex available, else `['sonnet']`. T3 chain is unchanged. | mutate state, assert chain. |
| I8 | `EXEC_COUNTER === 1000` triggers exactly ONE backtest spawn even if execute() is called 1000-then-2000-then-3000 across the same process. | spy on spawn, run loop. |
| I9 | `execute()` never throws — every error path produces a structured value. | inject `provider wrapper throws` → returns `ExecuteResult_Error`. |
| I10 | The `prompt_preview` in telemetry is sanitised (no API keys, no file paths beyond the wrapper module). | feed prompt with `OPENAI_API_KEY=sk-…`, assert preview is redacted. |
| I11 | `classify.js` is not modified. CI grep step asserts diff is empty against last commit on `tools/router/classify.js`. | git diff in CI. |

---

## 10. Acceptance criteria

The Wave-2 phase is **green** when ALL of the following hold:

1. `node --test tools/router/router-execute.test.js` passes for every invariant in §9 (I1–I10) → ≥ 25 test cases.
2. `npm test` in `tools/router/` reports ≥ 230 tests passing (current 206 + ~25 new). No regressions.
3. `node tools/router/router-execute.js < some-prompt.txt` end-to-end smoke produces a valid JSON output for: T0 (ollama → ok), T1 (codex_cli → ok), T1 high_risk (defer architect), T3 (defer architect).
4. `/metrics` endpoint shows the new `executions` block (sanity check via `curl 127.0.0.1:7821/metrics | jq .executions`).
5. After running the validation runner (`run-routing-accuracy.js` + `run-provider-invocation.js`) on a fresh 60-prompt corpus, the `executions.by_outcome.ok / total` ratio is ≥ 0.55 (i.e. at least 55 % of prompts were served by a non-Anthropic provider, vs the current 0 %).
6. `tools/router/classify.js` byte-identical to commit `aa25a2b` (verified by `git diff` in the final commit).
7. `final-reviewer` subagent runs on the resulting branch and returns `APPROVED` (or `APPROVED_WITH_NOTES` resolved by Paulo).
8. Notion sub-page + SYNC.md update at session end (per CLAUDE.md PROTOCOLO NOTION).

**Negative criteria** (any of these fails the phase):

- T3 prompt routes to a non-Anthropic provider in any test or smoke run.
- A `high_risk` prompt routes anywhere except `model-architect`.
- Calibration-loop check blocks the `execute()` return path (must be async-fire-and-forget).
- Coverage drops below 70 % in `tools/router/` (CI gate).

---

## 11. Open questions (must close before PLAN execution)

| # | Question | Default if Paulo silent |
|---|---|---|
| Q1 | Should `execute()` also handle the Option-A pre-computed-Ollama path (currently in `inject_context.js`), or stays separate? | **Stays separate.** Option-A is a hook-time concern; executor is for explicit dispatch. |
| Q2 | Should we add a `gemini` provider wrapper in this wave or defer to Wave-3? | **Defer to Wave-3.** Spec lists it as `defer with config_missing` for now. |
| Q3 | Should `defer_to_subagent` carry a richer payload (e.g. system prompt hints)? | **No.** The harness already knows. Keep the contract minimal. |
| Q4 | Does the calibration loop write its alert to Notion or only local? | **Local only** (`.calibration-alerts.jsonl`). Notion in a Wave-3 follow-up. |
| Q5 | Where does `router-execute.js` live in the repo: `tools/router/router-execute.js` or `tools/router/executor/index.js`? | **`tools/router/router-execute.js`** — flat, mirrors `classify.js`. |

If Paulo accepts these defaults the PLAN proceeds without blocking.

---

## 12. Doctrinal alignment checklist

- [x] HIGH_RISK floor honoured (§6.1 doctrine guards, I2)
- [x] user_override honored AND refused both supported (§6.1, I3)
- [x] T3 architecture work never routed to Codex/Ollama (§6.1, I1)
- [x] No modification to `classify.js` (§9 I11, §10 #6)
- [x] Tests-first per feature (PLAN.md task ordering)
- [x] Atomic commits (PLAN.md)
- [x] final-reviewer before push (§10 #7)
- [x] Notion + SYNC.md update at end of session (§10 #8)
