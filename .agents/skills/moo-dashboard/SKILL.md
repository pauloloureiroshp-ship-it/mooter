---
name: moo-dashboard
description: Open the full Mooter dashboard TUI (savings · Pastor · hardware · workflows · limits). Use when the user types /moo-dashboard or wants the full-screen view of the Mooter's state.
---

# /moo-dashboard

Launch the full-screen Mooter dashboard.

## Do this

```bash
mooter dashboard
```

It renders five widgets — MOOS ACTIVE, SAVINGS, QUOTA, PASTOR v2, HARDWARE,
WORKFLOWS, LIMITS — refreshing live. Keys: `r` refresh · `w` re-pull workflow rows ·
`q` quit. In a non-interactive context, run `mooter dashboard` once is fine; for a
compact in-chat snapshot prefer `/moo-status` instead.
