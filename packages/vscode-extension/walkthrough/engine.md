# Install the mooter engine

Mooter is a **router** for Claude Code: it sends each prompt to the cheapest model that can still do the job — local Ollama for trivial work, Haiku / Sonnet / Opus only when needed.

It's a **hook, not a proxy** — it never intercepts your API traffic and never touches your code.

```
npx @mooter/cli
```

Once installed, this cockpit reads its local telemetry (read-only) and shows you what you saved. Learn more at [mooter.ai](https://mooter.ai).
