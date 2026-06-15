# Context Budget per Tier (Wave 61 · GAP 4)

> **TL;DR** — `tools/router/context-budget.js` is a pure, advisory policy primitive: given a routing
> tier it returns how much context to spend and whether to send it **raw** or **distilled**. It is the
> one design-agnostic piece of the context axis; the graphify/repomap blocks are **deferred** (see
> "Scope" below).

## Why

Tokens spent on context are real cost, and more context is not always better — **context rot** means a
small focused slice often beats a dumped window. The lever: spend context where it's cheap, focus it
where it's expensive.

## Policy

| Tier | Budget (advisory) | Mode | Rationale |
|---|---|---|---|
| T0 (local) | 8k | **raw** | free/local, small-model-bound — no point distilling free tokens |
| T1 (Haiku) | 8k | **raw** | cheap cloud — light raw slice |
| T2 (Sonnet) | 16k | **distilled** | mid cost — begin focusing |
| T3 (Opus) | 24k | **distilled** | expensive + context-rot-prone — focus the tokens |
| T5 (Fable) | 24k | **distilled** | frontier opt-in — focus |
| unknown | 16k | **distilled** | safe mid default — never raw-dump on uncertainty |

This mirrors the brief's "T0 cru / T3 destilado". Token figures are **advisory policy defaults**, not
measured savings — callers may override. We never quote a "typical" multiplier (e.g. "71×"); context
savings from applying a budget are **advisory**.

```js
const { contextBudget, shouldDistill } = require('./context-budget.js');
contextBudget('T3'); // { tier:'T3', max_context_tokens:24000, mode:'distilled', rationale:'…', advisory:true }
shouldDistill('T0'); // false
```

## Scope — what shipped vs deferred (Wave 61 Day-0)

**Shipped:** the `context-budget.js` policy primitive only (this doc). It does NOT read a transcript,
build a code graph, or pick a context mechanism.

**Deferred** (see `docs/strategy/WAVE61_DAY0_RECON.md`, refutations W61-R1..R3):
- The graphify blocks (code-graph pack, `graph-context-bridge.js`, `graph-aware-decide.ts`, 🕸 chip,
  MCP coexist) — their architecture brief (`WAVE61_GRAPHIFY_ARCHITECTURE.md`) **does not exist**, and
  `graphify`/`graph.json` are not present on this machine. Building them would be fabrication.
- The transcript/context-bridge mechanism is an **open architectural decision** Paulo owns — the newer
  `wave65-context-bridge-rfc` (`CONTEXT_BRIDGE_RFC.md`, status *"decision needed before build"*) targets
  the same context axis with a different design (`session-context.js`). `context-budget.js` is a
  parameter **either** design can consume, so it ships safely without pre-empting that decision.
