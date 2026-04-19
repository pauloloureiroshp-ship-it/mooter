# @mooter/cli

> Intelligent model routing for Claude Code. [mooter.ai](https://mooter.ai)

## This package is a name reservation

The real mooter CLI is a **shell install**, not an npm package:

```bash
# macOS / Linux
curl -fsSL https://mooter.ai/install.sh | bash

# Windows PowerShell
irm https://mooter.ai/install.ps1 | iex
```

After install, type `mooter` in any project to launch Claude Code with routing active.

## Private friends-beta

Public one-liner lights up at v1.0 with signed tarballs. For access today, email [paulo@mooter.ai](mailto:paulo@mooter.ai) or follow along at [mooter.ai](https://mooter.ai).

## What mooter does

Auto-classifies every Claude Code prompt and routes it to the minimum viable model:

| Tier | Model | Used for |
|---|---|---|
| T0 | Ollama (local) | summaries, transforms, trivial rewrites |
| T1 | Haiku | commits, regex, triage |
| T2 | Sonnet | bug hunts, plans, comparisons |
| T3 | Opus | architecture, refactors, critical decisions |

Up to 90% less cost vs. naive all-Opus sessions. Validated on 1,370+ real prompts.

## License

MIT © Paulo Loureiro
