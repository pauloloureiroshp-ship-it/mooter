# INSTALL.md — frugal

> Full installation guide for Windows (Git Bash), macOS, and Linux.

## Prerequisites

| Requirement | Check | Install |
|---|---|---|
| Node.js ≥18 | `node --version` | nodejs.org |
| Git | `git --version` | git-scm.com |
| Claude Code | `claude --version` | `npm install -g @anthropic-ai/claude-code` |
| Ollama (optional) | `ollama --version` | ollama.com |

Claude Code must be authenticated before installing frugal:

```bash
claude auth login
```

Ollama optional but recommended:

```bash
ollama pull qwen2.5:3b    # fast T0 model (~2GB)
ollama pull qwen3:30b     # better quality T0 (~20GB, optional)
```

---

## Option A: One-command install

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/<YOUR_GITHUB_USERNAME>/frugal/main/install.sh)
```

Flags:

```bash
bash install.sh --dry-run    # preview without changes
bash install.sh --force      # overwrite without prompting
bash install.sh --uninstall  # rollback
```

## Option B: Manual install

```bash
git clone https://github.com/<YOUR_GITHUB_USERNAME>/frugal.git ~/frugal
cd ~/frugal
bash install.sh
```

---

## What the installer does

1. Creates `~/.claude/` if not exists
2. Backs up existing `~/.claude/` to `~/.claude/backups/frugal-install-TIMESTAMP/`
3. Copies `tools/router/` (classify.js, inject_context.js, statusline.sh, replay.js, stats.js, benchmark.sh)
4. Copies `agents/` (6 subagents)
5. Merges mediator doctrine into `~/.claude/CLAUDE.md` (non-destructive)
6. Merges `UserPromptSubmit` hook into `~/.claude/settings.json` (preserves existing hooks)
7. Makes all `.sh` scripts executable
8. Verifies Ollama + runs smoke test

---

## Verifying the installation

```bash
# Test the classifier
echo '{"prompt": "write a commit message for this change"}' | node ~/.claude/tools/router/classify.js
# Expected: {"tier":"T0","confidence":0.97,"reason":"commit-message-pattern"}

# Test the statusline
bash ~/.claude/tools/router/statusline.sh
```

---

## Configuring the statusline

Add to `~/.claude/settings.json`:

```json
{
  "statusline": {
    "enabled": true,
    "command": "bash ~/.claude/tools/router/statusline.sh",
    "refreshMs": 10000
  }
}
```

---

## Troubleshooting

**1. OAuth token expired / budget API returns 401**

```bash
claude auth login
```

**2. classify.js not found**

```bash
bash ~/frugal/install.sh --force
```

**3. Ollama unavailable**

frugal degrades gracefully: T0 prompts route to Haiku if Ollama is down.

```bash
ollama serve &
```

**4. 9Router not starting**

```bash
npx 9router start --config ~/.claude/9router.config.json
```

**5. Windows paths with spaces**

```bash
bash "/c/Users/My User/frugal/install.sh"
```
