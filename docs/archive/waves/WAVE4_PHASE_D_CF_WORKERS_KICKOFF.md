# Wave 4 Phase D — CF Workers Backend (active sync + activate dashboard cards)

> **Como usar**: cola no Claude Code. Self-contained.
>
> **Pré-requisitos**: tag `v0.4.1-dashboard-cloud` em dev (W4 Phase C). Working dir = `~/mooter`.
>
> **⚠️ LIÇÃO**: landing/ NÃO é greenfield. Recon obrigatório antes de assumir estrutura. **Padrão 2× recorrente confirmado** (W4 B + W4 C).
>
> **⚠️ Setup Cloudflare**: Paulo precisa criar CF account + D1 database manualmente (~10 min). CC implementa código + tests offline-testable.

---

=== START ===

## 0. Quem és e missão

És Claude Code Opus 4.8 no `~/mooter/`, branch `wave4-phase-d-cf-workers` (cria de `dev`). `--permission-mode bypassPermissions`.

**Missão Wave 4 Phase D**: shippar 6 sub-features que activam o CF Workers backend + ligam o CLI real ao cloud + activam os dashboard cards W4 C com dados reais.

### Recon OBRIGATÓRIO antes de implementar

Lê primeiro (sem modificar):
- `packages/cli/src/commands/sync.ts` (W3 D3) — cliente sync actual
- `packages/cli/src/sync/sync_event_schema.ts` (W3 D3) — contrato schema v1
- `landing/app/(app)/dashboard/page.tsx` — dashboard tabs/cards
- `landing/app/(app)/dashboard/_phase_c.tsx` (W4 C) — cards já adicionados
- `landing/app/api/cli-token/route.ts` — auth contract
- `landing/app/api/decisions-log/route.ts` — reference para padrão de API
- **Verifica** se existe `cf-workers/` ou similar no repo (improvável mas confirma)

**Reporta a tua leitura ao Paulo antes de implementar.** Se descobrires que alguma sub-feature já existe (CF Workers projecto, D1 schema, etc.), propõe adaptação. Se 100% greenfield, prossegue.

6 sub-features (ASSUMINDO greenfield no CF side):

1. **CF Workers project setup** — `cf-workers/` directory com `wrangler.toml`, `src/index.ts`, types
2. **D1 schema migrations** — tabelas `mooter_events`, `mooter_users`, `mooter_devices`
3. **POST /v1/events endpoint** — recebe sync events do W3 D3 contract, valida HMAC, escreve D1
4. **GET /v1/dashboard/{user_id_hash} endpoint** — retorna aggregates para landing dashboard
5. **`mooter sync` real mode** — extend CLI W3 D3 para enviar real (não só --dry-run)
6. **Activate dashboard cards** — substitui `ActivityNote` placeholder por chart real fetching `/v1/dashboard/...`

## 1. Invariantes (NÃO-NEGOCIÁVEIS)

- ❌ **classify.js byte-identical** (P11)
- ❌ **safety_boost.js critical phrases preserved** (W3 D1)
- ❌ **mooter_event + sync_event schemas v1 INTACTOS** — qualquer mudança = v2
- ❌ **landing/ Phase A + B + C INTACTOS** — extend cards, não substituir
- ❌ **NÃO commitar** Cloudflare API tokens / secrets
- ❌ **NÃO armazenar** `prompt_content` ou identificadores reais (só hashes)
- ❌ **NÃO fazer auto-deploy** para production — `wrangler deploy` é manual do Paulo
- ❌ **Não `git add -A`** · **`--no-verify`** · merge para `main`
- ✅ **Final-reviewer T3-gate** obrigatório
- ✅ **Auto-merge para dev** após APPROVE
- ✅ **Tag v0.4.2-cf-backend**
- ✅ **Vocabulário GLOSSARY** (Mooter/Moos)
- ✅ **Honesty**: feature flag `CF_BACKEND_URL` — sem isso, sync continua dry-run
- ✅ **HMAC signature verification** server-side antes de aceitar event

## 2. Branch + recon

```bash
cd ~/mooter
git checkout dev
git pull origin dev
git log --oneline -5  # confirma 967e2c6 + tag v0.4.1-dashboard-cloud
git tag -l | grep v0.4.
git checkout -b wave4-phase-d-cf-workers
```

Recon detalhado:
```bash
# CLI sync actual
cat packages/cli/src/commands/sync.ts | head -100
cat packages/cli/src/sync/sync_event_schema.ts

# Dashboard cards a activar
cat landing/app/\(app\)/dashboard/_phase_c.tsx 2>/dev/null | head -100

# CF Workers existe?
find . -name 'wrangler.toml' -not -path './node_modules/*' 2>/dev/null
ls cf-workers/ 2>/dev/null

# API patterns existentes
ls landing/app/api/
cat landing/app/api/decisions-log/route.ts | head -50

# Auth pattern para /v1/* endpoints
cat landing/app/api/cli-token/route.ts | head -80
```

## 3. Sub-feature 1 — CF Workers project setup

### 3.1 Estrutura

```
cf-workers/
├── wrangler.toml
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # entry point
│   ├── auth.ts               # HMAC verification + token lookup
│   ├── events.ts             # POST /v1/events handler
│   ├── dashboard.ts          # GET /v1/dashboard/* handlers
│   ├── d1.ts                 # D1 query helpers
│   └── types.ts              # shared types (re-export from packages/cli/src/sync/sync_event_schema.ts)
├── migrations/
│   ├── 0001_initial.sql
│   └── 0002_add_safety_boosts.sql
└── tests/
    ├── events.test.ts
    └── dashboard.test.ts
```

### 3.2 wrangler.toml

```toml
name = "mooter-backend"
main = "src/index.ts"
compatibility_date = "2026-05-01"

[[d1_databases]]
binding = "DB"
database_name = "mooter-events"
database_id = "<paulo-sets-this-manually-via-wrangler-cli>"

[vars]
ENVIRONMENT = "development"

# Secrets (set via `wrangler secret put`):
# - HMAC_SHARED_SECRET (used for signature verification)
# - SUPABASE_SERVICE_ROLE_KEY (for user lookup)
```

### 3.3 package.json

```json
{
  "name": "@mooter/cf-workers",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20260101.0",
    "@cloudflare/vitest-pool-workers": "^0.5.0",
    "wrangler": "^3.80.0",
    "vitest": "^2.0.0",
    "typescript": "^5.6.0"
  }
}
```

### 3.4 src/index.ts

```typescript
import { handleEvents } from './events';
import { handleDashboard } from './dashboard';

export interface Env {
  DB: D1Database;
  HMAC_SHARED_SECRET: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ENVIRONMENT: string;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    
    // Routes
    if (url.pathname === '/v1/events' && req.method === 'POST') {
      return handleEvents(req, env);
    }
    
    if (url.pathname.startsWith('/v1/dashboard/') && req.method === 'GET') {
      return handleDashboard(req, env);
    }
    
    if (url.pathname === '/v1/health') {
      return new Response(JSON.stringify({ ok: true, env: env.ENVIRONMENT }), { 
        headers: { 'Content-Type': 'application/json' } 
      });
    }
    
    return new Response('Not Found', { status: 404 });
  }
};
```

## 4. Sub-feature 2 — D1 schema migrations

### 4.1 migrations/0001_initial.sql

```sql
-- Mooter events backend schema v1

create table if not exists mooter_users (
  user_id_hash text primary key,        -- pseudonymous, from CLI auth.json
  first_seen_utc text not null,
  last_seen_utc text not null,
  total_events integer default 0
);

create table if not exists mooter_devices (
  device_id text primary key,
  user_id_hash text not null,
  os text,
  gpu_class text,                       -- 'none' | 'integrated' | 'discrete' | 'high-end'
  ram_class text,                       -- 'low' | 'mid' | 'high'
  ollama_available integer default 0,
  first_seen_utc text not null,
  last_seen_utc text not null,
  foreign key (user_id_hash) references mooter_users(user_id_hash)
);

create table if not exists mooter_events (
  event_id text primary key,           -- UUIDv7
  user_id_hash text not null,
  device_id text,
  emitted_at_utc text not null,
  received_at_utc text not null,
  schema_version integer not null,
  event_kind text not null,            -- 'tier_distribution' | 'safety_boost_reasons' | 'pack_usage' | 'hardware_info'
  payload_json text not null,           -- raw JSON of the category
  signature_value text not null,
  signature_verified integer default 0,
  foreign key (user_id_hash) references mooter_users(user_id_hash)
);

create index idx_events_user_emitted on mooter_events(user_id_hash, emitted_at_utc desc);
create index idx_events_kind on mooter_events(event_kind, emitted_at_utc desc);
```

### 4.2 migrations/0002_add_safety_boosts.sql

```sql
-- Aggregates view for safety_boost analytics

create view if not exists v_safety_boost_summary as
select 
  user_id_hash,
  date(emitted_at_utc) as date_utc,
  count(*) as total_events,
  sum(case when json_extract(payload_json, '$.applied') > 0 then 1 else 0 end) as boost_events
from mooter_events
where event_kind = 'safety_boost_reasons'
group by user_id_hash, date(emitted_at_utc);
```

## 5. Sub-feature 3 — POST /v1/events endpoint

### 5.1 Behaviour

CLI envia batch de sync events. Worker:
1. Verifica HMAC signature
2. Verifica auth token (lookup Supabase via service_role)
3. Escreve em D1 (transação)
4. Retorna 202 Accepted ou 4xx com razão

### 5.2 Implementação

`cf-workers/src/events.ts`:

```typescript
import { Env } from './index';
import { verifyHmac } from './auth';
import { writeEvents } from './d1';

export async function handleEvents(req: Request, env: Env): Promise<Response> {
  // Parse body
  let body: { events: any[] };
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, 'invalid_json');
  }
  
  if (!Array.isArray(body.events) || body.events.length === 0) {
    return errorResponse(400, 'empty_events');
  }
  
  if (body.events.length > 100) {
    return errorResponse(400, 'too_many_events_max_100');
  }
  
  // Validate auth header
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return errorResponse(401, 'missing_auth');
  }
  const token = authHeader.slice(7);
  
  // Validate user via Supabase
  const userIdHash = await lookupUserHash(token, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!userIdHash) {
    return errorResponse(401, 'invalid_token');
  }
  
  // Validate each event's signature + schema
  const validated: any[] = [];
  const rejected: { event_id: string; reason: string }[] = [];
  
  for (const event of body.events) {
    if (!validateSchema(event)) {
      rejected.push({ event_id: event.event_id ?? 'unknown', reason: 'invalid_schema' });
      continue;
    }
    
    const sigValid = await verifyHmac(event, env.HMAC_SHARED_SECRET);
    if (!sigValid) {
      rejected.push({ event_id: event.event_id, reason: 'invalid_signature' });
      continue;
    }
    
    // Reject forbidden fields (defence in depth)
    if (hasForbiddenFields(event)) {
      rejected.push({ event_id: event.event_id, reason: 'forbidden_field_detected' });
      continue;
    }
    
    validated.push(event);
  }
  
  // Write validated to D1
  await writeEvents(env.DB, userIdHash, validated);
  
  return new Response(JSON.stringify({
    accepted: validated.length,
    rejected: rejected.length,
    rejection_details: rejected
  }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' }
  });
}

function hasForbiddenFields(event: any): boolean {
  const forbidden = ['prompt_content', 'prompt_text', 'file_path', 'project_name', 'real_ip', 'real_email'];
  const json = JSON.stringify(event);
  return forbidden.some(f => json.includes(`"${f}"`));
}

function errorResponse(status: number, reason: string): Response {
  return new Response(JSON.stringify({ error: reason }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
```

### 5.3 Tests

`cf-workers/tests/events.test.ts`:
- 401 sem auth header
- 400 com body inválido / >100 events
- 401 com token inválido
- Event com signature inválida → rejected
- Event com `prompt_content` → rejected (forbidden field)
- Event válido + signature válida → 202 Accepted + escrito em D1 (mock)
- Batch parcial: 3 válidos + 1 inválido → 202 com `accepted: 3, rejected: 1`

## 6. Sub-feature 4 — GET /v1/dashboard/{user_id_hash}

### 6.1 Behaviour

Landing fetcha aggregates para activar cards W4 C:

```
GET /v1/dashboard/abc123hash
Authorization: Bearer <supabase_jwt>

Response:
{
  "user_id_hash": "abc123hash",
  "window_days": 7,
  "tier_distribution": { "T0": 65, "T1": 12, "T2": 8, "T3": 15 },
  "safety_boost_pct": 10,
  "total_events": 47,
  "pack_usage": { "diagram-systems": 12, "code-audit": 8 },
  "hardware_class": "high-end",
  "last_sync_utc": "2026-06-01T03:00:00Z"
}
```

### 6.2 Implementação

`cf-workers/src/dashboard.ts`:

```typescript
export async function handleDashboard(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const userIdHash = url.pathname.slice('/v1/dashboard/'.length);
  
  if (!userIdHash || !/^[a-f0-9]{16,64}$/.test(userIdHash)) {
    return errorResponse(400, 'invalid_user_id_hash');
  }
  
  // Verify the requester is the user (via Supabase JWT)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return errorResponse(401, 'missing_auth');
  }
  const requestedByHash = await lookupUserHash(authHeader.slice(7), env.SUPABASE_SERVICE_ROLE_KEY);
  if (requestedByHash !== userIdHash) {
    return errorResponse(403, 'forbidden_other_user');
  }
  
  // Query aggregates
  const aggregates = await env.DB.prepare(`
    select 
      event_kind,
      count(*) as count,
      payload_json
    from mooter_events
    where user_id_hash = ?
      and emitted_at_utc >= datetime('now', '-7 days')
    group by event_kind
  `).bind(userIdHash).all();
  
  // Build response
  const response = aggregatesToResponse(aggregates.results, userIdHash);
  return new Response(JSON.stringify(response), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=60' }
  });
}
```

### 6.3 Tests

`cf-workers/tests/dashboard.test.ts`:
- 401 sem auth
- 403 quando requested user_id_hash não bate com auth user
- 400 com user_id_hash mal formatado
- 200 com aggregates honestos (zero quando sem dados)

## 7. Sub-feature 5 — `mooter sync` real mode

### 7.1 Behaviour

Extend `packages/cli/src/commands/sync.ts` (W3 D3):

```bash
mooter sync                       # default: real sync se CF_BACKEND_URL setado
mooter sync --dry-run             # mantém dry-run (W3 D3)
mooter sync --force               # force send mesmo se cadence diz "wait"
```

Feature flag: requires `MOOTER_CF_BACKEND_URL` env var OR `~/.mooter/sync-config.json` com `backend_url`. Sem isso, mantém dry-run + sinaliza claramente.

### 7.2 Implementação

```typescript
export async function runSync(args: SyncArgs): Promise<void> {
  if (args.dryRun) return runDryRun(args);
  
  const backendUrl = process.env.MOOTER_CF_BACKEND_URL ?? await readBackendUrl();
  if (!backendUrl) {
    console.log('⚠ Real sync requires MOOTER_CF_BACKEND_URL or ~/.mooter/sync-config.json');
    console.log('  Falling back to --dry-run mode.');
    return runDryRun(args);
  }
  
  const auth = await readAuth();
  if (!auth?.access_token) {
    console.log('✗ Not logged in. Run `mooter login` first.');
    process.exit(1);
  }
  
  const consent = await readConsent();
  if (!consent.telemetry_enabled) {
    console.log('✗ Telemetry not opted-in.');
    process.exit(1);
  }
  
  // Build events (same as dry-run)
  const events = await buildSyncEvents(/* ... */);
  
  // Real POST
  const response = await fetch(`${backendUrl}/v1/events`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${auth.access_token}`,
      'Content-Type': 'application/json',
      'X-Mooter-Schema-Version': '1'
    },
    body: JSON.stringify({ events })
  });
  
  const result = await response.json();
  
  // Audit log (real not dry-run)
  await logAuditEntry({
    kind: 'real-sync',
    events: events.length,
    bytes_sent: JSON.stringify({ events }).length,
    endpoint: backendUrl,
    http_status: response.status,
    accepted: result.accepted,
    rejected: result.rejected
  });
  
  if (response.ok) {
    console.log(`✓ Sent ${result.accepted} events (rejected: ${result.rejected})`);
  } else {
    console.log(`✗ Sync failed: ${response.status} ${result.error}`);
    process.exit(1);
  }
}
```

### 7.3 Tests

`packages/cli/tests/sync-real.test.ts`:
- Sem CF_BACKEND_URL → fallback dry-run + warning
- Com URL + auth → POST mock (não real) + 202 → success
- 401 server → retorna erro graceful
- forbidden field rejected → audit log capta

## 8. Sub-feature 6 — Activate dashboard cards

### 8.1 Behaviour

`landing/app/(app)/dashboard/_phase_c.tsx` (W4 C) — substituir `ActivityNote` placeholder por `ActivityChart` com fetch real.

### 8.2 Implementação

```tsx
// Substitui ActivityNote por ActivityChart
async function ActivityChart() {
  const user = await getCurrentUser();
  if (!user) return <NotConnectedNote />;
  
  const backendUrl = process.env.NEXT_PUBLIC_MOOTER_BACKEND_URL;
  if (!backendUrl) {
    return <ActivityNote message="Backend not configured (CF_BACKEND_URL pending)." />;
  }
  
  const userIdHash = computeUserHash(user.id);
  const supabaseToken = await getSupabaseAccessToken();
  
  try {
    const res = await fetch(`${backendUrl}/v1/dashboard/${userIdHash}`, {
      headers: { 'Authorization': `Bearer ${supabaseToken}` },
      next: { revalidate: 60 }  // cache 60s
    });
    
    if (!res.ok) {
      return <ActivityNote message="No events synced yet. Run `mooter sync` to populate." />;
    }
    
    const data = await res.json();
    if (data.total_events === 0) {
      return <ActivityNote message="No events synced yet." />;
    }
    
    return (
      <div className="border border-[#3a3a3a] rounded p-6 mb-6">
        <h3 className="text-lg mb-4">Activity (last 7 days)</h3>
        <TierBarChart data={data.tier_distribution} />
        <p className="text-sm opacity-60 mt-4">
          {data.total_events} events · {data.safety_boost_pct}% safety boosted
        </p>
      </div>
    );
  } catch {
    return <ActivityNote message="Backend unreachable. Real data ships when CF deploys." />;
  }
}
```

### 8.3 Tests

- Sem backendUrl → fallback ActivityNote
- Com URL + data vazia → "No events synced yet"
- Com data → renders bar chart com counts reais
- Erro fetch → fallback graceful

## 9. Setup manual Paulo (after merge)

Cria `docs/strategy/WAVE4_PHASE_D_CLOUDFLARE_SETUP.md`:

```markdown
# Wave 4 Phase D — Cloudflare setup manual

## 1. CF account + Workers
1. Conta em cloudflare.com (free tier OK)
2. Install wrangler: `npm i -g wrangler`
3. `cd cf-workers && wrangler login`

## 2. Criar D1 database
```bash
cd cf-workers
wrangler d1 create mooter-events
# Copy database_id para wrangler.toml
```

## 3. Aplicar migrations
```bash
wrangler d1 execute mooter-events --file=migrations/0001_initial.sql
wrangler d1 execute mooter-events --file=migrations/0002_add_safety_boosts.sql
```

## 4. Set secrets
```bash
wrangler secret put HMAC_SHARED_SECRET
# Paste long random hex string (save in 1Password)

wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# Paste from Supabase project settings
```

## 5. Deploy
```bash
wrangler deploy
# Note the URL (e.g., mooter-backend.xyz.workers.dev)
```

## 6. Set env vars no landing
`landing/.env.local`:
```
NEXT_PUBLIC_MOOTER_BACKEND_URL=https://mooter-backend.xyz.workers.dev
```

## 7. Test
```bash
MOOTER_CF_BACKEND_URL=https://mooter-backend.xyz.workers.dev mooter sync
```
```

## 10. Verification

```bash
git diff dev tools/router/classify.js                    # VAZIO
git diff dev tools/router/safety_boost.js                 # critical phrases
git diff dev packages/router/src/types.ts                 # schemas
git diff dev packages/cli/src/sync/sync_event_schema.ts   # VAZIO (schema v1 intacto)

# Verificar que landing/ Phase A/B/C intactos
git diff dev landing/middleware.ts                       # VAZIO
git diff dev landing/app/api/cli-token/route.ts          # VAZIO
git diff dev landing/app/\(app\)/dashboard/page.tsx       # apenas _phase_c.tsx import change

# CF Workers só extend não substitui (greenfield)
ls cf-workers/                                           # estrutura criada
```

## 11. Tests aggregate

- Pre-W4 D: CLI 137+ landing 11
- W4 D: +50 (CF Workers events 8 + dashboard 6 + sync real 10 + activate 6 + d1 helpers 8 + integration 12)
- Total: ~210+ verdes

## 12. Final-reviewer T3-gate

```
Task tool, subagent_type: "general-purpose"
Prompt: "Review wave4-phase-d-cf-workers vs dev.

Verifica:
- classify.js BYTE-IDENTICAL com dev (P11)
- safety_boost.js + mooter_event + sync_event schemas v1 INTACTOS
- landing/ Phase A + B + C INTACTOS (só _phase_c.tsx adapta ActivityNote → ActivityChart)
- cf-workers/ greenfield (não existia)
- HMAC verification server-side
- forbidden fields (prompt_content) rejected
- 403 quando user_id_hash não bate com auth
- Feature flag MOOTER_CF_BACKEND_URL — sem isso, mantém dry-run + warning claro
- CF secrets NUNCA commitadas
- wrangler.toml database_id placeholder (paulo seta manual)
- ~210+ tests verdes
- Vocabulário GLOSSARY (Mooter/Moos)
- Sem git add -A, sem --no-verify
- Cost sanity: $0 (mocks)

Reporta: APPROVE | APPROVE_WITH_NOTES | REQUEST_CHANGES com NITs."
```

## 13. PR + auto-merge + tag

```bash
git push -u origin wave4-phase-d-cf-workers
PR=$(gh pr create --base dev --title "Wave 4 Phase D: CF Workers Backend (sync receive + dashboard activate)" --body-file - <<'EOF'
## Summary
6 sub-features que activam o backend remoto + ligam dashboard a dados reais:
- CF Workers project setup (greenfield)
- D1 schema migrations (events + users + devices)
- POST /v1/events endpoint (HMAC verify + auth + forbidden field reject)
- GET /v1/dashboard/{hash} endpoint (aggregates 7d)
- mooter sync real mode (feature flag MOOTER_CF_BACKEND_URL)
- Activate dashboard ActivityChart (substitui ActivityNote placeholder)

## Invariants
- classify.js byte-identical (P11) ✓
- safety_boost.js + mooter_event + sync_event schemas v1 INTACTOS ✓
- landing/ Phase A + B + C INTACTOS (só _phase_c.tsx adapta um placeholder) ✓
- ZERO secrets commitados ✓
- Feature flag: sem URL → dry-run + warning ✓

## Honesty
- forbidden fields server-side reject (prompt_content)
- 403 enforced (user só vê próprios dados)
- "No events synced yet" honesto quando vazio
- Sem auto-deploy (paulo deploya manual)

## Tests
- ~210+ verdes (CLI + landing + cf-workers)
- Sanity cost: $0 (mocks)

## ⚠ Manual setup required (Paulo)
Ler docs/strategy/WAVE4_PHASE_D_CLOUDFLARE_SETUP.md:
1. CF account + wrangler login
2. wrangler d1 create mooter-events
3. Apply migrations
4. wrangler secret put HMAC_SHARED_SECRET + SUPABASE_SERVICE_ROLE_KEY
5. wrangler deploy
6. Set NEXT_PUBLIC_MOOTER_BACKEND_URL no landing/.env.local

## Reviewer
final-reviewer: <APPROVE | APPROVE_WITH_NOTES>

## Próximo
- Wave 5: Adapter Forge (LoRA real — substitui "baseline" disclosure)
EOF
)
PR_NUM=$(echo "$PR" | grep -oP '\d+$')

sleep 30
gh pr merge $PR_NUM --squash --delete-branch
```

## 14. Closure Phase D

```bash
git checkout dev && git pull origin dev
cd cf-workers && npm install 2>/dev/null; cd ..
npm test && npm run lint && npm run typecheck

# Tag
git tag -a v0.4.2-cf-backend -m "Wave 4 Phase D: CF Workers Backend (sync receive + dashboard activate · feature-flag gated · setup manual pending)"
git push origin v0.4.2-cf-backend
```

+ Notion sub-page + SYNC.md + memória `project_mooter_wave4_phaseD_shipped.md`.

## 15. Resumo final

```
✅ Wave 4 Phase D — CF Workers Backend COMPLETA
- Branch: wave4-phase-d-cf-workers (merged)
- 6 sub-features: CF Workers setup · D1 migrations · /v1/events · /v1/dashboard · mooter sync real · ActivityChart activate
- Tests: ~210+ verdes
- Tag: v0.4.2-cf-backend
- P11 + schemas v1 INTACTOS ✓
- HMAC verification + forbidden field reject server-side
- Feature flag MOOTER_CF_BACKEND_URL gating

⚠ Setup Cloudflare manual pendente (Paulo):
   Ler docs/strategy/WAVE4_PHASE_D_CLOUDFLARE_SETUP.md (~10 min)

⏸ Para. Wave 4 COMPLETA. Próximo: Wave 5 (Adapter Forge — LoRA real). Precisa novo kickoff.
```

=== END ===
