---
name: moo-init
description: Initialise Mooter for this project — bootstrap the ~/.mooter home, preferences, and packs via `mooter init`. Use when the user types /moo-init or is setting Mooter up for the first time.
---

# /moo-init

Bootstrap Mooter for the current project. Mooter-native companion to Claude
Code's `/init` — it does **not** replace it.

## Do this

```bash
mooter init
```

This initialises Mooter's home (`~/.mooter`): preferences, packs, and routing
config. It is **idempotent** — safe to re-run. It does not write a project
`CLAUDE.md` (use Claude Code's `/init` for that); `/moo-memory` shows which
memory layers are already in place.

After it finishes, `/moo-status` shows the live state and `/moo-help` lists every
command.
