# Reasoning-Effort Axis (Wave 60.5)

> **TL;DR** — Mooter now emits a second routing output alongside the tier: a semantic
> **reasoning-effort** level (`none | low | medium | high`) for every prompt. It is derived
> deterministically from signals `classify.js` already computed — **zero extra LLM cost** — and
> appears in the `<router-hint>` so the agent can dial extended-thinking up or down per task.

## Why a second axis

Tier (which model) is only one cost lever. On a modern reasoning model the **thinking/reasoning
tokens dominate the bill and vary 5–25× *within the same tier*** depending on how hard the task
actually is. Spending `high` effort on "rename this variable" wastes thinking tokens; spending
`low` effort on an architecture decision is reckless. The reasoning-effort axis lets Mooter signal
*how much to think*, not just *which model to use* — the literature (Route-to-Reason, Ares,
SynapseRoute) measures 30–55% savings from getting this knob right.

## Semantic levels (not token counts)

The four levels are **stable semantic labels**, not raw token budgets:

| Level | Meaning | Maps onto |
|---|---|---|
| `none` | Mechanical task, no reasoning to spend | thinking off |
| `low` | Trivial / simple / ambiguous local work | minimal thinking |
| `medium` | Intermediate reasoning (root-cause, planning) | moderate thinking |
| `high` | Architecture / critical / high-risk | maximum thinking |

They map onto the effort knob every major provider exposes (Anthropic extended-thinking budget,
OpenAI `reasoning_effort`, Gemini thinking) and stay stable as those token scales change.

> **We never squeeze `max_tokens`.** Capping output truncates a reasoning model mid-thought and
> still bills the thinking already spent. The *only* knob is the effort level.

## Category → effort map

Effort derives from the real `decision` fields `classify.js` emits (`tier`, `risk_level`,
`task_category`, the safety floor) — **not** the 24-category matrix taxonomy in
`packages/router/src/task-categories.ts`, which never reaches the host-side decision.

| `task_category` (classify.js) | Tier | Effort | Why |
|---|---|---|---|
| `cross_file_change`, `architecture_or_critical` | T3 | **high** | high blast radius |
| any `risk_level: high` (deploy/secrets/migrations) | T3 | **high** | doctrine hard floor |
| safety-floor / beast mode | →T3 | **high** | critical-phrase / max-power |
| `reasoning_intermediate` | T2 | **medium** | root-cause, comparison, planning |
| `simple_transform_or_explain`, `cheap_task` | T1 | **low** | quick explain / transform |
| `ambiguous_medium`, `ambiguous_long` | T1 | **low** | unclear but not heavy |
| `trivial_local`, `mechanical_trivial`, `ambiguous_short` | T0 | **low** | local trivial |
| `bash_command_paste`, `file_read_intent` | T0 | **none** | pure mechanical, nothing to reason about |
| unknown / unexpected shape | — | **medium** | safe middle (never `none` under uncertainty) |

### Doctrine floor (never cut)

High-risk, architecture, cross-file, the critical-phrase safety floor, and beast mode **always**
resolve to `high` — effort is never cut on a high-blast-radius task, even under a budget cap or zen
mode. This mirrors the tier hard-floor.

### T5 (Fable) tracks the task, not the pin

T5 is **not** special-cased. T3 is complexity-driven (the classifier only assigns T3 on high
signals), but T5 is *pin-driven* (`@fable`, decoupled from complexity). So `@fable explain closures`
gets `low`, while `@fable redesign the architecture` gets `high` — effort follows the task's
risk/category, not the chosen model.

## Where you see it

- **Router hint** — every confident prompt's `<router-hint>` is followed by
  `<reasoning-effort>LEVEL</reasoning-effort>`. Best-effort: if the module is unavailable the tag is
  omitted and the hint is byte-identical to before.
- **Statusline chip (opt-in)** — `🧠 eff:high`. Off by default. Enable with either:
  - `~/.mooter/preferences.json` → `{ "statusline_chips": { "reasoning_effort": true } }`, or
  - `MOOTER_STATUSLINE_REASONING_EFFORT=1` in the environment.
  - It also needs line 3 visible (`statusline_line3: true`). The chip reads the last level Mooter
    recorded in `~/.mooter/reasoning-effort.json`; it is silent when stale (>6h) or absent — never a
    guessed level.

## Guarantees

- **Zero LLM in the decision** — `reasoningEffort(decision)` is pure set/string lookups over the
  already-computed decision. No model call, no re-classification.
- **`classify.js` untouched** — frozen, sha256 `427d8c0b…364bc48f`. This axis is host-side only
  (`tools/router/reasoning-effort.js` + a best-effort hook annotation).
- **No proxy** — Mooter never sits on the request path; it annotates the hint and persists one small
  local file. It never reads engine KV-cache or intercepts a request.

## Deferred

`mooter explain reasoning` as a wired CLI sub-command is **not** in this wave: `mooter explain` lives
in `packages/cli/src/commands/explain.ts`, a frozen engine file (no allowlist for Wave 60.5). This
document is the explanation home until a future wave allowlists that file. (See `REFUTATIONS_LOG.md`
R5.)
