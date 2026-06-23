# Wave 14 — Day 4: Brand Parity Dashboard + Settings (14B-B)

> **Goal**: continuar 14B Brand Parity em `/dashboard` + `/settings`, aplicando
> mesmo design system da landing Wave 12 (dark theme, serif headers, top nav,
> shadcn/ui). Continuação directa do Day 3 (`/onboarding`).
>
> **Trigger**: Wave 14 Day 3 EM DEV (`v1.8.5-onboarding-parity-dev`). Falta
> alinhar as 2 páginas signed-in restantes — onde testers passam mais tempo.
>
> **Scope**: 1 PR squash→dev, landing-only, foco em `/dashboard/*` + `/settings/*`.
> ~1 dia CC autonomous. Tag dev `v1.8.6-dash-settings-parity-dev`.
>
> **Non-negotiables**:
> - `classify.js` byte-identical (P11 sha256 `7b01eb86...87762`)
> - Zero schema changes / zero hub touch / zero CLI changes
> - Funcionalidade NÃO muda — só estética
> - DataSourceBadge (Day 2) + VersionBadge (Day 1) + recommendations state-aware mantidos
> - formatGpuLabel + formatOsLabel (Day 2) mantidos
> - Tests landing + 5 new
> - NÃO mexer em `/admin` (separate Day 5+)

---

## 0. Estado actual vs alvo

### Dashboard actual (`/dashboard`)

Audit Chrome MCP 2026-06-04:
- Background beige/cream, sidebar legacy left fixed
- Stats hero $73.85 SAVED + 663 DECISIONS + 100% SAVED VS ALL-OPUS
- VersionBadge (Day 1) já wired
- DataSourceBadge (Day 2) já wired
- Recommendations state-aware (Day 2) já wired
- Tabs/sections: Overview · Devices · Setup · Metrics · How it works · Workflow · Decisions
- Footer: "🐮 Mooter dashboard — synced session data"

### Settings actual (`/settings`)

- Background beige/cream
- Sidebar same legacy
- PROFILE section (avatar + email + Hardware + Persona + Change CTA)
- SUBSCRIPTIONS (Claude Max / Claude API / GPT Plus / Gemini)
- DEVICES (DESKTOP-J26409Q card)
- Footer: telemetry/sync via CLI message

### Alvo

Ambas alinhadas com landing:
- Dark theme + serif section headers
- Top nav (replace sidebar)
- shadcn/ui Cards / Buttons / Tables
- Stats hero card style matching landing's "Got Moo?" treatment
- Subscription tiles redesigned como cards consistentes
- Devices cards com mesmo polish

---

## 1. Fix paths exactos

### Step 1 — Top nav swap (replace sidebar)

**Action**: remove left fixed sidebar. Add top nav consistent with landing.

Sidebar tinha: Dashboard / Settings / Admin + Sign out + user info + GPU class.

Migration:
- Dashboard / Settings → top nav links
- Admin → top nav (only se user is admin)
- Sign out → top-right dropdown (user avatar)
- GPU class → moved to dashboard hero badge

### Step 2 — Dashboard redesign

- Header: replace `Dashboard | v0.9` with `Dashboard` (serif h1) + VersionBadge to the right
- Tabs: redesign as shadcn `<Tabs>` instead of legacy buttons
- Stats hero: 3 big numbers ($X saved · N decisions · %% saved) com gradient bg + DataSourceBadge inside the card
- Per-task-type / Misroute sections: shadcn `<Card>` style consistent
- AI Stack section: cards com pink active state matching landing
- Savings Calculator: redesigned slider component (shadcn `<Slider>`)
- Recommendations: shadcn `<Card>` w/ severity colored borders
- Activity section: empty state polished

### Step 3 — Settings redesign

- Header: `Settings` (serif h1) + VersionBadge to the right
- Profile card: shadcn `<Card>` with avatar + email + Hardware (formatGpuLabel applied Day 2) + Persona + Change CTA
- Subscriptions: 4-tile grid (Claude Max / Claude API / GPT Plus / Gemini) com checkbox state
- Devices: shadcn `<Card>` per device com VersionBadge + last-sync + GPU class
- Footer message: stripped/replaced from Day 1 fix

### Step 4 — Polish

- Loading states (skeleton from shadcn)
- Empty states (when no data)
- Error states (auth failure / network)
- Mobile responsive verification

---

## 2. Sequência (1 PR, ~1 dia CC autonomous)

### Manhã (~4h)
1. **Recon** (30 min) — identify all components in dashboard/settings + reuse Day 3 tokens
2. **Top nav swap** (1h) — replace sidebar both pages
3. **Dashboard header + tabs** (1h) — h1 serif + shadcn Tabs
4. **Dashboard stats hero** (1.5h) — gradient card + DataSourceBadge integrated

### Tarde (~4h)
5. **Dashboard sections** (2h) — Per-task / AI Stack / Savings Calc / Recs / Activity
6. **Settings profile + subs + devices** (1.5h)
7. **Visual + mobile review** (30 min)
8. **Tests** (45 min) — 5 new
9. **classify.js sha256** (5 min)
10. **PR squash→dev** branch `wave14-day4-brand-parity-dashboard-settings`
11. **final-reviewer T2 Sonnet**

---

## 3. Definition of Done (Day 4)

1. ✅ `/dashboard` adopts dark theme + top nav + shadcn components
2. ✅ `/settings` same treatment
3. ✅ Stats hero hero-style card com DataSourceBadge integrated
4. ✅ Sidebar fully removed both pages
5. ✅ Mobile responsive mantido
6. ✅ Tests landing + 5 new
7. ✅ classify.js byte-identical
8. ✅ PR squash→dev + tag dev `v1.8.6-dash-settings-parity-dev`
9. ✅ Visual review Cowork via Chrome MCP

---

## 4. Anti-patterns

- ❌ NÃO mudar data fetching / state shape
- ❌ NÃO redesign Wave 10 B.1a community pulse / Workflow Sankey tab (já bom)
- ❌ NÃO mudar admin links visibility (RBAC intacto)
- ❌ NÃO `git add -A`
- ❌ NÃO tocar `/admin`

---

## 5. Master prompt para CC (paste when Day 3 mergeada)

```
Inicia Wave 14 Day 4 Brand Parity Dashboard + Settings (14B-B) conforme docs/strategy/WAVE14_DAY4_BRAND_PARITY_DASHBOARD_SETTINGS_MICROBRIEF.md.

Pré-flight: Wave 14 Day 1/2/3 EM DEV. 14A audit complete. Day 3 v1.8.5-onboarding-parity-dev merged.

Scope: redesign /dashboard + /settings — aplicar mesmo design system Day 3 (dark theme, serif headers, top nav, shadcn/ui). Funcionalidade idêntica.

Lê PRIMEIRO:
  - docs/strategy/WAVE14_DAY4_BRAND_PARITY_DASHBOARD_SETTINGS_MICROBRIEF.md inteiro
  - docs/strategy/WAVE14_14A_QUALITY_AUDIT_FINDINGS.md
  - landing/app/onboarding/* (Day 3 reference patterns)
  - landing/app/(app)/dashboard/* (current state)
  - landing/app/(app)/settings/* (current state)
  - landing/components/ui/* (shadcn inventory)

Non-negotiables:
  - classify.js byte-identical
  - Zero schema/hub/CLI changes
  - VersionBadge + DataSourceBadge + recommendations state-aware mantidos
  - Mobile responsive mantido
  - Tests + 5 new
  - NÃO mexer em /admin

Sequência (~1 dia autonomous):
  Manhã: top nav swap + dashboard header/tabs/hero
  Tarde: dashboard sections + settings + tests + PR

Tag dev v1.8.6-dash-settings-parity-dev. final-reviewer T2 Sonnet.

Reporta WAVE14_DAY4_FINDINGS.md se houver decisões.
```

---

**Composed by Cowork, 2026-06-04 evening. Day 4 = 14B-B dashboard + settings.
~1 dia CC autonomous. Tag dev v1.8.6-dash-settings-parity-dev.**
