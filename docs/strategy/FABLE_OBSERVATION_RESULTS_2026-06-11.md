# Fable 5 Observation Loop — First Results (2026-06-11)

> Wave Mega 50-51, Phase 5. Status: **first seeding wave**. Everything below is
> either (a) mechanically verifiable from local files, or (b) explicitly marked
> as a placeholder to be filled from real observation counts. No quality-parity
> claims are made anywhere in this document — see [GAPS](#gaps--what-local-models-cannot-replicate).

## What this is

A **teacher–student observation loop**: when Claude Fable 5 (Anthropic's frontier
model, opt-in only in Mooter — it is never auto-routed) acts as an orchestrator,
every orchestration decision it makes is recorded as a feature-level observation:

- did it run the task **inline**, **spawn a subagent**, fan out a **workflow**, or **parallel-spawn**?
- which subagent type / model did it choose, and at what parallelism?
- what would the **sha-frozen local router** (`classify.js`, sha `427d8c0b…`) have
  done for the same task? (the `router_baseline`)
- where the two disagree, that disagreement (`pattern_gap`) is the learnable signal.

The student is the local stack: `mooter pastor train-on-fable` converts
observations into features-only training rows
(`~/.mooter/pastor/fable-training.jsonl`), and `mooter fable-observe
replicate-test <task_hash>` checks — per decision — whether a local model
(qwen2.5-coder:32b via Ollama) would have made the same orchestration choice.

## Methodology

1. **Schema v1** (fixed): `{schema, ts, ts_ms, session_id, orchestrator_model,
   task_hash (16-hex sha256), task_type, prompt_len, fable_decision {action,
   subagent_type, model_chosen, parallel_count, rationale}, router_baseline
   {tier, model, confidence, task_category} | null, pattern_gap, outcome
   {completed, tests_pass}, pastor_training_value}`. One JSON file per
   observation at `~/.mooter/fable-observations/<ts_ms>_<task_hash>.json`.
2. **Privacy: features-only by default.** Prompt text is sha256-hashed to the
   16-hex `task_hash` and **dropped**. Storing raw prompts requires the explicit
   `store_prompts` opt-in (`mooter fable-observe enable --store-prompts`, which
   prints a privacy warning). Training rows exported by `train-on-fable` never
   include `prompt_text` **or** `fable_decision.rationale` (free-text that may
   quote the prompt).
3. **Baseline is frozen.** `classify.js` is invoked read-only; its sha is
   CI-enforced. The loop observes the gap; it never mutates the router.
4. **Training is manual.** `train-on-fable` produces training INPUT only. Actual
   LoRA retraining happens manually on the RTX 4090 per
   `LORA_TRAINING_RUNBOOK.md`. **No automated training pipeline exists**, and we
   do not claim one does.
5. **Outcomes are factual booleans** (`completed`, `tests_pass`) — never
   self-assessed quality scores.

## Honest current state (seeding wave)

The first observations were seeded from **this very wave**: the orchestrator
that ran Wave Mega 50-51 *is* `claude-fable-5`, and its real delegation pattern
is the first data in the store:

- **phase-parallel subagent fan-out** — phases decomposed into independent
  build tracks, executed by concurrent agents (e.g. core observation module and
  training/validation half built simultaneously on the same branch);
- **2–3 agents per phase**, spawned in a single message when independent;
- **T0/T1-style doc and report tasks delegated to general agents** rather than
  burned inline in the frontier model's context.

That pattern — *frontier model as dispatcher, cheap executors as workers* — is
exactly what the local router cannot currently express (it picks a tier per
prompt; it does not plan a fan-out), and is why these observations have
training value.

## Top patterns

Seeded 2026-06-10 from the Wave Mega 50-51 session itself (the orchestrator
running that wave was `claude-fable-5`; every row below is a real logged
delegation decision, baseline computed by the frozen classify.js at log time).

| task_type | fable action (most common) | count | router baseline said | gap? |
|---|---|---|---|---|
| coding | parallel_spawn → general-purpose | 6 | T0 local ×4, T2 sonnet ×2 | 1/6 |
| docs | parallel_spawn → general-purpose | 3 | T1 haiku, T2 sonnet, T3 opus | 1/3 |
| reasoning (Day 0 recon) | **inline** in orchestrator | 1 | T3 opus | yes |
| architecture / review | parallel_spawn → general-purpose | 2 | T3 opus ×2 | 2/2 |

- Total observations: **12**
- With router baseline attached: **12/12**
- With pattern gap (Fable ≠ baseline): **5/12 (42%)**
- High training value share: **9/12 (75%)**

The dominant learnable pattern: Fable almost never executes inline — it
**plans a fan-out** (11/12 parallel_spawn, 2-3 agents per phase) and reserves
inline work for judgment that refutes or corrects the task itself (Day 0
recon). The per-prompt tier picker cannot express "spawn 3 workers in
parallel"; that dispatcher behavior is the training target, not the tier
choice.

## GAPS — what local models cannot replicate

Being honest about the ceiling matters more than the pitch:

- **Long-horizon multi-phase planning.** Fable 5 plans a wave as a dependency
  graph (recon → refute premises → parallel build → gate → ship) across hours.
  Local 30B-class models have shown no comparable capability in our usage, and
  we have no benchmark that says otherwise.
- **Context-window-scale orchestration.** Holding an entire wave's state
  (frozen-file doctrine, concurrent agents' partial outputs, test counts)
  in-context while dispatching is beyond what we can run locally today.
- **Self-refuting recon judgment.** The recurring Day-0 pattern of *disproving
  the brief's own premises before building* is a judgment behavior we have
  never observed from the local tier and do not claim to reproduce.

What local models demonstrably **can** do:

- **Tier choice on well-patterned tasks.** The local MLWR path routes
  well-patterned prompts correctly much of the time — the honest reference
  number is the real MooterBench run: **30/50 = 60.0% routing accuracy**
  against gold tier labels (`packages/mooter-bench/README.md`). Good enough to
  be useful, far from orchestration.
- **Cheap parallel execution.** Once a plan exists, local workers execute
  fan-out steps at $0 (`mooter workflow`, Wave 28+ engine).

**Zero claims are made about quality parity** between local models and Fable 5
— on orchestration or anything else — until `replicate-test` data accumulates.
Even then, `replicate-test` compares the *routing choice*, not output quality;
agreement on "spawn a subagent with a local model" says nothing about whether
the resulting work product would match. Full replication is additionally
impossible for the (default) features-only observations, because the prompt
text is not stored.

## Reproduce locally

```bash
mooter fable-observe enable            # opt-in, hash-only by default
mooter fable-observe stats             # what has been observed
mooter pastor train-on-fable --dry-run # features-only conversion preview
mooter fable-observe replicate-test <task_hash> [--with-ollama]
```

Nightly conversion (dry-run prints the line; nothing installed without `--yes`):

```bash
mooter pastor train-on-fable --install-cron
# 0 2 * * * mooter pastor train-on-fable --observations-since 24h
```
