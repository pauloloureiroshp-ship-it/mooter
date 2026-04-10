# Architecture

This document is the technical source of truth for frugal. If something in the code disagrees with what is written here, the code wins — but please open an issue so this document can be corrected.

**Audience:** engineers evaluating frugal, contributors, and future-Paulo six months from now who has forgotten how the backtest loop works.

---

## Table of contents

1. [Design principles](#1-design-principles)
2. [Runtime flow (single prompt)](#2-runtime-flow-single-prompt)
3. [Module map](#3-module-map)
4. [The classifier — `classify.js`](#4-the-classifier--classifyjs)
5. [The hook — `inject_context.js`](#5-the-hook--inject_contextjs)
6. [The doctrine — `~/.claude/CLAUDE.md`](#6-the-doctrine--claudeclaudemd)
7. [The subagents](#7-the-subagents)
8. [Telemetry — `decisions.log` and `savings-tracker.js`](#8-telemetry--decisionslog-and-savings-trackerjs)
9. [Auto-learning loop — backtest, tune, patch](#9-auto-learning-loop--backtest-tune-patch)
10. [Doctrine guardrails — dual-enforce at runtime AND upstream](#10-doctrine-guardrails--dual-enforce-at-runtime-and-upstream)
11. [Statusline integration — `gsd-statusline.js`](#11-statusline-integration--gsd-statuselinejs)
12. [Failure modes and what happens](#12-failure-modes-and-what-happens)
13. [Performance budget](#13-performance-budget)
14. [Security and privacy](#14-security-and-privacy)
15. [Design decisions and trade-offs](#15-design-decisions-and-trade-offs)

---

## 1. Design principles

frugal exists because a single principle kept failing in practice: *the right answer to "which model?" is "the cheapest one that can answer this".* Everything downstream falls out of that.

Five rules govern every design decision:

1. **No proxy.** The router never sits between the user and an LLM provider. It only emits hints that Claude Code itself honours. If frugal dies, Claude Code still works.
2. **Zero LLM cost at the classification step.** A router that calls an LLM to decide which LLM to call is recursive idiocy. frugal classifies in <50 ms using pure regex.
3. **Doctrine > configuration.** Complex YAML/JSON configs rot. A 165-line markdown doctrine read by the session itself is self-documenting, editable, and versionable.
4. **Explainability is non-negotiable.** Every decision returns a `reasoning` field. Every decision is logged. The user can always answer "why did this prompt go to Opus?".
5. **The doctrine must never be overridden by optimisation.** Auto-learning can move trivial prompts to cheaper tiers — but prompts touching push/deploy/secrets/architecture are forced to T3 regardless of what the backtest learned. This is non-negotiable and dual-enforced (see §10).

---

## 2. Runtime flow (single prompt)

```
user types "rename handleConnect to onConnect across the file"
            │
            ▼
┌───────────────────────────────────────────────────────────────────┐
│ 1. Claude Code fires UserPromptSubmit hook                        │
└──────────────────────────┬────────────────────────────────────────┘
                           │
                           ▼
┌───────────────────────────────────────────────────────────────────┐
│ 2. inject_context.js runs (~2 ms)                                 │
│    - spawns classify.js with prompt as arg                        │
│    - hard timeout: 500 ms (beyond which we emit 'claude_session') │
└──────────────────────────┬────────────────────────────────────────┘
                           │
                           ▼
┌───────────────────────────────────────────────────────────────────┐
│ 3. classify.js runs (~15-45 ms typical)                           │
│    a. SHA-256 cache lookup (30-min TTL)                           │
│    b. MD enrichment — reads `## Router Context` from project     │
│       CLAUDE.md (if any)                                          │
│    c. Early-exit fast paths (BASH_PASTE, READ_INTENT)             │
│    d. HIGH_RISK / MED_RISK / LOW_RISK / TRIVIAL regex scoring     │
│    e. Main decision branches (high, med, low, triv, ambiguous)   │
│    f. Low-confidence escalation guardrail                         │
│    g. TUNED_DEMOTE_T3 pass (if high === 0)                        │
│    h. TUNED_PROMOTE_T0 pass (if high === 0)                       │
│    i. Anthropic key degradation (T1 → T0 if no key)               │
│    j. 5h OAuth budget cap                                         │
│    k. Emits JSON to stdout                                        │
└──────────────────────────┬────────────────────────────────────────┘
                           │
                           ▼
┌───────────────────────────────────────────────────────────────────┐
│ 4. inject_context.js receives JSON, builds <router-hint>,         │
│    appends to the UserPromptSubmit response                       │
└──────────────────────────┬────────────────────────────────────────┘
                           │
                           ▼
┌───────────────────────────────────────────────────────────────────┐
│ 5. Claude Code starts processing the prompt WITH the hint visible │
│    in the session context, and with ~/.claude/CLAUDE.md loaded    │
│    as the mediator doctrine.                                      │
└──────────────────────────┬────────────────────────────────────────┘
                           │
                           ▼
┌───────────────────────────────────────────────────────────────────┐
│ 6. The session reads the hint and applies the doctrine:           │
│      - T0 + trivial  → answer inline or spawn local-transformer   │
│      - T1            → spawn cheap-triage (Haiku)                 │
│      - T2            → spawn model-reasoner (Sonnet)              │
│      - T3            → spawn model-architect (Opus)               │
│      - pre-merge     → always spawn final-reviewer                │
└──────────────────────────┬────────────────────────────────────────┘
                           │
                           ▼
┌───────────────────────────────────────────────────────────────────┐
│ 7. classify.js also appends a line to decisions.log for telemetry │
└───────────────────────────────────────────────────────────────────┘
```

---

## 3. Module map

```
~/.claude/
├── CLAUDE.md                     ← mediator doctrine (read every session)
├── hooks/
│   └── gsd-statusline.js         ← renders statusline, reads /metrics from tracker
├── tools/router/
│   ├── classify.js               ← the classifier (pure JS, zero deps)
│   ├── inject_context.js         ← the UserPromptSubmit hook
│   ├── savings-tracker.js        ← HTTP server on :7821, reads decisions.log
│   ├── backtest.js               ← daily auto-learning analyser
│   ├── update-router.js          ← idempotent patcher for classify.js
│   ├── backtest.test.js          ← node:test unit + integration suite (11 tests)
│   ├── decisions.log             ← JSONL, one line per classification
│   ├── router-tuning.json        ← backtest output, consumed by update-router
│   ├── backtest-latest.log       ← daily backtest stdout (human-readable)
│   ├── classify.js.bak           ← auto backup before each update-router run
│   ├── classify.js.bak2          ← hand backup from manual wire-up sessions
│   ├── run-backtest.cmd          ← Windows wrapper for scheduled task
│   ├── benchmark.sh              ← labelled-dataset accuracy harness
│   ├── replay.js                 ← replays decisions.log against current classifier
│   ├── stats.js                  ← aggregate stats printer
│   ├── statusline.sh             ← legacy shell statusline
│   ├── anthropic_call.sh         ← direct Haiku/Sonnet API helper
│   ├── ollama_call.sh            ← direct Ollama call helper
│   └── ollama_call_node.js       ← Node version of above
│   ├── frugal-mode.js            ← Beast/Zen/Auto mode CLI (v0.9.3)
│   ├── hub-push.js               ← privacy-preserving delta push to frugal-hub
│   ├── hub-pull.js               ← pull community config from frugal-hub
│   └── hub-status.js             ← hub health check
├── skills/
│   ├── frugal-{status,savings,route,summary,update}/ ← 5 utility skills
│   └── frugal-{beast,zen,auto}/  ← 3 mode skills (v0.9.3)
└── agents/
    ├── model-architect.md        ← T3 Opus subagent
    ├── model-reasoner.md         ← T2 Sonnet subagent
    ├── cheap-triage.md           ← T1 Haiku subagent
    ├── local-summarizer.md       ← T0 Ollama subagent
    ├── local-transformer.md      ← T0 Ollama subagent
    └── final-reviewer.md         ← pre-merge gate (Opus)
```

The repository at `github.com/pauloloureiroshp-ship-it/frugal` mirrors `~/.claude/tools/router/` + the doctrine + the agents + the skills, plus the docs you are currently reading. **The canonical runtime state lives in `~/.claude/`** — the repo is the distribution format.

---

## 4. The classifier — `classify.js`

**Input:** a prompt string (from argv[2] or stdin).

**Output:** JSON with the full decision.

```json
{
  "task_category": "architecture_or_critical",
  "risk_level": "high",
  "tier": "T3",
  "recommended_backend": "claude_subagent",
  "recommended_model": "claude-opus-4-6",
  "suggested_subagent": "model-architect",
  "confidence": 0.9,
  "escalation_rule": "none",
  "reasoning": "high-risk signals: 2, multiFile: false",
  "anthropic_key_present": true,
  "prompt_length": 142,
  "file_hint_count": 3
}
```

**Key constants (declared at the top of the file):**

- `HIGH_RISK` — 16 regex patterns for architecture/prod/secrets/refactor/CI
- `MED_RISK` — 14 patterns for debugging, reasoning, bug investigation
- `LOW_RISK` — 11 patterns for summarization, formatting, simple transforms
- `TRIVIAL` — 5 patterns for triage, classification, extraction
- `FILE_HINT` — glob-like file extension regex
- `BASH_PASTE` — ~30 common CLI tools as fast-path shortcut
- `PS_PASTE` — PowerShell paste marker
- `READ_INTENT` — "lê", "read", "abre" + filename
- `MODELS` — per-tier default model IDs (env-overridable)

**Decision tree (simplified):**

```
if BASH_PASTE or PS_PASTE   → T0 (ollama_terse, local-transformer)
elif READ_INTENT and short   → T0 (ollama_terse, local-summarizer)
elif high > 0 or multi-file  → T3 (architect)
elif med > 0 and no low/triv → T2 (reasoner)
elif low > 0                 → T1 (cheap-triage)
elif triv > 0 or very short  → T0 (summarizer)
else (ambiguous)             → T0 or T2 depending on length × threshold
```

**Post-decision passes (applied in order):**

1. **Low-confidence escalation:** if `confidence < 0.5 AND (med > 0 OR high > 0)`, bump tier up one. Only escalates when there is evidence of risk — prevents the v1 bug where 27 % of prompts auto-escalated to T3 with no rationale.
2. **TUNED_DEMOTE_T3:** if tier is T2/T3 AND `high === 0` AND any regex in `TUNED_DEMOTE_T3` matches, force tier to T1.
3. **TUNED_PROMOTE_T0:** if tier ≠ T0 AND `high === 0` AND any regex in `TUNED_PROMOTE_T0` matches, force tier to T0.
4. **Haiku key degradation:** if tier is T1 AND no `ANTHROPIC_API_KEY`, degrade to T0.
5. **Budget cap:** the OAuth budget guardrail may cap the tier ceiling (T3→T2→T1→T0).

**Why regex?** Because the classifier runs on every prompt and must be zero-cost. A single misrouted prompt costs more than 10 000 regex checks. And because regex is auditable — every pattern is in the source file, every match is explainable.

---

## 5. The hook — `inject_context.js`

Registered as a `UserPromptSubmit` hook in `~/.claude/settings.json`. Each time the user submits a prompt, Claude Code runs this script and awaits its stdout, which is then injected into the session as an additional system message.

**Safety rails:**

- **Hard 500 ms timeout.** If `classify.js` hangs, inject_context.js emits an empty hint rather than blocking the UI.
- **Never throws.** Any exception in the hook returns `''` — the prompt flows through Claude Code normally.
- **Idempotent.** Running twice on the same prompt produces the same hint (SHA-256 cache ensures it).

---

## 6. The doctrine — `~/.claude/CLAUDE.md`

This is the mediator doctrine. It's ~165 lines of Markdown that Claude Code reads at session start as a global instruction. It tells the session:

- The 5-step mental routing sequence (CLASSIFY → RISK → SCOPE → ROUTE → ACT)
- When to honour `<router-hint>` and when to override it
- The tier decision table with canonical examples
- The guardrails (operations that *force* T3 regardless of what the hint says)
- Token-discipline rules (read minimal file chunks, parallelize, no preamble)
- The subagent catalogue and when to spawn each
- The personal slash-command catalogue (e.g. `/update-router`)

It is the contract between the classifier and the session. The classifier suggests. The doctrine decides. The human approves hard actions.

---

## 7. The subagents

Each tier has a native Claude Code subagent markdown file in `~/.claude/agents/`. The session spawns them via the Agent tool when the doctrine says to.

| Subagent | Tier | Model | When |
|---|---|---|---|
| `local-summarizer` | T0 | Ollama | Summarize files, compare snippets, extract fields |
| `local-transformer` | T0 | Ollama | Format transforms, regex, reformatting |
| `cheap-triage` | T1 | Haiku | Commit messages, docstrings, light explanations |
| `model-reasoner` | T2 | Sonnet | Bug hunts, planning, medium reasoning |
| `model-architect` | T3 | Opus | Architecture, multi-file refactors, critical decisions |
| `final-reviewer` | T3 | Opus | Non-skippable pre-merge/pre-push gate |

Subagents are just markdown files. They contain a role description, allowed tools, and sometimes a template. Claude Code handles everything else natively — no plumbing, no external process, no RPC.

---

## 8. Telemetry — `decisions.log` and `savings-tracker.js`

Every classifier invocation appends a JSON line to `decisions.log`:

```json
{"ts":"2026-04-07T10:20:53.944Z","event":"classified","prompt_len":99,"prompt_preview":"consegue verificar se eu de facto tenho o Ollama local?","tier":"T0","task_category":"trivial_local","recommended_backend":"ollama","recommended_model":"qwen2.5:3b","confidence":0.8,"escalation_rule":"none"}
```

**`savings-tracker.js`** is a ~235-line HTTP server bound to `127.0.0.1:7821`. It reads `decisions.log` (cached for 4 s) and exposes:

| Route | Returns |
|---|---|
| `/health` | `{ok:true, port, pid}` |
| `/metrics` | Full JSON with `prompts`, `real_cost`, `naive_cost`, `saved`, `saved_pct`, `by_tier`, `pct_by_tier`, `by_model`, `pct_by_model`, `cost_by_tier`, `avg_saved_per_prompt` |
| `/summary` | Human-readable text |
| `/last` | Most recent `decisions.log` entry |

The tracker is **single-instance** (exits silently on EADDRINUSE), **best-effort** (never crashes the statusline), and **privacy-contained** (bound to `127.0.0.1` only).

---

## 9. Auto-learning loop — backtest, tune, patch

This is the v0.5 addition that turns frugal from "hand-tuned classifier" into "classifier that tunes itself".

### The loop in one diagram

```
┌───────────────────────────────────────────────────────────────────────┐
│ RUNTIME (every prompt)                                                │
│                                                                       │
│    classify.js ──► decisions.log (append-only JSONL)                  │
│        ▲                                                              │
│        │ reads TUNED_{DEMOTE_T3,PROMOTE_T0,COMPLEXITY_THRESHOLD}      │
│        │                                                              │
└────────┼──────────────────────────────────────────────────────────────┘
         │
         │ 02:00 daily (Windows Task Scheduler: FrugalRouterBacktest)
         │         or on demand via /update-router slash command
         │
┌────────┴──────────────────────────────────────────────────────────────┐
│ OFFLINE (once per day)                                                │
│                                                                       │
│    backtest.js                                                        │
│    ─────────                                                          │
│    1. Load decisions.log                                              │
│    2. Per-entry: skip anything with HIGH_RISK markers in the preview  │
│    3. Group by signature (first 3 meaningful words, lowercased)       │
│    4. Find:                                                           │
│       - shortHighTier   (<50 chars on T2/T3)                          │
│       - lowConfHighTier (confidence < 0.6 on T2/T3)                   │
│       - repeated        (same signature ≥3 times, always high tier)   │
│    5. Compute additional savings if candidates were demoted           │
│    6. Emit router-tuning.json + human-readable report                 │
│                                                                       │
│    update-router.js                                                   │
│    ───────────────                                                    │
│    1. Backup classify.js → classify.js.bak                            │
│    2. Read router-tuning.json                                         │
│    3. Build the TUNED block:                                          │
│       // ── TUNED-BLOCK-START (auto-generated) ──                     │
│       // generated_at: <ISO>                                          │
│       // sample_size: <N>                                             │
│       const TUNED_COMPLEXITY_THRESHOLD = 0.25;                        │
│       const TUNED_PROMOTE_T0 = [ /regex1/i, /regex2/i ];              │
│       const TUNED_DEMOTE_T3  = [ /regex3/i, /regex4/i ];              │
│       // ── TUNED-BLOCK-END ──                                        │
│    4. Replace existing block OR insert after 'use strict';            │
│    5. Write back. Idempotent — re-runs produce identical file.        │
└───────────────────────────────────────────────────────────────────────┘
         │
         │ next prompt
         │
         ▼
     classify.js reads the updated TUNED_* constants at runtime
```

### What `analyze()` actually does

```js
function analyze(decisions) {
  for (const d of decisions) {
    // ★ Guardrail 1: upstream HIGH_RISK filter
    if (hasHighRisk(d.prompt_preview)) continue;

    // Bucket entries by signal:
    if (d.prompt_len < 50 && (d.tier === 'T2' || d.tier === 'T3'))
      shortHighTier.push(d);
    if (d.confidence < 0.6 && (d.tier === 'T2' || d.tier === 'T3'))
      lowConfHighTier.push(d);
    sigToTiers.set(signature(d.prompt_preview), ...);
  }

  // Derive candidates:
  const topDemote    = top-3 signatures in shortHighTier;
  const promoteToT0  = low-conf + <30-char signatures;
  const repeated     = signatures seen ≥3 times, all on T2/T3;

  return { total, byTier, topDemote, promoteToT0, repeated, ... };
}
```

### What `buildTuning()` emits

```js
function buildTuning(stats) {
  const noiseRatio = stats.shortHighTier / stats.total;
  const complexity_threshold =
    noiseRatio > 0.1  ? 0.25 :
    noiseRatio > 0.05 ? 0.30 :
                        0.35;
  return {
    generated_at: new Date().toISOString(),
    sample_size: stats.total,
    complexity_threshold,
    promote_to_t0_patterns: [...stats.promoteToT0],
    demote_from_t3_patterns: stats.topDemote.map(d => d.pattern),
    notes: [ ... ]
  };
}
```

### The `update-router.js` idempotency invariant

Running `update-router.js` twice in a row must produce a byte-identical `classify.js`. This is enforced by a test in `backtest.test.js`:

```js
test('update-router: TUNED block is idempotent across runs', () => {
  const run1 = spawnSync(node, [UPDATE]);
  const after1 = fs.readFileSync(CLASSIFY);
  const run2 = spawnSync(node, [UPDATE]);
  const after2 = fs.readFileSync(CLASSIFY);
  assert.equal(after1, after2);
  const matches = after2.match(/TUNED-BLOCK-START/g);
  assert.equal(matches.length, 1);
});
```

### How `classify.js` applies TUNED at runtime

```js
// Demote pass
if (
  TUNED_DEMOTE_T3.length > 0 &&
  (tier === 'T2' || tier === 'T3') &&
  high === 0 && // ← doctrine guardrail (runtime-side)
  TUNED_DEMOTE_T3.some(rx => rx.test(p))
) {
  tier = 'T1';
  escalation_rule = 'tuned_demote_from_backtest';
}

// Promote pass (mirror)
if (
  TUNED_PROMOTE_T0.length > 0 &&
  tier !== 'T0' &&
  high === 0 && // ← doctrine guardrail (runtime-side)
  TUNED_PROMOTE_T0.some(rx => rx.test(p))
) {
  tier = 'T0';
  category = 'tuned_promote_local';
  escalation_rule = 'tuned_promote_from_backtest';
}
```

---

## 10. Doctrine guardrails — dual-enforce at runtime AND upstream

This section exists because of a real production bug we hit on 2026-04-07. It's the single most important rule in the codebase.

### The bug

The first wiring of the auto-learning loop added `high === 0` as a runtime guardrail in `classify.js` so that the TUNED_DEMOTE_T3 pass would never demote prompts containing high-risk markers (`push`, `deploy`, `.env`, `architect`, `review final`...). We smoke-tested it:

```bash
$ classify.js "review final antes de fazer push"
  "tier": "T3"                        # ✓ guardrail blocks demote
```

Looked fine. But the backtest had **already learned** `review final antes` as a demote candidate and written it into `router-tuning.json`. So the next day, `update-router.js` re-injected that pattern into the TUNED block — and would have done so **every single day**, forever, even though the runtime was blocking it. The tuning file would have been permanently poisoned.

### The fix

Guardrails that matter must be **dual-enforced**:

1. **Runtime guardrail** in `classify.js` — blocks the decision.
2. **Upstream guardrail** in `backtest.js` — filters the corpus before candidates are ever derived.

```js
// backtest.js
for (const d of decisions) {
  if (hasHighRisk(d.prompt_preview)) continue; // ← upstream filter
  // ... bucketing
}
```

`HIGH_RISK_MARKERS` in `backtest.js` mirrors `HIGH_RISK` in `classify.js`. They are kept in sync manually — which is a known gap (see `ROADMAP.md` v0.7). When you add a new HIGH_RISK regex to one file, add it to the other.

### The rule

> When runtime code blocks an auto-learning pipeline from taking an action, the pipeline that generates the rules must also be taught not to propose that action. Otherwise the rule file stays dirty and debugging becomes a loop.

This rule is persisted in Paulo's memory system (`feedback_dual_enforce_guardrails.md`).

---

## 11. Statusline integration — `gsd-statusline.js`

The statusline lives in `~/.claude/hooks/gsd-statusline.js` and is registered in `~/.claude/settings.json`. It is called by Claude Code after every response with a JSON payload describing the session state.

```
┌─────────────────────────────────────────────────────────────────────┐
│  ⬆ /gsd-update │ Opus 4.6 │ cloude-home █░░░░░ 14% │ 💰 $1.73 (77%)│
│                                                                     │
│  │ Ollama:62% Sonnet:18% Opus:20%                                  │
└─────────────────────────────────────────────────────────────────────┘
```

**Segments (left to right):**

1. **GSD update hint** — shown only if the GSD toolkit has a new version available.
2. **Model name** — current Claude Code model.
3. **Current task** — pulled from the todo list if one is active.
4. **Directory** — `basename(pwd)`.
5. **Context bar** — 10-segment progress bar scaled to the usable window (accounts for the 16.5% auto-compact buffer).
6. **💰 savings** — `saved` dollars + `saved_pct` from the tracker `/metrics` endpoint (500 ms hard timeout, fails silently).
7. **Model breakdown** — `pct_by_model` from the tracker, fallback to `pct_by_tier` with heuristic mapping.

The statusline **never blocks Claude Code** — every fetch has a 400 ms timeout and any error returns an empty segment.

---

## 12. Failure modes and what happens

| Failure | What happens | Why it's safe |
|---|---|---|
| `classify.js` throws | `inject_context.js` returns `{recommended_backend: 'claude_session'}` | Claude Code falls back to default behaviour |
| `classify.js` exceeds 500 ms | Hook aborts, emits empty hint | Session proceeds with no hint — identical to frugal being uninstalled |
| `decisions.log` unreadable | Tracker returns empty metrics | Statusline skips the savings segment |
| Tracker is down | Statusline omits savings + breakdown | No impact on routing |
| `router-tuning.json` corrupt | `update-router.js` exits non-zero, classify.js keeps previous TUNED block | Human sees error next time they run `/update-router` |
| TUNED block has bad regex | `classify.js` throws on `require()` | Backup `classify.js.bak` is one `cp` away |
| Ollama is offline | T0 subagent fails; Claude Code answers inline | No cost escalation — still T0 |
| No Anthropic API key | T1 degrades to T0 automatically | Documented in classifier output |
| Budget > 95 % | Hard cap at T0 for all paid tiers | Prevents overspend at the cost of quality |

The system is **designed to fail gracefully.** Every failure mode falls back to either default Claude Code behaviour or the cheapest tier, never up.

---

## 13. Performance budget

| Operation | Budget | Typical | Worst case |
|---|---|---|---|
| `classify.js` (cold) | <50 ms | 20–45 ms | 90 ms on first run (require cache) |
| `classify.js` (cached) | <5 ms | 2 ms | 10 ms |
| `inject_context.js` overhead | <5 ms | 2 ms | 20 ms |
| Savings tracker `/metrics` | <50 ms | 15 ms | 400 ms (hard timeout) |
| Statusline total | <100 ms | 35 ms | 500 ms (Claude Code hard timeout) |
| `backtest.js` (60 prompts) | <200 ms | 80 ms | 400 ms |
| `update-router.js` | <100 ms | 30 ms | 150 ms |
| Full test suite (`backtest.test.js`) | <500 ms | 143 ms | 800 ms |

---

## 14. Security and privacy

- **decisions.log** contains the first ~80 characters of every prompt as `prompt_preview`. It is stored locally in `~/.claude/tools/router/` and never sent anywhere. Delete it any time — nothing depends on its history beyond the last 24 h.
- **savings-tracker.js** binds to `127.0.0.1:7821` only. Not accessible from LAN.
- **No API keys are stored in the repo.** All secrets live in `~/.claude/.env` (gitignored) or in environment variables.
- **`.gitignore`** excludes `decisions.log`, `router-tuning.json`, `*.bak`, `backtest-latest.log`, and `.env*`.
- For vulnerability disclosure, see [SECURITY.md](SECURITY.md).

---

## 15. Design decisions and trade-offs

### Why not a proxy?

A proxy adds latency, a failure mode, and deployment friction. More importantly, a proxy lies to Claude Code about what it's talking to — it breaks the invariant that Claude Code sees the real session. frugal keeps Claude Code in charge and just whispers suggestions.

### Why regex instead of a small LLM?

A small LLM (Phi-3, DistilBERT, ...) would be more accurate on ambiguous prompts — but it costs 50–200 ms per classification, and you have to ship the model, and it can hallucinate. Regex is explainable, cheap, testable, and has zero cold-start. When a regex misfires, you fix it by adding a pattern and writing a test. When a small LLM misfires, you don't know why.

### Why doctrine in Markdown, not JSON config?

JSON config rots. You can't explain *why* a rule exists in a JSON file. Markdown doctrine is versionable in Git, explainable (every rule has a paragraph of context), and — critically — **the LLM itself reads it natively**. No parser needed.

### Why TUNED block injected into classify.js instead of loaded at runtime?

Loading a separate file at runtime would introduce filesystem I/O on every classification and a race condition between `update-router.js` writing the file and `classify.js` reading it. Injecting the block makes it part of `require()`'s cache and eliminates the race entirely. The cost is that `update-router.js` has to be idempotent and safe — which it is, and which is tested.

### Why `high === 0` instead of a list of allowed categories for demotion?

Inverse logic is less error-prone here. "Any HIGH_RISK signal forbids demotion" is one condition to check. "This specific list of categories is demotable" is five conditions, each with an edge case. We took the single-condition route.

### Why Windows Task Scheduler instead of a node-cron in-process daemon?

Daemons have lifecycle problems (crash, restart, drift). Task Scheduler is the OS-level primitive that Windows uses for everything else that runs daily. It's simpler and more reliable. On macOS/Linux the equivalent is `launchd` / `systemd timers` / `crontab`.

### Why keep two backups (`classify.js.bak` and `classify.js.bak2`)?

`classify.js.bak` is auto-written by `update-router.js` every time it runs. `classify.js.bak2` is hand-written before manual wire-up edits. They serve different audiences: the `.bak` is for "undo the last auto-run", `.bak2` is for "undo the last human edit". Both are gitignored.

---

*For the birds-eye overview and audience-facing pitch, see [README.md](README.md). For version history, see [CHANGELOG.md](CHANGELOG.md). For what's planned, see [ROADMAP.md](ROADMAP.md).*
