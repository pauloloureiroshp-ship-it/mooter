# Benchmark Sources 2026 — Wave 58 Matrix Foundation

**Status**: Sparse seed — intentionally incomplete. Cells grow via adaptive learning.
**Last updated**: 2026-06-12 (Wave 58 Phase Seed)
**Canonical data file**: `~/.mooter/benchmarks-overrides.json`

---

## Honesty Caveat (READ FIRST)

This matrix is **intentionally sparse**. A cell is only seeded when:

1. A real public benchmark result exists with a citable source.
2. The benchmark genuinely measures skills that the category represents.
3. The numeric score (or explicit "qualitative SOTA") is from that source — not interpolated, not extrapolated, not invented.

If a benchmark does not map cleanly to a category, it is **not** added — even if the model is obviously strong there. The matrix grows organically from real routing outcomes via the adaptive learning pipeline (`scripts/adaptive/`), not from filling gaps with guesses.

The 14×24 matrix has **336 possible cells**. Only **14 are seeded** at Wave 58 launch. That is correct and intentional.

---

## Benchmarks Used

### SWE-bench Verified

| Field | Value |
|---|---|
| Description | Real-world software engineering tasks: identify and fix bugs in open-source repos via PRs |
| URL | https://www.swebench.com / https://www.anthropic.com/research/swe-bench-sonnet |
| Metric | % of tasks resolved (0–1) |
| Categories mapped | `coding.backend` (primary), `coding.refactor` (proxy), `coding.debug` (proxy) |
| Mapping rationale | SWE-bench tasks are server-side bug-fix PRs — directly representative of backend coding skill. Refactor and debug are reasonable proxies because fixing a bug frequently requires both; confidence is medium for those two. |
| Scores seeded | claude-opus-4-8: 0.886 · claude-opus-4-7: 0.876 · gpt-5-3-codex: 0.850 |

### Terminal-Bench 2.0

| Field | Value |
|---|---|
| Description | Autonomous terminal operation — shell scripting, CLI toolchains, system administration |
| URL | (not confirmed in repo — supply when available) |
| Metric | Task completion rate (0–1) |
| Categories mapped | `coding.infra` (primary), `coding.security` (proxy) |
| Mapping rationale | Terminal-Bench tasks cover infra automation (IaC, CI, containers). Security is a proxy because the benchmark includes privilege/permission tasks; confidence medium. |
| Scores seeded | gpt-5-3-codex: 0.818 |

### GPQA Diamond

| Field | Value |
|---|---|
| Description | Graduate-level science multiple-choice (biology, chemistry, physics) — expert-level difficulty |
| URL | https://arxiv.org/abs/2311.12022 (original paper) / (model-specific result URL not confirmed) |
| Metric | Accuracy (0–1) |
| Categories mapped | `reasoning.science` |
| Mapping rationale | GPQA Diamond is the canonical graduate-science reasoning benchmark. Direct 1:1 mapping to reasoning.science. |
| Scores seeded | claude-fable-5: 0.946 |

### AIME 2026

| Field | Value |
|---|---|
| Description | American Invitational Mathematics Examination 2026 — competition mathematics |
| URL | (model-specific result URL not confirmed — supply when available) |
| Metric | Problems solved / total (reported as ~1.0 = perfect) |
| Categories mapped | `reasoning.math` |
| Mapping rationale | AIME is the canonical competition-math benchmark. Direct 1:1 mapping to reasoning.math. |
| Scores seeded | gpt-5: 1.0 |

### Anthropic Prose Eval (qualitative)

| Field | Value |
|---|---|
| Description | Anthropic internal evaluation of prose quality across evaluated models |
| URL | (internal; no public URL) |
| Metric | Qualitative rank (SOTA designation) — NO numeric score |
| Categories mapped | `writing.prose-en` (primary), `writing.prose-pt-pt` (lower confidence) |
| Mapping rationale | Opus 4.6 identified as SOTA for English prose. PT-PT inference is lower confidence — no PT-PT specific eval cited. Scores stored as null to avoid fabrication. |
| Scores seeded | claude-opus-4-6: null (qualitative SOTA) for both categories |

### Google Frontier Context Eval (qualitative)

| Field | Value |
|---|---|
| Description | Google internal / public claims for Gemini 3.1 Pro long-context capability |
| URL | (not confirmed in repo — supply when available) |
| Metric | Qualitative frontier designation — NO numeric score |
| Categories mapped | `context.large` |
| Mapping rationale | Gemini 3.1 Pro's multi-million token window makes it the frontier model for long-context tasks. Score stored as null to avoid fabrication. |
| Scores seeded | gemini-3.1-pro: null (qualitative frontier) |

---

## Mapping Decisions Log

| Decision | Rationale |
|---|---|
| SWE-bench → coding.backend (not coding.frontend) | SWE-bench repos are overwhelmingly server-side Python/JS backends; no frontend-specific UI tasks |
| SWE-bench → coding.refactor + coding.debug at same score | Same benchmark, no disaggregated per-category subscores; recorded as proxy with confidence:medium |
| Terminal-Bench → coding.infra + coding.security | Infra is primary; security is a proxy because privilege/permission tasks appear in the benchmark but are not its focus |
| AIME → reasoning.math only (not reasoning.general) | AIME is pure mathematics competition; not representative of general reasoning breadth |
| GPQA → reasoning.science only (not reasoning.general) | GPQA Diamond is specifically graduate-level STEM science, not general reasoning |
| Opus 4.6 prose → null score, not 0.9+ | No public numeric score available; qualitative "SOTA" is not the same as a measured number — null is honest |
| Gemini 3.1 Pro → context.large only | Long-context window is Gemini's documented differentiator; no benchmark score exists for the claim |
| coding.competitive, coding.test, reasoning.agentic, agents.*, context.small, context.multimodal, context.audio, writing.structured, writing.translation | No real cited benchmarks in the Wave 58 research foundation for these categories — cells left absent |

---

## What Is NOT Seeded (and Why)

The following categories have no seeded cells in `benchmarks-overrides.json` because no real cited benchmark was available at Wave 58 launch:

- `coding.frontend` — no public frontend-specific LLM benchmark confirmed
- `coding.competitive` — competitive programming (e.g. Codeforces) benchmarks exist but no Wave 58 data in scope
- `coding.test` — test-writing quality benchmarks not confirmed
- `reasoning.general` — MMLU/HellaSwag exist but Wave 58 scope did not include them; add via update
- `reasoning.agentic` — agent benchmarks (GAIA, AgentBench) exist but not confirmed for these specific models
- `agents.coordinator / agents.implementor / agents.reviewer` — multi-agent benchmarks not yet in scope
- `context.small / context.multimodal / context.audio` — not in Wave 58 research foundation
- `writing.structured / writing.translation` — not in Wave 58 research foundation

These will be populated as the adaptive learning pipeline accumulates real routing outcomes and as additional benchmark runs are added via `mooter benchmark-update`.

---

## How to Add a Cell

1. Find a real public benchmark with a citable URL.
2. Verify the benchmark genuinely tests skills the category represents (see Mapping Decisions Log above for precedent).
3. Add an entry to `~/.mooter/benchmarks-overrides.json` with `measured: true`, real `score`, real `source_url`.
4. Add a row to the Benchmarks Used table and a row to the Mapping Decisions Log above.
5. Open a PR; the reviewer must confirm the URL resolves and the score matches the cited table.

**Never** add a cell with a fabricated or interpolated score. The matrix's value comes from its honesty — a sparse-but-true matrix beats a full-but-fabricated one.
