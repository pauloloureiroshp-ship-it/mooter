# Wave 14 — Day 3 Brand Parity Onboarding (14B-A) — Findings & Decisions

> Execução autónoma 2026-06-04. Branch `wave14-day3-brand-parity-onboarding` → dev.
> Tag dev `v1.8.5-onboarding-parity-dev`. **Não promovido a prod** (só no fecho da Wave 14, v1.9.0).

## ⚠️ Key finding — o design system real ≠ premissas do brief

O brief assumia **Tailwind + shadcn/ui + serif headers**. **Nenhum existe neste repo.** A realidade:

| Brief assumia | Realidade do repo |
|---|---|
| `tailwind.config.ts` + classes Tailwind | **Não há Tailwind.** CSS custom properties em `globals.css` + **inline styles**. |
| `components/ui/*` shadcn (Card/Button/RadioGroup) | **Não há shadcn.** Componentes inline-styled (`PrimaryButton`, `Chip`, `FieldLabel`…) já no onboarding. |
| "serif gigante Got Moo" headers | O hero da landing é **Space Grotesk** (`--font-sans`) grande/bold/tight — **não serif**. Não existe fonte serif no projecto. |
| onboarding beige por theme override próprio | onboarding usa os **mesmos tokens** que o app shell. |

**Não inventei shadcn nem uma fonte serif** (seria criar elementos de design system inexistentes — anti-pattern "não criar componentes novos"). Aliniei o onboarding ao idioma **real** da landing.

## O verdadeiro F-1 (brand split) e o fix

Há **dois palettes** em `globals.css`:
- **Landing** (`app/page.tsx`, NavBar) → tokens `--color-*` = **dark** (`#0B0A09` bg, `#E8888A` pink).
- **App pages** (onboarding/dashboard/settings) → tokens curtos `--bg/--surface/--accent` definidos em `.app-shell-root` = **light parchment** (`#F2ECDF`). ← *isto* é a razão do onboarding parecer "beige".

**Fix (cirúrgico):** novo scope `.onboarding-shell` em `globals.css` que re-aponta os tokens curtos para o palette dark da landing. Como o onboarding já usa `var(--bg)`/`var(--surface)`/`var(--accent)` em todo o lado, **uma troca de className** (`app-shell-root` → `onboarding-shell`) vira a página inteira para dark **sem edits por-elemento**. Dashboard/settings mantêm `.app-shell-root` (light) — **intocados** (migram no Day 4 / 14B-B).

## Decisões tomadas (para validação do Paulo)

### D1 — Tema dark via token-override scope (não rewrite)
`.onboarding-shell` mapeia os tokens curtos → valores `--color-*` (dark). `--cream` → `#1A0E0E` (ink escuro) para texto nos CTAs rosa, igual ao `Btn.tsx` da landing (`color:#1A0E0E` sobre `--color-accent`).

### D2 — Typography já estava em paridade
Headers do onboarding ("Your setup" etc.) já usam Space Grotesk bold/`-0.02em` = mesmo tratamento da landing. **Não há serif a adoptar.** Deliverable "serif headers" do brief = N/A; paridade tipográfica já satisfeita.

### D3 — Top nav / logo / CTA / step progress já no idioma certo
O onboarding já tinha: logo (`OnboardingMooterLogo`) + "mooter" (stripped nav, sem links — compliant), `PrimaryButton` rosa, progress bar com fill `--accent`. Só faltava o **dark** + polish do impact card.

### D4 — Impact card → hero "reward" treatment
Passou de card `color-mix` flat para gradient `linear-gradient(135deg, rgba(232,136,138,0.12)…)` + glow `box-shadow` + número maior (1.7rem/800), espelhando o hero da landing. Conteúdo/cálculo inalterados.

### D5 — 1 bug-fix necessário (terminal mock)
O texto do comando no terminal mock (bg dark hardcoded `#0D0B08`) usava `color: var(--cream)` (branco no tema light). Com `--cream`→ink escuro ficaria **invisível** no dark. Fixei para `#F2ECDF` explícito (texto claro, independente do tema). Os restantes `var(--cream)` são texto sobre `--accent`/`--tier-0` → ink escuro correcto.

### D6 — `estimateMonthlySavings` exportada para teste unitário
Benigno; zero mudança de comportamento.

## Funcionalidade preservada (non-negotiable)
Zero mudanças a form fields, state shape, persona/hardware detection, ou ao fluxo de 3 steps. Só: className (tema), styling do impact card, 1 cor de texto do terminal, 1 `export`. Teste source-level guarda o fluxo (`useState(1)`/`setStep(2)`/`setStep(3)`, `PERSONAS`, `suggestHardware`, `monthly_budget_usd`).

## Ficheiros tocados

| Ficheiro | Mudança |
|---|---|
| `app/globals.css` | +scope `.onboarding-shell` (dark tokens) + regra `html:has(.onboarding-shell)` body dark |
| `app/onboarding/page.tsx` | root className → `onboarding-shell`; impact card hero; terminal text `#F2ECDF`; `export` em estimateMonthlySavings |
| `app/onboarding/brand-parity.test.ts` | **novo** — 5 testes (tema, impact hero, impact calc, fluxo 3 steps) |

## Gates
- `tsc --strict` 0 · ESLint 0 warnings (TSX) · **116/116 testes** (5 novos).
- `classify.js` byte-identical (sha256 `7b01eb86…87762`).
- Zero schema/hub/CLI · `/dashboard`,`/settings`,`/admin` intocados · mobile responsive não alterado (sem mudanças de layout).

## Pendente
- **Visual review (Cowork):** Chrome MCP no preview Vercel `/onboarding` vs landing (dark match, impact card, mobile). Processo §6 do brief.
- **Day 4 (14B-B):** dashboard + settings migram para dark — provavelmente mesmo padrão (re-apontar `.app-shell-root` tokens OU scope análogo). O `.onboarding-shell` serve de template.
- **Hygiene (fecho Wave 14):** mover `WAVE14_DAY*_FINDINGS.md` `docs/strategy/` → `docs/archive/sessions/`.
