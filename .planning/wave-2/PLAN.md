# Wave-2 — `router-execute.js` execution plan

**Status:** DRAFT (awaiting Paulo's GO before any code is written)
**Spec:** `.planning/wave-2/SPEC.md` (read first)
**Branch strategy:** all work on `main` with atomic commits; final-reviewer runs locally before any push.
**Tests-first invariant:** every task lists its **test file commit before** its **implementation commit**.

---

## 0. Pre-flight

These five checks must be green before T-01 starts:

| Check | Command | Expected |
|---|---|---|
| Wave-1 baseline tests | `cd tools/router && npm test` | 206/206 passing |
| Last commit on classify.js | `git log -1 --format=%H -- tools/router/classify.js` | `aa25a2b` (or newer cosmetic-only) |
| Provider wrappers exist | `ls tools/router/providers/{codex-cli,openai-api}.js` | both present |
| Quota tracker schema | `node -e "console.log(Object.keys(require('./tools/router/quota-tracker').summary()))"` | includes `anthropic_remaining_pct` |
| Savings tracker live | `curl -s 127.0.0.1:7821/health` | `{"ok":true,...}` |

If any check fails → halt and triage; don't start writing code.

---

## 1. Task graph (DAG, atomic commits)

```
        T-01 ─────────┐
                       ├── T-04 ──── T-05 ──── T-06 ──── T-07 ──── T-08 ──── T-09 ──── T-10
        T-02 ──────────┤                                            │                    │
                       │                                            │                    │
        T-03 ──────────┘                                            └── T-08b (parallel) │
                                                                                          │
                                                                       T-11 (final review)
```

| ID | What | Depends on | Atomic commit message |
|---|---|---|---|
| T-01 | Test fixtures: classification scenarios | — | `test(wave-2): scaffold router-execute test fixtures` |
| T-02 | Test fixtures: provider mocks | — | `test(wave-2): provider wrapper mocks for executor tests` |
| T-03 | Test scaffolding: helper to run executor under mocked deps | — | `test(wave-2): executor test harness + mock injector` |
| T-04 | Ollama wrapper recording usage | T-01..T-03 | `feat(router): ollama call wrapper records usage in tracker` |
| T-05 | `router-execute.js` core: skeleton + I1..I3 (T3, high_risk, override defer) | T-04 | `feat(router): router-execute defers T3 / high_risk / override to subagent` |
| T-06 | Fallback chain construction (I7) | T-05 | `feat(router): degradation-aware fallback chain in executor` |
| T-07 | Per-attempt loop + provider dispatch (I4..I6, I9) | T-06 | `feat(router): executor walks suggested_providers and dispatches calls` |
| T-08 | Telemetry: decisions.log line + sanitiser (I10) | T-07 | `feat(router): executor writes executed event to decisions.log` |
| T-08b | Savings-tracker `/last-execution` + `/metrics.executions` | T-07 (parallel with T-08) | `feat(metrics): savings-tracker exposes executions block` |
| T-09 | Calibration loop trigger (I8) | T-08, T-08b | `feat(router): executor triggers async calibration check every 1000 calls` |
| T-10 | CLI entry + smoke runner | T-09 | `feat(router): router-execute CLI for ad-hoc and validation use` |
| T-11 | final-reviewer pass + Notion + SYNC.md | T-10 | `docs(sync): Sessão #N — Wave-2 router-execute landed` |

Each row = one commit. No "while we're at it" mixing.

---

## 2. Detailed tasks

### T-01 — Classification scenario fixtures

**File:** `tools/router/test/fixtures/wave-2-classifications.json` (new)

**Content:** twelve classification objects covering the I1..I10 invariant prompts. Each entry has the full `Classification` shape from SPEC §3.1 plus an `expected` block describing the expected `ExecuteResult` outcome.

**Acceptance:**
- `node -e "JSON.parse(require('fs').readFileSync('tools/router/test/fixtures/wave-2-classifications.json'))"` parses.
- Twelve entries, each with `id`, `prompt`, `classification`, `expected`.

**Out of scope:** no executor code yet.

---

### T-02 — Provider mocks

**File:** `tools/router/test/mocks/providers.js` (new)

**Exports:** `createMockCodex({ result })`, `createMockOpenAI({ result })`, `createMockOllama({ result })`. Each returns a function that mimics the real wrapper's signature (`async (prompt, opts) => ({ ok, text, ... }) | null`).

**Acceptance:**
- Mocks return the configured result without spawning a child process.
- `node --test tools/router/test/mocks/providers.test.js` passes (a tiny self-test).

---

### T-03 — Executor test harness

**File:** `tools/router/test/helpers/executor-harness.js` (new)

**Exports:** `runExecutorWithMocks({ classification, prompt, providerMocks, providerState, trackerSpy, fsSpy })` → `Promise<ExecuteResult>`. Resets `require.cache` for `router-execute.js` and injects mocks via `proxyquire`-style mutation (no new dep — use Node's `Module._load` patch as already done in `providers.test.js`).

**Acceptance:**
- Harness exposes a `reset()` cleanup.
- Test asserting harness can run with all-undefined mocks and the executor still returns a structured `ExecuteResult_Error`.

---

### T-04 — Ollama wrapper records usage

**Files:**
- `tools/router/ollama_call_node.js` (existing — extend, do not rewrite)
- `tools/router/ollama_call_node.test.js` (new)

**Change:** after a successful Ollama response, call `tracker.recordUsage('ollama', { tokens_in, tokens_out, cost_usd: 0, duration_ms })`. Read tokens from the Ollama JSON response (`prompt_eval_count`, `eval_count`).

**Tests (commit BEFORE the change):**
- `records ollama usage when call succeeds`
- `does not record usage when call fails`
- `records 0 cost (subscription model)`

**Acceptance:** `tracker.summary()` reflects ollama usage after a successful call.

**Doctrinal note:** does NOT touch `classify.js`. Pre-flight grep on the diff to be sure.

---

### T-05 — Executor skeleton + defer cases (I1, I2, I3, I11)

**Files:**
- `tools/router/router-execute.js` (new)
- `tools/router/router-execute.test.js` (new — write FIRST)

**Skeleton:**
```js
async function execute({ prompt, classification, options = {} }) { ... }
module.exports = { execute };
```

**Initial branches implemented:**
- `classification.tier === 'T3'` → `defer model-architect, reason: tier_t3`
- `classification.high_risk === true` → `defer model-architect, reason: high_risk_floor`
- `classification.user_override?.honored` → match model: `opus → architect, sonnet → reasoner, haiku → triage`, reason: `user_override`

**Tests (BEFORE impl):** I1, I2, I3 from SPEC §9.

**Acceptance:**
- These three tests pass with mocked-empty providers (none called).
- Coverage > 70 % on the new file.

---

### T-06 — Fallback chain construction (I7)

**Files:**
- `tools/router/router-execute.js` (extend — new private function `resolveFallbackChain(classification, providerState)`)
- `tools/router/router-execute.test.js` (extend)

**Tests (BEFORE impl):** I7 plus three boundary cases (`codex_cli exhausted`, `ollama down`, `chain empty after filtering`).

**Implementation:** §6.1 of SPEC verbatim — degradation injection rules, doctrine guards already covered in T-05 short-circuit before this function runs.

**Acceptance:** unit tests for chain resolution pass without invoking any provider.

---

### T-07 — Per-attempt loop (I4, I5, I6, I9)

**Files:**
- `tools/router/router-execute.js` (extend — new function `dispatchOne(provider, prompt, opts)` and the iteration loop)
- `tools/router/router-execute.test.js` (extend)

**Tests (BEFORE impl):**
- I4: chain `[codex_cli, haiku]`, codex returns null → defer cheap-triage with `all_non_anthropic_failed`.
- I5: chain `[codex_cli, haiku]`, codex returns ok → result `provider_used: 'codex_cli'`.
- I6: T0 ollama success → exactly one `recordUsage('ollama', ...)`.
- I9: provider wrapper throws → `ExecuteResult_Error`, no escape.

**Implementation:** for-loop over chain, switch on provider key, structured try/catch around each provider call. Anthropic-tier chain entries short-circuit to defer.

**Acceptance:** 4 new tests pass. Total executor tests now ≥ 7.

---

### T-08 — Telemetry write (decisions.log + sanitiser, I10)

**Files:**
- `tools/router/router-execute.js` (extend — new function `writeTelemetry(executionRecord)`)
- `tools/router/router-execute.test.js` (extend)

**Tests (BEFORE impl):**
- I10: prompt with API key embedded → `prompt_preview` redacted.
- `writeTelemetry creates one JSONL line with all required fields`.
- `writeTelemetry does not throw when log path is unwritable` (best-effort).

**Implementation:** reuse `sanitize.sanitizeJson` already in repo. Append-only fd to `~/.claude/tools/router/decisions.log`. Path comes from `paths.js`.

**Acceptance:** the executed event format in §7.1 matches byte-for-byte expected fixture.

---

### T-08b — Savings-tracker `/last-execution` + `/metrics.executions` (parallel with T-08)

**Files:**
- `tools/router/savings-tracker.js` (extend — new in-memory `LAST_EXECUTION`, new handler `handleLastExecution`, extend `handleMetrics` to include `executions` aggregate)
- `tools/router/savings-tracker-me.test.js` (extend) — three tests:
  - POSTing an `executed` event populates `LAST_EXECUTION`
  - `GET /last-execution` returns the stored shape
  - `GET /metrics` includes `executions.{total,by_provider,by_outcome,guaranteed_saved_usd}`

**Implementation:** add `case '/last-execution': handleLastExecution` next to existing `/last`. Treat `event === 'executed'` in `handleDecision` as a multiplexed input that writes both `LAST_DECISION` (for backwards compat) and `LAST_EXECUTION`.

**Acceptance:** new tests pass; no regression in existing `savings-tracker-me.test.js` cases.

**Coordination with T-08:** these can be developed in parallel. Telemetry writer in router-execute.js POSTs to `/decision` AS BEFORE — the change is server-side only.

---

### T-09 — Calibration loop trigger (I8)

**Files:**
- `tools/router/router-execute.js` (extend — module-level `EXEC_COUNTER`, helper `maybeTriggerCalibration()`)
- `tools/router/router-execute.test.js` (extend)
- `tools/router/.calibration-state.json` (gitignored — created at runtime)

**Tests (BEFORE impl):**
- I8: 1000 simulated executions → spawn called once.
- 1000 then 1000 more → spawn called twice (assuming 24 h passes — mock Date).
- 1000 with calibration-state.json `last_run` < 24 h ago → no spawn.
- spawn failure does not affect executor return value.

**Implementation:** `child_process.spawn(node, [backtest.js, '--calibration-only', '--last-n=1000'], { stdio: 'ignore', detached: true }).unref()`. Persist `last_run` and `EXEC_COUNTER` (best-effort).

**Acceptance:** spawn call asserted via `child_process` mock; no awaits on the spawn promise.

**Note:** `backtest.js --calibration-only --last-n` flag may need a tiny addition to `backtest.js`. If absent today, add as part of T-09 with its own micro-test; mention in commit body.

---

### T-10 — CLI entry + smoke runner

**Files:**
- `tools/router/router-execute.js` (add `if (require.main === module) { ... }` block, mirroring `classify.js` pattern)
- `tools/router/test/smoke/wave-2-smoke.sh` (new) — runs four representative prompts end-to-end against the **real** classify (not mocked) but with provider mocks via `MOCK_PROVIDERS=1` env var.

**Acceptance:**
- `echo "rename foo to bar" | node tools/router/router-execute.js` returns a valid JSON ExecuteResult.
- The smoke script exits 0 and prints a 4-line PASS summary.

---

### T-11 — Pre-push gate

**Steps (sequential):**

1. `cd tools/router && npm test` — must show ≥ 230 passing, no fails.
2. `node tools/router/router-execute.js` smoke (T-10) — green.
3. Spawn `final-reviewer` subagent on the diff between this branch and last shipped commit on `main`. Mandatory before any push.
4. If reviewer returns APPROVED or APPROVED_WITH_NOTES (notes addressed), proceed.
5. Run the validation runner against a fresh corpus (re-use scripts in `.planning/validation-2026-05-07/`). Acceptance criterion §10 #5 must hold (≥ 55 % executions OK ratio).
6. Update `SYNC.md` Sessão #N entry (Wave-2 LANDED) and create the Notion sub-page (per CLAUDE.md PROTOCOLO NOTION).
7. Single force-no-push checkpoint: ask Paulo for explicit GO before `git push origin main`.

**Acceptance:** all of the above pass. No push without Paulo's signoff.

---

## 3. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Provider wrappers throw on edge cases not covered in current tests | Medium | High | T-07 requires structured try/catch; I9 enforces. |
| Calibration spawn leaks zombie processes | Low | Medium | `unref()` + `stdio: 'ignore'`; tests assert detach. |
| Adding `recordUsage('ollama', ...)` double-counts because of legacy elsewhere | Low | Medium | T-04 grep for any pre-existing ollama recordUsage in repo before edit; halt if found. |
| `decisions.log` write contention with concurrent inject_context.js writes | Low | Low | append-mode fs.appendFile is atomic for ≤ 4 KB on POSIX; acceptable. |
| Savings-tracker schema break for existing dashboards | Medium | Medium | T-08b adds `executions` as a NEW key — never mutates existing `pct_by_model`, `real_cost`, etc. |
| `final-reviewer` flags doctrine drift | Low | High | I1..I3 + I11 already encode doctrine; review should pass. |
| Wave-2 lands but doesn't move the needle in /metrics | Low | High | §10 #5 acceptance criterion requires ≥ 55 % OK ratio in fresh validation; halt + investigate if missed. |

---

## 4. Out of scope (deferred to Wave-3+)

- Gemini provider wrapper (SPEC §11 Q2)
- Notion-fanout for calibration alerts (SPEC §11 Q4)
- Direct Anthropic API path inside executor (SPEC §5 rationale)
- Mooter-tester running its own corpus through executor (separate phase)
- UI/statusline reflecting `guaranteed_saved_usd` (Wave-3 statusline pass)

---

## 5. Definition of Done (checklist for the closing commit)

- [ ] All 11 tasks committed atomically with the messages in §1.
- [ ] `npm test` ≥ 230 passing.
- [ ] `git diff aa25a2b -- tools/router/classify.js` is empty.
- [ ] `curl -s 127.0.0.1:7821/metrics | jq .executions` returns the new block.
- [ ] Smoke script (T-10) green for T0/T1/T1-high_risk/T3.
- [ ] Validation runner re-run shows ≥ 55 % executions OK ratio on a fresh 60-prompt corpus.
- [ ] final-reviewer APPROVED.
- [ ] Notion sub-page created and linked in `SYNC.md`.
- [ ] Paulo gave explicit GO before push.

---

## 6. Estimated effort

| Phase | Estimate |
|---|---|
| T-01..T-03 (fixtures + harness) | 30 min |
| T-04 (ollama tracker) | 15 min |
| T-05..T-07 (executor core) | 90 min |
| T-08 + T-08b (telemetry) | 45 min (parallelisable) |
| T-09 (calibration) | 25 min |
| T-10 (CLI + smoke) | 20 min |
| T-11 (review + sync) | 30 min |
| **Total wall-clock** | **~3.5 h** if no surprises; ~5 h with two re-runs. |

Estimate is *internal* — not exposed to user-side metrics. The single hard deadline is "before next milestone push".
