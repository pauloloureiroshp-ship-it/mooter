# MP-18 — Metrics Coherence: Pipeline completo da decisão ao ecrã

**Objectivo:** Fechar o ciclo entre as 5 superfícies de métricas (statusline, VSCode plugin, dashboard Supabase, decisions.log, frugal-hub D1) de forma que todas mostrem números reais, actualizados, e coerentes — sem acção manual do utilizador.

**Problema raiz identificado na sessão #21:**

| Superfície | Estado actual | Problema |
|---|---|---|
| `statusline` (terminal) | ✅ funciona | Só mostra sessão actual — ignora histórico total |
| `VSCode plugin` | ✅ funciona | Conta tokens reais OAuth — independente do frugal |
| `dashboard Supabase` | ⚠️ desactualizado | Só actualiza com `frugal-doctor --sync` manual |
| `decisions.log` (local) | ✅ funciona | Fonte de verdade local — nunca é vaziada |
| `frugal-hub D1` | ❌ vazia | `hub-push.js` nunca é chamado automaticamente |
| `landing page counters` | ❌ fallback | Mostra 1437 prompts / $6.29 porque hub D1 está vazia |
| `decisions_log Supabase` | ❌ vazia | `/api/install-complete` não insere nada |

**Princípio geral:** O utilizador não deve precisar de correr nenhum comando para que as métricas estejam actualizadas. As peças devem activar-se automaticamente a cada turn.

---

## CONTEXTO TÉCNICO OBRIGATÓRIO (lê antes de implementar)

### Fluxo actual de dados (com os gaps identificados)

```
[Claude Code turn]
       │
       ▼
inject_context.js  →  decisions.log (JSONL append)
       │                    │
       │                    ▼
       │           savings-tracker.js (HTTP :7821)
       │                    │
       │                    ├─► /metrics  (usado pelo statusline)
       │                    └─► /summary  (usado pelo frugal-doctor)
       │
       ▼
gsd-turn-end.js   →  decisions.log (turn_end event)
       │
       │    ← GAP 1: nenhum sync automático para Supabase
       │    ← GAP 2: hub-push.js nunca chamado
       │    ← GAP 3: decisions_log Supabase nunca populada

[Manual: node frugal-doctor.js --sync]
       │
       ▼
POST /api/install-complete
       │
       ├─► profiles (upsert)
       ├─► devices (upsert com decisions_count + savings_usd)
       │   ← GAP 4: decisions_log INSERT está em falta aqui
       └─► (nada para o hub)
```

### Arquitectura alvo (após MP-18)

```
[Claude Code turn]
       │
       ▼
inject_context.js  →  decisions.log
       │
       ▼
gsd-turn-end.js  →  decisions.log (turn_end)
       │
       │  (cada N turns, max 1x a cada 5 min)
       ▼
auto-sync.js (NOVO) ─────────────────────────────────┐
       │                                              │
       ▼                                              │
POST /api/install-complete                            │
       │                                              │
       ├─► profiles (upsert)                          │
       ├─► devices (upsert)                           │
       └─► decisions_log (INSERT novo snapshot)       │
                                                      │
       │  (1x por dia, após backtest)                 │
       ▼                                              │
hub-push.js (chamado por backtest.js)                 │
       │                                              │
       ▼                                              ▼
POST /api/delta  (frugal-hub Worker)        statusline mostra:
       │                                    session: 68% · total: 71%
       ▼
D1: deltas table populada
       │
       ▼
GET /api/stats  →  { prompt_count, total_savings_usd, user_count }
       │
       ▼
landing page useCommunityStats()  →  counters reais ✅
```

### Ficheiros a criar/modificar

```
NOVO
├── tools/router/auto-sync.js          ← sync silencioso por turn
└── landing/migrations/005_decisions_log_insert_policy.sql  ← policy para service role

MODIFICAR
├── tools/router/gsd-turn-end.js       ← chamar auto-sync.js no fim de cada turn
├── tools/router/backtest.js           ← chamar hub-push.js após export-delta
├── landing/app/api/install-complete/route.ts  ← adicionar INSERT decisions_log
├── hub/routes/stats.js                ← adicionar savings_usd + user_count aos retornos
├── landing/app/page.tsx               ← mapear prompt_count/user_count dos novos campos
└── landing/app/(app)/dashboard/page.tsx  ← Decisions tab com histórico decisions_log
```

---

## PEÇA 1 — auto-sync.js (sync silencioso por turn)

### 1a. Criar `tools/router/auto-sync.js`

Este script é chamado pelo `gsd-turn-end.js` no fim de cada turn. É **fire-and-forget**: nunca bloqueia o turn, nunca falha visivelmente.

Lógica:
1. Lê `~/.frugal/auth.token` — se não existir ou expirado, sai silenciosamente (sem erros)
2. Verifica `~/.frugal/.last-sync` — se menos de 5 minutos, sai (rate limit)
3. Lê `/metrics` do savings-tracker local (:7821) — se offline, sai
4. Lê `~/.frugal/device.id`, `hw-capability.json`, `subscription-profile.json`
5. Monta payload idêntico ao `frugal-doctor --sync`
6. POST para `/api/install-complete` com timeout 8s
7. Actualiza `~/.frugal/.last-sync` com timestamp
8. Sai silenciosamente (sucesso ou falha — nunca imprime)

```js
#!/usr/bin/env node
/**
 * auto-sync.js — sync silencioso de métricas para o dashboard
 *
 * Chamado pelo gsd-turn-end.js no fim de cada turn.
 * Fire-and-forget: nunca bloqueia, nunca falha visivelmente.
 *
 * Rate limit: máximo 1 sync a cada 5 minutos por device.
 * Sem token válido: sai sem erro.
 * Sem tracker local: sai sem erro.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');

const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const FRUGAL_DIR = path.join(os.homedir(), '.frugal');
const LAST_SYNC_PATH = path.join(FRUGAL_DIR, '.last-sync');
const TOKEN_PATH = path.join(FRUGAL_DIR, 'auth.token');
const DEVICE_ID_PATH = path.join(FRUGAL_DIR, 'device.id');
const SYNC_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

const LANDING_URL = process.env.FRUGAL_LANDING_URL || 'https://landing-five-azure-16.vercel.app';

function safeRead(p) {
  try { return fs.readFileSync(p, 'utf8').trim(); } catch { return null; }
}

function safeJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function isTokenExpired(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return payload.exp < Math.floor(Date.now() / 1000) + 60; // 60s buffer
  } catch { return true; }
}

function shouldSync() {
  try {
    const ts = parseInt(fs.readFileSync(LAST_SYNC_PATH, 'utf8').trim(), 10);
    if (Date.now() - ts < SYNC_COOLDOWN_MS) return false;
  } catch { /* no file = never synced */ }
  return true;
}

function markSynced() {
  try {
    fs.mkdirSync(FRUGAL_DIR, { recursive: true });
    fs.writeFileSync(LAST_SYNC_PATH, String(Date.now()));
  } catch { /* non-fatal */ }
}

function fetchMetrics() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:7821/metrics', { timeout: 3000 }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function postSync(token, payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const url = new URL(LANDING_URL + '/api/install-complete');
    const mod = url.protocol === 'https:' ? https : http;

    const req = mod.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'frugal-auto-sync/1.0',
      },
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({ ok: false }); } });
    });
    req.setTimeout(8000, () => { req.destroy(); resolve({ ok: false, timeout: true }); });
    req.on('error', () => resolve({ ok: false }));
    req.write(body);
    req.end();
  });
}

async function main() {
  // 1. Rate limit
  if (!shouldSync()) process.exit(0);

  // 2. Token check
  const token = safeRead(TOKEN_PATH);
  if (!token || isTokenExpired(token)) process.exit(0);

  // 3. Local metrics
  const metrics = await fetchMetrics();
  if (!metrics) process.exit(0);

  // 4. Device info
  const deviceId = safeRead(DEVICE_ID_PATH);
  const hwCap = safeJson(path.join(ROUTER_DIR, 'hw-capability.json'));
  const subProfile = safeJson(path.join(ROUTER_DIR, 'subscription-profile.json'));
  const versionFile = safeJson(path.join(ROUTER_DIR, 'version.json'));

  const payload = {
    device_id: deviceId || undefined,
    device_name: `${os.hostname()} (auto-sync)`,
    hw_tier: hwCap?.hw_tier || 'cpu-only',
    gpu_name: hwCap?.name_short || hwCap?.name || null,
    gpu_vram_mb: hwCap?.vramMB || null,
    has_anthropic_key: !!(subProfile?.keys?.anthropic),
    has_openai_key: !!(subProfile?.keys?.openai),
    has_gemini_key: !!(subProfile?.keys?.gemini),
    has_ollama: !!(metrics.has_ollama || subProfile?.integrations?.ollama),
    ollama_models: metrics.ollama_models || [],
    ollama_has_qwen3b: !!(metrics.ollama_models || []).some(m => m.includes('qwen3')),
    ollama_has_qwen30b: !!(metrics.ollama_models || []).some(m => m.includes('qwen3:30')),
    frugal_version: versionFile?.version || '0.0.0',
    os_type: process.platform,
    arch: process.arch,
    decisions_count: metrics.prompts || metrics.total_prompts || 0,
    savings_usd: metrics.saved || metrics.advisory_saved || 0,
  };

  // 5. Sync
  await postSync(token, payload);
  markSynced();
}

main().catch(() => process.exit(0)); // nunca falha visivelmente
```

### 1b. Modificar `gsd-turn-end.js` — chamar auto-sync

No fim do `main()` de `gsd-turn-end.js` (após o `process.stdout.write` do turn_end log), adicionar:

```js
// Auto-sync silencioso (fire-and-forget, sem await)
try {
  const { spawn } = require('child_process');
  spawn(process.execPath, [path.join(ROUTER_DIR, 'auto-sync.js')], {
    detached: true,
    stdio: 'ignore',
  }).unref();
} catch { /* non-fatal */ }
```

**Posição exacta:** Logo antes do `process.exit(0)` final (ou equivalente) em `gsd-turn-end.js`.

---

## PEÇA 2 — decisions_log INSERT em /api/install-complete

### 2a. Migration `005_decisions_log_insert_policy.sql`

A `decisions_log` já existe (MP-13 migration 003). O problema é que a policy INSERT usa `auth.uid()`, mas o `install-complete` corre com o token JWT do user — **deve funcionar**. O que está em falta é simplesmente o código que faz o INSERT.

Criar `landing/migrations/005_decisions_log_insert_policy.sql`:

```sql
-- MP-18 PEÇA 2: Verificar que a policy de INSERT está correcta
-- A decisions_log já existe — esta migration apenas confirma a policy

-- Policy já existe do MP-13. Se por alguma razão falhou, re-criar:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'decisions_log'
      AND policyname = 'Users insert own decisions_log'
  ) THEN
    CREATE POLICY "Users insert own decisions_log"
      ON decisions_log FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
```

**NÃO executar** — Paulo executa manualmente no Supabase SQL Editor.

### 2b. Modificar `/api/install-complete/route.ts`

Após o bloco `if (payload.device_id) { await upsertDevice(...) }`, adicionar:

```ts
// MP-18 PEÇA 2: insert snapshot em decisions_log para histórico
// Só insere se há decisões e o valor mudou em relação ao último registo
if (payload.decisions_count > 0) {
  try {
    await insertDecisionsSnapshot(accessToken, user.id, payload.device_id || null, {
      decisions: payload.decisions_count,
      savings_usd: payload.savings_usd,
    });
  } catch {
    // Non-fatal: se falhar, o sync de profile/device já ocorreu
  }
}
```

### 2c. Adicionar `insertDecisionsSnapshot` ao `lib/supabase.ts`

```ts
export async function insertDecisionsSnapshot(
  token: string,
  userId: string,
  deviceId: string | null,
  data: { decisions: number; savings_usd: number }
): Promise<void> {
  // Rate limit: só insere se o último registo para este device é > 5 minutos
  const lastRow = await supabaseFetch(token, `decisions_log?user_id=eq.${userId}&device_id=eq.${deviceId || 'null'}&order=recorded_at.desc&limit=1`);
  if (lastRow?.[0]?.recorded_at) {
    const lastTs = new Date(lastRow[0].recorded_at).getTime();
    if (Date.now() - lastTs < 5 * 60 * 1000) return; // 5 min cooldown
  }

  await supabaseFetch(token, 'decisions_log', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      device_id: deviceId,
      decisions: data.decisions,
      savings_usd: data.savings_usd,
    }),
  });
}
```

**Nota:** `supabaseFetch` é o helper existente em `lib/supabase.ts` que já usa `SUPABASE_URL` + `SUPABASE_ANON_KEY`. Se não existir com essa assinatura, adapta ao padrão dos outros helpers do ficheiro.

---

## PEÇA 3 — hub-push automático após backtest

### 3a. Modificar `tools/router/backtest.js` — auto-call hub-push

No `backtest.js`, após a chamada a `--export-delta` (ou após o `main()` produzir o `backtest-delta.json`), adicionar auto-push:

Localiza o bloco onde `backtest-delta.json` é escrito (provavelmente no final de `main()` ou numa função `exportDelta()`). Logo a seguir, adicionar:

```js
// MP-18 PEÇA 3: auto-push para o hub (fire-and-forget, uma vez por dia)
if (!process.env.FRUGAL_NO_HUB_PUSH) {
  try {
    const { spawn } = require('child_process');
    spawn(process.execPath, [path.join(ROUTER_DIR, 'hub-push.js')], {
      detached: true,
      stdio: 'ignore',
      cwd: ROUTER_DIR,
    }).unref();
  } catch { /* non-fatal */ }
}
```

O `hub-push.js` já tem o seu próprio cooldown de 24h (ficheiro `.last-hub-push`), por isso é seguro chamar sempre — ele decide se envia ou não.

---

## PEÇA 4 — hub /api/stats: adicionar savings_usd + user_count

### 4a. Modificar `hub/routes/stats.js`

O response actual não tem `total_savings_usd` nem `user_count` — a landing page espera esses campos.

Na query SQL do `handleStats`, adicionar:

```js
// Total savings e unique users (dos deltas com savings_usd)
const savingsAndUsers = await env.DB.prepare(`
  SELECT
    COUNT(DISTINCT profile_id) as user_count,
    SUM(savings_usd) as total_savings_usd,
    SUM(prompt_count) as total_prompts
  FROM deltas
  WHERE received_at > datetime('now', '-30 days')
    AND savings_usd IS NOT NULL
`).first();
```

**Nota:** A tabela `deltas` tem `prompt_count` mas não `savings_usd` nem `profile_id`. O `delta.js` (handleDelta) recebe esses campos no body mas não os persiste na DB. Precisamos de:

**4b. Modificar `hub/routes/delta.js`** — persistir savings_usd e prompt_count_total

Na definição do objeto `delta` (linha ~49), adicionar:
```js
savings_usd: typeof body.savings_usd === 'number' ? body.savings_usd : null,
profile_hash: body.profile_hash || null, // hash SHA256 do device_id para anonimato
```

No INSERT SQL (linha ~67), adicionar os campos:
```sql
INSERT INTO deltas (id, received_at, expires_at, hw_tier, sub_profile, lang,
  session_count, prompt_count, tier_distribution, keyword_signals,
  unknown_models, feedback_signals, delta_version, trust_score,
  savings_usd, profile_hash)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

**4c. Migration `hub/migrations/003_deltas_savings.sql`** (ficheiro novo no repo):

```sql
-- MP-18: adicionar savings_usd e profile_hash à tabela deltas
-- Executar no D1 via: wrangler d1 execute frugal-events --file=migrations/003_deltas_savings.sql
ALTER TABLE deltas ADD COLUMN savings_usd REAL;
ALTER TABLE deltas ADD COLUMN profile_hash TEXT;
```

**4d. Actualizar `handleStats` em `hub/routes/stats.js`** — response com novos campos:

```js
// Substitui o return final
return new Response(JSON.stringify({
  period: 'last_30_days',
  generated_at: new Date().toISOString(),
  // Campos que a landing page espera:
  prompt_count: Number(savingsAndUsers?.total_prompts || totals?.total_prompts || 0),
  user_count: Number(savingsAndUsers?.user_count || 1),
  total_savings_usd: Math.round((savingsAndUsers?.total_savings_usd || 0) * 100) / 100,
  avg_savings_pct: avgSavings !== null ? Math.round(avgSavings * 1000) / 10 : 90.2,
  // Campos internos:
  totals: { ... },  // manter estrutura existente
  hw_distribution: ...,
  ...
}), { ... });
```

### 4e. Actualizar `hub-push.js` — enviar profile_hash

Em `enrichDelta()`, adicionar:
```js
// Anonimous profile hash (SHA256 do device_id — nunca envia device_id directamente)
try {
  const { createHash } = require('crypto');
  const deviceId = fs.readFileSync(path.join(os.homedir(), '.frugal', 'device.id'), 'utf8').trim();
  delta.profile_hash = createHash('sha256').update(deviceId).digest('hex').slice(0, 16);
} catch { /* non-fatal */ }
```

---

## PEÇA 5 — landing page: mapear novos campos do hub

### 5a. Modificar `landing/app/page.tsx` — `useCommunityStats`

O hook já faz fetch a `/api/stats` e espera `data.prompt_count`. Após MP-18, o hub devolve mais campos. Actualizar o bloco `.then(data => ...)`:

```ts
.then(data => {
  if (data?.prompt_count || data?.totals?.prompts) {
    setStats({
      prompt_count: data.prompt_count || data.totals?.prompts || 1437,
      savings_pct: data.avg_savings_pct ?? 90.2,
      savings_usd: data.total_savings_usd ?? data.totals?.savings_usd ?? 6.29,
      user_count: data.user_count ?? 1,
    });
    setLive(true);
  }
})
```

---

## PEÇA 6 — statusline: mostrar session + total

### Problema actual
A statusline mostra só a % da sessão actual. Se o Paulo abrir uma sessão 100% Opus (tarefa de arquitectura), a statusline mostra `∅ 0% saved` — parece que o frugal não está a funcionar.

### Fix: mostrar session + total

Em `savings-tracker.js`, o endpoint `/metrics` já tem `saved_pct` (total acumulado) e dados por `session_id`. O que falta é expô-los no statusline.

Localiza o código que gera o statusline (provavelmente em `inject_context.js` ou `frugal-statusline.js`) e actualiza para:

```
⚡ frugal  session: 0% · total: 71% · 409 decisions
```

vs o actual:
```
⚡ frugal  0% saved (0 decisions this session)
```

**Onde modificar:** Grep por `statusline` ou `savings.*pct.*session` em `inject_context.js` e `savings-tracker.js` para encontrar o template exacto.

O metrics endpoint já tem:
- `saved_pct` — percentagem total acumulada
- `prompts` — total de decisões

O que está em falta é separar `session_saved_pct` do `total_saved_pct`. O savings-tracker já tem `session_id` filtering — verificar se `/metrics?session_id=X` devolve dados da sessão actual.

**Implementação:**

Em `savings-tracker.js`, no handler do `/metrics`, verificar se `session_id` está presente. Se sim, calcular métricas da sessão. Se não, calcular métricas totais.

No `inject_context.js`, ao construir o statusline, fazer dois calls:
1. `GET /metrics?session_id={SESSION_ID}` — sessão actual
2. `GET /metrics` — total acumulado

Formatação do statusline:
```js
const sessionPct = sessionMetrics.saved_pct || 0;
const totalPct = totalMetrics.saved_pct || 0;
const totalDecisions = totalMetrics.prompts || 0;

// Se sessão é 100% Opus (pct ~= 0), mostrar claramente
const sessionLabel = sessionPct < 2 ? '~0%' : `${Math.round(sessionPct)}%`;
const totalLabel = `${Math.round(totalPct)}%`;

statusline = `⚡ frugal  session: ${sessionLabel} · total: ${totalLabel} · ${totalDecisions} decisions`;
```

---

## PEÇA 7 — dashboard: tab Decisions (histórico)

### Adicionar 5ª tab ao dashboard: "Decisions"

**Nota:** O dashboard já tem 4 tabs (Overview, Devices, Setup, How it works). A tab "Decisions" usa a `decisions_log` table que ficará populada após PEÇA 2.

Em `landing/app/(app)/dashboard/page.tsx`, adicionar `'Decisions'` ao array de tabs e implementar `DecisionsTab`:

```tsx
function DecisionsTab({ profile }: { profile: Profile }) {
  const [log, setLog] = useState<Array<{ recorded_at: string; decisions: number; savings_usd: number; device_id: string | null }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch decisions_log via /api/decisions-log (novo endpoint — ver 7b)
    fetch(`/api/decisions-log?userId=${profile.id}`)
      .then(r => r.json())
      .then(data => { setLog(data?.rows || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [profile.id]);

  if (loading) return <div style={{ color: 'var(--muted)', padding: 32 }}>Loading history...</div>;

  if (log.length === 0) {
    return (
      <div style={{ color: 'var(--muted)', padding: 32, textAlign: 'center' }}>
        <p>No sync history yet.</p>
        <p style={{ fontSize: '0.8rem', marginTop: 8 }}>
          History populates automatically after the next Claude Code session.
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: '0.875rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Sync history — {log.length} entries
        </h3>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {log.slice(0, 50).map((row, i) => {
          const dt = new Date(row.recorded_at);
          const dateStr = dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
          const timeStr = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
          // Delta from previous entry
          const prev = log[i + 1];
          const delta = prev ? row.decisions - prev.decisions : null;
          return (
            <div key={i} style={{
              display: 'grid',
              gridTemplateColumns: '100px 1fr 80px 80px',
              gap: 12,
              padding: '8px 12px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              fontSize: '0.78rem',
              alignItems: 'center',
            }}>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--muted)' }}>{dateStr} {timeStr}</span>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{row.decisions.toLocaleString()} decisions</span>
              <span style={{ color: '#4ec9b0' }}>${row.savings_usd.toFixed(2)} saved</span>
              {delta !== null && (
                <span style={{ color: 'var(--muted)', fontSize: '0.72rem' }}>+{delta} new</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

### 7b. Novo endpoint `/api/decisions-log/route.ts`

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getUser, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/supabase';

export async function GET(request: NextRequest) {
  let accessToken = request.cookies.get('sb-access-token')?.value;
  if (!accessToken) {
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) accessToken = authHeader.slice(7);
  }
  if (!accessToken) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const user = await getUser(accessToken);
  if (!user) return NextResponse.json({ error: 'invalid_token' }, { status: 401 });

  const url = `${SUPABASE_URL}/rest/v1/decisions_log?user_id=eq.${user.id}&order=recorded_at.desc&limit=100`;
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${accessToken}`,
    },
  });
  const rows = await res.json();
  return NextResponse.json({ rows: Array.isArray(rows) ? rows : [] });
}
```

---

## PEÇA 8 — verificação e deploy

### 8a. TypeScript check

```bash
cd landing && npx tsc --noEmit
```

### 8b. Hub D1 migration

```bash
# Na raiz do repo, após criar hub/migrations/003_deltas_savings.sql:
cd hub
wrangler d1 execute frugal-events --remote --file=migrations/003_deltas_savings.sql
```

### 8c. Hub deploy (só se houver mudanças em hub/)

```bash
cd hub && wrangler deploy
```

### 8d. Supabase migration manual

Paulo executa `landing/migrations/005_decisions_log_insert_policy.sql` no Supabase SQL Editor.

### 8e. Primeiro sync manual para popular a decisions_log

```bash
node tools/router/frugal-doctor.js --sync
```

Após este sync, a `decisions_log` terá a primeira entrada e o histórico começa.

### 8f. Commit

```
feat(sync): auto-sync pipeline + decisions_log history + hub savings (MP-18)
```

---

## ORDEM DE EXECUÇÃO

```
PEÇA 1 (auto-sync.js + gsd-turn-end.js)
  → PEÇA 2 (decisions_log INSERT em install-complete + migration 005)
  → PEÇA 3 (backtest.js → hub-push automático)
  → PEÇA 4 (hub delta.js + stats.js: savings_usd + profile_hash)
  → PEÇA 5 (landing page: mapear novos campos)
  → PEÇA 6 (statusline: session % + total %)
  → PEÇA 7 (dashboard: tab Decisions + endpoint /api/decisions-log)
  → PEÇA 8 (tsc + hub migration + hub deploy + Supabase migration + commit)
```

---

## RESTRIÇÕES ABSOLUTAS

1. **auto-sync.js é SEMPRE fire-and-forget** — nunca pode bloquear o turn do Claude Code. Sem `await`, sem output, sem exceptions visíveis.
2. **Rate limit de 5 minutos** por device — não spammar o Supabase a cada turn.
3. **Não mudar a metodologia de cálculo** do savings-tracker — só melhorar a forma como os valores são expostos.
4. **Não remover campos existentes** de nenhuma interface ou resposta de API — só adicionar.
5. **hub-push.js já tem cooldown de 24h** — não adicionar outro cooldown por cima. Deixar o hub-push gerir o seu próprio ritmo.
6. **profile_hash** no hub é `SHA256(device_id).slice(0,16)` — nunca enviar device_id directamente para o hub.
7. **decisions_log tem rate limit de 5 minutos** no INSERT — para não criar 400 rows por dia por device.
8. **Zero dependências novas** em qualquer ficheiro.
9. **Não executar migrations** — Paulo executa manualmente.
10. **hub/migrations/003** só criar o ficheiro — Paulo/CI executa com `wrangler d1 execute`.

---

## RESULTADO ESPERADO APÓS MP-18

| Superfície | Antes | Depois |
|---|---|---|
| Statusline terminal | Session: 0% (após 100% Opus) | Session: 0% · total: 71% · 409 decisions |
| Dashboard Supabase | Actualiza só com --sync manual | Actualiza automaticamente a cada ~5 min |
| decisions_log table | Vazia | Snapshot por sync: histórico completo |
| frugal-hub D1 | Vazia | Populada após próximo backtest diário |
| Landing page counters | 1437 prompts (fallback) | Números reais da comunidade |
| Tab Decisions | Não existe | Histórico de syncs com deltas |

---

## DIAGRAMA DE FLUXO SIMPLIFICADO

```
Turn Claude Code
      │
      ▼
gsd-turn-end.js
      │
      ├─ spawn auto-sync.js (fire-and-forget)
      │         │
      │         ▼ (se token válido + cooldown ok)
      │   POST /api/install-complete
      │         │
      │         ├─► upsert profile
      │         ├─► upsert device (decisions_count + savings_usd)
      │         └─► INSERT decisions_log (snapshot histórico)
      │
      ▼
 [02:00 daily — Windows Task Scheduler / macOS LaunchAgent]
backtest.js
      │
      ├─► export backtest-delta.json
      └─► spawn hub-push.js (fire-and-forget)
                │
                ▼
          POST /api/delta (frugal-hub Cloudflare Worker)
                │
                ▼
          D1: deltas table (savings_usd + profile_hash)
                │
                ▼
          GET /api/stats → prompt_count + user_count + total_savings_usd
                │
                ▼
          landing page useCommunityStats() → counters reais ✅
```
