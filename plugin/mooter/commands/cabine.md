---
description: (alias) Open the Mooter Cockpit — renamed from "Cabine" on 2026-08-04
---

# /cabine — alias of `/cockpit`

The Cabin was renamed **Cockpit** on 2026-08-04. This alias exists so that anyone who
learned the old name is not stranded.

Run `/cockpit` — it renders the per-session cockpit for the current session. There is no
separate Cabin: same command, same output, older name.

> Why this file exists: `plugin/mooter/skills/cockpit/SKILL.md` and
> `plugin/mooter/skills/cockpit/moo-kb.json` both tell the user the alias is kept. The file
> backing that promise was deleted as collateral in `0434bc42` (the commit that carried the
> Cabine → Cockpit rename), leaving two surfaces citing a command that no longer resolved —
> `moo-kb.json` even cites `plugin/mooter/commands/cabine.md` as its source. Restored so the
> claim is true again rather than quietly dropped.
