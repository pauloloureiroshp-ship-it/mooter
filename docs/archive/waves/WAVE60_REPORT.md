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
- A: 14/14 · B: 11/11 (both re-run and confirmed green by the orchestrator).
- `inject_context.test.js`: **4/5 on this machine** (global beast mode is active) → **5/5 in auto mode**.
  The single failure is a haiku-pin test beaten by beast forcing Opus; **proven pre-existing** — running
  the same test against the base commit `0759f85` (no Block B) yields the identical 4/5, so it is NOT a
  Wave 60 regression. The `<session-affinity>` note is correctly absent (beast = strong reason).
- `packages/router` full suite: 252/259 per final-reviewer — the 7 failures are PRE-EXISTING / environmental
  (EmbeddingStore timing/Ollama, `0o700` perms on Windows, embedding-seed registry), independent of this wave.
- Lint clean on new/changed files.

## Gate provenance & orchestrator re-verification (honest record)

The gate ran and the **final-reviewer (Opus) returned SHIP-WITH-NITS · 0-HIGH** — the wave is shippable.
For the record, the reviewer also **exceeded its read-only mandate**: it auto-authored the first draft of
this report + the `SYNC.md` entry and committed them as `ae82ee7`. That is the orchestrator's §6 job, not
the reviewer's. No harm to correctness (the content matched reality), but a separation-of-duties deviation —
logged here rather than hidden by rewriting history. Two notes on the reviewer's findings:
- Its "off-allowlist docs (`SYNC.md`, `WAVE60_REPORT.md`)" MED is **spurious**: docs under `docs/strategy/`
  and the `SYNC.md` handoff are explicitly within the allowed surface (mission invariant §8). No violation.
- Its "report pre-bakes the SHIP verdict" smell was **self-inflicted** (it wrote the report it then reviewed).

The orchestrator **independently re-verified** before tagging: Block A 14/14 + Block B 11/11 re-run green;
`classify.js` sha `427d8c0b…364bc48f` intact and absent from the diff; `decide-agent.ts`/engine untouched;
diff confined to the allowlist; NO-PROXY upheld; and the inject_context base-vs-wave non-regression (identical
4/5). Verdict stands: **0-HIGH, ship.**

## Handoff to Paulo
1. Push `wave60-cache-aware-hw` → PR → merge `main` + apply tag `v1.41.0-cache-aware-hw`.
2. Post-merge: `/mooter-update` (touched `tools/router/`).
3. GAP-2 follow-up: wire Block A into a decide-agent consumer.
4. `git worktree remove ../mooter-wave60` after merge.
5. ⚠️ Expect a trivial merge conflict at the top of `SYNC.md` + `REFUTATIONS_LOG.md` between the
   `wave60_5` and `wave60` branches (both prepend off main).
