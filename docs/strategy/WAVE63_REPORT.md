# Wave 63 — Report · Cheap Guardrails (GAP 5 + 6)

**Branch:** `wave63-cheap-guardrails` (off `main` @ v1.39.0) · **Worktree:** `../mooter-wave63`
**Tag β (CC creates, Paulo applies final):** `v1.43.0-cheap-guardrails`
**final-reviewer (Opus):** **SHIP · 0-HIGH · 0-MED** · 2 NITs (advisory) · read-only review

## What shipped

| GAP | File | Tests |
|---|---|---|
| **5** anti-compression for dense code | `tools/router/prompt-optimizer.js` (host-side edit) | `prompt-optimizer-codeguard.test.js` (8) |
| **6** tool-result compression policy | `tools/router/tool-result-policy.js` (NEW) | `tool-result-policy.test.js` (7) |

- **GAP 5** — `isDenseCodePrompt()` + a guardrail `if (category==='code_generation' && isDenseCodePrompt(prompt)) return null;`.
  Stops the destructive `removePadding`/`reformatForT0` (PT+EN article/preposition strip + whitespace collapse)
  from corrupting code, identifiers, or string literals in dense code prompts (fenced block / multi-line spec /
  symbol-heavy). Light/short code prompts still optimize. Scoped to `code_generation` only — no behavior change
  for other categories (architecture/cross-file were already guarded by the pre-existing rules).
- **GAP 6** — `toolResultPolicy(toolName) → { compressibility, strategy: drop|summarize|keep, advisory:true }`.
  A deterministic, classify-style policy. `drop` is restricted to re-derivable/superseded results (mutation
  confirmations: Edit/Write/MultiEdit/NotebookEdit; ephemeral: TodoWrite). Readers (Read/Glob/Grep) and verbose
  exec/web summarize; synthesized conclusions (Task/Agent) and unknown/MCP tools are KEPT — never drop what can't
  be re-derived. Advisory input the host's `/compact` consults; Mooter never compacts itself (NO-PROXY).

## Invariants (verified by final-reviewer, read-only)

| # | Invariant | Status |
|---|---|---|
| 1 | classify.js FROZEN (sha `427d8c0b…364bc48f`) | ✅ intact, not in diff |
| 2 | No `packages/*` / frozen edits | ✅ diff confined to `tools/router/` + docs |
| 3 | Pure / zero-LLM / no-proxy | ✅ both modules pure; GAP 6 advises, never compacts |
| 4 | GAP 5 scoped + safe | ✅ code_generation-only; identifiers survive; existing test 46/46 (no regression) |
| 5 | GAP 6 drop-set safe | ✅ drop ⊂ {mutation confirmations, TodoWrite}; Task/Agent/unknown kept |
| 6 | Selective adds | ✅ package-lock churn NOT staged |

## NITs (advisory, non-blocking)
1. Incidental `package-lock.json` drift (0.9.9→1.0.0, npm syncing to the already-committed `package.json@1.0.0`) — not staged, not in the diff. Keep it out of the merge.
2. By-design residual: a single-line, symbol-light, NL-described code prompt still optimizes (only NL scaffolding degrades — identifiers verified intact). The guard targets dense bodies. Future tightening lever: snake_case/camelCase identifier density on single-line code prompts.

## Handoff to Paulo
1. Push `wave63-cheap-guardrails` → PR → merge `main` + apply tag `v1.43.0-cheap-guardrails`.
2. Post-merge: `/mooter-update` (touched `tools/router/`).
3. GAP 6 is an advisory primitive — wire `tool-result-policy.js` into the host `/compact` flow when desired.
4. `git worktree remove ../mooter-wave63` after merge.
5. ⚠️ Trivial merge conflict expected at the top of `SYNC.md` / `REFUTATIONS_LOG.md` across the 4 wave branches (60_5/60/61/63, all prepend off main).

## Arc status — token-economy multi-axis COMPLETE
- ✅ Wave 60.5 — Reasoning-Effort Axis (`v1.40.0-reasoning-axis`)
- ✅ Wave 60 — Cache-Aware Cost + Session Affinity (`v1.41.0-cache-aware-hw`)
- ✅ Wave 61 — Context-Budget MVP (`v1.42.0-graph-aware`); graphify deferred (brief missing + wave65 decision)
- ✅ Wave 63 — Cheap Guardrails (`v1.43.0-cheap-guardrails`)
