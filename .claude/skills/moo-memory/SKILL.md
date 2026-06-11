---
name: moo-memory
description: Show the memory layers Mooter and Claude Code read — project CLAUDE.md, global ~/.claude/CLAUDE.md, and the auto-memory MEMORY.md index. Use when the user types /moo-memory or asks what Mooter remembers.
---

# /moo-memory

Surface the memory layers that steer this session. Mooter-native companion to
Claude Code's `/memory` — it does **not** replace it.

## Do this

Read and summarise these, in order, skipping any that are absent:

1. **Project memory** — `./CLAUDE.md` (repo-local instructions)
2. **Global doctrine** — `~/.claude/CLAUDE.md` (the personal cross-project doctrine)
3. **Auto-memory** — `~/.claude/projects/<project>/memory/MEMORY.md` and the
   one-line-per-fact files it points to

Report what each layer contributes, and flag any contradiction between them
**before** acting on it (Honest > Forced).
