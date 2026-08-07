# Wave Council — Day-0 recon (verbatim API surface)

**Run:** 2026-06-22 · branch `wave-council` · 11-target parallel verification sweep
**Verdict:** ✅ **GO** — 11/11 targets verified, **zero blocking divergences**. Every API the
master prompt (`docs/strategy/WAVE_COUNCIL_MEGA_MASTERPROMPT_CC.md`) assumes exists, with the
claimed signature. The Council can be built as a purely additive `packages/council/` that READS
classify.js output and REUSES the primitives below — no frozen file is modified.

> This doc is the **single source of truth for the real signatures** used by blocks A–D. Quotes
> are verbatim from the repo at the cited `file:line`.

---

## 0. Method & honesty note

Eleven independent read-only agents each verified one API surface against the master prompt's
claims and ruled `MATCH` / `DIVERGENT` / `MISSING`, quoting the real code. Aggregate: **all
MATCH** except one cosmetic `DIVERGENT` (below), which is non-blocking and in fact *helpful*.

**Only divergence found:** `VoteResult` carries an extra field `reviewers: ReviewResult[]` that
the master prompt's shorthand did not list (`voter.ts:21`). Non-blocking — it is a data-pass
convenience the Council can use for the minority report. No signature the Council calls is wrong.

---

## 1. Deliberation motor — `packages/validation/src/adversarial/` (reused literally)

```ts
// reviewer.ts
export type Lens = "correctness" | "security" | "completeness" | "repro" | "doctrine";   // :9
export const LENSES: Lens[] = ["correctness","security","completeness","repro","doctrine"]; // :11
export interface ReviewTarget { id: string; claim: string; context?: string }            // :13-17
export type Verdict = "confirm" | "refute" | "uncertain";                                 // :19
export interface ReviewResult {                                                           // :21-27
  reviewer: string; lens: Lens; verdict: Verdict; confidence: number /*0..1*/; rationale: string;
}
export type LlmCaller = (prompt: string) => Promise<string>;                              // :29
export async function review(                                                             // :79-94
  target: ReviewTarget, lens: Lens, call: LlmCaller, reviewerName = `${lens}-reviewer`,
): Promise<ReviewResult>;

// voter.ts
export type Convergence = "CONFIRMED" | "REJECTED" | "UNCERTAIN";                          // :11
export interface VoteOptions { threshold?: number; /* default 0.5 */ }                     // :24-26
export interface VoteResult {                                                              // :13-22
  convergence: Convergence; confirmMass: number; refuteMass: number; uncertainMass: number;
  score: number /* (confirmMass − refuteMass)/total ∈ [-1,1] */; threshold: number;
  reviewers: ReviewResult[];   // ← extra field vs master prompt (non-blocking)
}
export function vote(results: ReviewResult[], opts: VoteOptions = {}): VoteResult;         // :33
```

- **Refute wins ties** confirmed at `voter.ts:43`: `if (refuteMass >= confirmMass && refuteMass >= threshold*…)`.
- Re-exported from `packages/validation/src/index.ts:11-12` (`export * from "./adversarial/reviewer.ts"|"./adversarial/voter.ts"`).
- The Council does **NOT write new aggregation** — it calls `review()` per seat/lens then `vote()`.

## 2. Seats = `ModelSpec` — `packages/validation/src/benchmark/callers.ts`

```ts
export interface CallOutcome { text: string; costUsd: number; latencyMs: number; error?: string } // :9-14
export interface ModelSpec {                                                                       // :16-21
  id: string; tier: Tier; kind: "local" | "cloud"; call: (prompt: string) => Promise<CallOutcome>;
}
export function makeOllamaModel(id, tier, opts:{host?,timeoutMs?}={}): ModelSpec;   // :35-63  costUsd ALWAYS 0
export function makeAnthropicModel(id, tier, opts:{apiKey?,maxTokens?,timeoutMs?}={}): ModelSpec; // :65-118 cost computed
```

- `Tier = "T0"|"T1"|"T2"|"T3"` (`packages/validation/src/types.ts:3`).
- Ollama default host `http://localhost:11434`, calls never throw (errors → `error` field). Cost **$0** (`:55,57`).
- Anthropic cost computed `(inTok*price.in + outTok*price.out)/1e6` (`:109`); price table only has
  `haiku-4-5-20251001`, `sonnet-4-6`, `opus-4-8` (`:24-28`) — **honesty caveat**: a seat whose model id
  is not in this table will compute cost 0; Council must treat unknown-price cloud cost as **pending**, not $0.
- **NOT re-exported** from validation's `index.ts` → import via deep path
  `../../validation/src/benchmark/callers.ts` (matches the repo's cross-package convention).

### ⚠️ Required adapter (seat → reviewer)
`review()` wants `LlmCaller = (p)=>Promise<string>`; a `ModelSpec` yields `CallOutcome`. Bridge:
```ts
const asCaller = (spec: ModelSpec): LlmCaller => async (p) => (await spec.call(p)).text;
```
Cost/latency are read from the raw `CallOutcome` separately (the Council tracks both).

## 3. Per-seat selection — `packages/router/src/`

```ts
// decide-agent.ts:283
export function decideAgent(args: DecideAgentArgs): DecideAgentResult;
//   args:  { task_category: string; min_score?: number; max_cost_usd?: number; prefer_local?: boolean; force_model?: string }
//   result:{ chosen_model: string|null; reason: string; tes: number|null; alternatives: AgentAlternative[];
//            cited_source: string|null; coverage_note: string }
// specialization-matrix.ts
export const MATRIX_MODELS = [...] as const;                                  // :63-81 (17 models)
export function getCell(model: string, category: TaskCategory): SpecializationCell | null; // :207
export function coverageStats(): CoverageStats;                              // :245
// task-categories.ts
export const TASK_CATEGORIES = [...] as const;                              // :60-66 (24 cats, 5 groups: 9+4+4+3+4)
export function parseTaskCategory(s: string): TaskCategory | null;          // :87-90
// adaptive-learner.ts
export function recomputeFromOutcomes(opts: RecomputeOptions = {}): RecomputeResult;  // :256
export function getLearnedCell(model, category, opts?): SpecializationCell | null;    // :405-409
export function driftReport(opts?): DriftReport;                                      // :460
export const EWMA_ALPHA = 0.3 as const;   // :56
export const MIN_DATAPOINTS = 5 as const; // :64
```

- `decideAgent` is the per-seat picker (Pareto/TES). `tes` is `number|null`; `coverage_note` is the
  honest "this cell is/ isn't measured" string the Council surfaces. **No fabrication** — honor nulls.
- `EWMA_ALPHA`/`MIN_DATAPOINTS` are what Bloco D's CAS auto-tune reuses.

## 4. Concurrency / convergence — `packages/workflow/src/primitives.ts`

```ts
export async function parallel<T,R>(items: T[], fn: (item:T)=>Promise<R>, options:{concurrency?:number}={}): Promise<R[]>; // :17
export async function converge<R>(initial: R[], refineFn:(r:R)=>Promise<R|null>, maxIterations = 3): Promise<R[]>;          // :42
```
- Phase-1 parallel generation = `parallel(seats, …)`. Multi-round cross-exam (Bloco B) = `converge(…)`.
- Re-exported from `packages/workflow/src/index.ts`.

## 5. Fan-out — `packages/spawn-orchestrator/src/fanout.ts`

```ts
export async function fanOut(tasks: FanoutTask[], options: FanoutOptions = {}): Promise<FanoutReport>; // :132
export const FANOUT_THRESHOLD = 3; // :36
```

## 6. MCP tool shape — `packages/mcp-server/src/tools.ts`

```ts
export interface McpTool {                                                  // :38-43
  name: string; description: string;
  inputSchema: { type: "object"; properties: Record<string,unknown>; required?: string[] };
  handler: (args: Record<string,unknown>, ctx: ToolContext) => Promise<string>;
}
export interface ToolContext { fetchImpl?; notionToken?; notionHqId?; dryRun? }   // :30-36
export function buildRegistry(): McpTool[];                                  // :764-790 (array of const McpTool)
```
- Bloco C's `council_convene` follows this exact pattern (a `const councilConveneTool: McpTool = {…}` added to the registry).

## 7. CLI dispatch (lazy-import) — `packages/cli/src/commands/workflow.ts`

```ts
export async function runWorkflow(args: string[]): Promise<CmdResult>;       // :421
// lazy engine load, hidden from esbuild:
const ENGINE_SPECIFIER = ["..","..","..","workflow","src","index.ts"].join("/"); // :116
async function engine() { return import(ENGINE_SPECIFIER); }                      // :117-119
// CmdResult { exitCode: number; output: string }  (trail.ts:23-26)
// index.ts:536-540 routes `mooter workflow …` → runWorkflow(rest)
```
- The `mooter council …` command (Bloco A) mirrors this: validate args first, lazy-import the
  council engine via a runtime-assembled specifier so the zero-deps CLI stays clean.

## 8. ⚠️ worktree-conductor is a LOCK conductor, NOT a worktree creator — `packages/worktree-conductor/src/`

```ts
export function acquireWithRecovery(resource: string, owner: LockOwner, opts: AcquireOptions = {}): RecoveryAcquire; // conductor.ts:28
export function status(opts:{home?;now?}={}): ConductorStatus;     // conductor.ts:49
export function forceRelease(resource, bySessionId, opts={}): boolean; // conductor.ts:62
export function reap(opts:{home?;now?}={}): string[];              // conductor.ts:75
export function runConductor(args: string[], opts: ConductorCmdOptions = {}): CmdResult; // commands.ts:79
```
- **Proven**: locks via `openSync(... 'wx')` (atomic O_CREAT|O_EXCL) + JSON heartbeats; **no
  `git worktree`, no `exec`/`spawn`/`fork`** anywhere in `src/`. package.json deps: only
  `@types/node`, `tsx`.
- **Implication for Bloco C:** the Builder Council must run `git worktree add/remove` itself,
  using the conductor only to coordinate locks/heartbeats and `reap()` stale leases.

## 9. classifier output contract — `tools/router/classify.js` (FROZEN, read-only)

- `confidence` field emitted on every decision: `Math.round(confidence*100)/100` (`classify.js:1002`;
  typed `confidence?: number` in `types.d.ts:83`).
- **High-risk T3 floor** (`classify.js:666-670`): `if (high > 0 || multiFile || /architect|arquitetur/i…) { tier='T3'; risk='high'; confidence = high>=2 ? 0.9 : 0.75 }`.
- HIGH_RISK patterns include deploy (`patterns.js:33`), secrets (`.env`/`secret`/`credential`/`API_KEY`, `:36`),
  migrations (EN+PT variants, `:34,45-46`). User override **refuses** downgrade when `high>0` (`:1068-1079`).
- Council **reads** this (`confidence` + the T3 floor signal) to compute CAS. It never imports or
  modifies classify.js. sha freeze stays intact.

---

## 10. Build implications (locked decisions for A–D)

1. **Cross-package imports = deep relative `.ts` paths** (no workspaces, no `@mooter/*` linking):
   e.g. `import { review, vote } from "../../validation/src/adversarial/index.ts"`.
2. **Council package = additive**, mirrors `@mooter/validation` conventions (ESM, strict tsconfig,
   tsx test runner). Scaffold committed in Bloco 0.
3. **Tests on Windows:** `npm test` fails locally due to a pre-existing shim quirk (the
   `../cli/node_modules/.bin/tsx` path is not cmd-resolvable — `@mooter/validation` fails identically).
   Run via Git Bash: `../cli/node_modules/.bin/tsx --test tests/*.test.ts`. CI (Linux) uses `npm test`.
4. **Honesty floors:** honor `tes:null` / `coverage_note`; treat unknown cloud price as `pending`
   cost, never $0; expose dissent (minority report) instead of fabricating consensus.
5. **Aggregation is reused, not rewritten** — `vote()` is the confidence-weighted consensus; the
   minority report reads `VoteResult.reviewers`, not a new tally.

**No blockers. Proceeding to Bloco A.**
