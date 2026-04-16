---
name: mooter-feedback
description: >
  Shows the explicit feedback summary — how many routing decisions the user
  rated good vs bad, broken down by tier and task category. Use when the user
  types "/mooter-feedback", "/frugal-feedback", "quantas ratings dei",
  "feedback stats", "mostra o feedback", "rating summary", or wants to see the
  aggregate of their positive/negative ratings on past routing decisions.
---

# /mooter-feedback — Feedback Stats

Shows the aggregate of `/mooter-good` and `/mooter-bad` ratings collected so
far. This is the reward signal dashboard — a snapshot of how the user judges
the router's tier choices over time.

---

## Execution

```bash
node ~/.claude/tools/router/feedback-collector.js --stats
```

---

## Output format

The script prints a table like:

```
Quality feedback summary:
  T0 trivial-edit:       12 good / 1 bad  (92%)
  T2 bug_investigation:  8 good / 3 bad   (73%)
  T3 architecture:       5 good / 0 bad   (100%)

  Total: 29 rated decisions · Overall: 86% good
```

Surface verbatim, preceded by `⚡ mooter — feedback summary`.

If output is "No quality feedback collected yet.", reply in PT-PT:
"Ainda não há ratings. Usa `/mooter-good` ou `/mooter-bad` depois de um prompt
para começar a construir o sinal."

---

## Notes

- Tiers with < 3 ratings are still shown but the percentage is noisy —
  the user should keep rating to build signal.
- Tier × category combos with < 70% good rate are candidates for pattern
  review in the next backtest cycle.
- This data will also feed the Thompson Sampling bandit in Sprint B.
