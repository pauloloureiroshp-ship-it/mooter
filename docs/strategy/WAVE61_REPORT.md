# Wave 61 — Report · Context-Budget (GAP 4 MVP) · Graphify DEFERRED

**Branch:** `wave61-graph-aware` (off `main` @ v1.39.0) · **Worktree:** `../mooter-wave61`
**Tag β (CC creates, Paulo applies final):** `v1.42.0-graph-aware`
**final-reviewer (Opus):** **SHIP · 0-HIGH · 0-MED** · 2 trivial NITs (read-only review, descope independently verified honest)

## The Day-0 verdict (why this wave is small)

Wave 61's master-prompt brief names `WAVE61_GRAPHIFY_ARCHITECTURE.md` as its source of truth. That file
**exists on no branch** (W61-R1). The context axis it targets has moved to a newer, *still-undecided*
design — `wave65-context-bridge-rfc` / `CONTEXT_BRIDGE_RFC.md` (status "Draft — decision needed before
build", W61-R2) with a written `session-context.js`. And `graphify`/`graph.json` are absent from the
machine (W61-R3). Building the graphify blocks would mean **inventing a missing architecture** and
**pre-empting an open decision Paulo owns** — both doctrine violations. So the graphify blocks are
**deferred**, and the wave ships only the one design-agnostic piece.

## What shipped

| Item | File | Tests |
|---|---|---|
| Context-budget per-tier primitive (GAP 4) | `tools/router/context-budget.js` (NEW) | `context-budget.test.js` (6) |
| Policy docs | `docs/ux/CONTEXT_BUDGET.md` (NEW) | — |
| Day-0 recon + refutations | `docs/strategy/WAVE61_DAY0_RECON.md` (NEW) | — |

`contextBudget(tier) → { max_context_tokens, mode: raw|distilled, advisory:true }`. Policy: T0/T1 raw
(free/cheap), T2/T3/T5 distilled (expensive + context-rot-prone) — mirrors "T0 cru / T3 destilado".
Pure (zero IO, zero LLM, no proxy), never throws, unknown tier → safe distilled default. It is a
*parameter* any future context mechanism (graphify OR the wave65 bridge) can consume; it does NOT read
a transcript, build a graph, or decide the architecture.

## Invariants (verified by final-reviewer, read-only)

| # | Invariant | Status |
|---|---|---|
| 1 | classify.js FROZEN (sha `427d8c0b…364bc48f`) | ✅ intact, not in diff |
| 2 | No `packages/*` / frozen edits | ✅ diff confined to `tools/router/context-budget.*`, `package.json`, docs |
| 3 | Pure / zero-LLM / no-proxy | ✅ no require/fs/net/process; comments disavow graph/transcript |
| 4 | No fabrication | ✅ descope verified honest against the repo; budgets labeled advisory; "71×" only disavowed |
| 5 | Selective adds | ✅ package-lock churn not staged |

## Deferred (graphify — needs a brief + the wave65 decision)
- `code-graph` pack, `graph-context-bridge.js`, `graph-context.js` (full), `graph-aware-decide.ts`,
  🕸 chip, MCP coexist. Blocked by W61-R1 (no brief) + W61-R2 (open context-axis decision) + W61-R3
  (no graphify tool/artifact).

## Handoff to Paulo
1. **Decide the context axis** — approve the wave65 Context-Bridge RFC, or revive the graphify plan
   (which first needs `WAVE61_GRAPHIFY_ARCHITECTURE.md` written). They are competing GAP-4 designs;
   `context-budget.js` serves either.
2. Push `wave61-graph-aware` → PR → merge `main` + apply tag `v1.42.0-graph-aware`.
3. Post-merge: `/mooter-update` (touched `tools/router/`).
4. `git worktree remove ../mooter-wave61` after merge.
5. ⚠️ Trivial merge conflict expected at the top of `SYNC.md` / `REFUTATIONS_LOG.md` between the
   `wave60_5` / `wave60` / `wave61` branches (all prepend off main).

## Arc status
- ✅ Wave 60.5 — Reasoning-Effort Axis (`v1.40.0-reasoning-axis`)
- ✅ Wave 60 — Cache-Aware Cost + Session Affinity (`v1.41.0-cache-aware-hw`)
- ✅ Wave 61 — Context-Budget MVP (`v1.42.0-graph-aware`); graphify + wave65 bridge pending architecture decision.
