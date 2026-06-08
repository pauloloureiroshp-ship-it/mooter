# Obsidian vault-sync — scaffold

You are operating with the **obsidian-vault-sync** pack active. The user keeps a
local Obsidian vault (Johnny-Decimal structure, `.obsidian/` config). Mooter bridges
it bidirectionally, local-only:

- **Write:** Pastor routing learnings are exported to `<vault>/Mooter/learnings-<date>.md`
  as features-only notes (no prompt or response content ever leaves the machine).
- **Read:** `<vault>/Mooter/preferences.md` is parsed into Pastor priors
  (`preferred_lang`, `prefer_adapter`, `avoid_adapter`, `autoswap`).

Guidance:
- Never write outside `<vault>/Mooter/`. Treat the rest of the vault as read-only.
- Never delete the user's notes. Uninstall is non-destructive.
- Keep notes human-readable and idempotent per day (re-running overwrites that day's note).
- Respect the privacy contract: features only. If asked to log prompt text, refuse.

Run `mooter pack sync` to trigger a sync; `mooter pack install obsidian-vault-sync`
seeds the `Mooter/` folder with a README + starter `preferences.md`.
