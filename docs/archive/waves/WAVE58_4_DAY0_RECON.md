# Wave 58.4 — Day-0 Recon (HONEST)

**Date:** 2026-06-13
**Scope:** Block A only (read-only investigation, zero code).
**Gate:** Three findings change scope significantly → **STOP + ask Paulo before Block B** (per brief GATE RECON).

> Baseline: v1.38.3 (`tag v1.38.3-statusline-multiline-honest`). classify.js sha intact, not touched.

---

## A.1 — Q4 Provider emoji palette recon

**Where provider/model emoji render today — there are THREE independent maps, none matching the brief's proposed palette:**

| Location | Keyed by | Palette today |
|---|---|---|
| `tools/router/PostToolUse.js:16-26` `getModelEmoji()` | **model id** (per Bash call) | opus 🔴 · sonnet 🟡 · haiku ⚡ · ollama/qwen 🦙 · gpt/codex/openai 🟩 · gemini 💎 · fallback ❓ |
| `tools/router/gsd-statusline.js:951-958` `PROVIDER_ICON` (subscription rows) | **providerKey** | anthropic 🧠 · openai 💬 · google ♊ · xai ⚡ · mistral 🌬️ · fallback 📦 |
| `tools/router/gsd-statusline.js:1869-1871` `PROVIDER_ICON_INLINE` (compact pills) | **providerKey** | (same as above) |

Plus `gsd-statusline.js:440-453` `bucketFor()` maps model→display bucket (deepseek/gemma/local/gpt/gemini/grok/mistral) and is documented as **"Mirrors the emoji logic in PostToolUse.js"** — so the emoji convention is *already* duplicated across ≥2 files by design intent.

**Brief B.1 proposed palette:** anthropic 🟠 · openai 🟢 · codex 🤖 · gemini 💎 · ollama 🦙 · deepseek 🐳 · groq 🔥 · moonshot/kimi 🌙 · fallback 📦.

**Conflict (HONEST):**
- `anthropic 🟠` ≠ current 🧠 (sub rows) and ≠ 🔴 (per-call opus).
- `openai 🟢` ≠ current 💬 (sub rows) and ≠ 🟩 (per-call).
- `gemini 💎` = matches PostToolUse, ≠ ♊ (sub rows).
- `ollama 🦙` = matches both. ✅
- `codex 🤖`, `deepseek 🐳`, `groq 🔥`, `moonshot 🌙` = net-new (no current mapping).
- The brief's palette is keyed by **provider**, but there is **no single "provider chip"** in the statusline today. There are (a) provider *health dots* `●/○` (`renderProviderDots`, ~line 1601, 6 fixed providers, no emoji) and (b) per-**subscription** emoji rows. "Wire em gsd-statusline.js no provider chip render" (B.2) is therefore under-specified — no such chip exists to wire into.

**Decision needed from Paulo (gate):** see §GATE Q1.

---

## A.2 — Q10 Agents-progress recon vs Cursor 3

**`tools/router/agents-progress-status.js` already exists** (Wave 58 batch 2 A.1, 215 lines). Current state:
- Renders `🤖 X/Y done · 1m 12s · ↓42.3k tok · current: <agent>` from two REAL sources: `~/.mooter/workflows/active-run.json` (run pointer) + `subagent_tracker.snapshot().active` (live herd).
- **Honest degrade already implemented:** `🤖 ?` when no run + no live agent; each trailing piece omitted when its source is absent; tokens only rendered if the pointer carries them (Wave 28 pointer doesn't yet → omitted).
- **Opt-in** via `statusline_chips.agents_progress` / `MOOTER_STATUSLINE_AGENTS_PROGRESS=1`. Already wired into `chip-composer.js` `DEFAULT_ELIGIBLE` (line 65) and `CHIP_MODULES` (line 108).

**Cursor 3 (cursor.com/blog/3-0) Agents Window pattern** surfaces: list of active agent sessions, the repo each runs against, and a local/cloud split. **Mooter chip vs Cursor gap:**
- Mooter shows aggregate `X/Y done` + single `current:` agent name. ✅ covers "how many / which now".
- Mooter does **not** show: per-agent list, repo, local-vs-cloud split. (Cursor is a full *window*; Mooter is one statusline chip.)

**Assessment:** Block C is **already ~80% built**. The brief's C.2 target (`🤖 N agents · K/N running · primary-spawn-name`) is essentially the existing render with a "running" count added. The "no sidebar" guardrail (C.3) is already honoured. **Estimate revision:** Block C is closer to 30-45 min (polish), not 1-2h.

---

## A.3 — Q1 Pastor v2 LoRA/TF-IDF recon

**There is no file literally named "LORAUTER".** The "Pastor v2 TF-IDF" concept maps to three real artifacts:
- `tools/router/pastor-status.js` — existing chip. Reads `~/.mooter/pastor/adapters-active.json` → renders `🧠 pastor: N adapters · <type> active`. Falls back to `~/.mooter/pastor-hint.json` (`💡 …`). Returns `null` when neither exists.
- `tools/router/pastor-tune.js` — the "learning loop": chains `backtest.js → update-router.js → tuning-state.json`. `MIN_DECISIONS` default **100**. Reads `decisions.log` line count.
- `packages/router/src/fable-5-routing.ts:24-27` — confirms classify.js's confidence **is** "TF-IDF routing confidence" (the term is real and lives in the frozen classifier).

**State on Paulo's machine RIGHT NOW (HONEST):**
- `~/.mooter/` contains only: `auth.token`, `budget-config.json`, `device.id`, `preferences.json`.
- **No `~/.mooter/pastor/` dir, no `adapters-active.json`, no `pastor-hint.json`.**
- `decisions.log` = **66 lines** (below the 100-line tune threshold AND below the brief's suggested N≥50 default-on threshold if "N" counts adapters; at/above 50 if "N" counts raw decisions).

**Implication for Block D:** the new `🎓 Pastor v2 · N decisions · TF-IDF` chip would **correctly render silent** on Paulo's box today (no adapter state) → cannot be visually verified locally. Honest degrade is the spec, so this is acceptable, BUT we must define **what "N" counts** (registered adapters = 0, vs raw decisions.log lines = 66). See §GATE Q3.

---

## A.4 — Q2 Mode labels recon

`tools/router/gsd-statusline.js:1699-1713` (`modeBadge`):
- Renders **all three modes always visible**: `🐮 Moo · CrazyMoo · LazyMoo`.
- Only the **active** mode gets emoji + colour + bold; the inactive two render as **DIM plain text** (no emoji).
- Mapping: `mode===null` → 🐮 Moo (bold) · `mode==='beast'` → 🐂 CrazyMoo (danger/bold) · `mode==='zen'` → 🐄 LazyMoo (healthy/bold).
- **Explicit prior design decision (v6.9 comment, lines 1707-1709):** "all three modes always visible... Makes modes discoverable and removes ambiguity about which mode is active at a glance."

**Assessment:** the "redundancy" the brief targets (E.1) is the dim inactive text — which was a **deliberate discoverability choice**. Hiding the inactive modes (or `[+2]`) is a **visual UX change that reverses a prior decision** → per `feedback_ask_before_ux_changes`, needs Paulo's explicit before/after sign-off. See §GATE Q3.

---

## A.5 — Q8 Matrix expansion recon (BIGGEST scope change)

**Matrix is defined in `packages/router/src/specialization-matrix.ts:58-73` — `MATRIX_MODELS` (14 models):**

| # | model id | in seed w/ measured cells? | brief F.2 wants to "add"? |
|---|---|---|---|
| 1 | claude-opus-4-6 | ✅ measured | — |
| 2 | claude-opus-4-7 | ✅ measured | — |
| 3 | claude-opus-4-8 | ✅ measured | — |
| 4 | claude-sonnet-4-6 | ❌ empty | — |
| 5 | claude-haiku-4-5 | ❌ empty | — |
| 6 | **claude-fable-5** | ✅ measured | **YES — but ALREADY PRESENT** |
| 7 | **gpt-5** | ✅ measured | **YES — but ALREADY PRESENT** |
| 8 | gpt-5-3-codex | ✅ measured | — |
| 9 | gpt-oss | ❌ empty | — |
| 10 | gemini-3.1-pro | ✅ measured | partial (brief wants "Gemini 3 **Flash**" — different/cheaper variant) |
| 11 | deepseek-v3.2 | ❌ empty | partial (brief wants "DeepSeek **V4 Pro**" — newer version) |
| 12 | minimax | ❌ empty | — |
| 13 | qwen3.6 | ❌ empty | — |
| 14 | qwen3-30b (local) | ❌ empty | — |

**Categories:** `packages/router/src/task-categories.ts` — **24** categories (coding.* ×9, reasoning.* ×4, writing.* ×4, agents.* ×3, context.* ×4). → **14 × 24 = 336 cells**, of which **only 14 cells are measured** (7 distinct models, ~1-2 cells each). The other **322 cells are honest-empty** (`measured:false`, awaiting adaptive learning).

**Seed:** `data/benchmark-seed-2026.json`, `_meta.as_of = 2026-06-12`, 14 cells, all measured.

**HONEST scope correction vs brief F.2:**
- **Fable 5 — already in the matrix** (row 6). Nothing to add. (And it's only matrix-presence; routing remains opt-in `@fable` — the matrix lists it, doesn't auto-route it.)
- **GPT-5 — already in the matrix** (row 7). Nothing to add.
- Genuinely NET-NEW models the brief names: **Kimi K2.6 (Moonshot)**, **Gemini 3 Flash**, **DeepSeek V4 Pro** (3, not 5).
- So `14×24 → 19×24` is **wrong arithmetic**: adding the 3 genuinely-new models → **17×24 = 408 cells**. To reach 19, we'd need 5 truly-new ids (brief double-counts Fable 5 + GPT-5).
- **Expansion is mostly empty scaffold:** new rows arrive `measured:false` unless we source real benchmarks. F.3 (TES + specialization scores per model) **cannot be honestly populated** without benchmark data → all-`?` per Doctrine V4. The "expansion" adds rows but near-zero *measured* intelligence.

**Sync constraint:** `tools/router/matrix-status.js:41-43` **hardcodes** `MATRIX_MODELS_COUNT=14`, `MATRIX_CATEGORIES_COUNT=24`, `MATRIX_TOTAL_CELLS=336`, with an explicit comment "bump both sides if the roster grows." So F.5 (chip text "19 mod × 24 cat") requires editing **both** `specialization-matrix.ts` AND `matrix-status.js` constants — and the matrix-status `.test.js` that asserts them.

**Allowlist:** `specialization-matrix.ts` IS allowlisted for additions (Wave 58 CLAUDE.md). `matrix-status.js` is in `tools/router/` (not frozen). `task-categories.ts` is allowlisted. ✅ All editable.

See §GATE Q2 — this is the biggest scope change.

---

## A.6 — Q13 Artificial Analysis MCP availability check

**HONEST:** The MCP servers connected to *this* Claude Code session are: Ahrefs, Canva, Cloudflare, Context7, Figma, Gmail, Google Calendar, Google Drive, Linear, Microsoft Learn, Notion, Sentry, Slack, Stripe, Supabase, Vercel, filesystem.

**There is NO "Artificial Analysis" MCP server connected.** Research (Q13) confirmed the product *exists* externally, but it is **not wired into Mooter or this session**. No endpoint is configured anywhere in the repo.

**For Wave 61 (future):** wiring it would mean adding an MCP server entry (likely via `claude mcp add` or `.mcp.json`) pointing at Artificial Analysis's published MCP endpoint, then a `benchmark-fetcher.ts` consumer that pulls model scores into the seed. **I will not fabricate an endpoint URL** — the real endpoint must be located from Artificial Analysis's own docs at wire-time. Recommendation: this stays a Wave 61 item; Wave 58.4 does **not** depend on it.

---

## Block-by-block readiness summary

| Block | State after recon | Estimate revision |
|---|---|---|
| B (emoji palette) | **Design conflict** — 3 existing maps, brief palette matches none; no single "provider chip" exists | Blocked on GATE Q1 |
| C (agents polish) | **~80% already built** in agents-progress-status.js; honest degrade done; wired | 30-45 min (was 1-2h) |
| D (Pastor chip) | Mechanism real (TF-IDF/tune loop); **state empty on this box** → chip silent locally | OK; needs GATE Q3 (what "N" counts) |
| E (mode labels) | Already dims inactive; brief reverses a deliberate v6.9 discoverability decision | Blocked on GATE Q3 (UX sign-off) |
| F (matrix) | **Fable 5 + GPT-5 already present**; only 3 genuinely-new models; mostly empty cells | Blocked on GATE Q2 |
| A.6 (AA MCP) | **Not connected**; defer to Wave 61, no endpoint fabricated | Done (documented) |

---

## GATE — decisions required before Block B

**Q1 (Block B emoji palette):** The proposed palette conflicts with 3 existing maps and there's no single "provider chip" to wire it into. Options: (a) make `provider-emoji.js` the SSOT and *refactor* the existing PostToolUse/statusline maps to it (bigger, touches frozen-ish display code, needs UX sign-off); (b) ship `provider-emoji.js` + tests as a pure module only, wire it into a *new* explicit provider chip later; (c) drop the brief palette and keep the existing 🧠/💬/♊ convention. **My recommendation: (b)** — ship the pure module + tests now (honest, zero visual regression), defer wiring until the target chip is specified.

**Q2 (Block F matrix):** Fable 5 and GPT-5 are already in. Only Kimi K2.6, Gemini 3 Flash, DeepSeek V4 Pro are net-new (→ 17×24, not 19×24), and they'd land as empty/unmeasured rows unless we source benchmarks (web-search prices ≠ benchmark scores). **My recommendation:** add the 3 genuinely-new ids with web-searched *prices* in the live pricing SSOT (`tools/router/pricing.js` — the dated `cost.ts` snapshot stays frozen), leave specialization cells honest-empty (`measured:false`), update the chip to the *real* new count (17), and skip the fabricated "19".

**Q3 (Blocks D + E UX):** (a) Block D — does "N" in the Pastor chip count registered adapters (0 today) or raw decisions (66 today)? (b) Block E — hiding/collapsing inactive mode labels reverses the v6.9 discoverability decision and is a visual change → needs your before/after sign-off per the "ask before UX changes" rule.

**classify.js sha:** untouched, intact. No code written in Block A.

---

## GATE RESOLVED — Paulo's decisions (2026-06-13)

- **Q2 (Block F):** Add the 3 genuinely-new models (Kimi K2.6, Gemini 3 Flash, DeepSeek V4 Pro) with **web-searched prices only** in `tools/router/pricing.js` (the live pricing SSOT — NOT the dated `cost.ts`/`pricing-snapshot-2026-05-27.json`, which stays frozen for reproducibility, so the new models' TES reads honestly "pending price"); specialization cells stay honest-empty (`measured:false`); chip becomes **"17 mod × 24 cat"** (real count, not the brief's "19"). No fabricated scores. Fable 5 + GPT-5 already present → not re-added.
- **Q1 (Block B):** Ship `provider-emoji.js` + `provider-emoji.test.js` as a **pure module only**. No visual wiring this wave (zero regression to the existing 🧠/💬/♊ maps). Wiring deferred until a target chip is specified.
- **Q3 (Blocks D + E):**
  - **D (Pastor chip):** "N" counts **decisions.log lines** (66 today, ≥ the 50 default-on threshold → chip will show). Honest-silent when N=0.
  - **E (mode labels):** **Keep as-is.** Do NOT collapse/hide inactive modes — the v6.9 discoverability decision stands. **Block E = no code change.**

**Final PR plan (Paulo's regrouping, 2026-06-13):**
- **PR α:** this recon doc + Block F matrix expansion (3 models + `pricing.js` prices + `matrix-status` constants 14→17 / 336→408 + tests) + Block G `PASTOR_RESEARCH_VALIDATION.md`.
- **PR β:** Block B `provider-emoji.js` + tests (pure SSOT module, unwired).
- **PR γ:** Block D Pastor chip (`pastor-lora-status.js` + tests + `chip-composer.js` wire).
- **PR δ:** Block C agents-progress polish (`agents-progress-status.js` + tests) + Block E mode-labels decision (comment-only in `gsd-statusline.js`).
- Tag `v1.38.4-quartet-chips-matrix-honest` after all four merged. final-reviewer SHIP gate before each push.
