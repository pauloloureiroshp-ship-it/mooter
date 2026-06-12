---
description: Set up the mooter routing engine (one-time) and verify it is healthy
---

# /mooter-setup

Check whether the mooter routing engine is installed and healthy, and guide the user through setup if it is not. Follow these steps exactly:

1. Check if `~/.claude/tools/router/inject_context.js` exists.
2. **If it exists:** run `mooter doctor` (PATH may need `~/.local/bin`). Show the user the result and explain any warnings in one sentence each. Done.
3. **If it does not exist:** tell the user mooter's plugin is active but the routing engine (local models + savings tracking) needs a one-time install. Ask for permission to run: `npx @mooter/cli` — it clones the open-source repo (MIT) and runs the official installer (~60s). After it finishes, tell them to restart the Claude Code session so the routing hook activates.
4. Never run the installer without explicit user consent in this conversation.
