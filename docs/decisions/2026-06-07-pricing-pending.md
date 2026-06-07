# ADR-0002: Pricing / business model — PENDING (Paulo decision)

- **Status:** Proposed (decision deferred to Paulo)
- **Date:** 2026-06-07
- **Deciders:** Paulo Loureiro (sole decider — strategic/financial)
- **Tier/Wave:** Wave 30 Mega Synthesis, Phase C (T0)

## Context

Mooter is MIT, free-forever on the local routing core. To be sustainable (and to be a credible Anthropic-showcase story) it needs a stated business model. This is a **strategic + financial decision that is Paulo's to make** — CC documents the candidates and trade-offs but does NOT decide. This ADR is a placeholder that records the option space so the decision, when made, has a written basis.

## Decision

**Deferred.** No pricing is committed. The product ships free/MIT; monetization is an open question with three live candidates below.

## Alternatives considered

| Option | Shape | Pros | Cons / risk |
|---|---|---|---|
| **A — Acqui-hire / showcase** | Build the best possible artifact; outcome is a role/acquisition, not revenue | No billing infra; full focus on quality; aligns with "Anthropic showcase" goal | Not a business; single-outcome bet; no recurring value capture |
| **E — Hybrid OSS + SaaS + Enterprise** | Core MIT free; paid hosted hub (sync/dashboard/team), Enterprise (SSO, audit, private LoRA) | Proven model (GitLab/Sentry shape); local core stays free → trust; clear upsell (hub already exists) | Requires billing, support, SLA; SaaS ops cost; must keep free tier compelling |
| **D — Marketplace** | Moo Packs + LoRA adapters marketplace; take rate on paid packs/adapters | Network effects; community-driven supply; ties to L15 ecosystem catalog | Chicken-and-egg supply; moderation/quality; smaller TAM until ecosystem matures |

## Consequences

- **Positive of deferring:** Wave 30 ships product value (CLI, bandit, MCP, benchmark) without coupling to an unmade financial call. Mission ADR-0001 deliberately avoids pricing language.
- **Negative of deferring:** the showcase narrative lacks a "how it sustains" slide; partially mitigated by stating "MIT core, monetization TBD" honestly.
- **Follow-ups:** when Paulo decides, supersede this ADR with an Accepted one and update landing/pitch. The hybrid (E) is the lowest-regret default if a decision is forced, because the hosted hub already exists (`mooter-hub.frugal-hub.workers.dev`).

## Doctrine alignment

- Honesty-first: no fabricated pricing on landing. The free/MIT core is real and stays.
- Privacy-first constrains any SaaS tier: aggregates remain DP + k-anonymity ≥50.

## References

- Brief: `docs/strategy/WAVE30_MEGA_SYNTHESIS_KICKOFF.md` (Phase C)
- Ecosystem catalog (option D substrate): `packages/synthesis/src/ecosystem/` (L15, Wave 29)
