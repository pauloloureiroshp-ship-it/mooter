# Wave 12 — Differentiation, Depth & Showcase Pride Master Prompt

> **Goal**: take Mooter from "warm-intro ready" (Wave 11 v1.6.1) to **"the obvious choice for hard
> vibe coders on Claude Code Max"** — depth of explainer, currency of model claims, comparison vs
> 2026 competitive landscape (Cline/Aider/Roo Code/OpenRouter/LiteLLM/Continue.dev), Anthropic
> showcase pride, and a dashboard that closes the feedback loop.
>
> **Scope** (Cowork audit 2026-06-02): Balanced — fixes all rubric C3 (Technical depth) and C5
> (Value prop) gaps from `ANTHROPIC_SHOWCASE_RUBRIC_V1.md` to bring both to **5/5**, lands
> 2026-current model list, deepens dashboard, hardens privacy page, and ships PR-C feedback
> anonymous via hub (carried over from Wave 11.1).
>
> **Estimate**: 18-25h CC + ~2-3h Paulo (gates + design choices + incognito re-validate). 4-5 days.
>
> **Prerequisite**: Wave 11 Day 4 (Paulo incognito E2E test) must complete first. If Day 4 hits
> blockers, fix those in Wave 11.1 before Wave 12.
>
> **Honesty discipline (non-negotiables)**:
> - `classify.js` byte-identical (P11 lockfile gate active)
> - No invented benchmark numbers — every quant claim needs citation
> - No "revolutionary" / "Same results" / "10x" hype
> - No PII in telemetry (anonymous HMAC user_id_hash)
> - No `--no-verify` / `git add -A` / direct main merges
> - Auto-merge ONLY for dev

---

## 0. Why Wave 12 (the audit findings)

Cowork audited mooter.ai live + did competitive research (LLM routers 2026) + LoRA/DoRA
explainer best practices 2026-06-02. Findings categorized below.

### Gaps found in current prod (v1.6.1):

| # | Gap | Page | Severity |
|---|---|---|---|
| G-1 | **Benchmark N inconsistency**: `/under-the-hood` says "142 prompts blind judge"; `/methodology` says N=34 | `/under-the-hood` line ~50 | 🔴 critical (honesty) |
| G-2 | **Local models stale (2024-2025)**: qwen2.5-coder, qwen3:30b, gemma3:12b, deepseek-r1:7b — none are 2026 SOTA | `/under-the-hood` | 🟠 important |
| G-3 | **Compare table missing 2026 competitors**: shows Claude Code default, LiteLLM, Continue.dev, OpenRouter only. Missing Cline (58.6k stars VSCode ext), Aider (terminal-native git-first), Roo Code (Cline fork with multi-mode) | `/compare` | 🟠 important |
| G-4 | **Privacy page misses opt-out + "no prompt text transmitted"**: HMAC + DP + k-anon present but `MOOTER_TELEMETRY=off` + explicit "no prompt content" not surfaced | `/privacy` | 🟠 important |
| G-5 | **DoRA explainer thin**: "separates magnitude from direction" is one sentence; no diagram, no HF PEFT citation, no 2026 Fused Triton mention | `/under-the-hood` | 🟠 important |
| G-6 | **Rubric C3 = 4/5**: missing classify.js/hook explainer | `/under-the-hood` | 🟠 important |
| G-7 | **Rubric C5 = 4/5**: missing condensed persona+$ line (e.g. "Solo founder on Max plan, $200/mo Opus burn → ~$30/mo saved") | `/`, `/methodology` | 🟠 important |
| G-8 | **Dashboard depth insufficient**: shows decisions log + savings $ but not per-task-type breakdown, no misroute report, no "what you'd have spent on all-Opus" comparison | `/dashboard` (signed-in) | 🟠 important |
| G-9 | **Adapter Forge teaser is impressive but un-actionable**: Wave 5 ETA Q3 2026, eligibility 30 days+200 decisions, no waitlist or signup | `/under-the-hood` end | 🟡 polish |
| G-10 | **Feedback flow login-gated** (Wave 11 PR-C deferred): kit promises "anonymous feedback" but CLI requires `mooter login` | `packages/cli/feedback` + `/api/feedback` | 🔴 critical (kit promise) |

### What `/under-the-hood` should look like in best-in-class 2026 (research synthesis):

**Hugging Face DoRA documentation** explains: "DoRA decomposes the pre-trained weight into two
components — magnitude (a scalar per output channel) and direction (a unit vector). LoRA's
low-rank update is applied only to direction; magnitude is updated separately. This split lets
the adapter be sharper for the same parameter budget."

**2026 Fused Triton kernels** (March 2026 arxiv): collapse the four-kernel DoRA composition
into a single pass → 1.5-2.0× faster inference, 1.5-1.9× faster gradient compute.

**Best practice**: start with half the rank of LoRA — Mooter's `r=32` could be `r=16` start
with comparable quality. Document this trade-off.

**2026 SOTA local coding models** (Spheron / Hugging Face / Local AI Master 2026 reports):
- **Qwen3-Coder-Next**: 58.7% SWE-bench Verified, 256K context, fits RTX 4090 24GB. Best overall local coding model.
- **DeepSeek V3.2-Speciale**: top for coding among open-source.
- **Llama 4 Scout**: 10M tokens context window — long-context champion.
- **GLM-5**: 77.8% SWE-bench Verified (best open-source overall).
- **Qwen3-Coder-Next 3B-active**: 70.6% SWE-bench with just 3B active params.

### Competitive landscape gap (what's missing from `/compare`):

**Cline** (58.6k GitHub stars VSCode extension, CLI 2.0 shipped early 2026): autonomous coding
agent, BYOK any model (local Ollama or cloud), MCP tools support. **Mooter's edge over Cline**:
in-process hook (no extension), per-prompt routing (Cline picks 1 model per session), tier
ladder T0→T3 explicit.

**Aider** (terminal-native, git-first): auto-commits, git-managed trust boundary. **Mooter's
edge**: routes per prompt; Aider users pick 1 model and pay accordingly. **Mooter's gap**:
no git integration.

**Roo Code** (Cline fork, multi-mode Code/Architect/Ask/Debug): pre-defined personas.
**Mooter's edge**: packs (7 Moo Packs) provide same concept but tier-aware; Roo Code's modes
all use same model.

**OpenRouter** (300+ models, 5.5% fee, default API for Cursor/Windsurf/Cline): single API key
to everything. **Mooter's edge**: $0 fee, hook in-process (not proxy), T0 stays local.

**LiteLLM** (self-hosted proxy MIT, $0 margin): teams with budget controls. **Mooter's edge**:
per-prompt routing not just gateway; T0 native; no Python infra to deploy.

---

## 1. The 7 dimensions Wave 12 must cover

Each dimension: **Recon → Test → Findings → Fix (PR gated) → Verify live**.

### Dimension 1 — Honesty fixes (CRITICAL)

**G-1 + G-10 are honesty blockers** for warm intro and Anthropic showcase. Fix first.

**Findings to fix**:

| # | Fix | Severity |
|---|---|---|
| D1-1 | **Benchmark N reconciliation**: decide canonical number. If `/under-the-hood` 142 prompts refers to a different/expanded test set, surface BOTH numbers + cite. If it was a copy error, fix to N=34. Reconcile across pages. Verify against `wave1-benchmark/README.md` | 🔴 critical |
| D1-2 | **Feedback anonymous via hub** (carryover Wave 11 PR-C): implement endpoint `/api/feedback` on hub CF Worker (reuses F-1 rate-limit infrastructure from Wave 10 Phase C.1). Landing forwards. CLI uses HMAC device-hash, no `mooter login` required. Updates kit promise live | 🔴 critical |

**Recon**:
```bash
# Reconcile benchmark numbers
cat wave1-benchmark/README.md 2>/dev/null | head -50
grep -rn "142\|N=34\|34 prompts" landing/app/ 2>/dev/null
# Recon hub /api/feedback path
ls hub/routes/
grep -rn "submit-events\|rate.limit" hub/routes/
```

**Fix policy**: 
- D1-1 → MUST reconcile before any other Wave 12 work
- D1-2 → MUST implement; landing-only fallback is acceptable if hub work too large for this wave (Cowork makes decision on architectural placement)

**Anti-pattern**: do NOT silently drop the 142 number if it was a real expanded test set. Honest disclosure ("first cohort N=34; expanded N=142 since") beats erasure.

---

### Dimension 2 — Local models refresh to 2026 SOTA

**G-2**: Mooter currently lists 2024-2025 local models. 2026 SOTA models (per research) deliver
GPT-4-equivalent performance on coding tasks at sizes that fit RTX 4090.

**Recon**:
```bash
grep -rn "qwen2.5-coder\|qwen3:30b\|gemma3:12b\|deepseek-r1\|qwen2.5:3b" landing/app/ tools/router/
ls tools/router/packs/
```

**Findings to fix**:

| # | Fix | Severity |
|---|---|---|
| D2-1 | `/under-the-hood` T0 model list: add Qwen3-Coder-Next (58.7% SWE-bench, 256K context, fits RTX 4090) as headline; keep current models as "v0.x compatibility list" if backwards compat matters | 🟠 important |
| D2-2 | Mention DeepSeek V3.2-Speciale + Llama 4 Scout + GLM-5 as alternatives with SWE-bench numbers | 🟠 important |
| D2-3 | Cite source (Hugging Face / Local AI Master 2026 / Spheron). Honest layer | 🟠 important |
| D2-4 | classify.js `recommended_model` for T0: confirm it picks 2026 SOTA when available locally (Ollama pull list update?) | 🟠 important — coordinate with CLI |

**Trade-off Paulo decides**: do we update the *recommended* T0 model in classify.js (and thus
the install.sh Ollama pull list) to Qwen3-Coder-Next? Or keep qwen2.5-coder as default for
stability and offer Qwen3-Coder-Next as "advanced" option? 

**Recommendation**: keep current default for stability; document Qwen3-Coder-Next as
"recommended upgrade" in `/under-the-hood` with `ollama pull` one-liner. Avoid breaking
existing installs. P11 invariant intact.

---

### Dimension 3 — `/compare` table v2

**G-3**: missing Cline, Aider, Roo Code. These are the 3 biggest 2026 competitors and what a
hard vibe coder evaluating Mooter will compare against.

**Recon**:
```bash
cat landing/app/compare/page.tsx | head -150
```

**Fix design**: expand current 5-column table to 8 columns adding Cline, Aider, Roo Code.
Suggested rows (add to existing):

| Row | Mooter | Claude Code default | LiteLLM proxy | Continue.dev | OpenRouter | **Cline** | **Aider** | **Roo Code** |
|---|---|---|---|---|---|---|---|---|
| Architecture | Hook (in-process) | Direct API | HTTP proxy | IDE plugin | API gateway | VSCode ext | Terminal CLI | VSCode ext fork |
| Local models (Ollama) | ✅ T0 native | ❌ | 🟡 configurable | ✅ | ❌ | ✅ Ollama+others | ✅ via BYOK | ✅ inherits Cline |
| Auto-routing by complexity | ✅ T0→T3 | ❌ Opus on all | 🟡 rule-based | 🟡 manual | 🟡 tags | ❌ one model per session | ❌ one model | 🟡 modes (Code/Arch/Ask) |
| Domain routing (packs/personas) | ✅ 7 Moo Packs | ❌ | ❌ | ❌ | ❌ | 🟡 via MCP | ❌ | ✅ 4 modes |
| Per-prompt overhead | 14ms p50 | n/a | 80-200ms | 120ms | 200ms cloud | n/a (manual) | n/a | n/a |
| Code/prompts leave machine | ❌ T0 stays local | ✅ | 🟡 depends | 🟡 depends | ✅ | 🟡 depends on model | 🟡 depends on model | inherits Cline |
| Open source / cost | MIT, $0 | n/a | MIT, $0 | Apache 2.0, $0 | Closed, 5.5% fee | Apache 2.0, BYOK cost | Apache 2.0, BYOK cost | inherits Cline |
| **Adapter / fine-tune support** | 🚧 Adapter Forge (Q3 2026) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **In-process (no extension/proxy)** | ✅ unique | n/a | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

**Findings to fix**:

| # | Fix | Severity |
|---|---|---|
| D3-1 | Add 3 new competitor columns | 🟠 important |
| D3-2 | Add 2 new rows: "Adapter/fine-tune support" + "In-process (no extension/proxy)" — these are Mooter's unique differentiators | 🟠 important |
| D3-3 | Footer note: "Comparison reflects 2026-06 state. Last reviewed: <date>." | 🟡 polish |
| D3-4 | Link each competitor name to their official site for credibility | 🟡 polish |

**Anti-pattern**: do NOT fabricate Mooter "wins" where they don't exist. If Cline has feature X
that Mooter doesn't, document it. Anthropic showcase rubric Honesty (#2) measures this.

---

### Dimension 4 — Privacy page hardening (rubric C1 → defend the 5/5)

**G-4**: page already scores 5/5 on rubric (HMAC, k-anon, DP) but is missing the user-facing
features that make privacy *demonstrable* to the visitor.

**Findings to fix**:

| # | Fix | Severity |
|---|---|---|
| D4-1 | Add section "**Opt out completely**": `MOOTER_TELEMETRY=off` env var OR `mooter quiet --telemetry-off`. Default-off after install (confirm with CC: is it actually default-off?). Cite code link | 🟠 important |
| D4-2 | Add section "**No prompt text transmitted**": only `{tier, latency_ms, model, task_category_label, anonymous_user_id_hash}` shipped. Even on opt-in, prompt content NEVER leaves the machine | 🟠 important |
| D4-3 | Add comparison vs cloud routers: "OpenRouter sees every prompt by design. LiteLLM proxy sees every prompt by design. Mooter's hook sits in-process — only post-classification metadata travels" | 🟠 important |
| D4-4 | Add "Audit it yourself" link to `tools/router/event_builder.js` (or wherever telemetry payload is constructed) — proves the claim | 🟡 polish |
| D4-5 | Add HMAC algorithm citation (SHA-256? what key derivation?) | 🟡 polish |

**Anti-pattern**: do NOT overclaim. If telemetry is opt-in by default-on (CC said earlier it's
default-off), confirm. Surface the actual install.sh behavior.

---

### Dimension 5 — `/under-the-hood` LoRA/DoRA depth (rubric C3 → 5/5)

**G-5 + G-6**: explainer is concise but missing visual + 2026 currency + classify.js mention.

**Findings to fix**:

| # | Fix | Severity |
|---|---|---|
| D5-1 | DoRA visual decomposition: simple ASCII or SVG diagram showing `W = m × (W_0 + B·A) / ||W_0 + B·A||` — magnitude scalar × normalized direction | 🟠 important |
| D5-2 | Add Hugging Face PEFT citation: `from peft import LoRAConfig; cfg = LoRAConfig(use_dora=True)` shows DoRA is one flag from existing infra. Lowers perceived complexity | 🟠 important |
| D5-3 | Mention 2026 Fused Triton kernels research (arxiv 2603.22276): 1.5-2× inference speedup, relevant for Wave 5 Adapter Forge runtime perf | 🟠 important |
| D5-4 | Add "Start with half the rank" note (HuggingFace best practice): Mooter's `r=32` could start at `r=16`. Document trade-off | 🟡 polish |
| D5-5 | classify.js + hook explainer (NEW section): the regex+arbiter pipeline in `<50ms`, why hook beats proxy (no double TLS, no marshaling). Cite line numbers | 🟠 important — fills C3 gap |
| D5-6 | Update model list per D2 (Qwen3-Coder-Next as headline 2026 model) | 🟠 important |

**Visual approach** (recommended): inline SVG diagram using shadcn primitives (no external img
assets to manage). Mooter brand color (rose for accent).

```
        Pre-trained W₀ (frozen)
              ▼
        ┌─────────────────────┐
        │   Direction update  │  ← LoRA: B·A (low-rank)
        │     B (r=32)        │
        │       ·             │
        │     A (r=32)        │
        └────────┬────────────┘
                 ▼
        Normalize (per output channel)
                 ▼
        ┌─────────────────────┐
        │  Magnitude scalar m │  ← DoRA's addition
        │  (one per channel)  │
        └────────┬────────────┘
                 ▼
        Final W = m × (W₀ + B·A) / ‖W₀ + B·A‖
```

---

### Dimension 6 — Hero / value-prop condensation (rubric C5 → 5/5)

**G-7**: hero and `/methodology` lack a 1-line condensed persona+$ statement that lands the
value prop in 5 seconds.

**Findings to fix**:

| # | Fix | Severity |
|---|---|---|
| D6-1 | Add tagline below hero "GotMoo?": **"Solo founder on Claude Max burning $200/mo on Opus? Mooter routes routine prompts to local models — typical savings $30-90/mo, no proxy, no extra bill."** (cite range from Wave1 benchmark scaled up) | 🟠 important |
| D6-2 | `/methodology` add concrete persona case: "Solo founder, ~80 prompts/day on Claude Code. Without Mooter: 100% Opus = ~$0.80/day = $24/mo (just for routing). With Mooter: 60% T0 local + 25% Haiku + 10% Sonnet + 5% Opus = ~$0.12/day = $3.60/mo. Saved: $20.40/mo, ~85%." (numbers Paulo verifies against real data) | 🟠 important |
| D6-3 | Hero "GotMoo?" decision: keep brand voice OR replace with persona statement. Paulo decides. **Default: keep "GotMoo?" + add persona subline** | 🟡 polish (no-op default) |

**Trade-off Paulo decides**: brand voice ("GotMoo?" + shepherd metaphor) vs corporate-friendly
positioning. Cowork audit notes Anthropic showcase audience may find shepherd metaphor
unconventional but it's also what makes Mooter memorable. **No change without Paulo sign-off.**

---

### Dimension 7 — Dashboard depth (signed-in `/dashboard`)

**G-8**: dashboard shows decisions log + savings $ but lacks the "wow factor close-loop" that
hard vibe coders expect from a 2026 product (per LLM observability research).

**Findings to fix**:

| # | Fix | Severity |
|---|---|---|
| D7-1 | **Per-task-type savings breakdown**: table showing "renames: $X saved (Y% local) · commits: $X (Y% local) · debug: $X (Y% local)" — proves where the savings actually come from | 🟠 important |
| D7-2 | **"All-Opus comparison" widget**: large number — "This week you'd have spent $X on all-Opus · You spent $Y · Saved $Z" — single most compelling number | 🟠 important |
| D7-3 | **Misroute report**: list user-flagged "wrong tier" decisions (Q9 from validation survey). Anonymous to admin, full prompt visible to user only. Allows in-product feedback loop | 🟠 important |
| D7-4 | **Tier-mix trend over time**: 30-day chart showing if local % is growing (success) or shrinking (concerning) | 🟡 polish |
| D7-5 | **Cost attribution by repo** (if `MOOTER_CWD` tracked): "This repo: 1240 prompts, $1.20 saved" — vibe coders love this | 🟡 polish |
| D7-6 | **"What we shipped because you asked" log** (linked from dashboard footer): public changelog of fixes triggered by `mooter feedback` — closes the loop and demonstrates user impact | 🟡 polish |

**Trade-off**: D7-1/D7-2/D7-3 are MUST for Wave 12. D7-4/D7-5/D7-6 nice-to-have, defer to
Wave 13 if scope tight.

---

## 2. Sequence (4-5 days)

### Day 1 — Recon + Honesty fixes (Dimension 1)

Block on D1-1 (benchmark N reconciliation) before any other work. Block on D1-2 (feedback
anonymous decision: implement OR document scope decision).

End-of-Day-1: `WAVE12_DAY1_FINDINGS.md` + decision on feedback architecture. Paulo Gate A.

### Day 2-3 — PRs squash→dev (Dimensions 2-7)

Recommended PR breakdown:

- PR-A: D1-1 benchmark N reconciliation (landing)
- PR-B: D1-2 feedback anonymous via hub (CLI + landing + hub)
- PR-C: D2 local models 2026 refresh (`/under-the-hood`)
- PR-D: D3 compare table v2 (Cline/Aider/Roo Code) (`/compare`)
- PR-E: D4 privacy hardening (`/privacy`)
- PR-F: D5 LoRA/DoRA explainer + diagram + classify.js section (`/under-the-hood`)
- PR-G: D6 hero condensed persona+$ + methodology case (`/`, `/methodology`)
- PR-H: D7 dashboard depth (D7-1/D7-2/D7-3) (signed-in `/dashboard`)

Each PR with tests + final-reviewer APPROVE. Squash→dev.

Tag `v1.7.0-rc1-differentiation-dev` after all 8 PRs in dev.

End-of-Day-3: Paulo Gate B (review subset of PRs).

### Day 4 — Promote dev→main + verify live

- Cowork merges PR dev→main `v1.7.0-differentiation-pride`
- Vercel auto-deploy
- Hub redeploy (if PR-B touches hub)
- CC re-runs Anthropic Showcase Rubric → target all 5/5 = 25/25
- CC re-runs Docker install test against prod (regression check)

Paulo Gate C — review rubric. Sign off "Wave 12 complete" OR list remaining blockers.

### Day 5 — Paulo re-incognito + closure

Same as Wave 11 Day 4 but on v1.7. Verify:
- Onboarding flow still works
- New copy lands correctly
- Dashboard shows new widgets
- `mooter feedback "wave 12 test"` works WITHOUT `mooter login` (D1-2 verify)

If pass → `WAVE12_CLOSURE.md` + sign-off. Validation 5 vibe coders gets even better experience.

---

## 3. Anti-patterns

- DO NOT ship Adapter Forge as functional (Wave 5 still pending). Teaser stays a teaser; clarify ETA.
- DO NOT touch `classify.js` (P11 byte-identical).
- DO NOT change "GotMoo?" brand voice without Paulo approval.
- DO NOT fabricate Mooter wins vs competitors in `/compare`.
- DO NOT overclaim privacy (e.g. "100% private" if telemetry default-on).
- DO NOT add features unrelated to differentiation/depth.
- DO NOT `git add -A`, `--no-verify`, or auto-merge to main.
- DO NOT cite benchmark numbers without `/methodology` link or `wave1-benchmark` source.

---

## 4. Definition of Done

Wave 12 is done when ALL of these are true:

1. ✅ Anthropic Showcase Rubric all 5 criteria = **5/5** (target 25/25 total, was 23/25 in Wave 11)
2. ✅ `/compare` includes Cline + Aider + Roo Code with honest comparison
3. ✅ `/under-the-hood` lists Qwen3-Coder-Next + SOTA 2026 alternatives with SWE-bench numbers
4. ✅ `/under-the-hood` has DoRA decomposition diagram + HF PEFT citation + 2026 Fused Triton mention
5. ✅ `/under-the-hood` explains classify.js + hook with line citations
6. ✅ `/privacy` has explicit "opt-out", "no prompt text transmitted", and cloud-router comparison
7. ✅ Hero has condensed persona+$ subline
8. ✅ `/methodology` has concrete persona case with verified numbers
9. ✅ Dashboard shows per-task-type savings + all-Opus comparison + misroute report
10. ✅ `mooter feedback "X"` works WITHOUT `mooter login` (D1-2 shipped)
11. ✅ Benchmark N consistent across all pages (D1-1 reconciled)
12. ✅ Vercel prod tagged `v1.7.0-differentiation-pride`, mooter.ai 200, no regressions

If any of 1-12 fails, Wave 12 stays open as `v1.7.0-rc-N` until fixed.

---

## 5. Failure case — honest fallback

If a critical dimension fails:

- **D1 honesty fix can't ship in time**: rollback to v1.6.1 + document blocker. Wave 12 re-opens after fix.
- **D7 dashboard depth too large**: ship D7-1/D7-2/D7-3 only, defer D7-4/D7-5/D7-6 to Wave 13.
- **D5 SVG diagram tricky**: ship text-only DoRA explainer + cite HF PEFT example code; defer diagram to Wave 13.

Document explicitly in `WAVE12_CLOSURE.md` with timeline for any deferrals.

---

## 6. Sources (all citable in copy)

### Competitive landscape 2026:
- [OpenRouter vs LiteLLM vs Portkey 2026](https://toolhalla.ai/blog/openrouter-vs-litellm-vs-portkey-2026)
- [Best LLM Routers 2026](https://www.clawrouters.com/blog/best-llm-routers-2026)
- [Best Local-First AI Coding Tools 2026 (14 compared)](https://nimbalyst.com/blog/best-local-first-ai-coding-tools-2026/)
- [Cline vs Continue vs Roo Code 2026](https://www.devtoolreviews.com/reviews/cline-vs-roo-code-vs-continue)
- [Claude Code Alternatives 2026 (Morph)](https://www.morphllm.com/comparisons/claude-code-alternatives)

### Local models SOTA 2026:
- [Best Local LLM for Coding 2026 (AI Hub)](https://overchat.ai/ai-hub/best-local-llm-for-coding)
- [Best Open-Source LLM Models 2026 (HuggingFace)](https://huggingface.co/blog/daya-shankar/open-source-llms)
- [DeepSeek V3.2 vs Llama 4 vs Qwen3 (Spheron)](https://www.spheron.network/blog/deepseek-vs-llama-4-vs-qwen3/)
- [Best Local AI Coding Models 2026 (Local AI Master)](https://localaimaster.com/models/best-local-ai-coding-models)

### LoRA/DoRA technical:
- [DoRA: Weight-Decomposed Low-Rank Adaptation (NVlabs)](https://github.com/NVlabs/DoRA)
- [DoRA Project Page](https://nbasyl.github.io/DoRA-project-page/)
- [Hugging Face PEFT LoRA docs](https://huggingface.co/docs/peft/developer_guides/lora)
- [Scaling DoRA: Factored Norms and Fused Kernels (arxiv 2026)](https://arxiv.org/abs/2603.22276)
- [LoRA Hugging Face course chapter 11](https://huggingface.co/learn/llm-course/chapter11/4)

### Dashboard / observability best practices:
- [10 LLM Observability Tools 2026 (Confident AI)](https://www.confident-ai.com/knowledge-base/compare/10-llm-observability-tools-to-evaluate-and-monitor-ai-2026)
- [Best LLM monitoring tools 2026 (Braintrust)](https://www.braintrust.dev/articles/best-llm-monitoring-tools-2026)
- [LLM Gateway Comparison 2026 (RelayPlane)](https://relayplane.com/blog/llm-gateway-comparison-2026)

---

## 7. Tracking

- `.planning/wave12/findings_dayN.md` — per-day log
- `docs/strategy/WAVE12_DAY1_FINDINGS.md` — Day 1 deliverable
- `docs/strategy/ANTHROPIC_SHOWCASE_RUBRIC_V2.md` — Day 4 re-scoring with target 25/25
- `docs/strategy/WAVE12_CLOSURE.md` — Day 5 final report
- Update SYNC.md after each Paulo Gate
- Notion HQ sub-page per session

Cowork handles MCP/Vercel + Chrome MCP smoke + competitive re-research if needed + Notion + memory.
CC handles filesystem audit + tests + PRs + Docker install + tag/release.

---

## 8. Kickoff command (paste into CC to start)

```
Inicia Wave 12 Differentiation, Depth & Showcase Pride conforme docs/strategy/WAVE12_DIFFERENTIATION_KICKOFF.md.

Scope: Balanced (audit + critical + important fixes, sem novas features fora de differentiation/depth).
VM test: tu corres em Docker node:20 bash sandbox para regression check pós-promote.
Pre-flight: Wave 11 v1.6.1 EM PROD, rubric ~23/25 ≥4 em cada (C3=4, C5=4 são os gaps que Wave 12 fecha para 5/5).

Day 1 BLOQUEIA em duas honesty fixes:
- D1-1 benchmark N reconciliation (142 vs 34 inconsistency entre /under-the-hood e /methodology)
- D1-2 feedback anónimo via hub (carryover Wave 11 PR-C, reusa F-1 rate-limit)

Resto da sequência:
- PR-A/B Day 1 (honesty)
- PR-C/D/E/F/G/H Day 2-3 (depth + comparison + privacy + hero + dashboard)
- Day 4 promote dev→main v1.7.0-differentiation-pride + re-rubric target 25/25
- Day 5 Paulo re-incognito + closure

Paulo Gates: A (post-Day-1 honesty), B (pre-promote Day 4), C (post-rubric Day 4).

Definition of Done: 12 critérios em §4. Falha = WAVE12_BLOCKERS.md + rollback honesto a v1.6.1.

Invariantes intactas: classify.js byte-identical (P11), no PII telemetry, no `--no-verify`, no auto-merge a main, no fabricated competitor comparisons, no overclaim privacy, no Adapter Forge ship (continua teaser com Q3 2026 ETA).

Arranca pelo Phase 0 (read context: STRATEGY.md, ANTHROPIC_SHOWCASE_RUBRIC_V1.md, wave1-benchmark/README.md, este kickoff) + Phase 1 recon honesty (D1-1 + D1-2). Reporta WAVE12_DAY1_FINDINGS.md no fim do Day 1 com decisão arquitectural sobre D1-2 (hub vs landing).
```

---

## 9. What Wave 12 makes possible

After Wave 12 ships:

1. **Anthropic showcase ready 25/25** — every dimension defendable, nothing to apologize for
2. **Competitive narrative clear** — visitor compares Mooter vs Cline/Aider/Roo Code/OpenRouter/LiteLLM and sees Mooter's unique slot (in-process hook + per-prompt routing + Adapter Forge teaser)
3. **Technical depth respected** — Q4_K_M + LoRA + DoRA + classify.js + hook all explained at a level that lands with hard vibe coders without being condescending
4. **Privacy demonstrable** — opt-out env var, no prompt text claim, code link, comparison vs cloud routers
5. **Dashboard closes the loop** — user sees per-task savings + all-Opus comparison + misroute report → believes the savings number
6. **Feedback anonymous** — kit promise honored, validation week unblocked end-to-end
7. **Models current** — Qwen3-Coder-Next, DeepSeek V3.2, Llama 4 Scout positioned correctly

This is what gets a friend to say "wait, this is actually better than what I have" instead of
"oh cool, another LLM tool."

---

**Composed by Cowork, 2026-06-02. Wave 12 supersedes Wave 11's C3+C5 gaps and ships PR-C
deferral. Validation 5 vibe coders benefits but is not blocked on Wave 12 (Wave 11 v1.6.1
already warm-intro ready for validation).**
