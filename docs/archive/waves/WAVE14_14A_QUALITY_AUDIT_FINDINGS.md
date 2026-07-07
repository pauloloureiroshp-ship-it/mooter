# Wave 14 — 14A Quality Audit Findings

> **Date**: 2026-06-04
> **Auditor**: Cowork via Chrome MCP (signed-in pages) + Read tool (code)
> **Scope**: signed-in pages (`/dashboard`, `/settings`, `/onboarding`, `/admin`) vs landing
> (`/`, `/under-the-hood`, `/compare`, `/privacy`) brand parity, telemetry flow,
> Moos local, security lightweight.
>
> **Verdict provisório**: **CRITICAL findings** que justificam Wave 14 Pre-Validation
> Sweep antes de qualquer outreach a vibe coders. UI signed-in está claramente em estado
> v0.9 frugal-era (52 dias atrás), enquanto prod CLI está em v1.8.2. Gap brand drástico
> entre landing polished e área logada legada.

---

## 0. Audit methodology

1. Chrome MCP navigate to mooter.ai (landing) → screenshot baseline
2. Chrome MCP navigate to `/dashboard`, `/settings`, `/onboarding` → get_page_text + screenshot
3. Compare visual identity, copy, version labels, feature promises
4. Cross-reference with memory (Wave 4 Phase D status, Wave 5 status, current prod tag)

---

## 1. CRITICAL findings (🔴 3)

### 🔴 F-1 — Visual brand split drastic landing vs signed-in

**Reproduce**: visit https://mooter.ai (landing) → dark theme + serif typography "Got Moo?" hero + top nav + Wave 12 polished design. Then https://mooter.ai/dashboard (signed-in) → cream/beige theme + sans-serif standard + left sidebar legacy + admin-panel-from-2020 feel.

**Impact**: vibe coders entering via OAuth GitHub will feel jarring transition Day 1 of validation. Wow factor broken **exactly when validation begins**. Brand consistency = trust signal; lack of it = "this product is unfinished".

**Fix path**: Sub-feature 14B Brand Parity sweep (CC autonomous ~2 days):
- Adopt landing palette tokens (dark theme · Tailwind config)
- Adopt landing typography (serif headers · sans body via same fonts)
- Adopt landing components (shadcn/ui)
- Top nav consistent across all signed-in pages (replace left sidebar)
- Keep `/admin` lower priority (Paulo-only)

**Estimate**: 2 days CC autonomous + Cowork visual review via screenshots.

---

### 🔴 F-2 — "v0.9" stamped across all signed-in pages

**Reproduce**: visit `/dashboard` → header shows "v0.9". Visit `/settings` → header shows "v0.9". Devices card shows "Windows · gpu-high · v0.9". Banner: *"Your CLI is on v0.9 — a newer major is out. Update with bash <(curl ...)"*.

**Why broken**:
- "v0.9" is **frugal-era version** (pre-rebrand 2026-04-14). Current prod CLI is **v1.8.2-digest-stderr-fix**.
- Cause: real-time CLI↔cloud sync was specified as **Wave 4 Phase D** which **NEVER shipped** (see STATUSLINE_V2_AND_USER_LIFECYCLE_ROADMAP.md). Last sync from Paulo's WSL was 52 days ago (when CLI was v0.9).
- Banner suggests "update CLI" but Paulo's CLI is already updated (v1.8.2). Confusing message.

**Impact**: testers will see "v0.9" label everywhere → assume product is **abandoned/old**. Bad first impression.

**Fix path** (2 options):
- **Option A — Quick win (1-2h CC)**: Push manual sync flow — `mooter sync` command exists; trigger heartbeat with current CLI version. Dashboard reads latest version from heartbeat. UI hides "v0.9" if last sync > 7d.
- **Option B — Ship Wave 4 Phase D properly**: CF Workers real-time sync. Much bigger scope (~1 week). Out of Wave 14.

**Recommendation**: Option A as 14A quick win + Option B as Wave 17+ backlog.

**Estimate**: 1-2h CC for Option A.

---

### 🔴 F-3 — Multiple "ships Wave X" promises for features that don't exist or already shipped

**Reproduce**: visit `/dashboard` → vê "Real-time CLI↔cloud sync ships Wave 4 Phase D (CF Workers backend)" + "Per-tier breakdown (T0–T3) ships Wave 4 Phase D" + "Per-task-type savings ... ships with the per-category telemetry pipeline (Wave 4 Phase D)" + "Misroute report — ... ships with the same pipeline" + footer "Adapter: ◌ baseline (LoRA ships Wave 5 · Adapter Forge)".

**Why broken**:
- **Wave 4 Phase D = NEVER shipped**: real-time CLI↔cloud sync. UI promises 4+ features behind this. Validation users will click "Per-tier breakdown" expectation → see "ships Wave 4 Phase D" message → conclude product is incomplete.
- **Wave 5 = SHIPPED** (2026-05-27 per PASTOR_OPERATIONS.md). "ships Wave 5" copy is **out of date** — LoRA Adapter Forge already shipped. `mooter forge install` command works.

**Impact**: visible to every signed-in user. Each "ships Wave X" message is a promise gap. Multiplies bad impression.

**Fix path**:
- Remove "ships Wave 4 Phase D" copy where features won't ship this quarter. Replace with honest "this feature ships in a future release" or just hide section.
- Remove "ships Wave 5" copy — Adapter Forge is **already available** via `mooter forge install`. Replace with "Run `mooter forge install` to activate LoRA adapter".
- Audit all `/dashboard`, `/settings`, `/onboarding` for "ships Wave X" strings → replace or remove.

**Estimate**: 30 min CC find/replace + visual review.

---

## 2. IMPORTANT findings (🟠 4)

### 🟠 F-4 — Stale stats display ($73.85 saved · 663 decisions · 52d ago)

**Reproduce**: `/dashboard` → "$73.85 SAVED" + "663 DECISIONS" + "100% SAVED VS ALL-OPUS" in giant hero, no "data is N days old" badge.

**Why broken**: stats are from last sync (52d ago). New user signing in fresh sees these numbers as fresh stats — but they're from someone else's session (Paulo's, in this case, last seen 2026-04-13).

**Impact**: validation tester signs in → sees giant "$73.85 saved" → thinks system shows their savings → confused when they don't accumulate.

**Fix path**:
- Add `DataSourceBadge` "Last sync 52d ago — outdated" on hero stats (similar to Wave 10 B.1a Demo/Live pattern).
- Hide stats hero if last sync > 7 days; show empty state with "Run `mooter sync` to populate".

**Estimate**: 1h CC (component already exists).

---

### 🟠 F-5 — Adapter "ships Wave 5 · Adapter Forge" copy stale

**Reproduce**: `/dashboard` footer: *"Adapter: ◌ baseline (LoRA ships Wave 5 · Adapter Forge)"*.

**Why broken**: Wave 5 shipped 2026-05-27. `mooter forge install` works. "ships Wave 5" message implies it's not yet available.

**Impact**: testers won't try `mooter forge install` because UI says "ships Wave 5" (future).

**Fix path**: Replace copy with `"Adapter: baseline · Run \`mooter forge install\` to activate LoRA"` + link to docs.

**Estimate**: 15 min CC.

---

### 🟠 F-6 — Recommendations not state-aware (already-installed models)

**Reproduce**: `/dashboard` → "🔴 Install qwen2.5:3b for fast T0" + "🟡 Install qwen3:30b for T0-smart". But Paulo's WSL2 Day 5 confirmed qwen3:30b is **already installed and being used** (statusline shows "via ollama").

**Why broken**: recommendations engine doesn't read current Ollama model inventory from sync. Suggests installing what's already installed.

**Impact**: testers ignore recommendations as noise. Lost opportunity to guide them.

**Fix path**:
- Recommendations engine reads `ollama list` output from CLI sync payload.
- Hide recommendation if model already installed.
- (Already partially addressed in Wave 10 B.2b.2 F-9 — but signed-in dashboard doesn't apply it.)

**Estimate**: 2h CC.

---

### 🟠 F-7 — Settings "Persona: Other" + "Hardware: windows nvidia" lowercase

**Reproduce**: `/settings` → "Persona: Other" (uppercase O ok) but "Hardware: windows nvidia" (lowercase, raw payload).

**Why broken**: Wave 10 B.2b.2 F-12 fixed win32→Windows in some places but not Settings hardware display. Persona display is right per Wave 10 B.2b.1 F-3 ("preserve Other") but no CTA "Change" beyond text.

**Impact**: cosmetic but inconsistent with landing polish.

**Fix path**: Apply `formatGpuLabel()` + `formatOsLabel()` to Settings hardware display.

**Estimate**: 30 min CC.

---

## 3. POLISH findings (🟡 5)

### 🟡 F-8 — Sidebar navigation legacy (left fixed) vs landing top nav

**Reproduce**: `/dashboard`, `/settings`, `/admin` all have left fixed sidebar with mooter logo + Dashboard/Settings/Admin links. Landing has top nav with mooter logo + Packs/Compare/Methodology/Privacy.

**Fix path**: Migrate signed-in to top nav matching landing.

**Estimate**: included in 14B Brand Parity sweep.

---

### 🟡 F-9 — "🐮" emoji vs mooter pixel logo inconsistency

**Reproduce**: `/dashboard` "🐮 CLI connected" + "🐮 Mooter dashboard" footer. Landing uses mooter pixel logo.

**Fix path**: Choose one (logo) — use across all surfaces.

**Estimate**: included in 14B Brand Parity sweep.

---

### 🟡 F-10 — Devices card shows "(win32)" platform label

**Reproduce**: `/settings` → "DESKTOP-J26409Q (win32)". Wave 10 B.2b.2 F-12 should have fixed this.

**Why broken**: F-12 fix may have been to sidebar only, not Settings devices card. Regression or incomplete fix.

**Fix path**: Apply `formatOsLabel()` to devices card platform field.

**Estimate**: 15 min CC.

---

### 🟡 F-11 — Onboarding wizard typography/palette beige stale

**Reproduce**: `/onboarding` → "STEP 1 OF 3" + "Your setup" header → beige/cream palette, sans-serif typography. Different from landing dark theme + serif headers.

**Fix path**: included in 14B Brand Parity sweep.

**Estimate**: ~4h within 14B (one of 3 pages to redesign).

---

### 🟡 F-12 — "Sign in with GitHub" CTA proeminence on landing

**Reproduce**: mooter.ai homepage → top right "Sign in with GitHub" small button vs "Install mooter →" larger pink CTA. Compete visually.

**Why concerning**: validation users may install CLI before signing up for account → miss onboarding flow → fragmented activation.

**Fix path**: Either:
- Make Sign in equally prominent.
- Funnel "Install mooter" through onboarding (require account first).

**Estimate**: depends on funnel decision — Paulo gate.

---

## 4. POSITIVE findings (🟢 to keep)

- ✅ OAuth GitHub flow works (Day 5 confirmed + Cowork audit).
- ✅ Wizard 3 steps functional + persona/hardware/providers captured.
- ✅ Wave 13 herd visibility working in WSL Claude Code (`🐄×N` chip).
- ✅ Anonymous feedback POST 201 working (Wave 12).
- ✅ Subscriptions display (Claude Max, Claude API, GPT Plus, Gemini).
- ✅ Devices card shows last sync timestamp + GPU class.
- ✅ Savings calculator interactive (`50 prompts/day · 2000 tokens · ~$31/mo`).
- ✅ Router context block copyable.

---

## 5. Severity-prioritized fix plan

### Day 1 (today) — quick wins (~3h CC)
- 🔴 F-3 — Strip "ships Wave 4 Phase D" + "ships Wave 5" copy → honest messaging
- 🔴 F-2 — Add "Last sync Nd ago — outdated" badge OR hide hero stats if stale
- 🟠 F-5 — Replace "Adapter ships Wave 5" with "Run mooter forge install"

### Day 2 — important fixes (~3h CC)
- 🟠 F-4 — DataSourceBadge on stats hero
- 🟠 F-6 — Recommendations state-aware (read ollama list from sync)
- 🟠 F-7 — Settings hardware formatGpuLabel + formatOsLabel
- 🟡 F-10 — Devices card formatOsLabel

### Day 3-4 — Brand Parity sweep (~2 days CC, Sub-feature 14B)
- 🔴 F-1 — Visual brand parity
- 🟡 F-8 — Top nav vs sidebar
- 🟡 F-9 — Logo consistency
- 🟡 F-11 — Onboarding palette
- 🟡 F-12 — Sign in CTA prominence (Paulo gate)

### Day 5 — closure
- Tag prod `v1.9.0-pre-validation-sweep`
- Notion daily log fechado
- Memória `project_mooter_wave14_quality.md`

---

## 6. Recommended order of operations

1. **AGORA** — Cowork audit Notion sub-page (this file content)
2. **Próximo CC** — Day 1 quick wins (F-3 + F-2 + F-5) → tag dev `v1.8.3-stale-copy-fix-dev`
3. **Día 2 CC** — Day 2 important fixes (F-4 + F-6 + F-7 + F-10) → tag dev `v1.8.4-state-aware-dev`
4. **Día 3-4 CC** — 14B Brand Parity (F-1 + F-8 + F-9 + F-11) → tag dev `v1.9.0-brand-parity-dev`
5. **Día 5** — Closure + tag prod `v1.9.0-pre-validation-sweep`

---

## 7. Outras sub-features status (handed off para depois)

- **14C — Statusline LoRA chip**: scope independente. Pode arrancar Día 2 em paralelo (~1h CC).
- **14D — E2E simulation**: depende de F-1/F-2/F-3 fixes para vale a pena.
- **14E — Security audit**: scope independente. Pode arrancar Día 3 em paralelo (~1 dia CC).

---

**Composed by Cowork via Chrome MCP audit + memory cross-reference, 2026-06-04
afternoon. 12 findings (3 critical + 4 important + 5 polish + several positive).
Severity-prioritized fix plan: 5 days CC autonomous + Cowork gates.**
