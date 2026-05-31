# Wave 4 Phase C — Dashboard Cloud (extend, NOT replace)

> **Como usar**: cola no Claude Code. Self-contained.
>
> **Pré-requisitos**: tag `v0.4.0-auth` em dev (W4 Phase B). Working dir = `~/mooter`. **Auth Supabase já live** no `landing/` desde Wave 4 Phase A.
>
> **⚠️ LIÇÃO Wave 4 Phase B**: landing/ NÃO é greenfield. Já tem `app/(app)/dashboard`, `/api/me`, `<LoginHero/>`, middleware vivo. **OBRIGATÓRIO recon primeiro** — se sub-feature já existe, ADAPTAR não duplicar (como fizeste em Phase B).

---

=== START ===

## 0. Quem és e missão

És Claude Code Opus 4.8 no `~/mooter/`, branch `wave4-phase-c-dashboard-cloud` (cria de `dev`). `--permission-mode bypassPermissions`.

**Missão Wave 4 Phase C**: estender o dashboard existente em `app/(app)/dashboard` com 5 features que dão à área logada uma vista útil sobre o Mooter local. NÃO criar novo dashboard — extend o que existe.

### Recon OBRIGATÓRIO antes de qualquer código

Lê primeiro (sem modificar):
- `landing/app/(app)/dashboard/page.tsx` (e ficheiros relacionados)
- `landing/app/api/me/route.ts`, `landing/app/api/profile/route.ts`, `landing/app/api/cli-token/route.ts`
- `landing/app/lib/supabase/` — clientes existentes
- `landing/components/` — componentes reutilizáveis (LoginHero, etc.)
- `packages/cli/src/commands/login.ts` (W4 B) — token format
- `packages/cli/src/commands/hub.ts` (W3 D2) — dados expostos pelo CLI

**Reporta a tua leitura ao Paulo antes de implementar** (como fizeste em Phase B). Se descobrires que alguma sub-feature já existe, propõe adaptação.

5 sub-features (ASSUMINDO greenfield — adaptar conforme recon):

1. **CLI Connection Status card** — header card que mostra "CLI connected · paulo@example.com" ou "Not connected · run `mooter login`"
2. **Activity Overview chart** — gráfico simples de tier distribution last 7d (mock data até Wave 4 D shippar real sync)
3. **Sync History table** — placeholder com "Sync ships in Wave 4 Phase D" + última operação dry-run (se houver)
4. **Settings panel** — UI para toggle telemetry consent, ver packs, ver hardware class (read-only neste Phase)
5. **Honest disclaimers** — claros sobre "mock data até Wave 4 D" + "Adapter Forge ships Wave 5" + "Real-time CLI sync requires Wave 4 D backend"

## 1. Invariantes (NÃO-NEGOCIÁVEIS)

- ❌ **classify.js byte-identical** (P11)
- ❌ **safety_boost.js critical phrases preserved** (W3 D1)
- ❌ **mooter_event + sync_event schemas INTACTOS**
- ❌ **landing/ Phase A + auth Supabase + dashboard existente INTACTOS** — APENAS adicionar/extender
- ❌ **NÃO inventar real-time CLI data** — usar mocks com label claro "mock"
- ❌ **NÃO fazer chamadas reais para CF Workers** (Wave 4 D ainda não shippa)
- ❌ **NÃO armazenar dados sensíveis** em localStorage/sessionStorage (per Cowork artifact rules)
- ❌ **Não `git add -A`** · **`--no-verify`** · merge para `main`
- ✅ **Final-reviewer T3-gate** obrigatório
- ✅ **Auto-merge para dev** após APPROVE
- ✅ **Tag v0.4.1-dashboard-cloud**
- ✅ **Vocabulário GLOSSARY** (Mooter/Moos)
- ✅ **Honesty**: cada widget mock tem label visível "Demo data — real data ships Wave 4 Phase D"

## 2. Branch + recon

```bash
cd ~/mooter
git checkout dev
git pull origin dev
git log --oneline -5  # confirma ee95c0f + tag v0.4.0-auth
git tag -l | grep v0.4.
git checkout -b wave4-phase-c-dashboard-cloud
```

Recon detalhado:
```bash
# Dashboard structure
find landing/app -type d -name 'dashboard' | head
ls -la landing/app/\(app\)/dashboard/ 2>/dev/null

# APIs disponíveis
ls landing/app/api/
cat landing/app/api/me/route.ts 2>/dev/null
cat landing/app/api/profile/route.ts 2>/dev/null

# Components reutilizáveis
ls landing/components/

# Settings existe?
find landing/app -type d -name 'settings' | head

# Auth token format (W4 B)
cat ~/.mooter/auth.json 2>/dev/null  # se existir
```

## 3. Sub-feature 1 — CLI Connection Status

### 3.1 Behaviour

Card no topo do dashboard:

**Connected state**:
```
┌──────────────────────────────────────────────────────────┐
│ 🐮 CLI connected · paulo@example.com                     │
│ Last sync: 2026-05-31T18:30Z (dry-run · 4 events queued) │
│ [ Run mooter sync --dry-run ] [ Logout ]                 │
└──────────────────────────────────────────────────────────┘
```

**Not connected state**:
```
┌──────────────────────────────────────────────────────────┐
│ ⚪ CLI not connected                                      │
│ Connect your terminal to see your Mooter data here       │
│ [ Run `mooter login` ]                                    │
└──────────────────────────────────────────────────────────┘
```

### 3.2 Implementação

`landing/app/(app)/dashboard/_components/CliStatus.tsx` (NEW — ou path actual conforme recon):

```tsx
'use server';
import { getCurrentUser } from '@/lib/supabase';  // ajustar path conforme existente

export async function CliStatus() {
  const user = await getCurrentUser();
  
  // Check if CLI is connected (server-side cannot read ~/.mooter/auth.json directly)
  // Approach: CLI sends a `last_seen` heartbeat via /api/cli-status endpoint
  // For now (Phase C): show heuristic based on auth.json existence detected via cookie indicator
  
  const cliConnected = await checkCliConnection(user?.id);
  
  if (!cliConnected) {
    return <NotConnectedCard />;
  }
  return <ConnectedCard user={user} lastSync={getLastSyncTime()} />;
}

function NotConnectedCard() {
  return (
    <div className="border border-[#3a3a3a] rounded p-6 mb-6">
      <h3 className="text-lg mb-2">⚪ CLI not connected</h3>
      <p className="opacity-80 mb-4">Connect your terminal to see your Mooter data here.</p>
      <code className="block p-3 bg-[#1a1a1a] rounded">mooter login</code>
    </div>
  );
}
```

### 3.3 Tests

`landing/app/(app)/dashboard/__tests__/cli-status.test.tsx`:
- Connected state renders email + last sync
- Not connected renders mooter login code

## 4. Sub-feature 2 — Activity Overview chart

### 4.1 Behaviour

Card mid-dashboard:

```
┌────────────────────────────────────────────────────────────┐
│ Activity (last 7 days)                                     │
│ ╔══════════════════════════════════════╗                  │
│ ║ T0 ████████████████ 65%             ║                  │
│ ║ T1 ████ 12%                          ║                  │
│ ║ T2 ██ 8%                             ║                  │
│ ║ T3 █ 5% · █ 10% safety boosts       ║                  │
│ ╚══════════════════════════════════════╝                  │
│ Demo data — real data ships Wave 4 Phase D                │
└────────────────────────────────────────────────────────────┘
```

### 4.2 Implementação

Mock data hardcoded com label "Demo data". Quando Wave 4 D shippar, substitui por fetch real.

```tsx
const MOCK_TIER_DISTRIBUTION = {
  T0: 65, T1: 12, T2: 8, T3: 15,
  safety_boost_pct: 10,
  isMock: true,
};

function ActivityChart({ data = MOCK_TIER_DISTRIBUTION }) {
  return (
    <div className="border border-[#3a3a3a] rounded p-6 mb-6">
      <h3 className="text-lg mb-4">Activity (last 7 days)</h3>
      <SimpleBarChart data={data} />
      {data.isMock && (
        <p className="text-sm opacity-60 mt-4">
          ⓘ Demo data — real data ships Wave 4 Phase D (CF Workers backend)
        </p>
      )}
    </div>
  );
}
```

Use ANSI-style bar chart with divs (no chart library dep). Honesty: NO inventar números reais.

### 4.3 Tests

- Mock data renders correctly
- "Demo data" disclaimer visible

## 5. Sub-feature 3 — Sync History table

### 5.1 Behaviour

Card sob Activity:

```
┌────────────────────────────────────────────────────────────┐
│ Sync history                                               │
│                                                            │
│ ⓘ Real sync ships in Wave 4 Phase D. For now, only        │
│   dry-run operations from your local CLI are reflected.   │
│                                                            │
│ Date         Kind       Events  Status                    │
│ ─────────────────────────────────────────                  │
│ 2026-05-31   dry-run    4       ✓ Mock OK                │
│ 2026-05-30   dry-run    3       ✓ Mock OK                │
│                                                            │
│ Settings: cadence = daily · last opt-in: 2026-05-30       │
└────────────────────────────────────────────────────────────┘
```

### 5.2 Implementação

Read from a mock fixture inicialmente. Estrutura preparada para futura ligação a `/api/sync/history` (Wave 4 D).

### 5.3 Tests

- Empty state ("No sync operations yet")
- Mock rows render
- Honesty disclaimer present

## 6. Sub-feature 4 — Settings panel (read-only Phase C)

### 6.1 Behaviour

Card lateral ou bottom:

```
┌────────────────────────────────────────────────────────────┐
│ Settings                                                   │
│                                                            │
│ Telemetry: ✓ opt-in since 2026-05-30 (signed ✓)           │
│ Cadence: daily · 03:00 local                              │
│ Packs installed: 7 (3 active last 7d)                     │
│ Hardware class: high-end · linux · ollama active          │
│ Adapter: ◌ baseline (LoRA: Wave 5)                        │
│                                                            │
│ ⓘ Edit settings in CLI for now: mooter quiet --help       │
│   Cloud edit ships in Phase D (sync round-trip required). │
└────────────────────────────────────────────────────────────┘
```

### 6.2 Implementação

Read-only neste Phase. Display mock + indica como editar via CLI. Phase D adicionará controls bidireccionais.

### 6.3 Tests

- All 5 settings rendered
- "Edit in CLI" disclaimer visible
- LoRA honest: "baseline · Wave 5"

## 7. Sub-feature 5 — Honest disclaimers

### 7.1 Onde adicionar

Em TODOS os mocks/placeholders:
- Activity chart: "Demo data — real data ships Wave 4 Phase D"
- Sync history: "Real sync ships in Wave 4 Phase D"
- Settings: "Edit in CLI · cloud edit ships Phase D"
- Adapter: "◌ baseline · LoRA: Wave 5 (Adapter Forge)"
- Hardware: anonimizado (class, não modelo)

Footer global do dashboard:
```
🐮 Mooter dashboard · running on demo data
Real CLI↔Cloud sync available after Wave 4 Phase D ships.
Roadmap: github.com/pauloloureiroshp-ship-it/mooter
```

## 8. Verification

```bash
# P11 + schemas
git diff dev tools/router/classify.js                    # VAZIO
git diff dev tools/router/safety_boost.js                 # critical phrases
git diff dev packages/router/src/types.ts                 # schemas

# landing intacto
git diff dev landing/middleware.ts                       # VAZIO (não tocar!)
git diff dev landing/app/api/me/route.ts                 # VAZIO
git diff dev landing/app/api/cli-token/route.ts          # VAZIO

# Mock labels visíveis
grep -rn "Demo data\|ships Wave 4\|baseline · LoRA: Wave 5" landing/app/\(app\)/dashboard/
```

## 9. Tests aggregate

- Pre-W4 C: CLI 137 (W4 B) · landing tests (count from recon)
- W4 C: +20 (CLI status 4 + Activity 4 + Sync history 4 + Settings 4 + integration 4)
- Total: ~157+ verdes (depending on landing baseline)

## 10. Final-reviewer T3-gate

```
Task tool, subagent_type: "general-purpose"
Prompt: "Review wave4-phase-c-dashboard-cloud vs dev.

Verifica:
- classify.js BYTE-IDENTICAL com dev (P11)
- safety_boost.js + mooter_event + sync_event schemas INTACTOS
- landing/middleware.ts INTACTO (NÃO tocado)
- landing/app/api/me + cli-token + profile INTACTOS
- Wave 4 Phase A + B (auth Supabase, LoginHero, /api/cli-token) INTACTOS
- Dashboard existente EXTENDIDO (não substituído)
- TODOS os mocks têm label visível 'Demo data' OR 'ships Wave 4 Phase D'
- Activity chart: mock data, label 'Demo data', sem inventar accuracy
- LoRA: '◌ baseline · LoRA: Wave 5 (Adapter Forge)' em 2+ sítios
- Hardware: 'high-end class' (não 'RTX 4090' literal)
- Zero fetch para CF Workers (Wave 4 D not shipped yet)
- Vocabulário GLOSSARY (Mooter/Moos)
- Sem git add -A, sem --no-verify
- Cost sanity: $0

Reporta: APPROVE | APPROVE_WITH_NOTES | REQUEST_CHANGES com NITs."
```

## 11. PR + auto-merge + tag

```bash
git push -u origin wave4-phase-c-dashboard-cloud
PR=$(gh pr create --base dev --title "Wave 4 Phase C: Dashboard Cloud (extend existing /dashboard with 5 cards)" --body-file - <<'EOF'
## Summary
5 sub-features que EXTENDEM o /dashboard existente (NÃO substituem):
- CLI Connection Status card
- Activity Overview chart (mock data, labeled)
- Sync History table (mock, "ships Wave 4 D")
- Settings panel (read-only, "edit in CLI for now")
- Honest disclaimers em todos os mocks

## Invariants
- classify.js byte-identical (P11) ✓
- safety_boost.js + schemas INTACTOS ✓
- landing/ Phase A + B + auth Supabase INTACTOS ✓
- Dashboard EXTENDIDO (não substituído) ✓
- ZERO network calls para CF Workers (não shippa ainda) ✓

## Honesty
- Activity chart: mock data labeled
- Sync history: "ships Wave 4 Phase D"
- Settings: "edit in CLI for now"
- LoRA: "baseline · Wave 5"
- Hardware: class (não modelo)

## Tests
- ~157+ verdes
- Sanity cost: $0 (mocks)

## Reviewer
final-reviewer: <APPROVE | APPROVE_WITH_NOTES>

## Next: Wave 4 Phase D
- CF Workers backend recebe sync events do Wave 3 D3 contract
- Activity chart liga a real data
- Sync history liga a real data
- Settings tornam-se bidireccionais
EOF
)
PR_NUM=$(echo "$PR" | grep -oP '\d+$')

sleep 30
gh pr merge $PR_NUM --squash --delete-branch
```

## 12. Closure Phase C

```bash
git checkout dev && git pull origin dev
cd landing && npm install 2>/dev/null; cd ..
npm test && npm run lint && npm run typecheck

# Smoke
ls landing/app/\(app\)/dashboard/_components 2>/dev/null

# Tag
git tag -a v0.4.1-dashboard-cloud -m "Wave 4 Phase C: Dashboard Cloud (extend existing /dashboard with 5 cards · mock data · honest disclaimers)"
git push origin v0.4.1-dashboard-cloud
```

+ Notion sub-page + SYNC.md + memória `project_mooter_wave4_phaseC_shipped.md`.

## 13. Resumo final

```
✅ Wave 4 Phase C — Dashboard Cloud COMPLETA (extend)
- Branch: wave4-phase-c-dashboard-cloud (merged)
- 5 sub-features: CLI status · Activity chart · Sync history · Settings panel · Honest disclaimers
- Dashboard EXTENDIDO (não substituído)
- Tests: ~157+ verdes
- Tag: v0.4.1-dashboard-cloud
- Mocks claramente labeled
- LoRA honest disclosure (3 sítios)
- ZERO network calls para CF Workers

⏸ Para. Próximo: Wave 4 Phase D (CF Workers backend — liga sync queue → cloud, activa real data no dashboard).
```

=== END ===
