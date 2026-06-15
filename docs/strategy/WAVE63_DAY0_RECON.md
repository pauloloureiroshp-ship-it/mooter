# Wave 63 — Day-0 Recon · Cheap Guardrails (GAP 5 + 6)

> **Branch:** `wave63-cheap-guardrails` (off `main` @ v1.39.0), worktree `../mooter-wave63`.
> Two small, host-side, deterministic guardrails. Both confirmed genuinely-new (not pre-existing).

## 0. Invariant check
- `classify.js` sha256 == `427d8c0b…364bc48f` ✅ verified on the worktree.
- Edits are host-side (`tools/router/`), never `classify.js` / `packages/*`.

## 1. GAP 5 — code_generation is compressed today (confirmed real)
`tools/router/prompt-optimizer.js` (377L) already guards `architecture_or_critical`, `cross_file_change`,
`bash_command_paste`, `file_read_intent`, HIGH_RISK, and `<30` chars (`:294-300`) — but **`code_generation`
is NOT guarded**. Its `categoryFrame` case only adds an `Implement:` prefix (`:192-194`), yet the
destructive strategies still run: `removePadding` (`:69`) and `reformatForT0` (`:85-101`) strip PT/EN
articles & prepositions mid-sentence and collapse whitespace. On a **dense** code prompt (a pasted code
block, a precise multi-line spec, a symbol-heavy body) that can corrupt code, identifiers, or string
literals. The literature flags code as the compression-sensitive case → the brief's GAP 5 holds.
**Fix:** add `isDenseCodePrompt()` + a guardrail `if (category==='code_generation' && isDenseCodePrompt) return null;`
Light/short code prompts still optimize.

## 2. GAP 6 — no tool-result compression policy exists (genuinely new)
**W63-R1:** `.claude/rules/router-logic.md` references *"Tool outputs must be trimmed … `inject_context.js`
`trimToolOutput`"*, but `trimToolOutput` **does not exist** in `inject_context.js` (grep → 0 hits). So there
is no tool-result compression policy to extend — GAP 6 is net-new.
**Fix:** a NEW `tool-result-policy.js` — a deterministic, classify-style policy mapping a tool NAME to a
compressibility verdict (`drop`/`summarize`/`keep`). It is **advisory** input the host's `/compact` can
consult; Mooter never compacts context itself (the host owns `/compact`; replicating it would be a proxy,
mission §5). Re-derivable results (Read/Glob/Grep, mutation confirmations, TodoWrite snapshots) are
droppable/summarizable; synthesized conclusions (Task/Agent) and unknown/MCP tools are kept (conservative —
never drop what we cannot re-derive).

## 3. Scope
- **GAP 5** `prompt-optimizer.js` — `isDenseCodePrompt()` + guardrail (host-side edit; exported for tests). 8 tests.
- **GAP 6** `tool-result-policy.js` (NEW) + `tool-result-policy.test.js`. 7 tests.
- Both pure, deterministic, zero-LLM, no-proxy. The host `/compact` and any future compaction layer are the
  consumers — these ship as advisory primitives (no live wiring needed; no behavior change without a caller).

## 4. Gate
final-reviewer 0-HIGH (read-only) · re-verify sha · diff confined to `tools/router/` + docs · β tag
`v1.43.0-cheap-guardrails` (Paulo applies final).
