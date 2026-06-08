---
name: moo-status
description: Show a one-shot Mooter status snapshot in plain language (effort mode · Pastor · adapters). Use when the user types /moo-status or asks "what's Mooter doing right now".
---

# /moo-status

Give the user a quick, human-readable snapshot of the Mooter's state.

## Do this

```bash
mooter status --didactic
```

This explains, in plain language: the current effort mode and what it does, the
Pastor v2 routing brain (how many per-task adapters, the active one, decisions
recorded). For a machine-readable form use `mooter status --json`; for the full
TUI use `/moo-dashboard`.
