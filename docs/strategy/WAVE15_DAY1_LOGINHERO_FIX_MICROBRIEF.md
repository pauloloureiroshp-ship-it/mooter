# Wave 15 — Day 1: LoginHero Dark + Stats Reality + Onboarding Escape

> **Goal**: corrigir 3 critical findings pre-friends-launch: LoginHero cream→dark
> (F-A1), fabricated stats →real ou empty (F-A2), onboarding escape nav (F-A3).
> Garantir que friends abrindo qualquer URL mooter.ai vêem brand visualmente
> consistente.
>
> **Trigger**: Wave 15 Friends-Launch Audit (`WAVE15_FRIENDS_LAUNCH_AUDIT_FINDINGS.md`).
>
> **Scope**: 1 PR squash→dev, landing-only. ~3h CC autonomous. Tag dev
> `v1.9.3-friends-launch-loginhero-dev`.
>
> **Non-negotiables**:
> - `classify.js` byte-identical (P11 sha256 `7b01eb86...87762`)
> - Zero schema changes / zero hub touch / zero CLI changes
> - Existing logged-in dashboard/settings dark theme MANTIDO (Wave 14 14B intacto)
> - Wave 14 onboarding dark theme MANTIDO
> - Tests landing + 3 new
> - Mobile responsive

---

## 0. Findings reproduzidos

### F-A1 — LoginHero cream theme
Reproduce: `mooter.ai/dashboard` ou `/settings` ou `/admin` sem login → cream "Route smarter." LoginHero.
Source: `landing/app/(app)/layout.tsx` linhas 360-403 inline styles.

### F-A2 — Fabricated stats
Hard-coded "6 PROMPTS · ~90% SAVED · $0.00 COMMUNITY" no LoginHero.

### F-A3 — Onboarding sem escape nav
`/onboarding` only has "mooter" logo, sem top nav.

---

## 1. Fix paths exactos

### Fix F-A1 — LoginHero dark theme + serif

Edit `landing/app/(app)/layout.tsx` LoginHero component:

**Before** (linhas ~340-403):
```tsx
<div style={{
  background: 'var(--cream)',     // ← REMOVE
  fontFamily: 'var(--font-sans)',  // ← REPLACE
  // ...
}}>
  <h1 style={{ fontFamily: 'var(--font-sans), sans-serif' }}>
    Route smarter.                  // ← KEEP or upgrade
  </h1>
```

**After**:
```tsx
<div className="bg-background min-h-screen text-foreground">
  <TopNav />  {/* import from landing layout */}
  <main className="container mx-auto px-4 py-16 max-w-2xl">
    <h1 className="font-headline text-5xl md:text-6xl font-bold mb-6">
      Route smarter.
    </h1>
    {/* CTA + stats */}
  </main>
</div>
```

Use Tailwind tokens consistent com landing. Verify dark/light tokens render correctly.

### Fix F-A2 — Replace fabricated stats

Option A (cleanest): Remove stats entirely from LoginHero. Sign-in CTA dominates.

Option B: Replace with real community pulse from `/api/community/pulse`:
```tsx
const { totalDecisions, avgSaved, communitySize } = await fetchHubAggregates();
```

If hub returns null/empty → empty state "Sign in to see your savings".

Option C (fallback): Add disclaimer `*illustrative` badge.

**Recommendation**: Option A (remove stats), pois friends-launch é Paulo's personal launch — não community-driven yet.

### Fix F-A3 — Onboarding minimal nav

Edit `landing/app/onboarding/layout.tsx` (ou page.tsx if no layout):

Add top nav simplificada:
```tsx
<header className="border-b border-border">
  <div className="container mx-auto px-4 py-4 flex items-center justify-between">
    <Link href="/">
      <Logo />
    </Link>
    <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
      ← Skip for now
    </Link>
  </div>
</header>
```

Permite ao friend voltar à landing sem abandonar form state irrevogavelmente.

---

## 2. Recon comandos

```bash
# Find LoginHero source
grep -n "Route smarter" landing/app/\(app\)/layout.tsx

# Find existing TopNav component (reuse)
grep -rn "TopNav\|Navigation" landing/app/_components/ landing/components/

# Find Tailwind tokens
cat landing/tailwind.config.ts | head -50

# Find onboarding layout
ls landing/app/onboarding/

# Verify classify.js byte-identical
sha256sum tools/router/classify.js
```

---

## 3. Sequência (1 PR, ~3h CC autonomous)

1. **Recon** (20 min) — locate LoginHero + TopNav + onboarding layout
2. **F-A1 LoginHero dark** (1.5h) — replace inline styles with Tailwind tokens, use TopNav, serif headline
3. **F-A2 stats removal** (20 min) — strip hard-coded stats (Option A)
4. **F-A3 onboarding nav** (30 min) — add minimal top nav with logo + skip link
5. **Visual verification** (15 min) — Vercel preview side-by-side com landing
6. **Mobile responsive** (15 min) — 375px viewport check
7. **Tests** (20 min) — 3 new (LoginHero dark renders + skip link works + community-pulse empty state)
8. **classify.js sha256** (5 min)
9. **PR squash→dev** branch `wave15-day1-loginhero-fix`
10. **final-reviewer T2 Sonnet**

---

## 4. Definition of Done

1. ✅ LoginHero usa `bg-background` (dark) + serif headline
2. ✅ TopNav consistent com landing aparece em LoginHero
3. ✅ Stats fabricadas removidas
4. ✅ Onboarding tem minimal top nav (logo + skip)
5. ✅ Mobile responsive 375px OK
6. ✅ Tests landing + 3 new
7. ✅ classify.js byte-identical
8. ✅ PR squash→dev + tag dev `v1.9.3-friends-launch-loginhero-dev`
9. ✅ Cowork visual review via Chrome MCP screenshots

---

## 5. Anti-patterns

- ❌ NÃO refactor logged-in dashboard/settings (Wave 14 14B mantido intacto)
- ❌ NÃO mexer em logged-in routing logic (auth flow intacto)
- ❌ NÃO redesign GitHub button (já consistent)
- ❌ NÃO criar new TopNav variant — reusar existente landing
- ❌ NÃO fabricar new stats
- ❌ NÃO tocar `/admin` content (lower priority)
- ❌ NÃO `git add -A`

---

## 6. Master prompt para CC

```
Inicia Wave 15 Day 1 LoginHero Fix conforme docs/strategy/WAVE15_DAY1_LOGINHERO_FIX_MICROBRIEF.md.

Pré-flight: Wave 14 INTEIRA EM PROD (v1.9.2). Wave 15 Friends-Launch Audit identificou 3 critical findings: F-A1 (LoginHero cream theme) + F-A2 (fabricated stats) + F-A3 (onboarding sem escape nav).

Scope: 3 fixes landing-only — LoginHero dark+serif via Tailwind tokens + strip fabricated stats + onboarding minimal nav. Logged-in dashboard/settings MANTIDOS intactos (Wave 14 14B).

Lê PRIMEIRO:
  - docs/strategy/WAVE15_DAY1_LOGINHERO_FIX_MICROBRIEF.md inteiro
  - docs/strategy/WAVE15_FRIENDS_LAUNCH_AUDIT_FINDINGS.md (contexto)
  - landing/app/(app)/layout.tsx (LoginHero source linhas 360-403)
  - landing/app/page.tsx (landing reference)
  - landing/app/_components/ (TopNav location)
  - landing/app/onboarding/ (layout/page)
  - landing/tailwind.config.ts (design tokens)

Non-negotiables:
  - classify.js byte-identical (sha256 7b01eb86...87762)
  - Zero schema/hub/CLI changes
  - Wave 14 14B logged-in dashboard/settings dark theme MANTIDO
  - Wave 14 14B onboarding dark theme MANTIDO
  - Tests landing + 3 new
  - Mobile responsive 375px

Sequência (~3h autonomous):
  1. Recon: LoginHero + TopNav + onboarding layout
  2. F-A1: LoginHero migrate cream→dark via Tailwind tokens + serif headline + TopNav reuse
  3. F-A2: strip fabricated stats (Option A clean remove)
  4. F-A3: onboarding minimal top nav (logo + skip link)
  5. Visual + mobile verification
  6. Tests 3 new
  7. classify.js sha256 check
  8. PR squash→dev branch wave15-day1-loginhero-fix
  9. final-reviewer T2 Sonnet

Tag dev v1.9.3-friends-launch-loginhero-dev. NÃO promote prod ainda (Wave 15 closure Day 2).

Reporta WAVE15_DAY1_FINDINGS.md se houver decisões para Paulo.
```

---

**Composed by Cowork, 2026-06-04 night. Day 1 fix 3 critical findings. ~3h CC autonomous.
Tag dev v1.9.3-friends-launch-loginhero-dev. Promote prod after Day 2 audit completed.**
