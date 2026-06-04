# Wave 14 — Day 1 Stale Copy Fix — Findings & Decisions

> Execução autónoma 2026-06-04. Branch `wave14-day1-stale-copy-fix` → dev.
> Tag dev `v1.8.3-stale-copy-fix-dev`. **Não promovido a prod** (só no fecho da Wave 14, v1.9.0).

## Key findings (TL;DR)

1. **Estrutura real ≠ brief**: as páginas vivem em `landing/app/(app)/…`, não `landing/src/app/…`. Componentes partilhados em `landing/app/_components/` (PascalCase, ex. `DataSourceBadge.tsx`), não `landing/src/components/`. Segui a convenção real do repo.
2. **Não existe literal `v0.9` no código** — a versão é sempre dinâmica (`frugal_version` vindo do último heartbeat). O "v0.9" em prod é apenas porque o sync do Paulo tem 52 dias. Logo F-2 = lógica stale-aware nos sítios de render, não um find/replace.
3. Todos os checks verdes: `tsc --strict` 0 erros, ESLint 0 warnings, **101/101 testes** (incl. 4 novos de `VersionBadge`). `classify.js` byte-identical (sha256 `7b01eb86…87762`).

## Decisões tomadas (para validação do Paulo)

### D1 — `VersionBadge` em `landing/app/_components/VersionBadge.tsx`
O brief indicava `landing/src/components/version-badge.tsx` (path inexistente). Coloquei-o junto dos outros componentes partilhados, em PascalCase, Client Component (`'use client'`). Lógica pura `versionBadgeInfo()` exportada e testada (vitest é node-env, sem RTL — mesmo padrão de `_phase_c.tsx`).

### D2 — Banner F-2 passou a ser sync-staleness, não version-major
O banner antigo ("Your CLI is on v0.9 — a newer major is out") disparava por `staleCliVersion()` (major < 1). Substituí pela lógica do brief: **`lastSync > 7d`** → "Last sync was {Nd}d ago. Run `mooter sync` from your CLI to refresh."
- Removi `staleCliVersion` + `CURRENT_CLI_MAJOR` (ficavam mortos → ESLint warning, e a CI exige 0 warnings).
- Honestidade: a versão só é tão fresca quanto o último heartbeat; deixou de fazer sentido nag de "upgrade de major" que não conseguimos confirmar.

### D3 — 1 campo aditivo em `/api/me` (`last_sync_at`)
O chip de versão do **header** vive no shell partilhado `app/(app)/layout.tsx` (renderizado em /dashboard E /settings), alimentado por `/api/me`, que **não** devolvia `last_sync_at`. Para tornar esse chip stale-aware adicionei `last_sync_at: latestDevice?.last_sync_at || null` à resposta.
- **Aditivo. Zero schema changes. Zero novo endpoint.** O device já tem `last_sync_at`.
- Se preferires não tocar em `/api/me`, o chip do header é o único sítio que perde o stale-marking; reverto numa linha.

### D4 — Testes que codificavam a copy stale foram atualizados (mantidos verdes)
"Tests landing mantidos" implicou atualizar 4 asserts que fixavam a copy agora removida — reescritos para validar a **nova** copy honesta (continuam significativos, não apenas relaxados):
- `phase-c.test.ts` — asserts `PHASE_C.*` agora exigem `mooter sync`/`mooter trail`/`mooter quiet`/`forge install` e **negam** `Wave 4 Phase D`/`ships Wave 5`.
- `b2b2.test.ts` F-7 — agora exige `syncStale`/`Last sync was`/`mooter sync` e nega `a newer major is out`.
- `b2b2.test.ts` F-10 — exige `mooter quiet --help` e nega `Wave 4 Phase D`.
- `wave12-dashboard.test.ts` — nota de honestidade passou de `don&apos;t fabricate numbers` para `no fabricated numbers`.

## Ficheiros tocados

| Ficheiro | Mudança |
|---|---|
| `app/_components/VersionBadge.tsx` | **novo** — componente + helper puro `versionBadgeInfo` |
| `app/_components/VersionBadge.test.tsx` | **novo** — 4 testes (fresh<7d, stale>7d, threshold, null/strip-v) |
| `app/(app)/dashboard/_phase_c.tsx` | `PHASE_C` (realTimeSync/perTier/settingsInCli/adapter) → copy honesta/actionable |
| `app/(app)/dashboard/page.tsx` | banner sync-stale, VersionBadge ×3 (devices, hero, explainer), per-task-type + misroute copy, removeu staleCliVersion |
| `app/(app)/settings/page.tsx` | VersionBadge na devices row, disclaimer F-10 sem "Wave 4 Phase D" |
| `app/(app)/layout.tsx` | header chip via VersionBadge + `last_sync_at` no ShellUser |
| `app/api/me/route.ts` | +`last_sync_at` (aditivo) |
| `app/(app)/dashboard/phase-c.test.ts`, `app/_components/b2b2.test.ts`, `app/_components/wave12-dashboard.test.ts` | asserts → nova copy |

## Não tocado (non-negotiables respeitados)
`classify.js` (sha idêntica) · hub · CLI · schemas · `/admin` · sem `git add -A`.
