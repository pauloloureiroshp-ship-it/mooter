# Wave 23 — Mooter Audits Mooter (Mega Self-Audit)

> **The meta-wave**: Use Mooter para auditar Mooter. Validates the whole stack
> empirically + generates training data for LoRA + produces marketing artifacts.
>
> **Goal**: Run T0/T1/T2/T3 audit over the entire Mooter codebase. Output:
> AUDIT_REPORT.md + AUDIT_BENCHMARK.md + corpus.jsonl + validation.jsonl +
> lora_train.jsonl + tweet thread + blog post draft.
>
> **Trigger**: Wave 22 v1.12.0-honesty-foundation EM PROD. SubagentStop hot-reload
> validated (v165) + transcript-merge token tracker live (v167). Phase 0 redo
> needed para v167 SubagentStop schema regression.
>
> **Scope**: 1 audit pipeline · 5 phases · ~6h CC + ~3h Ollama runtime
> Tag dev `v1.13.0-self-audit-dev` → promote prod `v1.13.0-self-audit`
>
> **Non-negotiables**:
> - `classify.js` byte-identical (P11 sha256 `7b01eb86…87762`)
> - Wave 21 Day 2 `recordSpawn` preserved (fallback path)
> - Wave 22 token_tracker shape unchanged
> - Wave 13 subagent_tracker.snapshot() shape unchanged
> - **Audit output corpus 100% honest** — no synthetic data, no fabricated samples
> - **Zero PII in corpus** — strip user paths, secrets, env values
> - Zero hub touch (audit is tooling-only)
> - All summaries must include source line numbers for traceability

---

## 0. Pre-flight — Wave 22 prod discoveries (must read first)

### Discovery 1 — SubagentStop hot-reload (v2.1.165)

Confirmed in Wave 22 Day 0: SubagentStop fires once per spawn AND hot-reloads
mid-session. Hook handler can be tested in same session as edit (no fresh CC
needed for v165).

### Discovery 2 — "local-summarizer" actually runs cloud Haiku

**The big one for marketing**. When `ANTHROPIC_API_KEY` is present, the
`local-summarizer` subagent **actually executes on cloud Haiku (T1)**, not
Ollama (T0). Usage lives in a *separate subagent transcript* that the main
sync never read — hence the "~64% partial Ollama capture" was misleading.

Wave 22 22.C exposed this via divergence chip:
```
mooter → 🌱 T0 qwen3:30b · conf 0.80
         ⚠ exec T1 haiku · N calls
```

Wave 23 Phase 4 **quantifies** this gap precisely:
- Run audit 2× rounds: with API key (cloud) + keyless (Ollama)
- Compare quality + cost + latency
- Generate honest benchmark report

### Discovery 3 — CC v2.1.167 SubagentStop schema regression

CC auto-updated mid-wave-22 from v2.1.165 → v2.1.167. The new version broke
22.A herd file writer (schema may have changed or hook stopped firing).

Wave 23 Phase 0 includes empirical re-capture of v167 SubagentStop payload +
adjust handler. Fix lands as side-effect of audit setup.

---

## 1. Phase 0 — Setup + v167 schema recapture (~30 min)

### 0.1 Update CC settings.json for audit-aware logging

Add audit-mode SubagentStop hook that logs to corpus:

```json
"SubagentStop": [{
  "matcher": "*",
  "hooks": [{
    "type": "command",
    "command": "node /home/paulo/mooter/tools/router/subagentstop_audit_hook.js"
  }]
}]
```

### 0.2 v167 payload capture

Same trick as Wave 21 Day 2: debug stderr → spawn 1 prompt → cat log → document
schema in `WAVE23_PHASE0_V167_SCHEMA.md`.

### 0.3 Fix 22.A herd writer for v167

Update `subagentstop_hook.js` to use whichever field replaces `agent_type` /
`agent_id` in v167.

### 0.4 Audit infrastructure

Create `tools/audit/` directory:
- `audit_pipeline.js` — orchestrator
- `audit_corpus_builder.js` — Phase 1 worker
- `audit_validator.js` — Phase 2 worker
- `audit_insights.js` — Phase 3 worker
- `audit_benchmark.js` — Phase 4 worker
- `audit_pii_redactor.js` — common utility (strip paths/secrets)

**Estimate**: 30 min CC autonomous.

---

## 2. Phase 1 — Corpus generation (T0 Ollama heavy, ~3-4h)

### Scope

For each file in scan-list:
- `tools/router/*.js` (all router code)
- `tools/audit/*.js` (audit code itself — meta!)
- `hub/src/**/*.ts` (Cloudflare Worker)
- `landing/app/**/*.tsx` + `landing/components/**/*.tsx`
- `docs/strategy/*.md` (all wave briefs)
- Root `*.md` (CLAUDE.md, SYNC.md, README.md, MEMORY.md)

Approximate corpus size: **~400 files**.

### Pipeline per file

```javascript
for (file of scanList) {
  prompt = `Read ${file.path} and summarize in EXACTLY 5 lines, in PT-PT:
    line 1: purpose (what is this for)
    line 2: key exports / public API
    line 3: dependencies (imports + runtime)
    line 4: invariants / non-obvious claims
    line 5: test coverage (if test file referenced, name it)
  No preamble. Strict format.`;

  // Spawn local-summarizer subagent (Wave 22 path)
  spawnId = await spawn('local-summarizer', { prompt });

  // Output stored to corpus
  corpus.append({
    path: file.path,
    sha256: file.sha256,
    summary: spawnResult.output,
    actual_exec_tier: divergenceChip.tier,  // T0 or T1
    actual_model: divergenceChip.model,
    tokens_in: spawnResult.tokens_in,
    tokens_out: spawnResult.tokens_out,
    duration_ms: spawnResult.duration_ms,
    timestamp: Date.now()
  });

  await sleep(100);  // rate limit
}
```

### Output

`audit/corpus.jsonl` (~400 lines, ~80MB).

Plus `audit/corpus_stats.json`:
- Total files
- Total tokens T0 vs T1 (the divergence chip telling truth!)
- Cost actual (Ollama=$0, Haiku=$X)
- Cost vs all-Opus baseline
- Duration

### Honest tracking

The audit IS the validation. Each spawn must:
- Fire SubagentStop hook → write herd file
- Update token_tracker (Wave 22 22.B)
- Generate decision entry in decisions_v2.jsonl

If 22.A herd file STILL doesn't fire in v167 → audit fails fast (visible) →
Phase 0 needs another iteration.

**Estimate**: 3-4h Ollama runtime + ~30 min CC orchestration.

---

## 3. Phase 2 — Cross-validation (T1 Haiku, ~1h)

### Scope

For each corpus entry, validate summary against actual code:

```javascript
for (entry of corpus) {
  validationPrompt = `Compare this summary to the actual file content.
    Summary: ${entry.summary}
    File: ${readFile(entry.path)}

    Output JSON:
    {
      "drift_level": "none|minor|major",
      "evidence": ["specific discrepancy 1", "specific discrepancy 2"],
      "missing": ["fact the summary missed"],
      "fabricated": ["claim the summary made that's not in code"],
      "score_0_to_10": <accuracy>
    }`;

  // Spawn cheap-triage (Haiku T1)
  validation = await spawn('cheap-triage', { prompt: validationPrompt });
  validations.append({ ...entry, validation });
}
```

### Output

`audit/validation.jsonl` + summary stats:
- Drift histogram (% none/minor/major)
- Top 20 files with highest drift (these are bug candidates)
- Avg accuracy score
- Cost (Haiku ~$X)

### Why this matters

- T0 Ollama summaries can hallucinate
- T1 Haiku is more reliable but still might miss things
- Cross-validation catches both — honest about LLM limitations

**Estimate**: 1h Haiku runtime + ~30 min orchestration.

---

## 4. Phase 3 — Insights extraction (T2 Sonnet via model-reasoner, ~45 min)

### Scope

Aggregate validations into prioritized issue list:

```javascript
insightsPrompt = `Given these N validated file summaries with drift analysis,
identify the TOP 50 issues in the Mooter codebase, prioritized.

Categories:
  1. Duplicate functionality (2+ files doing same thing)
  2. Dead code (no consumer found)
  3. Stale docs (doc says X, code does Y)
  4. Missing tests (file has no test coverage)
  5. Architecture violations (mixed concerns, leaky abstractions)
  6. Security gaps (input not validated, secret in plaintext)
  7. Performance traps (sync I/O on hot path, n+1 queries)
  8. Branding leftover (frugal mentions remaining)
  9. Naming inconsistencies (wave2 vs Wave 2 vs wave_2)
 10. Inline TODOs/FIXMEs

For each issue:
- title
- category
- severity (high/medium/low)
- evidence (file path:line)
- estimated_fix_effort_minutes
- wave_candidate (e.g., "Wave 24 cleanup" / "blocker for next major")

Output JSON array of 50.`;

// Spawn model-reasoner (Sonnet T2)
insights = await spawn('model-reasoner', { prompt: insightsPrompt });
```

### Output

`AUDIT_REPORT.md` with:
- Executive summary (3 paragraphs)
- Top 10 critical issues (table)
- 50 prioritized issues (categories)
- Heatmap by directory
- Recommended Wave 24+ scope

**Estimate**: 45 min Sonnet + ~15 min orchestration.

---

## 5. Phase 4 — Benchmark + marketing (T3 Opus, ~45 min)

### Scope

Final synthesis + marketing artifacts. **The "Mooter audits Mooter" payoff**.

### 5.1 Cost breakdown

Generate `AUDIT_BENCHMARK.md` with:

| Phase | Tier | Tokens | Cost actual | Cost all-Opus baseline | Saved |
|---|---|---|---|---|---|
| 1 Corpus | T0+T1 | ~5.6M | $X | $120 | $115 (95.8%) |
| 2 Validate | T1 | ~800k | $Y | $40 | $35 (87%) |
| 3 Insights | T2 | ~200k | $Z | $20 | $5 (25%) |
| 4 Benchmark | T3 | ~50k | $W | $5 | $0 |
| **Total** | mixed | **~6.65M** | **$~A** | **$185** | **$~B (~85%)** |

### 5.2 Quality benchmark

Run 20 sample prompts through Q4_K_M quantized vs FP16 reference:
- Measure ROUGE-L / BLEU on summary outputs
- Subjective quality (Sonnet evaluates)
- Compute honest "% quality vs FP16" claim

Output: `audit/quantization_benchmark.json`.

### 5.3 LoRA training data export

From validated corpus (drift_level=none, score>=8):

```jsonl
{"prompt": "Summarize tools/router/classify.js purpose in 1 line", "completion": "Heuristic prompt classifier for the model router..."}
{"prompt": "...", "completion": "..."}
```

Output: `audit/lora_train.jsonl` (~300-400 high-quality samples).

### 5.4 Marketing artifacts

**Tweet thread draft** (10 tweets):
1. Hook: "We used Mooter to audit Mooter. Here's what we found."
2. Methodology: "T0 Ollama summarized 400 files. T1 Haiku validated. T2 Sonnet ranked issues. T3 Opus wrote the report."
3. Cost: "$X total vs $185 all-Opus baseline. 85% reduction."
4. Discovery 1: "local-summarizer actually runs cloud Haiku when API key exists. We show the gap."
5. Discovery 2: "Quantization quality: Q4_K_M ~99% vs FP16 on summarization."
6. Top issue: "[specific finding]"
7. LoRA data: "300 high-quality samples for adapter training."
8. Validation: "Mooter validated itself. Synthetic tests ≠ live."
9. CTA: "Try it: mooter.ai"
10. Repo: "Open source: github.com/pauloloureiroshp-ship-it/mooter"

**Blog post draft** in `audit/BLOG_POST_DRAFT.md`:
- "How we used Mooter to audit Mooter (and shipped Wave 23)"
- Methodology section
- Cost breakdown chart
- Discovery deep-dives
- Code samples
- Repo link

**README badge** in mooter README:
```markdown
[![Mooter audited itself](https://img.shields.io/badge/audited_by-mooter-green)]
(./docs/AUDIT_REPORT.md)
```

**Estimate**: 45 min Opus + ~30 min orchestration.

---

## 6. Sequência (~6h CC + 3-4h Ollama runtime)

### Day 1 — Phase 0 + 1 (~4-5h)
- 0.1-0.4 setup + v167 schema fix (~30 min)
- 1 corpus generation (3-4h Ollama overnight if needed)

### Day 1 (continued) — Phase 2 + 3 (~1.5h)
- 2 validation (~1h)
- 3 insights (~30 min)

### Day 1 (continued) — Phase 4 + closure (~1.5h)
- 4 benchmark + marketing (~45 min)
- Tests + classify guard + remove debug
- PR squash → `wave23-self-audit`
- final-reviewer T3 Opus (this one needs Opus due to scope)
- Tag dev `v1.13.0-self-audit-dev`

**Total**: ~6-7h CC + ~3-4h Ollama runtime (can run overnight).

---

## 7. Non-negotiables

| # | Item | Como verificar |
|---|---|---|
| 1 | classify.js byte-identical | sha256sum em cada commit |
| 2 | Wave 22 token_tracker shape | snapshot() unchanged |
| 3 | Wave 21 Day 2 recordSpawn preserved | grep present |
| 4 | Audit corpus 100% real | grep "fabricated" / "synthetic" / "TODO_FILL" = 0 matches |
| 5 | Zero PII | grep `/home/paulo` / `process.env` values / token strings = 0 in corpus |
| 6 | Zero hub touch | `git diff --name-only main` zero `hub/` |
| 7 | UserPromptSubmit intact | smoke test |
| 8 | Audit must validate itself | corpus includes `tools/audit/*.js` self-summaries |

---

## 8. Definition of Done

1. ✅ Phase 0 v167 SubagentStop schema documented + 22.A fix shipped
2. ✅ `audit/corpus.jsonl` exists (~400 entries)
3. ✅ `audit/validation.jsonl` exists with drift histogram
4. ✅ `AUDIT_REPORT.md` lists 50 issues prioritized
5. ✅ `AUDIT_BENCHMARK.md` shows cost actual vs baseline
6. ✅ `audit/lora_train.jsonl` has ≥300 samples score≥8
7. ✅ `audit/quantization_benchmark.json` (Q4_K_M vs FP16)
8. ✅ Tweet thread draft + blog post draft + README badge
9. ✅ classify.js sha256 = `7b01eb86…87762`
10. ✅ E2E validation: rerun 5 prompts after Phase 0 → 🐄 chip works v167
11. ✅ Tag prod `v1.13.0-self-audit` em main
12. ✅ Notion sub-page + SYNC.md update

---

## 9. Master prompt para CC (paste when ready)

```
Inicia Wave 23 Mooter Audits Mooter mega-audit conforme docs/strategy/WAVE23_MOOTER_AUDITS_MOOTER_KICKOFF.md.

Pré-flight: Wave 22 v1.12.0-honesty-foundation EM PROD (main 22b268b). 22.A herd file broken em CC v2.1.167 (Phase 0 fix candidate). 5/6 Wave 22 fixes live (T1 honest, divergence chip, branding, decisions sync, Stop digest v165). Discovery enorme: local-summarizer actually routes cloud Haiku quando API key existe.

Scope: 5 phases (0 setup + v167 fix, 1 corpus T0/T1, 2 validate T1, 3 insights T2, 4 benchmark T3 + marketing). Output AUDIT_REPORT.md + AUDIT_BENCHMARK.md + corpus.jsonl + validation.jsonl + lora_train.jsonl + tweet thread + blog post draft + README badge.

Lê PRIMEIRO:
  - docs/strategy/WAVE23_MOOTER_AUDITS_MOOTER_KICKOFF.md inteiro
  - tools/router/subagentstop_hook.js (Wave 22 22.A — needs v167 fix)
  - tools/router/token_tracker.js (Wave 22 22.B — preserve shape)
  - tools/router/post_tool_badge.js (Wave 21 Day 2 — fallback path)
  - tools/router/classify.js (P11 sha256 7b01eb86…87762 — NUNCA tocar)
  - tools/router/subagent_tracker.js (Wave 13 shape — preserve)
  - ~/.claude/settings.json + cache/changelog.md (v167 hints)

PHASE 0 RECON OBRIGATÓRIO (mesmo trick Wave 22 + Wave 21):
  1. Capture v167 SubagentStop payload via debug-only stderr handler
  2. Document v167 schema em docs/strategy/WAVE23_PHASE0_V167_SCHEMA.md
  3. Fix subagentstop_hook.js to use real v167 fields
  4. Re-validate 22.A live: 1 prompt → 🐄 chip shows N/M/peakK + herd file written
  5. Build tools/audit/ infrastructure (6 .js files conforme brief §0.4)

Non-negotiables:
  - classify.js byte-identical (P11 GUARD em cada commit)
  - Wave 21/22 trackers preserved
  - Zero PII em corpus (strip paths, secrets, env values via audit_pii_redactor.js)
  - Audit corpus 100% real (zero synthetic/fabricated samples)
  - Zero hub touch
  - Audit must validate ITSELF (corpus includes tools/audit/*.js)

Sequência (~6-7h CC + 3-4h Ollama):
  Phase 0 Setup (30 min): v167 schema + 22.A fix + audit infra
  Phase 1 Corpus (3-4h Ollama): ~400 files × local-summarizer 5-line strict-format summaries
  Phase 2 Validate (1h Haiku): cross-check vs actual code, drift analysis
  Phase 3 Insights (45 min Sonnet): top 50 prioritized issues in AUDIT_REPORT.md
  Phase 4 Benchmark (45 min Opus): cost breakdown + quantization quality + LoRA data export + marketing artifacts
  Closure (1h): tests + classify guard + PR squash → wave23-self-audit + final-reviewer Opus

Tag dev v1.13.0-self-audit-dev.

E2E VALIDATION GATE:
  - Paulo verifica AUDIT_REPORT.md top 10 issues quality
  - corpus_stats.json shows T0 vs T1 honest split (divergence chip data backed)
  - lora_train.jsonl has ≥300 high-quality samples
  - tweet thread + blog draft readable
  - 🐄 chip works in CC v167 after Phase 0 fix

NÃO promover prod até esse PASS.

Reporta findings em WAVE23_PHASE_X_FINDINGS.md por phase.

Marketing artifacts (tweet thread + blog) são draft — Paulo final approval antes de publicar.
```

---

## 10. Marketing rollout (post-prod tag)

**Day 0**: tag prod + Notion sub-page + SYNC update.

**Day 1**: Paulo aprova tweet thread + blog post + posts em ordem:
1. Tweet thread no X (link to blog)
2. Blog post no mooter.ai/blog (link to repo + AUDIT_REPORT.md)
3. README badge live
4. 3 friends-launch DMs (incorporando audit highlight)

**Day 2-7**: monitorar engagement + iterate based on feedback.

---

## 11. Expected outcomes

### Best case (90% probability)
- Audit reveals 30-50 actionable issues (mostly minor: stale docs, branding residual)
- Discovery 2 (Haiku-cloaked-as-local) quantified: "We promised local. Reality: 87% cloud. Here's why and how to fix."
- LoRA training data exports 300+ samples → Wave 24 trains adapter
- Marketing artifacts go viral-ish (~1k impressions tweet, ~50 stars repo)

### Realistic case (60% probability)
- Audit reveals 20-30 issues, mostly low-severity
- Marketing gets modest traction (~200 impressions, ~10 stars)
- Internal validation: confirms Wave 22 honesty foundation

### Worst case (10% probability)
- v167 SubagentStop completely broken → audit can't validate herd → fallback to Wave 21 Day 2 PostToolUse path (works)
- LoRA samples quality too low → defer adapter training
- Marketing rejected by Paulo as "not ready"

In all cases: codebase gets honest snapshot + Wave 24 backlog informed.

---

**Composed by Cowork, 2026-06-05 pós-Wave 22 prod. 5-phase mega-audit using
Mooter on Mooter. ~6-7h CC + 3-4h Ollama. Tag v1.13.0-self-audit. Marketing
unlock. Wave 24 backlog informed by real codebase audit.**
