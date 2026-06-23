# Wave 4 — Launch v0.2.0 — Overview & sequencing

> **Status**: Phase A arranca paralelo a Wave 2/3 em `wave4-landing-impl`. Phases B+C+D esperam Wave 3 closure (hub D1 ready).
>
> **Origem**: master prompt produzido pelo Claude Design (Phase 1.5 entregue), refinado nos pontos críticos: schema canónico Wave 2 D4 enforced · invariants mooter explícitos · scope splittado em 4 phases · branch isolada · timing alinhado com Wave 2/3.

---

## Pre-decided (Paulo 2026-05-28)

| Decisão | Resolução |
|---|---|
| Theme | **Dark intencional** — landing actual light beige será migrado para warm dark (`#0B0A09` bg, `#F2EDE6` text). Cow + "Got Moo?" + Pastor preservados |
| Schema `mooter_event` | **Wave 2 D4 canónico** (31 campos, lineage, axis confidence, `cost_micros`, feedback signals) — design adapta-se |
| Estrutura execução | **4 master prompts** (1 por Phase = 1 PR) — padrão Wave 1 Days 1-7 |
| Timing | **Phase A arranca agora** em branch isolada `wave4-landing-impl`. Phases B+C+D esperam Wave 3 closure |

---

## Os 4 phases

| Phase | Foco | Branch | Depende de | Estimativa | Master prompt |
|---|---|---|---|---|---|
| **A · Landing public** | 8 marketing pages (hero, under-the-hood, packs, compare, methodology, privacy, install, footer) | `wave4-landing-impl` | nada (paralelo Wave 2/3) | ~6-8h | `WAVE4_PHASE_A_LANDING_KICKOFF.md` ✅ pronto |
| **B · Auth + onboarding** | Sign-in dark redesign + 5-step wizard com URL state + probe wiring | `wave4-auth-onboarding` | Wave 3 D3 (providers expansion) | ~5-7h | a compor após Wave 3 D3 |
| **C · App dashboard** | `/app/dashboard`, `/app/settings`, `/app/packs` + stubs Forge/Digest/Community | `wave4-app-dashboard` | Wave 3 D5 (hub endpoints live) | ~6-8h | a compor após Wave 3 D5 |
| **D · Plumbing + endpoints** | `/api/community/pulse` CF Worker, `/api/me/*` endpoints, install token flow, probe binary | `wave4-plumbing` | Wave 3 D4 (D1 schema) | ~8-10h | a compor após Wave 3 D4 |

**Total Wave 4**: ~25-33h dev. Splittado em 4 PRs reviewable.

---

## Dependencies (DAG)

```
Wave 2 (current)
  └── Day 4: event schema mooter_event ────────┐
  └── Day 7: re-bench (gate)                   │
                                               │
Wave 3                                         │
  └── D4: Cloudflare D1 schema ──────────┐     │
  └── D5: hub Workers endpoints          │     │
                                          ▼    ▼
                                    ┌──────────────────┐
                                    │ Wave 4 Phase D   │ ◄── arranca pós-W3 D4
                                    │ (endpoints +     │
                                    │  CF Workers)     │
                                    └────────┬─────────┘
                                             │
                              ┌──────────────┴──────────────┐
                              ▼                             ▼
                    ┌──────────────────┐         ┌──────────────────┐
                    │ Wave 4 Phase B   │         │ Wave 4 Phase C   │
                    │ (auth +          │         │ (app dashboard)  │
                    │  onboarding)     │         │                  │
                    └──────────────────┘         └──────────────────┘
                              │                             │
                              └──────────────┬──────────────┘
                                             ▼
                                    ┌──────────────────┐
                                    │ launch v0.2.0    │
                                    │ (Wave 4 closure) │
                                    └──────────────────┘

Wave 4 Phase A (landing public) ◄── arranca AGORA paralelo a tudo
  Não depende de hub/D1/endpoints — landing tem dados estáticos +
  graceful fallback se /api/community/pulse não responder.
  Branch isolada wave4-landing-impl, merge para dev só pós-Wave 3.
```

---

## Phase A — pode arrancar agora porque

| Requisito Phase A | Como satisfaz sem Wave 3 |
|---|---|
| `/api/community/pulse` (live numbers) | Graceful fallback: mostra "growing" placeholder se endpoint não responde |
| Pack browser data | Static seed JSON em `landing/public/packs-seed.json` (7 Pastor packs) |
| Methodology calculator | Client-only, formula deterministic, sem backend |
| GitHub OAuth | Já wired no Supabase (existe pré-Wave 4) |
| Statusline preview | Hard-coded mock string com format Wave 2 D2 |

---

## Estratégia de merge

| Quando | Acção |
|---|---|
| Phase A PR aberto | Mergeio para `dev` se Wave 2 estiver entre Days (não a meio de PR aberto) |
| Phase B/C/D | Cada um para `dev` quando Wave 3 closure validar |
| Wave 4 closure | Tag `v0.2.0` push, merge `dev` → `main` |

⚠️ **Nunca** merge directo Phase A → `main`. Sempre `dev` → review → `main` no Wave 4 closure final.

---

## Ficheiros produzidos por esta Wave (acumulado)

```
landing/
├── app/
│   ├── (marketing)/
│   │   ├── layout.tsx                  (A · novo)
│   │   ├── under-the-hood/page.tsx     (A · novo)
│   │   ├── packs/page.tsx              (A · novo)
│   │   ├── packs/[id]/page.tsx         (A · novo)
│   │   ├── compare/page.tsx            (A · novo)
│   │   ├── methodology/page.tsx        (A · novo, replace existing)
│   │   ├── privacy/page.tsx            (A · novo)
│   │   └── install/page.tsx            (A · novo)
│   ├── (app)/
│   │   ├── layout.tsx                  (C · refactor existing)
│   │   ├── dashboard/page.tsx          (C · refactor existing)
│   │   ├── settings/page.tsx           (C · refactor existing)
│   │   ├── packs/page.tsx              (C · novo)
│   │   ├── forge/page.tsx              (C · stub)
│   │   ├── digest/page.tsx             (C · stub)
│   │   └── community/page.tsx          (C · stub)
│   ├── auth/
│   │   └── sign-in/page.tsx            (B · refactor existing)
│   ├── onboarding/page.tsx             (B · refactor existing)
│   ├── api/
│   │   ├── community/pulse/route.ts    (D · novo)
│   │   ├── onboarding/probe/route.ts   (D · novo)
│   │   ├── onboarding/state/route.ts   (D · novo)
│   │   ├── packs/recommend/route.ts    (D · novo)
│   │   ├── install/verify/route.ts     (D · novo)
│   │   ├── install/verify-status/route.ts (D · novo)
│   │   ├── me/savings/route.ts         (D · novo)
│   │   ├── me/sessions/route.ts        (D · novo)
│   │   ├── me/adapter/route.ts         (D · novo)
│   │   ├── me/regression-flags/route.ts (D · novo)
│   │   ├── me/consent/route.ts         (D · novo)
│   │   ├── me/packs/install/route.ts   (D · novo)
│   │   └── hub/event/route.ts          (D · novo)
│   ├── page.tsx                        (A · replace existing)
│   ├── globals.css                     (A · refactor dark tokens)
│   └── layout.tsx                      (A · update theme-color)
├── public/
│   ├── packs-seed.json                 (A · novo, 7 Pastor packs)
│   └── shepherd-crook.svg              (A · 4 variants component)
├── components/                         (A/B/C · shadcn extracted primitives)
│   ├── MooterMark.tsx
│   ├── PastorCrook.tsx
│   ├── TierChip.tsx
│   ├── StatuslineCard.tsx
│   ├── TerminalCard.tsx
│   ├── MooHerd.tsx
│   ├── NavBar.tsx
│   ├── Footer.tsx
│   └── ProviderLogo.tsx
├── lib/
│   ├── mooter-event.ts                 (D · canonical Wave 2 D4 schema in TS)
│   ├── cost-calculator.ts              (A · client-only formula)
│   └── tier-distribution.ts            (A · GPU → tier mix)
└── docs/                               (A · referenced from UI)
    ├── compare-snapshot.md             (A · "last updated" source)
    └── data-policy.md                  (A · "what we collect" source)

supabase/migrations/
└── 20260601_wave4_onboarding.sql       (B · onboarding_state + install_tokens)

hub/                                    (D · CF Workers)
└── src/community-pulse.ts              (D · /api/community/pulse with k-anon ≥50)
```

---

## Relacionados

- [WAVE2_PLAN.md](./WAVE2_PLAN.md) — Wave 2 em curso
- [WAVE3_PLAN.md](./WAVE3_PLAN.md) — Wave 3 plan (hub + activation)
- [DESIGN_MASTER_PROMPT.md](./DESIGN_MASTER_PROMPT.md) — design brief original
- [DESIGN_ITERATION_1.md](./DESIGN_ITERATION_1.md) — design Phase 1.5 brief (8 additions)
- [WAVE4_PHASE_A_LANDING_KICKOFF.md](./WAVE4_PHASE_A_LANDING_KICKOFF.md) — master prompt Phase A
