# Wave 14 — Day 4 (14B-B) Dashboard + Settings Dark Parity — Findings & Decisions

> Execução autónoma 2026-06-04. Branch `wave14-day4-dashboard-settings-dark-parity` → dev.
> Tag dev `v1.8.6-app-dark-parity-dev`. **Não promovido a prod** (v1.9.0 ao fecho da Wave 14).

## Key findings (TL;DR)

1. **Não havia microbrief Day 4.** Apliquei o objetivo explícito ("dashboard + settings dark parity") + o template do Day 3 (`.onboarding-shell`). 
2. Fix cirúrgico (mesmo padrão do Day 3): novo modifier `.app-shell-dark` que **partilha o bloco de tokens dark** com `.onboarding-shell`, aplicado em `(app)/layout.tsx` em todas as rotas **exceto `/admin`**. Dashboard + settings ficam dark; **`/admin` mantém-se light** (guardrail "não mexer em /admin").
3. Tudo verde: `tsc` 0 · ESLint 0 · **119/119 testes** (+3) · `next build` ✓ · `classify.js` byte-identical.

## Decisões tomadas (para validação do Paulo)

### D1 — Route-scoped dark (admin fica light)
`.app-shell-root` (tokens light parchment) é partilhado por dashboard/settings/**admin** via `(app)/layout.tsx`. Para dar dark a dashboard+settings **sem** tocar no admin (guardrail), o layout calcula:
```
const shellClass = pathname.startsWith('/admin') ? 'app-shell-root' : 'app-shell-root app-shell-dark';
```
e aplica-o nos wrappers do shell autenticado (loading + main). `/admin` → só `app-shell-root` (light). **Se preferires admin dark também**, é trivial: remover a condição `/admin`.

### D2 — `.app-shell-dark` partilha o bloco dark do Day 3
Em vez de duplicar tokens, estendi os blocos do Day 3: selector `.onboarding-shell, .app-shell-dark { … }` e a regra body `html:has(.onboarding-shell), html:has(.app-shell-dark) { … }`. **Ordem em CSS importa**: `.app-shell-dark` está declarado **depois** de `.app-shell-root`; num elemento com ambas as classes (dashboard/settings), os tokens dark ganham por source-order (especificidade igual). Idem para a regra body dark (depois da light).

### D3 — Login gate (signed-out) fica light, fora de scope
O 3º wrapper `app-shell-root` em `layout.tsx` pertence a um **componente separado** (o ecrã de login `login-hero`, sem `pathname`/`shellClass` em scope). Não é dashboard nem settings → deixei-o light (literal `app-shell-root`). Brand parity do login pode ser um follow-up.

### D4 — Bug-fix necessário (TerminalBlock, mesma classe do Day 3)
`TerminalBlock` (dashboard) tem bg dark hardcoded `#0D0B08` e o texto default das linhas usava `var(--cream)`. No scope dark, `--cream`→ink escuro (texto-em-CTA-rosa) ⇒ **invisível** no terminal dark. Fixei a linha para `#F2ECDF` explícito (consistente com os outros terminal blocks do dashboard que já usam `#F2ECDF`). Restantes `var(--cream)` (dashboard:295 era este; settings:137 avatar) são texto-sobre-accent → ink escuro correcto.

### D5 — Teste do Day 3 ajustado
A regex do `brand-parity.test.ts` assumia `.onboarding-shell {`; como o selector passou a partilhado (`.onboarding-shell, .app-shell-dark {`), tornei a regex tolerante até à `{`. Continua a validar os tokens dark.

## Auditoria de cores (sem outras regressões light-on-dark)
Os hardcoded `#F2ECDF` em dashboard (766, 893) já são texto claro sobre terminal dark `#0D0B08` → corretos. DataSourceBadge usa `var(--color-*)` com fallbacks → theme-independent. Restante UI usa tokens (`--surface`/`--accent`/`--text`/`--border`) → remapeados pelo scope.

## Ficheiros tocados

| Ficheiro | Mudança |
|---|---|
| `app/globals.css` | `.app-shell-dark` partilha bloco dark do Day 3 + regra body `html:has(.app-shell-dark)` |
| `app/(app)/layout.tsx` | `shellClass` (dark exceto /admin) nos 2 wrappers do shell autenticado |
| `app/(app)/dashboard/page.tsx` | TerminalBlock texto default `var(--cream)` → `#F2ECDF` |
| `app/(app)/dark-parity.test.ts` | **novo** — 3 testes (scope dark/admin, tokens, terminal fix) |
| `app/onboarding/brand-parity.test.ts` | regex tolerante ao selector partilhado |

## Gates
- `tsc --strict` 0 · ESLint 0 warnings · **119/119 testes** · `next build` ✓ Compiled successfully.
- `classify.js` byte-identical (sha256 `7b01eb86…87762`).
- Zero schema/hub/CLI · `/admin` intocado (light) · funcionalidade inalterada (só tema).

## Pendente
- **Visual review (Cowork):** Chrome MCP preview Vercel `/dashboard` + `/settings` dark vs landing.
- **Day 5:** closure + tag prod `v1.9.0`.
- **Hygiene (fecho):** mover `WAVE14_DAY*_FINDINGS.md` `docs/strategy/` → `docs/archive/sessions/`.
- Eventual: brand parity do login gate + (decisão) admin dark.
