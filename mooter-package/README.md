# 🐮 mooter

> The LLM router that keeps your wallet happy. Coming soon at [mooter.ai](https://mooter.ai).

## Status

This package is **reserved** — `v0.0.1` is a placeholder while the public release is being polished.

The real Mooter router automatically picks the cheapest model that can handle each Claude Code turn:

| Tier | Model | Used for |
|---|---|---|
| T0 | Ollama (local) | summaries, transforms |
| T1 | Haiku | commits, regex, triage |
| T2 | Sonnet | bug hunts, plans |
| T3 | Opus | architecture, refactor |

## Get notified

Join the waitlist at [mooter.ai](https://mooter.ai). One email when public beta opens. Zero marketing.

## License

MIT © Paulo Loureiro
