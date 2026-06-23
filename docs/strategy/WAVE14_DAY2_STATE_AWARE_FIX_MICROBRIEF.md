# Wave 14 — Day 2 State-Aware Fixes (F-4 + F-6 + F-7 + F-10)

> **Goal**: trazer signed-in pages para estado "actual" — stats hero com
> data-source badge stale-aware, recommendations que sabem o que já está
> instalado, hardware labels formatados (não-raw payload).
>
> **Trigger**: Wave 14 14A audit findings, continuação do Day 1 (`v1.8.3-stale-copy-fix-dev`).
>
> **Scope**: 1 PR squash→dev, landing-only, 4 fixes coordenados. ~3h CC autonomous.
> Tag dev `v1.8.4-state-aware-dev`.
>
> **Non-negotiables**:
> - `classify.js` byte-identical (P11 sha256 `7b01eb86...87762`)
> - Zero schema changes
> - Zero hub touch
> - Zero CLI changes
> - Tests landing mantidos + novos para cada fix
> - Backwards-compat (UI evolution, não breaking)

---

## 0. Findings reproduzidos (do 14A audit)

### F-4 — Stats hero stale sem disclaimer

`/dashboard` mostra `$73.85 SAVED · 663 DECISIONS · 100% SAVED VS ALL-OPUS` em hero gigante. Stats são de **52 dias atrás** (último sync Paulo). Sem disclaimer.

### F-6 — Recommendations não state-aware

`/dashboard` mostra:
- `🔴 Install qwen2.5:3b for fast T0`
- `🟡 Install qwen3:30b for T0-smart`

Mas Paulo já tem `qwen3:30b` (visível no WSL2 statusline Day 5). Sync payload deve dizer quais models já instalados.

### F-7 — Settings hardware label raw

`/settings` mostra `Hardware: windows nvidia` (lowercase, raw payload).

### F-10 — Devices card (win32)

`/settings` devices: `DESKTOP-J26409Q (win32)`. Wave 10 B.2b.2 F-12 supostamente fixou para "Windows" — regressão ou fix incompleto.

---

## 1. Fix paths exactos

### Fix F-4 — DataSourceBadge on stats hero

**Reusar existing `DataSourceBadge`** de Wave 10 B.1a (componente em `landing/app/_components/` ou equivalente).

Wire em `/dashboard` stats hero:
- Se `last_sync_at` > 7 dias atrás → badge `Last sync {N}d ago — outdated · run \`mooter sync\``
- Se `last_sync_at` ≤ 7 dias → badge `Live · last sync {N}d ago` (verde)
- Se `last_sync_at` null → badge `Demo · run \`mooter init\``

Stats podem permanecer visíveis sempre — só o badge contextualiza.

**Anti-pattern**: NÃO esconder stats. Vibe coders precisam de ver "$73.85" para entender valor. Só clarificar source.

### Fix F-6 — Recommendations state-aware

**Lê `installedOllamaModels` do sync payload** (já existe ou adicionar — provavelmente já existe via Wave 10 B.1a hub aggregation).

Logic em `recommendations.tsx` (ou onde está):
```ts
const recommendations = RECS.filter(rec => {
  if (rec.type === 'ollama_pull' && installedOllamaModels.includes(rec.model)) {
    return false; // already installed, hide
  }
  return true;
});

if (recommendations.length === 0) {
  return <p>✓ All recommended models installed. Your setup is optimal.</p>;
}
```

**Anti-pattern**: NÃO assume model name format — Ollama returns `qwen3:30b` exact. Match string after `:` for tag.

### Fix F-7 — Settings hardware label

**Reusar `formatGpuLabel()`** de Wave 10 B.2b.1 F-2 (componente em `landing/app/_lib/` ou equivalente).

`/settings` `Hardware: windows nvidia` → `Hardware: Windows · NVIDIA GeForce RTX 4090` (ou similar).

Aplicar `formatOsLabel()` + `formatGpuLabel()` na mesma string.

### Fix F-10 — Devices card formatOsLabel

`/settings` devices row: `DESKTOP-J26409Q (win32)` → `DESKTOP-J26409Q (Windows)`.

Aplicar `formatOsLabel()` no platform field.

Idênticamente em `/dashboard` devices section se existir.

---

## 2. Recon comandos

```bash
# Find DataSourceBadge component (Wave 10 B.1a)
grep -rn "DataSourceBadge" landing/

# Find formatGpuLabel + formatOsLabel (Wave 10 B.2b.1)
grep -rn "formatGpuLabel\|formatOsLabel" landing/

# Find recommendations source
grep -rn "qwen3:30b\|qwen2.5:3b" landing/

# Find stats hero in dashboard
grep -rn "SAVED VS ALL-OPUS\|DECISIONS" landing/

# Find installedOllamaModels in sync payload
grep -rn "installedModels\|ollama_models" landing/

# Verify classify.js byte-identical
sha256sum tools/router/classify.js
```

---

## 3. Sequência (1 PR, ~3h CC autonomous)

1. **Recon** (20 min) — grep DataSourceBadge, formatGpuLabel, recommendations source
2. **F-4 DataSourceBadge wire** (45 min) — stats hero conditional badge
3. **F-6 Recommendations state-aware** (60 min) — filter logic + empty state
4. **F-7 + F-10 formatters** (30 min) — apply existing helpers
5. **Visual verification** (20 min) — Vercel preview local
6. **Tests** (30 min) — landing tests + novos para cada fix
7. **classify.js sha256 check** (5 min)
8. **PR squash→dev** branch `wave14-day2-state-aware-fix`
9. **final-reviewer T2 (Sonnet)** — F-6 logic merece T2 review
10. **Tag dev** `v1.8.4-state-aware-dev`

---

## 4. Definition of Done (Day 2)

1. ✅ DataSourceBadge wired em stats hero `/dashboard` com 3 estados (Live ≤7d / Outdated >7d / Demo)
2. ✅ Recommendations filtra modelos já instalados + empty state se nenhuma rec
3. ✅ Settings `Hardware:` usa formatGpuLabel + formatOsLabel
4. ✅ Devices card platform usa formatOsLabel (corrige regressão F-12)
5. ✅ Tests landing mantidos + 4 new tests (F-4 badge / F-6 filter / F-7 hardware / F-10 platform)
6. ✅ `classify.js` byte-identical
7. ✅ PR squash→dev + tag dev `v1.8.4-state-aware-dev`
8. ✅ final-reviewer T2 Sonnet PASS

---

## 5. Anti-patterns

- ❌ NÃO inventar models recomendados — usa lista existente
- ❌ NÃO criar formatters novos — reusar existing
- ❌ NÃO mudar shape do sync payload sem schema migration
- ❌ NÃO esconder stats hero (vibe coder precisa de ver valor)
- ❌ NÃO refactor recommendations engine — só adicionar filter
- ❌ NÃO tocar em `/admin` (lower priority Day 3 separate)
- ❌ NÃO `git add -A`

---

## 6. Master prompt para CC (paste when ready)

```
Inicia Wave 14 Day 2 State-Aware Fix conforme docs/strategy/WAVE14_DAY2_STATE_AWARE_FIX_MICROBRIEF.md.

Pré-flight: Wave 14 Day 1 EM DEV (v1.8.3-stale-copy-fix-dev, PR #77 merged). 14A audit complete.

Scope: Day 2 fixes F-4 + F-6 + F-7 + F-10 = stats hero data-source badge + recommendations state-aware (filtra modelos já instalados) + Settings/Devices format hardware labels. Landing-only.

Lê PRIMEIRO:
  - docs/strategy/WAVE14_DAY2_STATE_AWARE_FIX_MICROBRIEF.md inteiro
  - docs/strategy/WAVE14_14A_QUALITY_AUDIT_FINDINGS.md (contexto findings)
  - landing/app/_components/DataSourceBadge.tsx (ou equivalente — reusar de Wave 10 B.1a)
  - landing/app/_lib/formatGpuLabel + formatOsLabel (de Wave 10 B.2b.1)
  - landing/app/(app)/dashboard/* (stats hero + recommendations)
  - landing/app/(app)/settings/* (hardware + devices)

Non-negotiables:
  - classify.js byte-identical (sha256 7b01eb86...87762)
  - Zero schema changes / zero hub touch / zero CLI changes
  - Tests landing mantidos + 4 new tests
  - Backwards-compat
  - NÃO mexer em /admin
  - NÃO esconder stats hero — só clarificar via badge

Sequência (~3h autonomous):
  1. Recon — grep DataSourceBadge, formatGpuLabel/formatOsLabel, installed models source
  2. F-4 — DataSourceBadge wire stats hero (3 estados Live/Outdated/Demo)
  3. F-6 — Recommendations filter installed models + empty state
  4. F-7 — Settings hardware formatGpuLabel + formatOsLabel
  5. F-10 — Devices card formatOsLabel (corrige regressão F-12)
  6. Tests novos (4: F-4 badge, F-6 filter, F-7 hardware, F-10 platform)
  7. classify.js sha256 check
  8. PR squash→dev branch wave14-day2-state-aware-fix
  9. final-reviewer T2 Sonnet (F-6 merece T2)

Tag dev v1.8.4-state-aware-dev. NÃO promote prod ainda.

Reporta WAVE14_DAY2_FINDINGS.md se houver decisões para Paulo (path real ≠ brief, etc).
```

---

**Composed by Cowork, 2026-06-04 evening. Day 2 fixes state-aware UI evolution.
~3h CC autonomous. Tag dev v1.8.4-state-aware-dev. Não promote prod até Wave 14
closure (v1.9.0 ao fim de Day 5).**
