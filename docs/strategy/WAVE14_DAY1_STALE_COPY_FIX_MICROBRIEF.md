# Wave 14 — Day 1 Stale Copy Fix (F-3 + F-2 + F-5)

> **Goal**: strip "ships Wave 4 Phase D" + "ships Wave 5" promises stale, replace
> by honest messaging. Hide "v0.9" CLI version label when last sync > 7 days
> (instead show "Last sync Nd ago — outdated"). Replace adapter footer message
> with actionable `mooter forge install` CTA.
>
> **Trigger**: Wave 14 14A audit findings (`WAVE14_14A_QUALITY_AUDIT_FINDINGS.md`)
> 12 findings · 3 critical. Day 1 = quick wins copy-only (no functional changes).
>
> **Scope**: 1 PR squash→dev, landing-only, copy + 1 conditional render. ~3h CC autonomous.
>
> **Non-negotiables**:
> - `classify.js` byte-identical (P11)
> - Zero schema changes
> - Zero hub touch
> - Zero CLI changes
> - Tests landing mantidos
> - Backwards-compat (apenas copy)

---

## 0. Findings reproduzidos (do 14A audit)

### F-3 — "Ships Wave X" stale strings

Recolhidos via Chrome MCP get_page_text 2026-06-04 nas páginas signed-in:

| Local | String stale | Razão |
|---|---|---|
| `/dashboard` | "Real-time CLI↔cloud sync ships Wave 4 Phase D (CF Workers backend)" | Wave 4 Phase D nunca shipped, scope ainda pendente |
| `/dashboard` | "Per-task-type savings ... ships with the per-category telemetry pipeline (Wave 4 Phase D). Not estimated here — we don't fabricate numbers." | Mesmo razão |
| `/dashboard` | "Misroute report — ... ships with the same pipeline. Today: inspect locally with `mooter trail`." | Mesmo razão |
| `/dashboard` | "Per-tier breakdown (T0–T3) ships Wave 4 Phase D" | Mesmo razão |
| `/dashboard` footer | "🐮 Mooter dashboard — synced session data. Real-time CLI↔cloud sync ships Wave 4 Phase D (CF Workers backend)." | Mesmo razão |
| `/dashboard` footer | "Adapter: ◌ baseline (LoRA ships Wave 5 · Adapter Forge)." | **Wave 5 shipped 2026-05-27**, copy stale |
| `/settings` | "Telemetry, sync cadence & adapter are managed in your CLI (`mooter quiet --help`). Cloud-side editing ships Wave 4 Phase D." | Wave 4 Phase D não shipped |

### F-2 — "v0.9" label in headers and devices card

Locations:
- `/dashboard` header top-right: literal `v0.9` next to "Dashboard" title
- `/settings` header top-right: literal `v0.9`
- `/dashboard` body: "Your CLI is on v0.9 — a newer major is out. Update with bash <(curl -fsSL https://mooter.ai/install.sh)" banner
- `/dashboard` mini-card: "mooter v0.9"
- `/settings` devices card: "Windows · gpu-high · v0.9"

Causa: o version label vem do sync payload (último heartbeat). Paulo's CLI no Win sync foi há 52 dias. **Não consigo refrescar o sync (Wave 4 Phase D)**. Mas posso **esconder ou marcar como stale**.

### F-5 — Adapter footer stale

Footer atual: `"Adapter: ◌ baseline (LoRA ships Wave 5 · Adapter Forge)."`

Wave 5 já shipped. `mooter forge install` works (visto em prod statusline "mooter forge install" CTA).

---

## 1. Fix paths exactos

### Fix F-3.1 — Strip "ships Wave 4 Phase D" copy

**Search & Replace** (em ficheiros `landing/src/app/(app)/dashboard/*` + `landing/src/app/(app)/settings/*`):

| Find | Replace with |
|---|---|
| `"Real-time CLI↔cloud sync ships Wave 4 Phase D (CF Workers backend)."` | `"Showing your last synced session. Run `mooter sync` to refresh."` |
| `"Per-task-type savings ... ships with the per-category telemetry pipeline (Wave 4 Phase D). Not estimated here — we don't fabricate numbers."` | `"Per-task-type breakdown is computed locally by your CLI. Run `mooter trail` to inspect."` |
| `"Misroute report — Prompts where a higher tier would have helped — ships with the same pipeline. Today: inspect locally with mooter trail."` | `"Misroute report — Run `mooter trail` locally to inspect prompts where a higher tier would have helped."` |
| `"Per-tier breakdown (T0–T3) ships Wave 4 Phase D."` | `"Per-tier breakdown — Run `mooter trail` for the per-tier view of your last session."` |
| `"Telemetry, sync cadence & adapter are managed in your CLI (mooter quiet --help). Cloud-side editing ships Wave 4 Phase D."` | `"Telemetry, sync cadence & adapter are managed in your CLI. Run `mooter quiet --help` for options."` |

**Anti-pattern**: NÃO criar nova section "Wave 4 Phase D backlog" — só strip. Mantém UI minimal.

### Fix F-2 — Hide "v0.9" label when stale

**Logic**: dashboard reads `lastSync` from sync state. If `Date.now() - lastSync > 7 days`:
- **Hide** literal "v0.9" version chip in header
- **Replace** banner "Your CLI is on v0.9 — a newer major is out" by `"Last sync was {Nd} days ago. Run `mooter sync` from CLI to refresh."` 
- **Replace** "mooter v0.9" card with `"Last seen: v{X} ({Nd}d ago)"` where X is whatever last synced version was
- **Devices card**: `"Windows · gpu-high · v0.9 (stale)"` with grey colour

If `lastSync` < 7 days: keep current behavior (show version as-is).

**Component**: criar `<VersionBadge lastSync={timestamp} version={string} />` em `landing/src/components/version-badge.tsx`.

```tsx
export function VersionBadge({ lastSync, version }: { lastSync: Date | null; version: string }) {
  if (!lastSync || !version) return null;
  const daysSince = Math.floor((Date.now() - lastSync.getTime()) / 86400000);
  if (daysSince > 7) {
    return <span className="text-muted-foreground">v{version} ({daysSince}d ago, stale)</span>;
  }
  return <span>v{version}</span>;
}
```

Aplica em:
- `/dashboard` header chip
- `/dashboard` "mooter vX" mini-card
- `/settings` devices row
- `/dashboard` banner (replace by stale message if > 7d)

### Fix F-5 — Replace Adapter footer

| Find | Replace with |
|---|---|
| `"Adapter: ◌ baseline (LoRA ships Wave 5 · Adapter Forge)."` | `"Adapter: baseline — Run \`mooter forge install\` to activate LoRA adapter for your stack."` |

---

## 2. Recon comandos

```bash
# Find files with stale "Wave X" copy
grep -rn "ships Wave 4 Phase D" landing/
grep -rn "ships Wave 5" landing/
grep -rn "LoRA ships" landing/

# Find v0.9 hardcoded vs dynamic
grep -rn "v0.9" landing/
grep -rn "lastSync" landing/src/app/\(app\)/

# Verify classify.js byte-identical (must NOT change)
sha256sum tools/router/classify.js
# Expected: 7b01eb8623a0b8fcff17b976e9afcf572f3a762bf60c578a5099dac014b87762
```

---

## 3. Sequência (1 PR, ~3h CC autonomous)

1. **Recon** (15 min) — grep all stale strings, list files affected
2. **Component creation** (30 min) — `VersionBadge` component + tests
3. **Apply fixes** (1.5h) — find/replace stale strings + wire VersionBadge into dashboard/settings
4. **Visual verification** (15 min) — local Vercel preview (or run landing dev)
5. **Tests** (15 min) — landing tests mantidos + 2 new VersionBadge tests (fresh < 7d, stale > 7d)
6. **classify.js sha256 check** (5 min)
7. **PR squash→dev** branch `wave14-day1-stale-copy-fix`
8. **final-reviewer T1 (Haiku)** suficiente — copy-only changes
9. **Tag dev** `v1.8.3-stale-copy-fix-dev`

---

## 4. Definition of Done (Day 1)

1. ✅ Strings "ships Wave 4 Phase D" stripped/replaced (7 sítios)
2. ✅ String "ships Wave 5" replaced with actionable `mooter forge install`
3. ✅ `VersionBadge` component criado + tests
4. ✅ "v0.9" replaced with stale-aware logic (`v{X} (Nd ago, stale)` quando > 7d)
5. ✅ Banner "Your CLI is on v0.9 — a newer major is out" replaced
6. ✅ Tests landing mantidos + 2 new VersionBadge tests
7. ✅ `classify.js` byte-identical sha256 `7b01eb86...87762`
8. ✅ PR squash→dev + tag dev `v1.8.3-stale-copy-fix-dev`

---

## 5. Anti-patterns

- ❌ NÃO refactor componente existente — só copy changes
- ❌ NÃO trazer "Wave 4 Phase D" copy noutros sítios (search whole repo, not just dashboard)
- ❌ NÃO partir Server Components / Client Components ratio (VersionBadge é Client)
- ❌ NÃO mexer em `classify.js`, hub schemas, CLI
- ❌ NÃO `git add -A`
- ❌ NÃO criar novos endpoints
- ❌ NÃO sync hub changes
- ❌ NÃO mexer em `/admin` (lower priority, separate)

---

## 6. Master prompt para CC (paste when ready)

```
Inicia Wave 14 Day 1 Stale Copy Fix conforme docs/strategy/WAVE14_DAY1_STALE_COPY_FIX_MICROBRIEF.md.

Pré-flight: Wave 13.1 v1.8.2-digest-stderr-fix EM PROD. Wave 14 14A audit complete (12 findings em docs/strategy/WAVE14_14A_QUALITY_AUDIT_FINDINGS.md).

Scope: Day 1 fixes F-3 + F-2 + F-5 = strip stale "ships Wave 4 Phase D" + "ships Wave 5" copy + hide/marca-como-stale "v0.9" labels quando lastSync > 7d. Landing-only, copy + 1 conditional component.

Lê PRIMEIRO:
  - docs/strategy/WAVE14_DAY1_STALE_COPY_FIX_MICROBRIEF.md inteiro
  - docs/strategy/WAVE14_14A_QUALITY_AUDIT_FINDINGS.md (contexto findings)
  - landing/src/app/(app)/dashboard/* (todos)
  - landing/src/app/(app)/settings/* (todos)
  - landing/src/components/ (existing shadcn components)

Non-negotiables:
  - classify.js byte-identical (sha256 7b01eb86...87762)
  - Zero schema changes / zero hub touch / zero CLI changes
  - Tests landing mantidos + 2 new VersionBadge tests
  - Backwards-compat (copy + 1 component only)
  - NÃO mexer em /admin

Sequência (~3h autonomous):
  1. grep para localizar todas strings stale "ships Wave 4 Phase D" e "ships Wave 5"
  2. Criar component VersionBadge (Client Component) conforme §1 do brief
  3. Apply find/replace strings stale (lista em §1 Fix F-3.1 do brief)
  4. Wire VersionBadge em dashboard header, devices card, settings devices row
  5. Replace banner "Your CLI is on v0.9 — a newer major is out" por stale-aware message
  6. Replace adapter footer "LoRA ships Wave 5" por "Run mooter forge install"
  7. Tests: landing existentes mantidos + 2 new VersionBadge tests (fresh < 7d, stale > 7d)
  8. classify.js sha256 check
  9. PR squash→dev branch wave14-day1-stale-copy-fix
  10. final-reviewer T1 (Haiku) — copy-only, low risk

Tag dev v1.8.3-stale-copy-fix-dev (não fazer tag prod ainda — promote ao fim de Wave 14 v1.9.0).

Reporta WAVE14_DAY1_FINDINGS.md se houver decisões para Paulo durante execução.
```

---

**Composed by Cowork, 2026-06-04 evening. Day 1 fixes targeting F-3 (stale "ships
Wave X" copy) + F-2 (v0.9 stale-aware display) + F-5 (Adapter forge actionable
CTA). ~3h CC autonomous. Tag dev v1.8.3-stale-copy-fix-dev. Não promote prod até
Wave 14 closure Day 5.**
