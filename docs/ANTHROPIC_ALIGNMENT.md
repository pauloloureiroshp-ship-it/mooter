# Mooter & Anthropic's values

Mooter is a local-first router for Claude Code. This page states, honestly, how Mooter's
design maps to values Anthropic has emphasised publicly — and, just as importantly, where
the mapping is aspirational rather than done. Every claim below is verifiable from the code
or from a command you can run yourself. Where a number appears, its source and its caveat
are named.

## Honesty

- **Routing decisions are visible, not hidden.** Every prompt's tier, model and the
  classifier's confidence are shown on the statusline (e.g. `T2 sonnet-4.6 · conf 0.84`).
  `mooter explain <chip>` documents what each figure means and how to read it.
- **Claims are advisory, and labelled as such.** The savings figure is an estimate from
  per-tier token-cost models, **floored at $0**, not a billed amount. The headline number
  we quote is **47% across 658 real routed calls** — measured, advisory, and reproducible
  on your own machine with `mooter digest`. We do not quote a fabricated savings rate.
- **We correct ourselves.** Wave 48 relabelled several chips that were misleading
  (`MLWR` → `local routes`, a `session` cost that was actually all-time, etc.) and fixed
  pricing copy that had been wrong. The changelog records these as corrections, not features.

## Transparency

- Benchmarks run locally and print their methodology and caveats — `mooter benchmark run`.
- Tier pricing is stated authoritatively in `mooter explain tiers` (Anthropic list pricing,
  input/output per million tokens) rather than guessed.
- An open benchmark methodology (MooterBench) is in progress; until it ships, the benchmark
  numbers above carry an explicit single-evaluator caveat.

## Metacognition / uncertainty signalling

- A single low-confidence route (`< 0.60`) is marked **⚠** in-line so you can verify or pin
  a tier, rather than only learning of it once three-in-a-row trip the red
  "router miscalibrated" headline. See `mooter explain confidence`.
- Local subagents are asked to flag what they are *not* sure about; low self-assessed
  confidence escalates the task or surfaces the uncertainty. See `mooter explain uncertainty`.
  This is honest signalling — it is **not** a correctness guarantee.

## Local-first & privacy

- The default tier (T0) runs entirely on your machine via Ollama, at $0 and without sending
  the prompt to any API.
- The identity tag on the statusline (`👤 user <hash>`) is an opaque, non-reversible hash —
  never your GitHub handle or email. When logged out, it is silently absent.

## Open source & ecosystem

- Mooter is MIT licensed.
- Mooter speaks MCP (Model Context Protocol) as a first-class citizen — it both exposes
  tools via an MCP server and is designed to consume community MCP servers.

## What is NOT claimed

- Mooter does not claim its routing is optimal, only that it defaults to the cheapest tier
  that fits and escalates on signal. Your mileage varies with your workload.
- Savings are estimates, not guarantees, and read near 0% on Opus-heavy / extended-thinking
  sessions where there is genuinely less to save.
- "Aligned with Anthropic's values" describes design intent and is not an endorsement by,
  affiliation with, or certification from Anthropic.

---

*Reproduce any number here: `mooter digest`, `mooter benchmark run`, `mooter explain <chip>`.*
