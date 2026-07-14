---
name: moo-effort
description: Set the Mooter session-wide effort mode (low/default/high/ultramoo). Use when the user types /moo-effort or wants to dial frugality up or down. ultramoo flips 8 sub-systems for maximum savings.
---

# /moo-effort

Change the Mooter effort mode for this session.

## Do this

Parse the mode from the argument (`low`, `default`, `high`, `ultramoo`). Then run:

```bash
mooter effort set <mode>
```

If no mode is given, show the current one:

```bash
mooter effort show
```

## Modes

- **low** — baseline; the router routes, nothing extra.
- **default** — Pastor routing hints + soft local preference.
- **high** — adds LLMLingua prompt compression + earlier workflow auto-trigger.
- **ultramoo** — maximum frugality: LLMLingua + Caveman + LORAUTER + Multi-LoRA +
  workflow auto > 500 tok + stricter cost cap ($1/$20) + hard local bias +
  statusline 🐄 chip.

ultramoo never downgrades a critical task — classify.js tier floors always win.
