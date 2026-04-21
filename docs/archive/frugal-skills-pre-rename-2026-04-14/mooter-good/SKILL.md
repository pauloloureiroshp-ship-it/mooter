---
name: mooter-good
description: >
  Rates the LAST routing decision as good. Captures explicit positive feedback
  for the reward signal that drives self-improvement. Use when the user types
  "/mooter-good", "/frugal-good", "/good", "rating good", "foi bom", "correu bem",
  "essa rota foi certa", "tier certo", "👍", or signals the router picked the
  right tier/model for the last prompt. Writes a quality_feedback event to
  decisions.log with followup_quality=1 against the last classified decision.
---

# /mooter-good — Explicit Positive Feedback

Marks the last routing decision as **good**. This is the primary positive reward
signal for the feedback loop. Without explicit ratings the system relies on
frail proxies (followup_within_30s, prompt_len). With them, it can actually
learn quality, not just noise.

---

## Execution

```bash
node ~/.claude/tools/router/feedback-collector.js --rate good
```

If no classified decision exists yet in `decisions.log`, the tool prints an
error and exits with code 1 — in that case tell the user: "Ainda não há
decisão de routing para avaliar. Faz um prompt primeiro."

---

## Output format

The script prints one line like:

```
✓ Rated last decision as good (T2 · bug_investigation · session abc123)
```

Surface that line verbatim to the user, preceded by `⚡ mooter —` for brand consistency.

Do **not** add commentary or suggestions. This is a logging action, not a
conversation. The entire response should be two lines max.

---

## Notes

- Each rating appends a `quality_feedback` event to `~/.claude/tools/router/decisions.log`.
- The event carries `followup_quality: 1` which is later consumed by `backtest.js`
  and the future Thompson Sampling bandit (Sprint B).
- Ratings are attached to the most recent `classified` event in the log.
- If the user wants to rate a specific past decision by id, run:
  `node ~/.claude/tools/router/feedback-collector.js --rate good --decision-id <session_id>`
