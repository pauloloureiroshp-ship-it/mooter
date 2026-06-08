---
name: moo-distill
description: Distil the Mooter Pastor's learned routing into an installable .skill.md. Use when the user types /moo-distill or wants to export/share what their router learned. Features only — no prompts or responses.
---

# /moo-distill

Export this machine's learned routing patterns as a portable, installable skill.

## Do this

```bash
mooter pastor distill                  # → ~/.mooter/distilled/pastor-<date>.skill.md
mooter pastor distill --name my-routing
```

Then tell the user where it was written and that it can be installed anywhere with
`npx skills add <path>`. The distilled skill encodes per-(task, tier) patterns,
dominant model, language mix, and confidence — **features only**, never prompt or
response text. The classifier tier stays a hard guardrail.
