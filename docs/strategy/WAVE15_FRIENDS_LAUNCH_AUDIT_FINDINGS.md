# Wave 15 — Friends-Launch Readiness Audit Findings

> **Date**: 2026-06-04 evening
> **Auditor**: Cowork via Chrome MCP (8 pages) + Read code (LoginHero source)
> **Scope**: pre-launch sistemático audit — landing + login flow + signed-in pages
> + statusline reality + data pipeline + visual harmony + edge cases.
>
> **Pre-launch goal**: Paulo lançar Mooter para AMIGOS sem passar vergonha.
> Critério: friend abre mooter.ai → flow inteiro funciona + visualmente coerente
> + telemetria capturada + Pastor learning visível + sem broken states.
>
> **GO/NO-GO verdict provisório**: **NO-GO TODAVIA** — 3 critical findings (LoginHero
> cream vs landing dark) precisam fix antes de launch. Fix path realista: ~2-4h CC.

---

## ⚠️ Design-system reality — read before composing any landing brief

> Added 2026-06-05 by Claude Code after Wave 14 Day 3 + Wave 15 Day 1, where the
> briefs (and the audit table below) prescribed a stack that **does not exist in
> this repo**. Correcting it here so future briefs stop repeating the assumption.

The mooter `landing/` app does **NOT** use Tailwind or shadcn/ui, and has **no
serif font**. The real design system is:

- **Styling**: CSS custom properties (`--color-*` in `:root`; short `--bg/--surface/--accent/--text` tokens scoped to `.app-shell-root`) + **inline `style={{…}}`** on elements. There is **no `tailwind.config.ts`**, no `bg-background`/`text-foreground`/`font-headline` classes, no `components/ui/`.
- **Fonts**: `Space_Grotesk` (`--font-sans`) + `JetBrains_Mono` (`--font-mono`), via `next/font` in `app/layout.tsx`. The landing hero **"Got Moo?" is bold Space Grotesk — NOT serif** (the table below mislabels it). No serif family exists anywhere.
- **Dark theming for app pages**: not Tailwind `dark:` — a **token-scope** pattern. `.app-shell-dark` / `.onboarding-shell` (in `globals.css`) re-point the short `--bg/--surface/--accent…` tokens to the dark `--color-*` values; adding that class to a wrapper flips the page dark with no per-element edits (Wave 14 Day 3/4, Wave 15 Day 1).
- **Reusable nav**: the real component is `components/NavBar.tsx` (default export, sticky, `--color-*`), imported as `@/components/NavBar`. There is **no `<TopNav>`**.
- **Internal links**: use Next `<Link>` (ESLint `no-html-link-for-pages` blocks `<a href="/page">`).

**For brief authors**: specify changes in terms of the above (token scopes, inline
styles, `NavBar`, Space Grotesk) — not `className="bg-background"` / `font-headline`
/ `<TopNav>`. Those map to nothing and cost a recon + findings round-trip each time.

---

## 0. Pages audited via Chrome MCP

| URL | Status | Verdict |
|---|---|---|
| `mooter.ai/` | Dark theme + "Got Moo?" serif | ✅ PASS |
| `mooter.ai/install` | Dark + "One command. Your whole stack, herded." | ✅ PASS |
| `mooter.ai/under-the-hood` | Dark + "Mooter pastors the Moos." + quantization explainer | ✅ PASS |
| `mooter.ai/privacy` | Dark + GDPR/LGPD/CCPA aligned + cards | ✅ PASS |
| `mooter.ai/dashboard` (logged-out) | 🔴 CREAM LoginHero "Route smarter." | ❌ FAIL |
| `mooter.ai/settings` (logged-out) | 🔴 CREAM LoginHero (same) | ❌ FAIL |
| `mooter.ai/admin` (logged-out) | 🔴 CREAM LoginHero (same) | ❌ FAIL |
| `mooter.ai/onboarding` | ⚠️ Dark mas SEM top nav (mooter logo only) | 🟡 PARTIAL |
| `mooter.ai/compare` | (não testado, último audit Wave 14 OK) | (assume ✅) |

Plus: visited Paulo's actual `/dashboard` logged-in last session = dark with stats (Wave 14 14B applied).

---

## 1. CRITICAL findings (🔴 3) — friends-launch blockers

### 🔴 F-A1 — LoginHero cream theme em /dashboard, /settings, /admin

**Reproduce**: `mooter.ai/dashboard` sem login → LoginHero appears com:
- Beige/cream background (NOT dark)
- "Route smarter." sans-serif (NOT serif "Got Moo?" matching landing)
- "Continue with GitHub" pink button (right colour pero contexto cream)
- Hard-coded stats "6 PROMPTS · ~90% SAVED · $0.00 COMMUNITY" (fabricated)
- Terminal mockup on right (matches landing style)

**Source confirmed**: `landing/app/(app)/layout.tsx` lines 360-403 — inline styles cream.

**Impact friends-launch**: Friend abre `mooter.ai/dashboard` (potencialmente via link partilhado) → vê página CREAM enquanto landing é DARK → "produto inconsistente / abandonado". **Quebra wow factor primeiro toque.**

**Cause**: Wave 14 14B brand parity foi aplicado a:
- `/onboarding` content ✅
- `/dashboard` logged-in content ✅ (precisa verificar)
- `/settings` logged-in content ✅ (precisa verificar)
- LoginHero (mostrado quando NOT logged in) — **NÃO TOCADO**

LoginHero é shown by route guard quando user não autenticado. Vive em layout `(app)/layout.tsx` separado do landing's `app/layout.tsx`.

**Fix path (~2h CC)**:
1. Migrar LoginHero do `(app)/layout.tsx` para usar:
   - `bg-background` (dark) em vez de inline cream
   - Serif font matching landing (`font-headline`)
   - Top nav consistent com landing (mooter logo + Sign in CTA)
   - Replace "Route smarter." → use "Got Moo?" hero style ou nova hero alinhada
2. Strip hard-coded stats "6 PROMPTS · ~90% SAVED · $0.00 COMMUNITY" — substituir por **community stats reais** do hub `/api/community/pulse` (Wave 10 B.1a) OR honest empty state "Sign in to see your savings"
3. Manter "Continue with GitHub" pink CTA (já consistente)

### 🔴 F-A2 — Fabricated stats no LoginHero

**Reproduce**: same pages logged-out → stats fixos "6 PROMPTS · ~90% SAVED · $0.00 COMMUNITY".

**Why broken**:
- 6 PROMPTS é fabricated (não é número real de community)
- ~90% SAVED inflated (Mooter benchmark mediu 34% típico, não 90%)
- $0.00 COMMUNITY é honesto mas confuso (significa "valor estimado community spent on Mooter" = 0? ou "community savings" = 0?)
- **Sem disclaimer "*illustrative" ou "Demo data"**

**Impact**: friends vão ver ~90% SAVED e pensar "MOOTER GUARANTEES 90%" → expectativa irrealista → decepção após install.

**Fix path (~1h CC)**:
- Replace with real community pulse from `/api/community/pulse` (already exists post-Wave 10 B.1a)
- OR add `*illustrative` badge
- OR remove stats entirely from LoginHero (cleaner) + show stats only post-login

### 🔴 F-A3 — Onboarding sem top nav consistente

**Reproduce**: `/onboarding` → só "mooter" logo top-left, SEM top nav (Packs/Compare/Methodology/Privacy + Install/Sign in).

**Why partial-broken**: friends abandonam onboarding mid-flow → não conseguem voltar à landing facilmente. Padrão UX: onboarding = focused, mas usually has "exit" or "skip" link to landing.

**Impact**: onboarding feels "trapped" sem escape clear. Less serious que F-A1 mas affects abandonment recovery.

**Fix path (~30 min CC)**:
- Add minimal top nav: mooter logo + "How" or "Privacy" link (defensive escape) + "Skip for now" link to landing
- OR keep current minimal but add subtle "← back to home" link bottom

---

## 2. IMPORTANT findings (🟠 4) — fix soon, not blockers

### 🟠 F-B1 — Visual harmony test passar com 1 mancha

5 de 8 pages dark + serif consistent. 3 logged-out fallbacks cream. Overall brand health 60% OK, 40% needs Wave 15 fix. Após F-A1 fix → 100%.

### 🟠 F-B2 — Dashboard logged-in actual state UNVERIFIED

Sessão Paulo expirou no Chrome MCP. Não pude validar `/dashboard` post-login pós-Wave 14 14B-B fix. **Risco**: Wave 14 dashboard parity pode estar OK em prod ou ter regressões não detectadas.

**Action needed**: Paulo abre Chrome Incognito + login + tira 1 screenshot `/dashboard` → cola aqui.

### 🟠 F-B3 — Statusline chip reality check NÃO DONE

Não validei sistematicamente que cada chip statusline reflecte real data. Wave 14 14C adicionou LoRA chip mas:
- `🐮 saved $X today` — vem de onde? local cache CLI ou hub aggregation? Reliable?
- `▁▅██ last 10 sparkline` — confirmed Wave 10 Phase A real
- `T0 · conf 0.85 · 🐄×0` — confirmed Wave 13 herd tracker
- `🏠 30/42 local · 70% local` — confirmed Wave 12
- `🎮 RTX 4090 · ☁ Claude Max 100% · 5h reset` — hardware detected + budget
- `quant Q4_K_M (-72% size · ~99% quality vs FP16)` — Wave 12 PR-F chip
- `adapter — baseline` — Wave 5 adapter system
- `🧬 LoRA active · <name>` — Wave 14 14C (só visível quando adapter ≠ baseline)
- `mooter forge install` — CTA Wave 5

**Risk**: cada chip lê de fonte diferente. Se 1 chip mostra dados fabricados/stale → friend percebe e perde trust.

**Action needed**: CC autonomous 1h sweep — for each chip, trace source code path + confirm = real-time real data, não cache stale.

### 🟠 F-B4 — Data pipeline integrity NÃO VALIDADA

Pastor learning loop + hub D1 + telemetry + adapter forge — Wave 14 14E security audit READ-ONLY existe mas **não validei se os dados realmente fluem end-to-end**:
1. CLI envia event → hub D1 captura? schema correct?
2. Hub aggrega → `/api/community/pulse` retorna real numbers?
3. Pastor learning lê eventos → adapta classify.js patterns? Adapter forge install funciona?
4. `mooter feedback` → POST 201 → admin endpoint vê feedback?

**Confirmed working** (Day 5 incognito + Wave 12 anon feedback):
- ✅ `mooter feedback` anonymous POST 201
- ✅ Statusline saved $X real-time
- ✅ Local subagent spawn working
- ✅ Wave 13 herd 🐄 chip + Stop digest

**NOT confirmed end-to-end**:
- Pastor learning **actually changes classify behavior** over time per user (N=1 Paulo data)
- Hub D1 mooter_events table populated correctly (not just feedback table)
- Per-user data isolation (Paulo's events NÃO are mixed with others)
- Adapter Forge auto-install on first run actually installs adapter

**Action needed**: CC autonomous 1-2h trace — read hub schemas + insert test events via curl + verify D1 query + Pastor adaptation.

---

## 3. POLISH findings (🟡 4)

### 🟡 F-C1 — OAuth handshake timing not measured
OAuth → callback timing (Cowork fez via Chrome MCP, ~1-3s). Worth measure formally + add loading state.

### 🟡 F-C2 — Mobile responsive POST-Wave-14 not verified
Wave 10 B.2c #9 fixed hero mobile. Wave 14 brand parity may have regressed mobile. Need test 375px viewport.

### 🟡 F-C3 — Error states (OAuth revoke / token expired) UX not designed
What happens if friend revokes OAuth in GitHub? Or session token expires? Need defined error UX.

### 🟡 F-C4 — Install flow E2E timing
`curl mooter.ai/i/<token> | bash` should complete <60s. Need timing baseline for friends-launch ("downloads in 30s, configures in 30s").

---

## 4. POSITIVE — what works for friends-launch

- ✅ Landing dark + serif polished
- ✅ /install + /under-the-hood + /privacy dark consistent
- ✅ Onboarding wizard dark (Wave 14 Day 3)
- ✅ Anonymous feedback hub LIVE (POST 201 confirmed)
- ✅ Statusline savings tracking working LIVE ($2.51 today, 70% local)
- ✅ Local Moos via Ollama working (Day 5 6 spawns)
- ✅ Wave 13 herd 🐄 chip + Stop digest working
- ✅ Repo público + MIT + 7 packs
- ✅ Anthropic Showcase Rubric 25/25 (Wave 12)
- ✅ classify.js byte-identical (P11 across all 7 prod tags)
- ✅ Brand assets (logo, palette tokens, fonts) defined Wave 12

---

## 5. Friends-launch fix plan (~4-6h CC + Cowork validation)

### Day 1 fix — ~3h CC (F-A1 + F-A2 + F-A3)

Compose master prompt for CC autonomous:
1. **F-A1 (~2h)**: migrate LoginHero `landing/app/(app)/layout.tsx` to dark theme + serif headline + top nav consistent + remove inline cream styles
2. **F-A2 (~30 min)**: replace fabricated "6 PROMPTS · ~90% SAVED" with real community pulse OR honest empty state
3. **F-A3 (~30 min)**: add minimal top nav to `/onboarding` for escape path

Tag dev `v1.9.3-friends-launch-loginhero-dev`. Promote prod after Cowork visual review.

### Day 2 fix — ~2h CC (F-B3 + F-B4)

Compose master prompt for CC autonomous audit:
1. **F-B3 (~1h)**: statusline chip reality check — trace each chip source + add comment in code documenting truth-source
2. **F-B4 (~1-2h)**: data pipeline integrity test — insert test events + verify hub D1 + Pastor adaptation + per-user isolation

Output: `WAVE15_DAY2_DATA_PIPELINE_FINDINGS.md`. No code changes unless gaps found.

### Day 2 — Paulo (~10 min)

- Chrome Incognito → login fresh → screenshot /dashboard → cola aqui (validates F-B2)
- Mobile viewport test (Chrome devtools 375px) → screenshot of landing + onboarding (validates F-C2)

### Day 3 — Promotion + closure (~30 min Cowork)

- Tag prod `v1.10.0-friends-launch-ready`
- SYNC.md + MEMORY.md + Notion final closure
- Verdict: **GO friends-launch**

---

## 6. GO/NO-GO checklist friends-launch

| # | Critério | Status pre-fix | Após Wave 15 |
|---|---|---|---|
| 1 | Landing → login → onboarding → dashboard fluxo sem visual break | ❌ F-A1 cream LoginHero | ✅ todo dark |
| 2 | Stats no LoginHero não fabricadas | ❌ "~90% SAVED" inflated | ✅ real ou empty state |
| 3 | Onboarding tem escape path | ⚠️ logo only | ✅ skip link |
| 4 | Statusline cada chip real data | ❓ unverified | ✅ traced |
| 5 | Data pipeline end-to-end works | ❓ unverified | ✅ tested |
| 6 | Mobile responsive verified | ❓ unverified | ✅ tested |
| 7 | Anonymous feedback POST 201 | ✅ Wave 12 LIVE | ✅ |
| 8 | Privacy page accurate | ✅ Wave 10 polished | ✅ |
| 9 | Install flow <60s | ❓ untimed | ✅ timed |
| 10 | Error states defined | ❌ undocumented | ⚠️ Wave 16 backlog |

**Pre-launch grade**: 4/10 confirmed PASS, 5/10 needs work, 1/10 backlog.
**Post-Wave-15 grade target**: 9/10 confirmed PASS.

---

## 7. Recommended sequence (next steps)

### Tonight (~3h)
1. Cola Day 1 fix master prompt no CC (composto separadamente)
2. CC autonomous works ~3h (F-A1 + F-A2 + F-A3)
3. Cowork merge PR → tag dev `v1.9.3-friends-launch-loginhero-dev`

### Tomorrow morning (~1h)
4. Paulo Chrome Incognito test (~10 min) — screenshots
5. Cola Day 2 audit master prompt no CC (composto separadamente)
6. CC autonomous reads ~2h (F-B3 + F-B4)

### Tomorrow afternoon (~30 min)
7. Cowork promote dev→main `v1.10.0-friends-launch-ready`
8. SYNC + Notion + MEMORY final
9. Paulo envia 3 DMs amigos com confiança

---

**Composed by Cowork, 2026-06-04 night audit. 11 findings (3 critical + 4 important
+ 4 polish + 11 positives). Friends-launch READY após ~5h CC autonomous + ~30 min
Paulo validation. NO-GO until F-A1/F-A2/F-A3 fixed.**
