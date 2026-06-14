# Confidence Cascade (Wave 62.5)

**Local-first execution mode.** The local moo already drafts answers for confident T0 prompts
(Option A). Before this wave, Option A injected **any** draft >5 chars as a `<suggested_answer>` for
the agent to output verbatim — with **no check on the draft's quality**. The confidence cascade adds a
deterministic quality gate on that draft:

- **Confident draft → keep it** (stay local; same `option_a_hit` saving as before).
- **Shaky draft → withhold it** and emit a `<confidence-cascade>` note so the agent reasons it out or
  escalates effort, instead of echoing a low-confidence regurgitation.

It is an **execution signal, not a re-route.** `classify.js` is untouched and the tier never changes —
this only decides whether to *trust* a local draft that was already produced. **NO-PROXY:** the
confidence comes from the local draft's own text; nothing is sent to a cloud model.

## How confidence is scored

`tools/router/confidence-probe.js → draftConfidence(text, opts) → { score∈[0,1], band, reasons }`.
Pure, deterministic, zero extra LLM call (the hook rule forbids awaiting the network). Signals:

| Signal | Effect |
|---|---|
| empty / < 5 chars | score 0 → low |
| refusal / non-answer ("I don't know", "não sei", "as an AI") | −0.6 → low |
| hedging ("maybe", "probably", "talvez") | −0.1 each (cap −0.3) |
| repeated lines / single-token domination | −0.5 / −0.4 |
| long draft ending mid-sentence (truncation) | −0.2 |
| unbalanced code fence / brackets (code tasks) | −0.25 / −0.2 |

Bands: `score ≥ 0.7` → **high**, `≥ threshold` → **medium**, else **low** (escalate). Only **low**
withholds the draft — medium and high are kept (conservative; avoids over-escalation).

> Mean-logprob / self-consistency scoring is a **future enhancement**. Ollama returns only text here,
> and re-sampling inside the hook would blow the latency budget (W62.5-R1).

## Turning it on (opt-in — default OFF, hint byte-identical)

- Env: `MOOTER_CONFIDENCE_CASCADE=1` (or `=0` to force off).
- Prefs (`~/.mooter/preferences.json`): `{ "confidence_cascade": true }`.

Optional calibrated threshold (auto-learning, Block D): `MOOTER_CONFIDENCE_THRESHOLD=0.5` or
`{ "confidence_cascade_threshold": 0.5 }`. Computed out-of-band by `calibrateLowThreshold(scores)`
(percentile over logged cascade scores, clamped to [0.3, 0.6]); the hook only reads the number.

## What it measures (advisory only — never inflates `$`)

`savings-tracker.js` counts `cascade_local_kept` (drafts trusted) and `cascade_escalated` (drafts
withheld) → `cascade_decisions`, `cascade_escalation_rate`. These are **advisory**: a withheld bad
draft *prevents a false saving* (a wrong verbatim answer that would cost a correction turn) — it does
not manufacture a real one. Nothing here is ever added to `guaranteed_saved` (W62.5-R2).

## Safety

HIGH_RISK prompts are floored to T3 by `classify.js`; Option A requires `tier === 'T0'`. So the cascade
**structurally cannot fire on HIGH_RISK**. The wiring is best-effort (try/catch): any probe error keeps
the draft, exactly as before.
