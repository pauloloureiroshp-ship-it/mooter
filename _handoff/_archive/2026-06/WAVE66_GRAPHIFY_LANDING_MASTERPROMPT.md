# 🐮🕸 MASTER PROMPT — Wave 66: Graphify lands on main (coexist, no regression)

> Paste into the Claude Code session that is asking how to land graphify.
> **Decision (final): Option 1 — rename the graphify work to its own wave number and open a clean PR
> off `main` WITHOUT touching main's existing "Wave 61" (context-budget) or the auto-matrix brief.**
> The two are orthogonal axes (context-budget = conversation/context-per-tier; graphify =
> code-structure/grep-vs-graph) and must coexist, not overwrite each other.
>
> **Wave number = 66.** 60/60.5/61 are taken; 62 is reserved (Codex Plane, in `_handoff/codex/`);
> 63/64/65 are referenced in the roadmap. 66 is the first genuinely free number — re-confirm with
> `git log --all --oneline | grep -iE "wave ?6[0-9]"` before you start; if 66 is somehow used, take the next free one and tell me.

## House laws (non-negotiable — repeat to yourself before every commit)
- `tools/router/classify.js` is **FROZEN**, sha256 `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`. Re-verify before and after; never modify it.
- **NEVER merge `wave60_design_redesign` as a whole** — it regresses the cockpit (main 0.16.1 → branch 0.12.1) and drops 100+ router commits main has. Cherry-pick graphify commits ONLY.
- **Selective git adds only.** Never `git add -A`. Stage exactly the graphify files.
- **Do not touch the other session's work in main**: the Wave-61 context-budget files (`context-budget.js`, tag `v1.42.0`), `WAVE61_AUTO_MATRIX_BRIEF.md`, and the "graphify deferred" recon stay exactly as they are.
- **Honest-copy doctrine.** No fabricated numbers; if a premise is wrong, refute it and stop.

## Step 0 — Pre-flight (read, don't change)
1. `git rev-parse --abbrev-ref HEAD` and `git fetch origin`.
2. Verify classify.js sha (`sha256sum tools/router/classify.js`) == the frozen value above.
3. List the commits graphify added that main does NOT have:
   `git log origin/wave60_design_redesign ^origin/main --oneline`
4. Split that list into two buckets by inspecting each (`git show --stat <sha>`):
   - **KEEP (graphify):** pack `code-graph`, `graph-context-bridge`, statusline chip `🕸 graph`, hook `<graph-context>`, savings advisory for graph context, and the graphify brief.
   - **EXCLUDE (design redesign / unrelated):** anything touching `landing/`, `app/page.tsx`, the cockpit, `version.json` bumps tied to the design, or any non-graphify file.
   Print both buckets and **stop for my confirmation** if any commit is ambiguous (mixes graphify + design).

## Step 1 — Clean branch off main
- `git fetch origin && git switch -c wave66-graphify origin/main`
- This branch starts from current main, so it inherits main's Wave 61 (context-budget) untouched. Graphify will be **added beside it**, not over it.

## Step 2 — Cherry-pick graphify only
- Cherry-pick the KEEP commits in order: `git cherry-pick <sha1> <sha2> …`
- If a graphify commit also carries a design-redesign hunk, do NOT take it whole — `git cherry-pick -n <sha>`, then `git restore --staged` + `git checkout` the non-graphify paths, keeping only graphify files. Document which hunks you dropped.
- Recover the graphify brief: it was authored as `WAVE61_GRAPHIFY_ARCHITECTURE.md` but **never committed** (untracked in the other worktree). Find it (`git show wave60_design_redesign:docs/strategy/WAVE61_GRAPHIFY_ARCHITECTURE.md` or the untracked copy), and add it as `docs/strategy/WAVE66_GRAPHIFY_ARCHITECTURE.md`.

## Step 3 — Rename 61 → 66 (graphify-scoped only)
- In the cherry-picked graphify files + the brief, rename the wave label `Wave 61`/`WAVE61`/`61.A–61.D` → `Wave 66`/`WAVE66`/`66.A–66.D` **only where it denotes the graphify wave**.
- ⚠️ Do **not** rename any "Wave 61" that belongs to context-budget or auto-matrix. Grep first and review each hit: `grep -rn "61" <only the graphify files you staged>`. Identifiers/chips that are graph-specific (e.g. a `wave61` tag in graph code) get the 66 update; nothing else.
- Keep the chip text `🕸 graph` (that's a feature label, not a wave label).

## Step 4 — Verify (gate)
1. `sha256sum tools/router/classify.js` == frozen value. **Hard stop if not.**
2. `git diff --stat origin/main...wave66-graphify` — every changed path must be a graphify path. **Zero** `landing/`, cockpit, or context-budget files. Zero design regression.
3. Tests: `cd packages/router && npm install && npm test`; same for `packages/cli` and any package the graphify pack lives in. All green.
4. `mooter doctor` clean; if the graph chip is opt-in, confirm the default statusline is byte-identical.
5. Spawn `final-reviewer` (Opus) on the full diff. Ship only on 0-HIGH / 0-MED.

## Step 5 — PR (coexist, honest)
- Push `wave66-graphify`, open a PR into `main` titled **"Wave 66 — Graphify × Mooter (graph-aware routing)"**.
- PR body must state plainly: *"Graphify was previously deferred under Wave 61 (context-budget shipped instead). It now ships independently as Wave 66; the two are orthogonal axes and coexist. This PR does not modify Wave 61 / context-budget / auto-matrix."*
- **Do not edit** the other session's "graphify deferred" recon doc. (Optional, only if you want a forward-pointer: a single non-destructive line "superseded by Wave 66 (#PR)" — ask me first; default is leave it.)

## Step 6 — Record
- Update `SYNC.md` with a Wave 66 block: branch `wave66-graphify`, the KEEP/EXCLUDE buckets, classify.js sha re-verified, PR link, and the note that `wave60_design_redesign` is still NOT to be merged whole.

**Definition of done:** a `wave66-graphify` PR off main containing graphify-only changes, main's Wave 61 untouched, classify.js sha intact, tests green, final-reviewer SHIP, SYNC.md updated. Nothing deleted from any other session.
