---
trigger: /frugal-doctor
description: Full health check of the frugal installation — shows every component, subscription profile, data pipeline, auto-learning status, and quick fixes.
---

# /frugal-doctor

Run a comprehensive health check of your frugal installation.

## What it checks

1. **Core files** — all router scripts installed and present
2. **Hook registration** — UserPromptSubmit hook in settings.json
3. **Classifier** — smoke test (3 prompts, verifies T0/T2/T3 routing)
4. **Subscription profile** — what frugal knows about your subscriptions (Claude Max, API key, OpenAI, Gemini)
5. **Provider availability** — Ollama installed + models ready, API keys in env
6. **Data pipeline** — decisions.log count, tracker :7821, hub reachability, last hub-push timestamp
7. **Auto-learning schedule** — LaunchAgent (Mac) / Task Scheduler (Windows) / cron (Linux)
8. **Slash commands** — all 9+ frugal skills installed
9. **Savings summary** — live metrics from tracker if running

## Usage

```
/frugal-doctor
```

## What to do when you see this skill invoked

Run the following bash command and report the full output to the user:

```bash
node ~/.claude/tools/router/frugal-doctor.js
```

If there are issues, ask the user if they want to auto-fix them:

```bash
node ~/.claude/tools/router/frugal-doctor.js --fix
```

If the subscription profile needs updating (shows `anthropic: unknown`):

```bash
node ~/.claude/tools/router/setup-profile.js
```

Always end by showing the user a clear summary: how many checks passed, what needs fixing, and the single most important action to take next.
