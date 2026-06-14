# Wave 60 — Report · Cache-Aware Cost + Session Affinity (GAP 2)

**Branch:** `wave60-cache-aware-hw` (off `main` @ v1.39.0) · **Worktree:** `../mooter-wave60`
**Tag β (CC creates, Paulo applies final):** `v1.41.0-cache-aware-hw`
**final-reviewer (Opus):** **SHIP** · **0-HIGH** · 1 MED (documented) · 2 NITs (non-blocking)

## What shipped (genuine new code = A + B)

| Block | File(s) | Tests |
|---|---|---|
| **A** | `packages/router/src/cache-aware-cost.ts` (NEW, allowlisted) | `tests/cache-aware-cost.test.ts` (14) |
| **B** | `tools/router/session-affinity.js` (NEW) + `inject_context.js` best-effort block | `session-affinity.test.js` (11) |

- **A — switching-cost primitive.** Anthropic prompt cache is per-model; changing the routed model
  mid-session abandons the warm prefix (cache read ~0.10× → write ~1.25×).
  `switchingCostUsd = prefix × inputPrice(candidate) × (CACHE_WRITE − CACHE_READ)`. Pure, reuses
  `cost.ts`'s frozen snapshot (no pricing re-impl), wraps decide-agent without editing it, adopts the
  *idea* of switching cost — never a real cache (NO-PROXY). Returns 0 when nothing is at stake (local,
  same model, no prefix, **pending-price model → 0, no fabrication**).
- **B — session affinity.** Records the session's routed model and surfaces a `<session-affinity>`
  hint note when a prompt would switch models without a strong reason. Host-side, deterministic, zero
  KV read, never mutates routing. Strong reasons (HIGH_RISK / safety-floor / beast / honored-override
  / ≥2-rung tier jump) always take the freshly-classified model — no note. Module absent → no note →
  hint byte-identical.

## Invariants (verified by final-reviewer)

| # | Invariant | Status |
|---|---|---|
| 1 | classify.js FROZEN (sha `427d8c0b…364bc48f`) | ✅ intact, not in diff |
| 2 | decide-agent.ts / engine files not edited | ✅ only a NEW allowlisted file added to packages/router |
| 3 | NO-PROXY / zero LLM | ✅ A pure; B host-side, zero KV, no routing mutation |
| 4 | Doctrine floor (affinity never suppresses a strong reason) | ✅ `hasStrongReason` + ≥2-rung guard |
| 5 | Hint byte-identical by default | ✅ best-effort try/catch; note only on a genuine weak switch |
| 6 | Selective git adds | ✅ no package-lock churn committed |
| 7 | No fabrication (pending-price → 0) | ✅ verified empirically (opus-4-6 → 0) |

## Descope — honest Day-0 findings (NOT gaps)

- **Block C (roster) — fully moot.** `qwen3-coder-next` doesn't exist (W60-R1); the dispatch path is
  already `qwen3:30b`; the T0 default lives in FROZEN classify.js behind `ROUTER_OLLAMA_*` env; even the
  `model-manager.js` "pull qwen2.5:3b" hint is correct (smallest first-pull). Zero actionable change.
- **Block D (HW-aware T0) — already implemented end-to-end (W60-R5).** `gpu-probe.js recommended_t0`
  → `inject_context.js:642 FRUGAL_HW_RECOMMENDED_T0` → FROZEN `classify.js:945` T0 bias →
  `hardware-matcher.js` (the `mooter models` content) → `gpu-status.js` chip. Not rebuilt (duplicate).

## MED (documented, non-blocking)

`cache-aware-cost.ts` has no production caller yet — it is a **tested, staged primitive**. Block B uses
a qualitative tier-rung nudge, not A's USD math (B is CJS, A is ESM/TS — different runtimes by design;
A's natural consumer is the TS-side decide-agent path). **Explicit GAP-2 follow-up:** wire
`annotateSwitchingCost` into a decide-agent consumer so the switching-cost USD reaches a decision.

## Test state
- A: 14/14 · B: 11/11 · inject_context hook: 5/5 (auto mode).
- `packages/router` full suite: 252/259 — the 7 failures are PRE-EXISTING / environmental (EmbeddingStore
  timing/Ollama, `0o700` perms on Windows, embedding-seed registry), independent of this wave.
- Lint clean on new/changed files.

## Handoff to Paulo
1. Push `wave60-cache-aware-hw` → PR → merge `main` + apply tag `v1.41.0-cache-aware-hw`.
2. Post-merge: `/mooter-update` (touched `tools/router/`).
3. GAP-2 follow-up: wire Block A into a decide-agent consumer.
4. `git worktree remove ../mooter-wave60` after merge.
5. ⚠️ Expect a trivial merge conflict at the top of `SYNC.md` + `REFUTATIONS_LOG.md` between the
   `wave60_5` and `wave60` branches (both prepend off main).
