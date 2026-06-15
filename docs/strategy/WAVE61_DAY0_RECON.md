# Wave 61 — Day-0 Recon · Graph-Aware + Repomap + Context-Budget (GAP 3+4)

> **Branch:** `wave61-graph-aware` (off `main` @ v1.39.0), worktree `../mooter-wave61`.
> **Verdict: BLOCKED at the foundation — surfaced to Paulo before any code.** The wave's named
> source-of-truth brief does not exist, and the context axis has moved to a newer, explicitly-undecided
> design (Wave 65 Context Bridge). Building the graphify blocks now would be fabrication + collision.

---

## 0. Invariant check
- `classify.js` sha256 == `427d8c0b…364bc48f` ✅ verified on the worktree.

## 1. Refutations (Day-0 — repo contradicts the master prompt)

**W61-R1 — the brief does not exist.** The master prompt §4 Wave 61 says *"Concretiza o brief
`WAVE61_GRAPHIFY_ARCHITECTURE.md`"* and *"seguir os 7 blocos do brief Graphify"*. That file exists on
**no branch** (`git log --all -- "*GRAPHIFY*"` → only an archived `docs/archive/master-prompts-2026-04/
GRAPH_MEMORY_VAULT_MASTER_PROMPT.md` on the wave65 branch, a different/older artifact). The only
`WAVE61*` doc is `docs/strategy/WAVE61_AUTO_MATRIX_BRIEF.md` — a different topic (auto-matrix). So the
7-block architecture (pack `code-graph`, `graph-context-bridge.js`, `graph-context.js`,
`graph-aware-decide.ts`, chip 🕸, MCP coexist) has **no spec to concretize**. Building it = inventing
architecture (violates "No fabrication" / "Não inventar nomes de ficheiros").

**W61-R2 — the context axis has been superseded by Wave 65 (Context Bridge), still undecided.**
`wave65-context-bridge-rfc` carries `docs/strategy/CONTEXT_BRIDGE_RFC.md` (dated **2026-06-14**, the
same day as this mission) and a written `tools/router/session-context.js` (Wave 65 P0/P1). It tackles
GAP 4's territory — giving stateless dispatches a **budgeted, coherent slice of the conversation** —
but via a **transcript/context-bridge**, NOT graphify/repomap/PageRank. Critically the RFC's own status
is **"Draft (decision needed before build) · Decision asked: approve P0+P1"**. So: (a) the context
axis design is an OPEN architectural decision Paulo owns, and (b) it is a *different* design from the
Wave 61 graphify plan. Shipping a Wave 61 `graph-context.js` / context-budget now would pre-empt that
decision and risk duplicating/conflicting with `session-context.js`.

**W61-R3 — `graphify` is not installed.** The `gsd-graphify` skill shells out to an external
`graphify` tool to produce `graphify-out/graph.json` (`{ nodes[], edges[] }`) → `.planning/graphs/`.
`graphify` is **not on PATH**, and `.planning/graphs/` is empty / `graph.json` exists nowhere. The
"schema real do graph.json fixado no Day-0" the brief asks for is `{nodes[], edges[]}` from a tool that
isn't present. A graph-aware router would depend on an artifact that does not yet exist on this machine.

## 2. What this means

The Wave 61 graphify plan, as written in the master prompt, cannot be honestly built right now:
- no architecture brief to follow (W61-R1),
- its context-budget half overlaps an explicitly-undecided newer design Paulo owns (W61-R2),
- it depends on an uninstalled graph tool + absent artifact (W61-R3).

This is the same class of honest Day-0 finding as Wave 60's C (moot) / D (pre-existing) — surfaced, not
bulldozed. "Segue sem parar" cannot mean "fabricate a missing architecture and pre-empt an open RFC".

## 3. Options (Paulo decides — see the session message)
- **A. Pivot to align with the Wave 65 Context Bridge RFC** (the actual current design for the context
  axis) — but that RFC itself says "decision needed before build", so it needs Paulo's approval first.
- **B. Build only the one safe, design-agnostic primitive** of GAP 4: a pure `context-budget.js`
  policy `contextBudget(tier) → token budget` (T0 small/raw … T3 large/distilled), host-side, zero-LLM,
  no proxy, no graphify/transcript dependency — consumable by EITHER design later.
- **C. Pause Wave 61** until the brief exists and the wave65 context-axis decision is made; spend the
  momentum elsewhere (e.g. the deferred GAP-2 follow-up: wire Wave 60's `cache-aware-cost.ts` into a
  decide-agent consumer).
