---
name: wave-brief-compose
description: Compose a Mooter wave kickoff brief in the house style — Day 0 recon that REFUTES premises first, doctrine block (classify.js sha freeze, frozen packages, allowlist), phases with gates, STOP criteria, and an honest ship-probability table. Use when the user asks to draft/compose a wave brief, kickoff, or master prompt for the next Mooter wave.
---

# /wave-brief-compose <wave name + goals>

Produce a wave kickoff brief that survives contact with reality. The house
style is adversarial-by-default: every wave since 27 has had Day 0 recon
refute 2-5 of the brief's premises, so the brief must be WRITTEN expecting
refutation.

If `.planning/wave-mega-50-51/WAVE_MEGA_DAY0_RECON.md` (or the current wave's
equivalent under `.planning/<wave>/`) exists, read it first and mirror its
structure — it is the canonical example of the format.

## Required sections, in order

1. **Header** — wave name, orchestrator model, worktree/branch, base commit.
2. **Gate Phase 0 (Day 0 recon)** — a checklist the executing session MUST run
   before building, each row with a verifiable command/result:
   - classify.js sha vs frozen constant
   - git state clean, correct branch
   - version.json vs latest tag (they drift when tags aren't pushed)
   - model access / pricing assumptions verified against live sources
   - "**Refuted / corrected brief premises**" subsection — instruct the
     executor to LIST premises it disproved, numbered, before writing code.
3. **Doctrine block** (copy verbatim into every brief):
   - `tools/router/classify.js` FROZEN, sha
     `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`,
     byte-identical, CI-enforced.
   - Frozen packages untouched except an EXPLICIT allowlist (name the files).
   - Tier ladder T0-T3 auto + T5 Fable opt-in via `@fable` only; no T4.
   - Pricing: defer to the `pricing-correto-2026` skill — never restate from
     memory.
   - Selective git adds only (never `git add -A`); each phase = own branch
     off `main` (`feat/<wave>-N-*`), independently mergeable.
4. **Phases with gates** — each phase: scope, files allowlist, exit gate
   (tests green, sha intact, final-reviewer verdict), and what is explicitly
   OUT of scope.
5. **STOP criteria** — conditions that halt the wave and require Paulo:
   destructive ops, shared-config changes (settings.json, CI), >5 subagents
   in one turn, sha mismatch, anything touching prod secrets/migrations.
6. **Honest ship-probability table** — per phase, a % estimate WITH the
   reason for the discount (e.g. "55% — depends on weights not yet
   released"). Never list 100% except pure-docs phases.
7. **Return format** — what the executing session must report back (TL;DR,
   files, test counts, deviations).

## Honest caveats

- Do not inherit version numbers, package names, or "X already exists" claims
  from memory — phrase them as premises TO VERIFY, not facts.
- A brief that contains fabricated metrics (benchmarks, savings %, user
  counts) is NO-SHIP; every number needs a source or a "to be measured" tag.
- Session reports go to Notion / `.planning/<wave>/`, not new root `.md`
  files (markdown hygiene doctrine).
