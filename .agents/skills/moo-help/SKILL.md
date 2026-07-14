---
name: moo-help
description: Show the Mooter mission + all /moo-* slash commands + current session state. Use when the user types /moo-help or asks what Mooter can do.
---

# /moo-help

Show the Mooter command menu and current state.

## Mission

> **Mooter — your LLM router. Local-first. Learns forever.**
> Route every turn to the cheapest model that can do it well, keep work local when
> it can, and learn your patterns over time. You pay for Opus only when it matters.

## The /moo-* slash commands

| Command | What it does |
|---|---|
| `/moo-workflow <task>` | Local-first dynamic workflow (free Ollama workers + 1 cloud synthesis) |
| `/moo-effort <mode>` | Set effort: low · default · high · ultramoo (max frugality) |
| `/moo-herd` | Live local-worker herd + recent workflow runs |
| `/moo-dashboard` | Full dashboard TUI (savings · Pastor · hardware · workflows · limits) |
| `/moo-status` | One-shot plain-language status |
| `/moo-distill` | Export learned routing as an installable skill |
| `/moo-pack <action>` | Manage packs (list/show/diff/validate) |
| `/moo-agents` | Mooter subagent roster + live orchestration status (CC-parity for /agents) |
| `/moo-memory` | Memory layers: project + global AGENTS.md + MEMORY.md (CC-parity for /memory) |
| `/moo-init` | Bootstrap Mooter config via `mooter init` (CC-parity for /init) |
| `/moo-help` | This menu |

## Do this

After showing the menu, run the snapshot so the user sees live state:

```bash
mooter status --didactic
```
