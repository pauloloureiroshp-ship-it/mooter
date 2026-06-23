# Anthropic Showcase Rubric — v2 (Wave 12 re-score)

> CC scoring, 2026-06-03, against prod tag `v1.7.0-differentiation-pride`
> (mooter.ai LIVE; hub `mooter-hub.frugal-hub.workers.dev` POST `/api/feedback` → **201**
> confirmed by Cowork). 5 criteria, 0–5 each. Target (Wave 12 §4 #1): **5 on EACH = 25/25**.
> Honesty discipline: scored as an independent reviewer would; every 5 is backed by a
> file:line citation that exists in the shipped tree. Re-runnable for future revisions.
>
> **Supersedes** `ANTHROPIC_SHOWCASE_RUBRIC_V1.md` (Wave 11: 20→23/25, C3=4, C5=4 the gaps).

## Score summary

| # | Criterion | v1 (Wave 11) | v2 (Wave 12) | Meets ≥4? | What closed the gap |
|---|---|---|---|---|---|
| C1 | Privacy & data discipline | 5 | **5** | ✅ | held + hardened (PR-E) |
| C2 | Honesty in claims | 5 | **5** | ✅ | held + N reconciled 142→34 (PR-A) |
| C3 | Technical depth | 4 | **5** | ✅ | DoRA SVG + PEFT/Triton + classify.js/arbiter explainer (PR-F) |
| C4 | Build-with-Claude credentials | 2→5 | **5** | ✅ | footer credit LIVE in prod |
| C5 | Value-prop clarity | 4 | **5** | ✅ | hero persona subline + methodology persona case (PR-G) |
| | **Total** | **23 / 25** | **25 / 25** | **✅ ≥4 on every criterion** | — |

**Verdict:** **25/25, 5 on every criterion.** Wave 12 §4 criterion #1 (all 5/5) **MET**.
Wave 11 §4 #4 (≥4 each, ≥20 total) was already met; Wave 12 takes it to the ceiling.

---

## C1 — Privacy & data discipline — **5/5** (held + hardened)

- `/privacy` now surfaces the user-facing proofs, not just the cryptographic claims:
  - "Opt out anytime … `mooter quiet --telemetry-off`. No prompt text is ever transmitted — only hashes and counts." (`privacy/page.tsx:16`, **D4-1/D4-2**).
  - Cloud-router comparison: "mooter (hook, local-first) … T0 runs on your machine — prompt never leaves … mooter never sees or stores your prompt text" (`privacy/page.tsx:22`, **D4-3**).
- Wave 11 foundations intact: SHA-256 prompt hashing, opt-out default, k-anon ≥50, DP ε=1.0, server-derived `user_id_hash`, `/privacy` linked from footer.
- **5**: anonymous hashes + opt-out flag + "no prompt content" demonstrable + cloud-router contrast — the full 5-anchor present and now legible to a non-cryptographer visitor.

## C2 — Honesty in claims — **5/5** (held + benchmark N reconciled)

- **D1-1 fixed**: the fabricated "142 prompts" is gone site-wide. Canonical N=34 across `/under-the-hood` ("34 prompts × 3 arms, blind judge", `under-the-hood/page.tsx:61`) and `/methodology` ("N=34", "34-prompt blind-judged validation set", `methodology/page.tsx:96,104,123`).
- A regression test locks it: `landing/app/_components/wave12-benchmark-n.test.ts` asserts no page matches `/142\s*prompts/i`.
- "N=34 is a small set — only medium-to-large effects detectable" caveat retained (`methodology/page.tsx:138`). Benchmark reproducible (`wave1-benchmark/README.md`).
- **5**: every quant claim cited, ranged not absolute, the one prior honesty inconsistency eliminated and fenced by a test.

## C3 — Technical depth — **5/5** (was 4 — gap closed by PR-F)

- DoRA explained with an **inline SVG decomposition diagram** (`under-the-hood/page.tsx:125`) showing magnitude × normalized direction (`:136-144`).
- **HF PEFT citation** present (`:146`, `use_dora=True` one-flag framing) and **2026 Fused Triton kernels** mention (`:147`, D5-3).
- **Routing-engine explainer** — the exact v1 gap — now on the page: `classify.js` regex + `arbiter` pipeline and the hook-vs-proxy argument, with repeated line-cited references (`:152-179`).
- 2026 model currency: **Qwen3-Coder-Next** headline with **SWE-bench** numbers (`:69`, D2/D5-6).
- **5**: all three technical pillars (quantization, LoRA/DoRA, routing engine) now explained with a diagram + citations. The single thing the v1 5-mark demanded (routing internals) is shipped.

## C4 — Build-with-Claude credentials — **5/5** (was 2 — LIVE in prod)

- Footer credit live: "Built for Claude Code & made with Claude Code · routes across Anthropic's Claude models (Opus · Sonnet · Haiku)" (`landing/components/Footer.tsx:129`).
- Honest: mooter genuinely is built for + on Claude Code, and routes across the named Anthropic models.
- **5**: Anthropic credited and prominent (global footer, every page), not buried.

## C5 — Value-prop clarity — **5/5** (was 4 — gap closed by PR-G)

- **Hero persona subline**: "For a vibe coder on a Max plan: renames, commits & explains run local (free); …" (`landing/app/page.tsx:48`) — the condensed persona+task-split line the v1 5-mark wanted.
- **Concrete persona case** on `/methodology`: "Solo founder, Claude Code Max plan, RTX 4090, ~80 prompts/day, ~8% critical." with the worked savings split (`methodology/page.tsx:88-96`, D6-2), tied to the N=34 benchmark not a marketing number.
- Audience ("vibe coder"), concrete tasks ("renaming a variable"), quantified savings (calculator + N=34 cost table), and the full `/compare` v2 table (now incl. Cline / Aider / Roo Code) all retained.
- **5**: persona + plan + $ + task-split pinned in one line on the hero and expanded with a verified case on `/methodology`.

---

## Definition-of-Done cross-check (Wave 12 §4)

| # | DoD criterion | Status | Evidence |
|---|---|---|---|
| 1 | Rubric all 5/5 = 25/25 | ✅ | this doc |
| 2 | `/compare` incl. Cline + Aider + Roo Code | ✅ | `compare/page.tsx` (3 hits each) |
| 3 | `/under-the-hood` Qwen3-Coder-Next + SWE-bench | ✅ | `under-the-hood/page.tsx:69` |
| 4 | DoRA diagram + PEFT + Fused Triton | ✅ | `:125,146,147` |
| 5 | classify.js + hook explainer | ✅ | `:152-179` |
| 6 | `/privacy` opt-out + no-prompt-text + cloud contrast | ✅ | `privacy/page.tsx:16,22` |
| 7 | Hero condensed persona+$ subline | ✅ | `page.tsx:48` |
| 8 | `/methodology` concrete persona case | ✅ | `methodology/page.tsx:88-96` |
| 9 | Dashboard per-task + all-Opus + misroute | ✅ | PR-H #67 "Savings depth" |
| 10 | `mooter feedback` works w/o login | ✅ | hub POST `/api/feedback` → **201** (Cowork) |
| 11 | Benchmark N consistent (no 142) | ✅ | reconciled + regression test |
| 12 | Prod tagged `v1.7.0-differentiation-pride`, 200 | ✅ | tag present; mooter.ai live |

All 12 green.

**Paulo Gate C:** review/dispute scores. If approved → `WAVE12_CLOSURE.md` sign-off.
