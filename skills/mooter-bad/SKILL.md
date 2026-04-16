---
name: mooter-bad
description: >
  Rates the LAST routing decision as bad. Captures explicit negative feedback
  for the reward signal that drives self-improvement. Use when the user types
  "/mooter-bad", "/frugal-bad", "/bad", "rating bad", "foi mau", "devia ter sido T3",
  "devia ter sido mais barato", "tier errado", "rota errada", "overkill",
  "underkill", "👎", or signals the router picked the wrong tier/model for the
  last prompt. Writes a quality_feedback event to decisions.log with
  followup_quality=0 against the last classified decision.
---

# /mooter-bad — Explicit Negative Feedback

Marks the last routing decision as **bad**. This is the primary negative reward
signal and the single most valuable input for improving the classifier — every
bad rating is a concrete example of a misroute that backtest.js can use to
adjust patterns in the next tuning cycle.

---

## Execution

```bash
node ~/.claude/tools/router/feedback-collector.js --rate bad
```

If no classified decision exists yet, the tool prints an error and exits 1 —
tell the user: "Ainda não há decisão de routing para avaliar."

---

## Output format

The script prints two lines:

```
✓ Rated last decision as bad (T2 · bug_investigation · session abc123)
  → This feedback will help improve future routing decisions.
```

Surface them verbatim, preceded by `⚡ mooter —` for brand consistency.
**Do not** try to diagnose *why* the routing was wrong — that's what the
backtest cycle is for. Keep the response to three lines max.

---

## Optional — user adds a reason

If the user naturally includes a reason in the same prompt ("/mooter-bad
devia ter sido T3, não T2"), pass it through stderr for future review:

```bash
echo "reason: devia ter sido T3, não T2" >> ~/.claude/tools/router/feedback-notes.log
```

Do not invent reasons if the user did not provide one.

---

## Notes

- Ratings feed `quality_feedback` events into decisions.log with
  `followup_quality: 0`.
- `backtest.js` aggregates these by tier × task_category and surfaces
  systematic misroutes in `router-tuning.json`.
- Bad ratings on T3 (Opus) are especially valuable — they identify over-routing
  and directly unlock savings.
