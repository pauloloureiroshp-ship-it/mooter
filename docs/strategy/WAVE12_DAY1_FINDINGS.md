# Wave 12 — Day 1 Findings (honesty recon) + Gate A

> CC, 2026-06-02. Day 1 blocks on two honesty fixes (D1-1, D1-2). Prod baseline
> `v1.6.1-anthropic-credit` (rubric ~23/25; C3=4, C5=4 are the gaps Wave 12 closes).
> No code changed Day 1. **Paulo Gate A** = approve D1-1/D1-2 + 5 architectural decisions.

## D1-1 — Benchmark N inconsistency (🔴 honesty)

- **Canonical = 34.** `packages/router/scripts/wave1-benchmark/README.md:7` "over **34 prompts** × 3 arms + a blind judge"; :20 "102 rows (34×3)"; the published cost numbers $0.02239 / $0.02799 / $0.03366 (Pastor/Sonnet/Opus, :24-26) are this N=34 run.
- **The "142" is fabricated** — `landing/app/(marketing)/under-the-hood/page.tsx:61` "Source: mooter benchmark, **142 prompts**, blind judge". No 142-prompt run exists anywhere in `packages/router/scripts/` (only wave1=34 and wave2-benchmark). `/methodology` already says 34 correctly (:92, :111, :126).
- **Fix:** `/under-the-hood:61` `142` → `34` (match canonical). Trivial, landing-only.
- **Note:** this is the same "142" the Wave 10 kickoff wrongly stated and I corrected to 34 then — it survived in /under-the-hood. Recommend a grep-guard test so it can't recur.

## D1-2 — Feedback anonymous (carryover Wave 11 PR-C)

- Today: `packages/cli/src/commands/feedback.ts` requires `mooter login` (Bearer) → POSTs `mooter.ai/api/feedback` (Supabase, authed). `/admin/feedback` reads the **Supabase** `feedback` table.
- **The hub has NO feedback route** (`hub/routes/`: delta, events, heartbeat, models, stats, version). It has `feedback_signals` only as an aggregate field inside `delta` (followup/accepted rates) — not free-text feedback.
- **Anon-via-hub = real work:** new hub route (e.g. `POST /api/feedback`) + hub D1 `feedback` table + reuse F-1 rate-limit (Wave 10 C.1, profile/IP cap, fail-open) + PII rejection (mirror the CLI's email regex) + **a way for Paulo to read it** (the hub D1 is separate from Supabase, so `/admin/feedback` would need a new hub-backed tab OR the existing `lib/hub.ts` aggregate path) + hub redeploy.
- **Anon-via-landing = simpler but worse:** migration 009 (`grant submit_feedback to anon`) + accept anon at `/api/feedback`, keeps Supabase storage (so `/admin/feedback` works unchanged) BUT opens an **unauthenticated insert on a Vercel route with no rate-limit** (spam surface — the hub has rate-limit infra, the Vercel route does not).

---

## Gate A — 5 architectural decisions (my recommendation on each)

**1. Benchmark N: 142 vs 34 — disclose both or pick canonical?**
→ **Pick canonical 34.** 142 is not a real run (no artifact anywhere); "disclosing both" would legitimize a fabricated number. Fix /under-the-hood → 34. *(Recommend.)*

**2. Feedback architecture: hub vs landing?**
→ **Hub.** It's the architecturally correct home for anonymous, rate-limited ingestion (F-1 already shipped; no need to grant anon insert on Supabase, no unguarded Vercel insert). Cost: new hub route + D1 table + hub redeploy + an admin read path (new `/admin/feedback` hub tab, or surface via `lib/hub.ts`). Worth it for a public launch. *(Recommend — accept the extra work.)*

**3. classify.js default model: switch to Qwen3-Coder-Next, or keep qwen2.5-coder + recommend upgrade?**
→ **Keep qwen2.5-coder as the default; recommend Qwen3-Coder-Next as an upgrade in docs/recommendations.** `classify.js` is P11 byte-identical — changing the hardcoded default touches it (risk) and would assume every fresh install can pull the newer model. Keep the stable default; surface the 2026 SOTA models on `/under-the-hood` + as a `mooter` recommendation. *(Recommend — no classify.js change.)*

**4. Brand voice: keep "GotMoo?" + persona subline, or replace?**
→ **Keep "GotMoo?" + add the persona subline.** You flagged GotMoo as no-change-without-sign-off; it's memorable and the rubric C5 gap is the missing *persona+$ subline*, not the H1. Add the subline, keep the H1. *(Recommend.)*

**5. D7 dashboard scope: D7-1/2/3 only, or full D7-1..6?**
→ **D7-1/2/3 only (must).** Those three = DoD #9 (per-task-type savings + all-Opus comparison + misroute report). D7-4/5/6 are polish — defer to keep Wave 12 balanced and shippable in the day budget. *(Recommend the must-set.)*

---

## Day 2-3 PR plan (gated on Gate A)
PR-A D1-1 benchmark N (landing) · PR-B D1-2 feedback anon (per decision #2) · PR-C 2026 models (per #3) · PR-D compare v2 (Cline/Aider/Roo) · PR-E privacy hardening · PR-F LoRA/DoRA + classify/hook explainer (closes C3→5) · PR-G hero persona subline + /methodology persona case (closes C5→5) · PR-H dashboard depth (per #5). Each squash→dev + final-reviewer. **Gate B** pre-promote, **Gate C** post-rubric (target 25/25). Invariants: classify.js P11, no PII, no fabricated competitor wins, no privacy overclaim, Adapter Forge stays teaser (Q3 2026 ETA).
