# Auto-Research Loop — Mooter's Self-Improving Routing

> **Status legend**: every stage below is explicitly marked **SHIPPED** or **PLANNED**.
> This doc never implies an automated stage is live when it isn't. As of Wave Mega 50-51
> (2026-06), stages 1–3 are shipped, stage 4 ships in Phase 5 of this wave, stages 5–6
> are design-stage.
>
> Companion docs: [`WORKSPACE_ORGANIZATION.md`](./WORKSPACE_ORGANIZATION.md) (where
> everything lives) · [`../strategy/STRATEGY.md`](../strategy/STRATEGY.md) (why) ·
> [`../strategy/LORA_TRAINING_RUNBOOK.md`](../strategy/LORA_TRAINING_RUNBOOK.md) (how to train).

---

## 1. The loop at a glance

The idea (Karpathy-style: log everything, score outcomes, retrain on your own exhaust):
routing decisions become labeled training data, and the learned layer (Pastor) gets
better at *this user's* workload over time — without ever touching the deterministic
safety core.

```
(1) decide ──► (2) score ──► (3) featurize ──► (4) observe frontier ──► (5) retrain ──► (6) A/B
 SHIPPED        SHIPPED        SHIPPED           PHASE 5 (this wave)     PLANNED        PLANNED
     ▲                                                                                     │
     └───────────────────────── advisory bias only — classify.js floors always win ◄───────┘
```

## 2. The six stages

### Stage 1 — Decisions logged with deterministic span_ids · **SHIPPED** (Wave 50-51)
Every routing decision in `decisions.log` carries a deterministic `span_id`
(`packages/cli/src/observability/span-id.ts`). Same decision → same id, so feedback
given hours later still joins cleanly to the original decision.

### Stage 2 — Human/agent scoring · **SHIPPED** (Wave 50-51)
```
mooter feedback span <span_id> <score>
```
(`packages/cli/src/commands/span-feedback.ts`) appends to
`~/.mooter/span-feedback.jsonl`. Scores can come from Paulo or from an agent that
observed the outcome (e.g. "the T1 answer was wrong, had to escalate").

### Stage 3 — Features-only training file · **SHIPPED** (Wave 50-51)
```
mooter pastor learn-from-spans
```
joins feedback to decisions and writes `~/.mooter/pastor/span-training.jsonl` with
**features only**: `task_category, tier, model, confidence, prompt_len, score`.
Never the prompt text. (See §3 Privacy invariants.)

### Stage 4 — Fable 5 frontier observations · **PHASE 5 of this wave** (fable-observe)
A logger captures frontier-orchestrator decisions (what the top-tier model chose to
delegate, to whom, and how it went) to `~/.mooter/fable-observations/`, in the same
features-only shape, feeding the same training pipeline. Until Phase 5 lands on this
branch, treat this stage as in-flight, not live.

### Stage 5 — Nightly Pastor LoRA retrain · **PLANNED**
The goal: accumulate features in stages 3+4, retrain the LORAUTER per-task adapters
(Wave 31) on a schedule. **Today, training is manual** — Paulo runs it on his RTX 4090
following [`../strategy/LORA_TRAINING_RUNBOOK.md`](../strategy/LORA_TRAINING_RUNBOOK.md).
There is no cron, no daemon, no automatic retrain. Anything that says "nightly" is the
target state, not the current one.

### Stage 6 — A/B routing strategies · **PLANNED** (design only)
Design sketch — none of this is implemented:
- Reuse the existing `shadow_pair` events already present in `decisions.log`: for a
  sampled subset of prompts, log what the *candidate* strategy (learned bias) would
  have chosen alongside what the *incumbent* (current advisory stack) actually chose.
- Compare offline on scored spans (stage 2/3 data): cost delta, score delta, escalation
  rate. No live traffic split is needed — shadow pairs make the comparison free and safe.
- Outcome is **advisory only**: a winning strategy updates within-tier biases
  (Pastor/bandit weights), never tiers.
- **`classify.js` sha never changes** as part of this loop. Ever. The A/B layer sits
  entirely above the frozen classifier.

## 3. Privacy invariants (non-negotiable)

1. **Features only.** No training artifact — `span-training.jsonl`, fable-observations,
   distilled `.skill.md` exports — ever contains prompt text or model responses. Only:
   task_category, tier, model, confidence, prompt_len, score (and similar scalars).
2. **Local-first.** All loop data lives under `~/.mooter/`. Training data never leaves
   the machine unless the user explicitly opts into telemetry (HMAC, features-only,
   Wave 3 D2) — and even then, never prompts.
3. **Erasable.** `mooter data export / delete-all / forget-me` (Wave 32,
   `@mooter/data-rights`) cover the loop's artifacts like everything else.

## 4. Guardrails (why the loop can't make routing worse)

| Guardrail | Rule |
|---|---|
| Tier floors | `classify.js` (sha-frozen) sets the tier. Everything learned — Pastor, bandit, arbitrage, effort modes — is an **advisory within-tier bias**. A learned preference can pick *which* T2 model, never demote T3→T1. |
| safety_boost precedence | The Wave 3 D1 safety layer sits above budget/learned preferences: safety floor beats budget cap beats learned bias. |
| Opt-in everywhere | LoRA adapters / LORAUTER routing are opt-in. Default install runs the deterministic stack only; the loop observes but does not steer until enabled. |
| Frozen core | The loop's outputs feed Pastor — never `classify.js`. CI enforces the sha (`tools/router/classify.js.sha256`). |

## 5. Operating it today (honest summary)

What you can actually do right now: route normally → spans get ids (1) → score the ones
you care about with `mooter feedback span` (2) → run `mooter pastor learn-from-spans` (3)
→ when enough data has accumulated, train manually per the LoRA runbook → enable the
adapters opt-in. Stages 4–6 close the loop further; they are tracked in this wave's
`.planning/` and in `SYNC.md`.

---

*Wave Mega 50-51, Phase 3.G · Cross-links: [`WORKSPACE_ORGANIZATION.md`](./WORKSPACE_ORGANIZATION.md) · [`../strategy/STRATEGY.md`](../strategy/STRATEGY.md)*
