# Wave 14 — Day 2 State-Aware Fix — Findings & Decisions

> Execução autónoma 2026-06-04. Branch `wave14-day2-state-aware-fix` → dev.
> Tag dev `v1.8.4-state-aware-dev`. **Não promovido a prod** (só no fecho da Wave 14, v1.9.0).

## Key findings (TL;DR)

1. **F-10 já estava resolvido em `dev`** — ambas as device rows (settings linha ~281, dashboard linha ~226) já usavam `osLabel(d.os_type)` (`win32 → Windows`, fix B.2b.2 F-12 presente). O "(win32)" do audit era da build de **prod antiga**. Adicionei teste de regressão; sem mudança de código necessária.
2. **F-4 badge já existia** mas hardcoded `source="live"` no hero — o problema real era ser sempre "Live" mesmo com sync de 52 dias. Estendi o `DataSourceBadge` com 3º estado `outdated` (amber), backwards-compat.
3. **F-6**: a fonte de verdade dos modelos instalados é `device.ollama_models` (sync payload), **não** os flags legacy `frugal_config.ollama_has_*`. A coluna já existe e flui via `/api/profile` (`getDevices` faz `select=*`). Por isso o `qwen3:30b` do Paulo continuava a aparecer como recomendação.
4. Tudo verde: `tsc --strict` 0 · ESLint 0 warnings · **111/111 testes** (incl. 10 novos). `classify.js` byte-identical (sha256 `7b01eb86…87762`).

## Decisões tomadas (para validação do Paulo)

### D1 — `formatGpuLabel` vive em `app/onboarding/_lib/hardware.ts` (não `app/_lib/`); `formatOsLabel` não existe
O brief referia `landing/app/_lib/formatGpuLabel + formatOsLabel`. Na realidade: `formatGpuLabel()` está em `onboarding/_lib/hardware.ts` (reutilizei-o). **`formatOsLabel` não existe** — o formatador de OS de facto é a função local `osLabel(win32→Windows)` duplicada em dashboard/settings/layout. Reutilizei a `osLabel` local em vez de criar um novo formatter (anti-pattern proíbe criar formatters novos; não fiz refactor para centralizar).

### D2 — F-4: estendi `DataSourceBadge` com estado `outdated` (não criei componente novo)
`source: "live" | "outdated" | "demo"`. Verde / amber / muted. Callers existentes (`live`/`demo`) inalterados. Hero passou de `source="live"` fixo para `heroDataSource(last_sync_at, decisionsCount>0)`:
- ≤7d → **Live · N devices · last sync …**
- >7d → **Outdated · last sync {N}d ago · run `mooter sync`**
- sem sync/sem dados → **Demo · run `mooter init`**
Stats nunca escondidos (anti-pattern respeitado) — só o badge contextualiza.

### D3 — F-6: `ollama_models` adicionado ao Device type (aditivo) + filtro state-aware
- Adicionei `ollama_models?: string[]` ao interface `Device` (dashboard) — **aditivo, zero schema change** (a coluna já existe; o `/admin` já a lê).
- Novo módulo puro `app/(app)/dashboard/_state.ts`: `heroDataSource`, `installedOllamaModels` (dedup cross-device), `isModelInstalled` (match exacto de tag; rec sem tag faz match de qualquer tag do repo).
- `getRecommendations`: as recs `qwen2.5:3b` / `qwen3:30b` agora também escondem se `isModelInstalled(installed, …)`.
- Empty-state ("Your setup is optimised"): `applied` agora lê `installedOllamaModels` (fonte real) em vez de só os flags legacy — não desaparece quando os modelos vêm do payload.

### D4 — F-7: `formatGpuLabel` aplicado a 3 sítios no dashboard + label de hardware em settings
- Dashboard: `gpuLabel` (Hardware grid), hero device line, e `gpuName` (explainer) — todos passam por `formatGpuLabel` (desembrulha ANGLE/PCI/D3D noise → "NVIDIA GeForce RTX 4090").
- Settings: adicionei `gpu_name?` ao Device type (aditivo) e construo `hardwareLabel = osLabel(os) · formatGpuLabel(gpu)`, fallback ao tier formatado. "windows nvidia" → "Windows · NVIDIA GeForce RTX 4090".

### D5 — 1 teste pré-existente atualizado
`b2b.test.ts` F-5 fixava o comentário `honesty layer parity with Workflow` (que substituí). Reescrito para validar que o hero continua a ter `DataSourceBadge` agora ligado a `heroDataSource` (mantido verde e significativo).

## Ficheiros tocados

| Ficheiro | Mudança |
|---|---|
| `app/(app)/dashboard/_state.ts` | **novo** — helpers puros (heroDataSource, installedOllamaModels, isModelInstalled) |
| `app/(app)/dashboard/state-aware.test.ts` | **novo** — 10 testes (F-4/F-6/F-7/F-10) |
| `app/_components/DataSourceBadge.tsx` | +estado `outdated` (backwards-compat) |
| `app/(app)/dashboard/page.tsx` | F-4 hero badge, F-6 filtro+empty-state, F-7 formatGpuLabel ×3, +`ollama_models` no Device |
| `app/(app)/settings/page.tsx` | F-7 hardwareLabel, +`gpu_name` no Device |
| `app/_components/b2b.test.ts` | F-5 assert atualizado |

## Não tocado (non-negotiables respeitados)
`classify.js` (sha idêntica) · hub · CLI · schemas · `/admin` · stats hero não escondidos · sem `git add -A`.
