# 🐮 Mooter — Cost Cockpit for Claude Code

**See what your Claude Code routing actually saves you.** Mooter routes each prompt to the cheapest capable model — local Ollama for trivial work, Haiku / Sonnet / Opus only when needed. This extension is the **read-only cockpit** for that engine: live savings, the tier mix, and every decision with its *why*.

> Community project. **Not affiliated with, or endorsed by, Anthropic.** "Claude" and "Claude Code" are trademarks of Anthropic, PBC. This extension pairs with — and never replaces — the official Claude Code extension.

## Features

| | |
|---|---|
| 💸 **Saved vs all-Opus** | Real $ counterfactual computed from *your own* routing decisions — labelled token-estimated/advisory, never inflated. |
| 📊 **Tier mix** | How much went local (T0 · free) vs Haiku / Sonnet / Opus, at a glance. |
| 🧾 **Decisions feed** | Every prompt's tier, model, confidence and escalation rule — expand any row for detail. |
| 🐄 **Herd** | Live agent run, swimlanes, and a tokens × LLM × agent matrix when you spawn work. |
| 🩺 **Doctor** | Engine, tracker and pipeline health, with one-click fixes. |
| ✱ **Pairing** | Detects the official Claude Code extension and shows the pairing in the header. |

## Requirements

- The **mooter engine** — install once with `npx @mooter/cli` (see [mooter.ai](https://mooter.ai)).
- The official **[Claude Code extension](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code)** (recommended — enables one-click sessions and pairing).
- Optional: **[Ollama](https://ollama.com)** for the free local (T0) tier.

Until the engine is installed, the cockpit shows a short setup wizard instead of data.

## How it works

Mooter is a **hook, not a proxy** — it never intercepts your API traffic and never touches your code. The engine writes local routing telemetry under `~/.claude/tools/router`; this extension only **reads** that telemetry and talks to the engine's local savings tracker on `127.0.0.1`. Nothing is sent anywhere by the extension.

## Privacy

Read-only and fully local. No accounts, no network calls from the extension beyond `localhost`, no analytics. Works in Restricted Mode; needs a local filesystem (so not in virtual/web workspaces).

## Settings

- `mooter.trackerPort` — port of the local savings tracker (default `7821`).
- `mooter.statusBar.enabled` — show the 🐮 status-bar item (default `true`).

## Cross-platform

macOS, Windows and Linux. With Remote/WSL/Codespaces the extension runs where your router lives (`extensionKind: workspace`).

MIT licensed · [source](https://github.com/pauloloureiroshp-ship-it/mooter) · [issues](https://github.com/pauloloureiroshp-ship-it/mooter/issues)
