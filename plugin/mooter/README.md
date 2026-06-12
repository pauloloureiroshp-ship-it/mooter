# 🐮 mooter — The Router for Claude Code (plugin)

Routes every prompt to the cheapest capable model — local Ollama for trivial work (free, private), Haiku/Sonnet mid-tier, Opus only when the wall is concrete. **Hook, not proxy:** mooter never intercepts your API traffic; it injects a routing hint through Claude Code's own UserPromptSubmit hook.

**Real numbers:** 47% saved vs all-Opus across 658 routed calls on the author's machine — [methodology published](https://mooter.ai/methodology), including where mooter *loses* (it is a Claude Code specialist, not a general-purpose router).

## What this plugin does

| Piece | Behaviour |
|---|---|
| Hook (`UserPromptSubmit`) | If the mooter engine is installed: stays silent (native pipeline routes). If not: suggests setup once per session. Never blocks, never throws. |
| `/mooter` skill | Shortcuts: `route · savings · explain · local · tier · bench` |
| `/mooter-setup` command | Health-check + guided one-time engine install (with your consent) |

## Setup (one time)

The routing engine (local model probes, savings tracker, 200+ scripts) installs outside the plugin:

```bash
npx @mooter/cli
```

Or use `/mooter-setup` inside Claude Code and it walks you through it. Telemetry is **opt-in** and anonymous (device hash only — see [privacy](https://mooter.ai/privacy)).

## Safety posture

- No silent downloads: the engine install always requires your explicit consent.
- The hook reads only its own state files; it never touches your code or prompts beyond the standard hook contract.
- Risk floor: destructive-looking prompts ("drop that table…") are escalated to the strongest model — 70% catch rate on disguised-destructive prompts in our benchmark.

MIT · [mooter.ai](https://mooter.ai) · [GitHub](https://github.com/pauloloureiroshp-ship-it/mooter) · Not affiliated with Anthropic.
