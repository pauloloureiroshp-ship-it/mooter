# Wave Council — captured demos (real, local, $0)

Captured 2026-06-22 on the dev box (RTX-class GPU, Ollama local). No cloud key present →
both demos run **100% local at $0**. Numbers are real (measured), not illustrative.

---

## 1. Advisory Council — `mooter council "<prompt>"`

**Command**

```
mooter council "Should packages/council expose its API only via index.ts, or also allow deep imports?" --category coding.refactor
```

**Composition** (auto): `qwen3:30b (qwen/local) · gemma3:12b (gemma/local) · deepseek-r1:7b (deepseek/local)`,
deterministic synthesis (no cloud judge — no key). 3 distinct local families.

**Chip / meta (measured):**

```
🏛 council 126.6s · $0.00 · saved ~100%
confidence: 0.559 · convergence: CONFIRMED · rounds: 2 · calls: 13
```

**Why it matters — the council exposed real dissent a single model would have hidden.**
The recommendation converged on "index.ts only", but the **minority report** preserved 7
substantive objections with evidence, including two that are *technically correct
corrections* of the leading answer:

- `qwen3:30b` (correctness, conf 0.95): *"Tree-shaking efficiency is identical between
  flattened exports and deep imports when properly implemented; the claim incorrectly
  asserts flattened exports provide superior tree-shaking — a well-documented bundler
  misconception."*
- `qwen3:30b` (completeness, conf 0.95): *"framework libraries (React/Vue) require deep
  imports for core functionality, making index.ts-only fundamentally incompatible with
  their architecture."*
- `gemma3:12b` (completeness, conf 0.8): for tightly-integrated modules, index.ts-only can
  hinder discoverability without real benefit.

This is the thesis working live: **calibrated uncertainty with the dissent surfaced**, not
false confidence. A single-model answer would have shipped the tree-shaking misconception
unchallenged.

> Full transcript: re-run the command above (deterministic-ish; local models vary slightly).

---

## 2. Builder Council — concurrent implementations, tests as judge

The Builder Council demo is the **GATE C test** — it runs on a REAL throwaway git repo with
REAL `node` test executions (no mocks), $0:

```
cd packages/council && ../cli/node_modules/.bin/tsx --test tests/builder.test.ts tests/builder-gate.test.ts
```

What it demonstrates (all asserted):

- 3 members each implement a fix in their **own isolated `git worktree`**, in parallel.
- The **tests are the judge**: the member whose `impl.cjs` makes `run-tests.cjs` exit 0 wins;
  the wrong implementation (`a*b` instead of `a+b`) fails and loses.
- **Zero worktree leaks**: after cleanup `git worktree list` shows only the main worktree;
  member **branches are kept** (the diffs are the deliverable).
- **Honest "no winner"** when no implementation passes — never fabricated.
- The winning branch genuinely contains the fix (`git show <branch>:impl.cjs` → `a + b`).

> The Builder uses the `worktree-conductor` only for lock/heartbeat coordination — it runs
> `git worktree add/remove` itself (the conductor does not create worktrees), and **never
> merges to main**.

---

## Cost honesty

Both demos cost **$0.00** (all-local Ollama). The chip's "saved ~%" compares the measured
real cost against an *estimated* all-Opus baseline (`modelCalls × per-call estimate`),
explicitly marked `~` — never presented as a measured cloud figure.
