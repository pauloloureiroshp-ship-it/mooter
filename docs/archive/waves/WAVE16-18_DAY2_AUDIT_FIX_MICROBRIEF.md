# Wave 16–18 — Day 2: Audit Fix Microbrief

> **Goal**: fix the findings from the Moo Herd self-audit (Wave 16 statusline /
> Wave 17 data pipeline / Wave 18 accessibility) — **prioritised by blast radius**,
> not lumped together. The safe, launch-relevant landing fixes ship first; the
> statusline (`tools/router/`) and hub fixes are scoped separately because they
> carry real risk near `classify.js` and prod data.
>
> **Trigger**: `WAVE16_STATUSLINE_REALITY_AUDIT.md` + `WAVE17_DATA_PIPELINE_INTEGRITY.md`
> + `WAVE18_ACCESSIBILITY_AUDIT.md` (2026-06-05).
>
> **Headline reassurance from the audit**: 🔒 **privacy is sound** (PII redaction
> clean, per-user isolation verified, no cross-user leak, community pulse honest).
> Nothing below is a privacy leak — the findings are **honesty/staleness/polish**.

---

## ⚠️ Design-system reality (read first — this repo has NO Tailwind)

Styling = **CSS custom properties** (`--color-*` in `app/globals.css`) + **inline
`style={{}}`**. No `tailwind.config.ts`, no `bg-background`/`font-headline`, no
`components/ui/`. Fonts = Space Grotesk + JetBrains Mono (no serif). Reusable nav =
`components/NavBar.tsx`. Internal links = Next `<Link>`. **Specify all fixes in
those terms.** (See the design-system note at the top of `WAVE15_FRIENDS_LAUNCH_AUDIT_FINDINGS.md`.)

---

## Non-negotiables (all tiers)

- `classify.js` byte-identical (sha256 `7b01eb86…87762`) — **especially** Tier B, which edits `tools/router/`.
- Zero schema changes in Tier A/B; **hub touch only in Tier C** (and only after the decision below).
- Wave 14/15 dark theme + LoginHero intact.
- Tests + new per fix; `next build` ✓ (run locally — the unit CI misses route-export breaks); mobile 375px.
- No `/admin` content changes. No `git add -A`.

---

## TIER A — Landing-only a11y + link fix (SAFE, ship Day 2)

All in `landing/` CSS + pages. Low risk, high value, friends-launch-relevant.

### A1 — Focus indicators (WCAG 2.4.7) · med
`app/globals.css` has **no `:focus`/`:focus-visible`/`outline` rules** (verified). Keyboard users get no visible focus.
**Fix**: add a global rule, e.g.
```css
:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; border-radius: 2px; }
```
Verify it doesn't get suppressed by inline styles on the key CTAs (NavBar buttons, LoginHero "Continue with GitHub", onboarding chips).

### A2 — Muted-text contrast ≈ 4.1:1 (fails AA normal) · med
`--color-muted: #7A7168` on `--color-bg: #0B0A09` = **~4.1:1** (orchestrator-verified WCAG sRGB formula). Passes large text, **fails normal/small** — and `--color-muted` is used site-wide for small captions/disclaimers.
**Fix (pick one, Paulo's call — see Decisions)**:
- (a) lighten `--color-muted` to ~`#8A8076` (≈4.6:1) — one token, site-wide; **risk**: changes every muted text shade slightly. OR
- (b) keep `--color-muted` for large text only; introduce/`use --color-text` for small secondary copy (more surgical, more edits).
**Recommend (a)** + visual pass via the Playwright harness (`landing/scripts/visual/`).

### A3 — `/privacy` broken "security policy" link · low-med
`app/(marketing)/privacy/page.tsx:78`: `<a href="/privacy">Read the security policy →</a>` points back to `/privacy`.
**Fix**: point at the real security policy (confirm the URL — is there a `/security` page? if not, remove the second link or link the GitHub `SECURITY.md`). Use `<Link>`.

### A4 — Decorative SVGs missing `aria-hidden` · low
`CrookOutline` (landing hero h1 + Footer) has no `aria-hidden`/alt.
**Fix**: add `aria-hidden="true"` to purely-decorative SVGs (CrookOutline; audit others surfaced).

**Tier A tests**: source-level — globals.css contains `:focus-visible`; `--color-muted` new value; privacy link href ≠ `/privacy`; CrookOutline usages have `aria-hidden`. Optional: a small pure contrast-ratio unit test asserting muted ≥ 4.5:1.
**Tier A tag**: dev `v1.9.4-a11y-fixes-dev`.

---

## TIER B — Statusline honesty (CAREFUL — `tools/router/`, near classify.js)

Edits `tools/router/statusline-multi.js` (+ helpers). **Higher risk**: statusline
render behavior + proximity to `classify.js` (which must stay byte-identical).
Each fix needs the statusline tests green + a manual statusline render check.
**Do NOT bundle with Tier A** (different blast radius). Suggest its own PR.

### B1 — Quota chip is a local estimate, not real Max quota · med (honesty)
`quota-tracker.js` makes **0 network calls**; "☁ Claude Max 100% · 5h reset" is a local 5h token-window heuristic vs a hardcoded limit.
**Fix**: relabel so it doesn't imply authoritative plan quota — e.g. `~Nh local est.` or `est. N% · 5h`. Do **not** wire a real Anthropic quota API in this brief (no such endpoint).

### B2 — Adapter chip never reflects a deployed adapter · med (stale)
`statusline-multi.js:getAdapterStatus()` hardcodes `{status:'idle'}` and never calls the real `adapter_selection.js:getActiveAdapter()` (which genuinely reads `~/.mooter/preferences.json` + manifest + HMAC).
**Fix**: wire `getAdapterStatus()` → `getActiveAdapter()`; render the real adapter name when active, fall back to the `baseline · mooter forge install` CTA when null. Add a test with a fixture preferences.json.

### B3 — "saved $X today" — CONFIRM scope before touching · med (FLAGGED)
Headline at `statusline-multi.js:458` says "today"; `savings-tracker.js:538` computes `m.saved` **all-time**. Could not confirm read-only whether the headline's `savedUsd` reads a today-scoped field or all-time `m.saved`.
**Step 1 (no fix)**: trace `savedUsd` through `buildContext`. If today-scoped → REAL, close it. If all-time → either filter to today or relabel "all-time". **Don't relabel blindly.**

### B4 (optional, low) — quant chip provenance
Add a source-URL/commit comment to `quantization.js:QUANT_INFO` (the -72%/99% constants). Cosmetic.

**Tier B tag**: dev `v1.9.5-statusline-honesty-dev`. **Guard**: re-run `sha256sum tools/router/classify.js` after every edit.

---

## TIER C — Needs Paulo decision before any code (hub + learning loop)

### C1 — Pastor "learns from every decision" is dormant · med (honesty)
The backtest→tuning→classify pipeline exists but `tuning-state.json` doesn't, and the backtest isn't scheduled → classifier runs on committed defaults.
**Decision (Paulo)**: (a) **wire it** — schedule the `backtest.js`→`update-router.js` job (the P11 checksum-refresh handshake is already in `test.yml`), making the claim true; or (b) **soften the copy** wherever it implies live self-learning (landing `/under-the-hood`, strategy docs) until wired. *(b) is the safe, landing-only path; (a) is real infra work.*

### C2 — Hub schema hardening · med (operational, not exposure)
FK constraints absent; `ALTER TABLE` non-idempotent; RLS not in DDL.
**Decision (Paulo)**: confirm the **actual backend first** — the audit couldn't tell D1 (Cloudflare, no RLS concept) vs Supabase from the migrations. The fix path differs entirely. **Hub touch = separate effort, your gate** (prior waves kept hub changes manual-approval).

---

## Decisions needed from Paulo (blockers for the relevant tiers)

1. **A2 muted contrast**: lighten the token (a) vs surgical small-text swap (b)? → recommend (a).
2. **A3 privacy link**: is there a real `/security` page, or link `SECURITY.md`, or drop the second link?
3. **B3 saved-today**: confirm after the trace whether to relabel or filter (don't guess).
4. **C1 Pastor loop**: wire the scheduler vs soften the copy?
5. **C2 hub schema**: which backend (D1 vs Supabase)? — gates any hub work.

---

## Suggested sequence

1. **Day 2 = Tier A only** (landing a11y + link), visual-verify via harness, PR squash→dev, tag `v1.9.4-a11y-fixes-dev`, final-reviewer T2. Ship-ready for friends.
2. **Tier B** as a separate, careful PR (statusline honesty) once Paulo OKs the relabels — classify.js guard every step.
3. **Tier C** only after the two decisions — and hub work stays on the manual-approval gate.

**Do not promote prod** until Paulo reviews. NO `git add -A`. NO hub touch outside Tier C.

---

*Composed by Claude Code, 2026-06-05, from the Wave 16–18 self-audit. Tiered by
blast radius so the safe launch-relevant fixes aren't held hostage to the hub/
statusline ones.*
