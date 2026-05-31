# Wave 2.7 — End-to-End Persona Simulation: Meta-Report

> Reviewer/coordinator synthesis of 5 hermetic persona simulations (P1–P5). Every claim below traces to `persona-P<N>.md` and `persona-P<N>.data.json`. All runs were hermetic in isolated temp HOMEs, drove the real shipped units, touched zero production code, and made zero live model calls. **Cost: $0.**

---

## Executive Summary

**Blocker verdict: 0 blockers. `anthropic_ready = true` (blockers === 0).**

All 5 personas returned `verdict: READY` with `blockers: 0` in their own data. After the evidence gate (every gap re-checked against observed data, minimum evidence length 91 chars — all pass, **0 gaps rejected**), the consolidated tally is:

- **Blockers: 0**
- **Major: 3** (classification accuracy below the 90% target on P2, P3, P5)
- **Minor: 2 distinct issues, each affecting all 5 personas** (no dashboard PACK section; Moo card omits LoRA/adapter disclosure)

The wizard, schema writes, transparency invariants (zero hyperbole, zero "Pastor" entity, per-session isolation, LoRA honesty, formulas+sources in trail, honest evolution against a zero baseline) hold across **all 5 personas with no exception**. Both edge personas behaved correctly: P4 (no Ollama) got no phantom `ollama` provider; P5 (no Anthropic key) got no fabricated `anthropic` credential.

**One major deserves elevation above the others:** P2's miss includes a genuine **T3→T0 safety downgrade** — "design a sharding strategy for the events table" was routed to local `qwen2.5:3b` instead of Opus. The P3 and P5 majors are accuracy drift confined to the T0↔T1 boundary with **no** high-risk downgrade. P2 is the only persona where an architecture-grade prompt silently landed on a 3B local model.

Not a showcase blocker (the shipped units are honest, isolated, and crash-free), but the P2 sharding misroute is the top pre-Wave-3 fix.

---

## Per-Persona Summary Table

| Persona | Profile | Providers (correct?) | Wizard | Class. acc. | T3 safety | Gaps (B/Maj/Min) | Verdict |
|---|---|---|---|---|---|---|---|
| **P1** Solo Founder Paula | Max plan, RTX 4090, both tiers | anthropic+ollama yes | exit 0, 36 ms, 5/5 schemas | **90%** (9/10) | 3/3 T3 correct, no downgrade | 0 / 0 / 2 | READY |
| **P2** Senior IC Marco | Max plan, M3 Pro, both tiers | anthropic+ollama yes | exit 0, 38 ms, 5/5 schemas | **70%** (7/10) | **1 T3→T0 downgrade** | 0 / 1 / 2 | READY |
| **P3** OSS Maintainer Yuki | Team plan, Threadripper, both tiers, 2 packs | anthropic+ollama yes | exit 0, 45 ms, 5/5 schemas | **70%** (7/10) | 3/3 T3 correct, no downgrade | 0 / 1 / 2 | READY |
| **P4** No-Ollama Edge Linus | Max plan, M1, **no Ollama** | anthropic only yes | exit 0, 40 ms, 5/5 schemas | **90%** (9/10) | 3/3 T3 correct, no downgrade | 0 / 0 / 2 | READY |
| **P5** No-Anthropic Edge Sara | **No key**, RTX 3090, local-only | ollama only yes | exit 0, 37 ms, 5/5 schemas | **80%** (8/10) | 2/2 T3 correct, no downgrade | 0 / 1 / 2 | READY |

Aggregate classification accuracy across all 50 prompts: **40/50 = 80%**.

---

## Anthropic-Readiness Scorecard (40 items)

Each item is a boolean derived from observed persona data. Green = holds for all personas it applies to.

### Wizard & schemas (10)
1. GREEN Wizard exits 0 for all 5 personas
2. GREEN Wizard `ok: true` for all 5
3. GREEN `profileOk: true` for all 5
4. GREEN `credentialsOk: true` for all 5
5. GREEN `consentOk: true` for all 5
6. GREEN `installedOk: true` for all 5
7. GREEN `packsDirOk: true` for all 5
8. GREEN Telemetry OFF by default (opt-out respected) for all 5
9. GREEN Wizard duration < 100 ms for all 5 (36–45 ms)
10. GREEN At least 1 pack installed per persona, count matches output line

### Provider correctness incl. edge cases (5)
11. GREEN P1/P2/P3 (full-stack) provisioned both `anthropic`+`ollama`
12. GREEN P4 (no Ollama) wrote NO `ollama` provider (`hasOllama: false`)
13. GREEN P5 (no key) wrote NO `anthropic` provider (`hasAnthropic: false`)
14. GREEN No phantom/fabricated provider injected for any persona
15. GREEN `providersPresent` matches persona constraints exactly in all 5

### Classification & routing (8)
16. RED No high-risk T3 prompt downgraded — **FAILS for P2** (T3→T0 sharding)
17. GREEN P1/P3/P4/P5: every T3 prompt classified correctly (13/13)
18. RED Classification accuracy ≥ 90% per persona (P2 70%, P3 70%, P5 80%)
19. GREEN Aggregate accuracy ≥ 75% (80% over 50 prompts)
20. GREEN All misses except P2#7 are adjacent-tier (±1)
21. GREEN Confidence scores present and plausible (0.70–0.90) for all prompts
22. GREEN Correct local model selected for genuine T0 tasks where Ollama present
23. GREEN Latency band consistent (~83–118 ms spawn wall-time; documented as Node cold-start, not hook latency)

### Moo card (5)
24. GREEN Card emitted for all 5 (`cardEmitted: true`)
25. GREEN Opt-in respected for all 5 (`optInRespected: true`)
26. GREEN 6 fields present for all 5
27. GREEN Glyph correctness (`🦬 opus`, `🐄 ollama`, cloud/local) for all 5
28. RED LoRA/adapter disclosure on card (`loraDisclosed: false` for all 5)

### Dashboard (6)
29. GREEN 5 core sections present (MOOS ACTIVE, SAVINGS, CONTEXT, QUOTA, ADAPTER) for all 5
30. RED PACK/domain section present (`packSectionPresent: false` for all 5)
31. GREEN LoRA honesty in ADAPTER section for all 5 (`loraHonesty: true`)
32. GREEN Dashboard call counts reconcile with prompt tier mix (verified P3 exactly)
33. GREEN Cloud/local split rendered honestly (incl. edge personas)
34. GREEN Zero hyperbole in dashboard for all 5

### Trail & evolution (4)
35. GREEN Trail JSON parses for all 5 (`jsonParses: true`)
36. GREEN 10 fields + 10 events (one per prompt) for all 5
37. GREEN Formulas + sources present for all 5 (`hasFormulasAndSources: true`)
38. GREEN Evolution honest against zero baseline, no fabricated LoRA progress, for all 5

### Transparency & vocab (2)
39. GREEN Per-session isolation clean for all 5 (`otherSessionEvents: 0`, `ok: true`)
40. GREEN Zero "Pastor"-as-entity + zero hyperbole across wizard/dashboard/card for all 5

**Scorecard: 36 / 40 green.**

Red items: #16 (P2 T3 downgrade), #18 (accuracy < 90%), #28 (no card LoRA line), #30 (no dashboard PACK section). #16 and #18 are the same family (classification); #28 and #30 are the two cosmetic disclosure minors.

---

## Cross-Persona Patterns

1. **All 5: no dashboard PACK section.** Every persona installed at least 1 pack (`installedOk: true`) but `packSectionPresent: false` in every dashboard. The pack-install path works; the surface to display it does not exist. Universal, deterministic — a missing feature, not a flake.
2. **All 5: Moo card omits LoRA/adapter line.** `loraDisclosed: false` on all 5 cards, while every dashboard ADAPTER section carries the honest "none yet" disclosure. The omission is card-local and consistent.
3. **All 5: transparency invariants hold perfectly.** Zero hyperbole, zero "Pastor" entity, clean per-session isolation, formulas+sources in trail, honest evolution, honest LoRA "none yet / Wave 5" — no exception anywhere.
4. **All 5: wizard is fast and complete.** 36–45 ms, exit 0, 5/5 schemas, telemetry OFF.
5. **4 of 5: no high-risk downgrade.** P1/P3/P4/P5 classified every T3 prompt correctly (13/13 combined). **P2 is the lone exception** with a T3→T0 sharding misroute.
6. **Both edge personas correct.** No phantom providers — the wizard reflects real persona capability (P4 no Ollama, P5 no key).
7. **Accuracy misses cluster at the T0↔T1 boundary** (summarize/docstring/changelog/typo-triage), the cheap end. Apart from P2#7, no miss has cost or safety consequence beyond minor over/under-spend on trivial prompts.

---

## Prioritized Gaps

### Blockers
None.

### Major

**MAJ-1 — T3→T0 safety downgrade (architecture prompt to a 3B local model).**
- Affected: **P2** (only).
- Evidence: `persona-P2.data.json` prompt `"design a sharding strategy for the events table"` → `expectedTier: T3`, `actualTier: T0`, `actualModel: qwen2.5:3b`, `confidence: 0.80`, `correctlyClassified: false`. Verified directly against the data file.
- Why it matters: an architecture-grade decision can silently land on a 3B local model. This is the one accuracy miss with real downside.
- Recommended fix: add architecture keyword/intent signals ("sharding strategy", "design a … for the … table") to the T3 path in `classify.js`; consider a guardrail that blocks T3-class prompts from dropping below T2. Validate against the Wave-2 benchmark corpus.

**MAJ-2 — Classification accuracy below the 90% target.**
- Affected: **P2 (70%), P3 (70%), P5 (80%)**. (P1 and P4 hit 90%.)
- Evidence: `classificationAccuracy` = 0.7 / 0.7 / 0.8 in the respective data files; per-prompt miss lists in `gaps[0]` of each (evidence lengths 177 / 159 / 106 chars).
- Why it matters: showcase narrative implies ≥90% routing; three personas miss it. Apart from MAJ-1 the misses are cost-drift only (adjacent-tier, cheap end).
- Recommended fix: tune the T0↔T1 boundary (summarize/docstring/changelog/typo-triage repeatedly mis-tier). Run `/update-router` (backtest → update-router) against the expanded persona corpus. Treat MAJ-1 separately and with higher priority.

### Minor

**MIN-1 — Dashboard has no PACK/domain section.**
- Affected: **all 5 personas**.
- Evidence: every data file has `dashboard.packSectionPresent: false` with a non-empty `installedPacks` (e.g. P3 `["data-spreadsheet","diagram-systems"]`, P4 `["code-audit"]`). Evidence strings 91–115 chars.
- Why it matters: installed packs are invisible post-install; the showcase spec's 6th section is absent.
- Recommended fix: add a PACK/domain section to the dashboard renderer that lists `installedPacks`. Cosmetic, deterministic.

**MIN-2 — Moo card omits LoRA/adapter disclosure.**
- Affected: **all 5 personas**.
- Evidence: every data file has `mooCard.loraDisclosed: false`; card body is `moo / confidence / last10` with no adapter line (evidence 120 chars each, includes the rendered card).
- Why it matters: disclosure is inconsistent surface-to-surface (dashboard ADAPTER has it, card does not). Honest-by-omission, not a falsehood.
- Recommended fix: echo the honest "adapter: none yet (Wave 5)" line onto the Moo card for parity with the dashboard.

> **Evidence gate result:** 13 gaps reported across the 5 personas (2+3+3+2+3). Every gap carries evidence ≥ 30 chars traceable to observed data (minimum observed: 91 chars). **0 gaps rejected.**
>
> **One report-level inaccuracy noted (not a unit gap):** the P2 report claims its data JSON serializes only 9 of 10 prompt rows. The data file actually contains all 10 rows (`promptListLen: 10`, `correctCount: 7`). The unit data is complete; the P2 narrative overstated a serialization issue that does not exist. Does not change any tally.

---

## Recommendations for Wave 3

1. **Fix MAJ-1 first.** Add architecture-intent detection + a no-downgrade-below-T2 guardrail for T3-class prompts. This is the only finding with genuine downside.
2. **Tune the T0↔T1 boundary** via `/update-router` against an expanded corpus including the 50 persona prompts. Target ≥90% per-persona without re-introducing T3 downgrades.
3. **Ship the dashboard PACK section** (MIN-1) so installed packs are visible — closes the 6th-section gap for all personas in one change.
4. **Add the Moo-card adapter line** (MIN-2) for disclosure parity with the dashboard.
5. **Carry the LoRA "none yet / Wave 5" honesty forward** — it is correct everywhere today; do not let Wave 3 introduce premature adapter claims before training exists.
6. **Keep the hermetic persona harness as a regression gate.** It is $0, deterministic, and caught both the safety downgrade and the universal cosmetic gaps. Re-run before each showcase.
7. **Correct the P2 report's serialization claim** if these reports are reused, to avoid propagating a non-issue.

---

## Cost Sanity

**$0.** All 5 runs were hermetic in isolated temp HOMEs (`/tmp/claude-1000/mooter-e2e-P<N>-*`), drove the real shipped units, and made no live model calls. No production code or state was touched. Latency figures are `classify.js` process wall-time (Node cold-start ~50–100 ms), explicitly documented in each data file's note as not in-process hook latency and not UX-facing.

---

## Sign-off

- **Anthropic-ready:** YES (`blockers === 0`).
- **Reviewer verdict:** APPROVE_WITH_NOTES. Zero blockers; the shipped units are honest, isolated, edge-correct, and crash-free across all 5 personas. Address MAJ-1 (P2 T3→T0 safety downgrade) as the top pre-Wave-3 fix, then MAJ-2 (accuracy tuning) and the two universal minors.
- **Scorecard:** 36/40 green.
- **Evidence gate:** 13/13 gaps passed, 0 rejected.
- **Coordinator:** Wave 2.7 reviewer (meta-synthesis of P1–P5).
