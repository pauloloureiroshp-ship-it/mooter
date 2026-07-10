# Wave 14 — Day 3: Brand Parity Onboarding (14B-A)

> **Goal**: redesign `/onboarding` 3-step wizard para alinhar com landing Wave 12
> (dark theme, serif headers, top nav, shadcn/ui consistent). Onboarding é first
> impression do testers em validation week — vai do "abandoned old admin tool" (beige/sans)
> para "polished modern" (dark/serif), mesma identidade visual da landing.
>
> **Trigger**: Wave 14 14A audit findings F-1 (visual brand split) + F-8 (sidebar
> legacy vs top nav) + F-9 (emoji vs logo) + F-11 (onboarding palette). 14B-A focuses
> em onboarding only (Day 3); Day 4 farás /dashboard + /settings (14B-B).
>
> **Scope**: 1 PR squash→dev, landing-only, foco em `/onboarding/*`. ~1 dia CC
> autonomous. Tag dev `v1.8.5-onboarding-parity-dev`.
>
> **Non-negotiables**:
> - `classify.js` byte-identical (P11 sha256 `7b01eb86...87762`)
> - Zero schema changes / zero hub touch / zero CLI changes
> - Funcionalidade onboarding NÃO muda — só estética
> - Tests landing mantidos + visual review obrigatório
> - 3 steps wizard mantidos com mesma logic flow
> - Persona / hardware / providers captured idênticamente

---

## 0. Estado actual vs alvo

### Landing reference (mooter.ai)

Estilo confirmado via Chrome MCP audit:
- **Background**: dark (preto profissional)
- **Typography**: serif gigante "Got Moo?" hero + sans-serif body
- **Top nav**: mooter logo + Packs / Compare / Methodology / Privacy + "Sign in with GitHub" + "Install mooter →" pink button
- **Components**: shadcn/ui (Card, Button rounded)
- **Hero pattern**: gradient backgrounds, badge pills "Open source · MIT · Free forever"
- **CTA buttons**: pink primary "Install mooter →" + secondary "Sign in with GitHub"
- **Footer features**: "✓ Hook, not a proxy / Runs locally / <50ms overhead"

### Onboarding actual (`/onboarding`)

Audit Chrome MCP 2026-06-04:
- **Background**: beige/cream pastel
- **Typography**: sans-serif standard
- **Layout**: full-page wizard (não sidebar — bom)
- **Components**: legacy (Tailwind base, não shadcn padrão landing)
- **Step header**: "STEP 1 OF 3 · Your setup" (small uppercase label + h1 sans)
- **3 steps**:
  1. Hardware detection + persona + providers
  2. Ollama models pull (qwen2.5:3b baseline + optional)
  3. Monthly budget + persona + ESTIMATED IMPACT

### Alvo

Onboarding alinhado com landing:
- **Background**: dark (mesmo preto)
- **Typography**: serif headers ("Your setup", "AI providers", "Local stack"), sans body
- **Top nav**: mooter logo only (sem signing-out CTA durante onboarding flow)
- **Components**: shadcn/ui Card / Button / Toggle / RadioGroup (mesmos da landing)
- **Step progress**: redesigned (não "STEP 1 OF 3" all-caps, use serif "Step 1 — Your setup")
- **CTAs**: pink primary "Next →" matching landing "Install mooter →" style
- **Estimated impact card**: hero-style com gradient/glow matching landing's "Got Moo?" treatment
- **Funcionalidade idêntica**: forms work the same, persona/hardware/providers captured the same way

---

## 1. Fix paths exactos

### Step 1 — Adopt landing design tokens

**Tailwind config**: Verify `landing/tailwind.config.ts` has same colors/typography across landing/onboarding. Onboarding may have its own theme overrides.

**Find onboarding-specific overrides**:
```bash
grep -rn "bg-cream\|bg-beige\|onboarding-theme" landing/
```

**Action**: remove onboarding-specific theme overrides, adopt landing's `dark` palette.

### Step 2 — Top nav consistent

**Action**: replace any onboarding-specific nav with the landing TopNav component (or stripped variant — `mooter logo only`, sem links de Packs/Compare durante onboarding flow).

### Step 3 — Typography sweep

**Find serif font usage**:
```bash
grep -rn "font-serif\|font-headline" landing/
```

**Action**: apply serif font (whatever landing uses) to onboarding step headers ("Your setup", "AI providers", "Local stack", "Monthly token budget", "What best describes you?").

### Step 4 — Component swap

Identify onboarding components vs landing's shadcn/ui:
- Step container → `<Card>` like landing's hero card
- Radio buttons → `<RadioGroup>` shadcn (selected pink, not default)
- Toggle providers → `<Toggle>` or `<Card>` clickable
- Budget select → `<RadioGroup>` cards
- "Next →" button → landing's pink primary CTA style

### Step 5 — Estimated impact card

Current: simple "Save ~$108/mo · 90% less than Opus-only" text + bullet points.

Redesign: hero-style card with gradient bg, big number, similar treatment to landing's "Got Moo?" emphasis. Should feel like a **reward moment** ("you'll save this much").

---

## 2. Recon comandos

```bash
# Find onboarding source
ls landing/app/onboarding/

# Find landing's design tokens
cat landing/tailwind.config.ts
grep -rn "darkMode\|theme.extend" landing/

# Find shadcn/ui components in use on landing
grep -rn "@/components/ui/" landing/app/ | head -20

# Find onboarding-specific styles
grep -rn "onboarding" landing/app/onboarding/ | head -20

# Verify classify.js byte-identical
sha256sum tools/router/classify.js
```

---

## 3. Sequência (1 PR, ~1 dia CC autonomous)

### Manhã (~4h)
1. **Recon** (45 min) — design tokens, components, current onboarding source
2. **Tailwind theme adopt** (30 min) — remove cream/beige, adopt landing dark
3. **Top nav swap** (45 min) — strip variant
4. **Step 1 redesign** (1.5h) — hardware/persona/providers
5. **Step 2 redesign** (1h) — Ollama models pull cards

### Tarde (~4h)
6. **Step 3 redesign** (1.5h) — budget + persona + impact card
7. **Visual verification via Vercel preview** (30 min) — side-by-side com landing
8. **Mobile responsive verification** (30 min)
9. **Tests** (45 min) — landing tests + 3 new (step transitions, persona persist, impact calc)
10. **classify.js sha256 check** (5 min)
11. **PR squash→dev** branch `wave14-day3-brand-parity-onboarding`
12. **final-reviewer T2 Sonnet** (foco em visual review + accessibility)

---

## 4. Definition of Done (Day 3)

1. ✅ `/onboarding` adopts dark theme (mesmo `bg` da landing)
2. ✅ Typography matching landing (serif headers + sans body)
3. ✅ Top nav consistent (stripped variant — mooter logo only)
4. ✅ 3 steps wizard funcional (mesma logic flow — só estética)
5. ✅ Persona / hardware / providers captured idênticamente
6. ✅ Estimated impact card redesigned com gradient/hero treatment
7. ✅ Mobile responsive mantido (Wave 10 B.2c #9 fix)
8. ✅ Tests landing mantidos + 3 new
9. ✅ classify.js byte-identical
10. ✅ PR squash→dev + tag dev `v1.8.5-onboarding-parity-dev`
11. ✅ Visual review Cowork via Chrome MCP screenshots (after merge to dev)

---

## 5. Anti-patterns

- ❌ NÃO mudar form fields ou state shape — só estética
- ❌ NÃO mudar persona detection logic
- ❌ NÃO mudar hardware detection (Wave 10 B.2b.1 F-2 já correto)
- ❌ NÃO mudar Ollama models recommendation (Wave 14 Day 2 já state-aware)
- ❌ NÃO criar componentes novos — usa shadcn/ui da landing
- ❌ NÃO trazer onboarding-specific theme overrides
- ❌ NÃO tocar em `/dashboard` e `/settings` (Day 4 separate)
- ❌ NÃO tocar em `/admin` (lower priority)
- ❌ NÃO `git add -A`

---

## 6. Visual review process (Cowork)

Após CC abrir PR, Cowork vai:
1. Vercel preview deploy READY (esperar build)
2. Chrome MCP navigate to preview URL `/onboarding`
3. Screenshot lado-a-lado com landing (mesma página)
4. Verify:
   - Background dark matching
   - Typography serif headers
   - Pink CTA "Next →" matching landing
   - Mobile responsive (resize window)
   - Estimated impact card hero treatment
5. Approve OR request revisions

---

## 7. Master prompt para CC (paste when ready)

```
Inicia Wave 14 Day 3 Brand Parity Onboarding (14B-A) conforme docs/strategy/WAVE14_DAY3_BRAND_PARITY_ONBOARDING_MICROBRIEF.md.

Pré-flight: Wave 14 Day 1 (v1.8.3) + Day 2 (v1.8.4) EM DEV. 14A audit complete.

Scope: redesign /onboarding 3-step wizard para alinhar com landing Wave 12 (dark theme + serif headers + shadcn/ui). Funcionalidade idêntica — só estética. Landing-only.

Lê PRIMEIRO:
  - docs/strategy/WAVE14_DAY3_BRAND_PARITY_ONBOARDING_MICROBRIEF.md inteiro
  - docs/strategy/WAVE14_14A_QUALITY_AUDIT_FINDINGS.md (F-1 + F-8 + F-9 + F-11 contexto)
  - landing/tailwind.config.ts (design tokens)
  - landing/app/page.tsx (referência visual landing)
  - landing/app/onboarding/* (todos — current state)
  - landing/components/ui/* (shadcn inventory)

Non-negotiables:
  - classify.js byte-identical (sha256 7b01eb86...87762)
  - Zero schema changes / zero hub touch / zero CLI changes
  - Funcionalidade onboarding NÃO muda — só estética
  - Form fields + state shape + persona detection idênticos
  - 3 steps wizard mantidos
  - Mobile responsive mantido (Wave 10 B.2c #9)
  - Tests landing mantidos + 3 new
  - NÃO mexer em /dashboard, /settings, /admin (separate)

Sequência (~1 dia autonomous):
  Manhã (4h):
    1. Recon (45 min) — design tokens, shadcn inventory, onboarding source
    2. Tailwind theme adopt (30 min)
    3. Top nav swap stripped variant (45 min)
    4. Step 1 redesign hardware/persona/providers (1.5h)
    5. Step 2 redesign Ollama models (1h)
  Tarde (4h):
    6. Step 3 redesign budget/persona/impact card (1.5h)
    7. Visual + mobile responsive verification (1h)
    8. Tests (45 min) — 3 new
    9. classify.js sha256 check
    10. PR squash→dev branch wave14-day3-brand-parity-onboarding
    11. final-reviewer T2 Sonnet com foco em accessibility

Tag dev v1.8.5-onboarding-parity-dev. NÃO promote prod.

Reporta WAVE14_DAY3_FINDINGS.md se houver decisões para Paulo durante execução (design system gaps, etc).
```

---

**Composed by Cowork, 2026-06-04 evening. Day 3 = 14B-A onboarding brand parity.
~1 dia CC autonomous. Tag dev v1.8.5-onboarding-parity-dev. Day 4 = 14B-B dashboard
+ settings. Day 5 = closure + tag prod v1.9.0-pre-validation-sweep.**
