# ADR-0001: Mission statement — "Your LLM router. Local-first. Learns forever."

- **Status:** Superseded by tese 2026-07-15 (commit 1486af4, PR #248)
- **Date:** 2026-06-07
- **Deciders:** Paulo Loureiro (owner), Cowork (strategy), CC (apply)
- **Tier/Wave:** Wave 30 Mega Synthesis, Phase B (T0/T1)

## Context

Mooter accumulated many positioning lines across 29 waves ("The AI router that picks tools, not just models", "The AI shepherd for your Claude Code", "Claude Code hook-based LLM router that saves ~90%"). None was a single, durable one-liner usable verbatim across README, landing hero, CLI banner, OG image, and pitch DMs. The Big-Picture Audit (criterion: *clarity of positioning*) flagged this as a gap suppressing the showcase score.

We needed one mission that is: (a) instantly legible to a Claude Code user, (b) true to the architecture (two-axis routing, local-first defaults, self-tuning/Pastor/bandit learning), and (c) short enough to be a tagline.

## Decision

We will adopt **"Your LLM router. Local-first. Learns forever."** as the canonical mission statement, applied verbatim to README header, landing hero subtitle (h2), and the CLI top-usage banner. Brand assets ("Got Moo?" wordmark, shepherd metaphor) are preserved as secondary identity, not replaced.

## Alternatives considered

| Option | Pros | Cons | Why not chosen |
|---|---|---|---|
| "The AI router that picks tools, not just models." | Accurate (two-axis) | "picks tools" is jargon; doesn't convey local-first or learning | Kept as README positioning sub-line, not the mission |
| "The AI shepherd for your Claude Code." | On-brand (Pastor/shepherd) | Metaphor-first; a newcomer can't tell what it does | Demoted to hero sub-line |
| "Stop burning Opus on `git commit`." | Punchy, concrete pain | Negative framing; narrow to one tier; ages with model names | Rejected — too narrow |
| **"Your LLM router. Local-first. Learns forever."** | Says what it is + the two differentiators (local-first, self-tuning) in 6 words | Slightly generic noun "router" | **Chosen** — the two qualifiers are the moat |

## Consequences

- **Positive:** one string to reuse everywhere; "Local-first" and "Learns forever" map directly to the architecture's two hardest-to-copy properties (zero-proxy local default; Pastor + L16.2 bandit learning).
- **Negative:** "router" alone is a crowded category word; mitigated by the two qualifiers and the compare page.
- **Follow-ups:** propagate to OG image, pitch DMs (`FRIENDS_LAUNCH_DMS_v6`), and any future store listings. Revisit if pricing model (ADR-0002) reframes the product as a platform vs. a tool.

## Doctrine alignment

- **Local-first** is principle-aligned (zero-proxy, Ollama-default routing).
- **"Learns forever"** is honest only because Pastor (Wave 26) + the L16.2 bandit (Wave 30 Phase G) exist and the bandit is bounded by the classify.js hard guardrail (princ. 5 — doctrine wins bandit). The claim is not vaporware.

## References

- Brief: `docs/strategy/WAVE30_MEGA_SYNTHESIS_KICKOFF.md` (Phase B)
- Applied: commit `45c0c31` (README, landing hero, CLI banner)
