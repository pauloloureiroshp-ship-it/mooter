---
name: moo-herd
description: Show the live Mooter herd — local Ollama workers in flight + recent workflow runs. Use when the user types /moo-herd or asks how many agents/Moos are running.
---

# /moo-herd

Surface the live "herd" of local workers and recent workflow activity in the chat.

## Do this

```bash
mooter workflow list          # recent runs (status · cost · agents)
```

Then summarise: how many runs are active, how many local 🏠 vs cloud ☁️ agents,
and the savings vs all-Opus. If a run is live, offer:

```bash
mooter workflow watch <run_id>    # full Mission Control TUI
```

The statusline already shows the live `🐄 active/total/peak` chip; this command
gives the per-run breakdown behind that number.
