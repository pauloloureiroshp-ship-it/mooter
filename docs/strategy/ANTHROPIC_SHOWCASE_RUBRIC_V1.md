# Anthropic Showcase Rubric — v1 (Wave 11, Dimension 7)

> CC scoring, 2026-06-02, against prod `v1.6.0-warm-intro-ready`. 5 criteria, 0–5
> each. Target: ≥4 on EACH, ≥20/25 total (Wave 11 §4 criterion #4).
> Honesty discipline: scored as an independent reviewer would; a low score is a
> finding, not a failure to hide. Re-runnable for future revisions.

## Score summary

| # | Criterion | Score | Meets ≥4? |
|---|---|---|---|
| C1 | Privacy & data discipline | **5** | ✅ |
| C2 | Honesty in claims | **5** | ✅ |
| C3 | Technical depth | **4** | ✅ |
| C4 | Build-with-Claude credentials | **2 → 5** | ✅ **LIVE in prod** (PR #62 `0ea1fa5`, `v1.6.1-anthropic-credit`) |
| C5 | Value-prop clarity | **4** | ✅ |
| | **Total** | **20 / 25** | per-criterion bar fails on C4 |

**Verdict:** total clears 20/25; C4 was the only sub-4. **C4 fix shipped to dev (PR #61** — footer "Built for Claude Code & made with Claude Code · routes across Anthropic's Claude models (Opus · Sonnet · Haiku)"**)** → C4 → ~5. After PR #61 is promoted to prod, the rubric is **~23/25, ≥4 on every criterion** → Wave 11 §4 #4 MET. (C3/C5 5/5 bumps deferred to Wave 12 per Paulo.)

---

## C1 — Privacy & data discipline — **5/5**

- `landing/app/(marketing)/privacy/page.tsx`: "Prompts hashed — SHA-256 hash of each prompt, never the text" (:14); "Opt-in telemetry, defaults OFF; only aggregated stats leave" (:15); "k-anonymity threshold ≥50 · Differential privacy noise ε=1.0" (:23).
- Telemetry is **opt-out by default** (`packages/cli/src/commands/hub.ts:125` "opt-out (default · nothing collected)") with an explicit toggle `mooter quiet --telemetry-off` (`consent.ts:132`, `index.ts:68`).
- Server derives `user_id_hash` from the authed id; client never sends it (`landing/app/api/feedback/route.ts:39`); hub ingestion has no PII column.
- `/privacy` linked from footer.
- **5**: anonymous hashes, opt-out env/flag, audit-ready policy linked, no prompt text transmitted by default — all present.

## C2 — Honesty in claims — **5/5**

- Hero (post Wave 11 PR-A, `landing/app/page.tsx:37-43`): "Comparable quality on routine tasks, up to 90% less cost on T0-heavy sessions" + inline "See the benchmark *" → `/methodology`. Banned "Same results" removed.
- `/methodology`: "34-prompt blind-judged validation set" (:92), real costs $0.022/$0.028/$0.034 (:95-97), reproduce instructions (`tsx run.ts`, :117), and an explicit "N=34 is a small set — only medium-to-large effects detectable" caveat (:126).
- Benchmark public + reproducible (`packages/router/scripts/wave1-benchmark/README.md`).
- **5**: every quant claim cited, ranged (not absolute), benchmark reproducible.

## C3 — Technical depth — **4/5**

- `/under-the-hood` explains **quantization (Q4_K_M)** with a worked example (:26-54) and **LoRA/DoRA** (:7-8). Strong on the "why your laptop runs it" ML side.
- **Gap:** does NOT explain the routing engine — `classify.js` regex + arbiter, tier model, or the hook lifecycle (grep for classify/arbiter/hook/tier = none on the page). The 5-mark wants those too.
- **4**: two technical pillars (quant, LoRA) explained well with examples; routing-engine internals + a diagram would earn 5. (Optional Wave-12 bump.)

## C4 — Build-with-Claude credentials — **2/5** ❌

- The public marketing pages reference "Claude Code" only as the tool Mooter plugs into ("The AI shepherd for your Claude Code", `page.tsx:33`; "Claude Code defaults to Opus", :38).
- **No Anthropic credit, no "Made with Claude Code" badge, no Anthropic logo** anywhere on the public site. (The only `Anthropic`/`AnthropicLogo` hits are the signed-in dashboard AI-stack tile — internal, not a public credit.)
- **2**: Claude Code present as context but Anthropic is not credited/prominent — the rubric's 0–5 anchor for "logo missing or buried".
- **Fix to reach ≥4 (small landing PR):** add a footer credit/badge — e.g. "Built for Claude Code · routes across Anthropic's Claude models (Opus/Sonnet/Haiku)" with the Anthropic/Claude mark, and optionally a "Made with Claude Code" line. Honest (Mooter genuinely is built for + on Claude Code). Bumps C4 → 4–5.

## C5 — Value-prop clarity — **4/5**

- Audience explicit: "vibe coder" (`WhyLocalCards.tsx:5`, hero framing). Concrete task example: "even renaming a variable" (`page.tsx:38`). Quantified savings via the `/methodology` calculator + the N=34 cost table. Full `/compare` table vs LiteLLM/Continue/OpenRouter/Claude-Code-default.
- **Gap for 5:** no single condensed line pinning persona + plan + $ + task-split (e.g. "vibe coder on a Max plan: ~$X/mo saved; renames/commits/explain run local, debug/refactor go cloud").
- **4**: audience + tasks + quantified savings all present across pages; a one-line persona+$ statement on the hero would earn 5. (Optional.)

---

## Recommended action (Gate C)

1. **Required to pass the rubric:** one landing PR adding the **Anthropic/Claude-Code credit** (C4 → ≥4). Honest, ~15 min, footer + optional hero badge.
2. **Optional (Wave 12 candidates):** C3 routing-engine + hook explainer on `/under-the-hood`; C5 condensed persona+$ line on the hero.

With #1, the rubric is **22–23/25, ≥4 on each** → Wave 11 §4 criterion #4 met.

**Paulo Gate C:** review/dispute scores, approve the C4 fix (copy — needs your sign-off), decide C3/C5 now-vs-Wave-12.
