# Mooter — Anthropic Showcase Pack

> Materials for a potential Anthropic developer-relations conversation. **Paulo decides if/when to send.** Everything here is verifiable; nothing is an endorsement by or affiliation with Anthropic.

## The one-liner

> Mooter is a local-first router for Claude Code. It defaults work to a free local model, escalates to Haiku / Sonnet / Opus / Fable only on signal, and shows every routing decision — tier, model, confidence — so the user can see and verify it.

## Why it maps to Anthropic's stated values

| Value | How Mooter reflects it | Where to verify |
|---|---|---|
| **Honesty** | Savings are advisory estimates, floored at $0, labelled as such. Headline is **47% across 658 real routed calls** — measured, not invented. Wave 48/49 relabelled misleading chips and fixed wrong pricing copy. | `mooter digest`, `mooter explain saved`, changelog |
| **Transparency** | Tier pricing stated authoritatively; benchmarks print methodology + caveats. | `mooter explain tiers`, `mooter benchmark run` |
| **Metacognition** | Low-confidence routes (<0.60) flagged ⚠ in-line; local subagents signal what they're unsure about rather than bluff. | `mooter explain confidence`, `mooter explain uncertainty` |
| **Local-first / privacy** | Default tier runs on-device ($0); identity is an opaque non-reversible hash, never a GitHub handle/email. | `mooter explain user` |
| **Open ecosystem (MCP)** | First-class MCP server already exposes 16 tools; `mooter mcp {serve,list,install}`. | `mooter mcp list` |
| **Open source** | MIT licensed. | repo |

## What is explicitly NOT claimed (so the honest framing holds)

- No claim of optimal routing — only "cheapest tier that fits, escalate on signal."
- Savings read near 0% on Opus-heavy / extended-thinking sessions; that's disclosed.
- "Aligned with Anthropic's values" = design intent, **not** endorsement/affiliation/certification.
- Open benchmark methodology (MooterBench) and OpenTelemetry tracing are **planned**, not shipped — do not present them as done.

## Reference doc

`docs/ANTHROPIC_ALIGNMENT.md` (also intended for mooter.ai/alignment) — the public, footnoted version of the table above.

---

## Friends DM — v15 proposal (Anthropic-aligned framing)

**Recommendation: keep v13 as the primary DM** (the 47%-real-savings hook is the strongest, most concrete lead). Use v15 only for technically-minded friends who'll appreciate the alignment angle.

**v15 (technical friends):**
> Lembras-te do Mooter? Live em mooter.ai — router local-first p/ Claude Code. Corre o trabalho num modelo local grátis por default e só escala p/ Haiku/Sonnet/Opus/Fable quando faz falta — e mostra-te cada decisão (tier, modelo, confiança) p/ poderes verificar. 47% menos custo vs all-Opus nos meus 658 calls reais — vês o teu número com `mooter digest`. Open source MIT. 5 min p'ra experimentar?

**Why v15 ≠ a hard replace:** v13's lead is the measured 47%. v15 trades some of that punch for the honesty/transparency story. Both are true; pick by audience.
