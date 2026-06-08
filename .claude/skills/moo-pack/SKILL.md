---
name: moo-pack
description: Manage Mooter packs (list/show/diff/validate). Use when the user types /moo-pack or wants to inspect, compare, or validate a Mooter pack.
---

# /moo-pack

Run a Mooter pack subcommand. Pass the user's arguments straight through.

## Do this

```bash
mooter pack <action> [args]
```

Common actions:

```bash
mooter pack list                  # installed packs
mooter pack show <id>             # a pack's manifest
mooter pack diff <id>             # local vs canonical
mooter pack validate <path>       # schema-validate a pack
```

Show the output. Packs are domain skill bundles (caveman, obsidian-vault-sync,
data-spreadsheet, …) — they bias prompts/tooling, never the router tier.
