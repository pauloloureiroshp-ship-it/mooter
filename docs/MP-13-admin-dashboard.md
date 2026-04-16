# MP-13 — Admin Dashboard: Visão Completa de Administrador

> Spec completa para o admin dashboard profissional do frugal.
> Sessão #20 — 2026-04-12
> Acesso: paulo.loureiro.shp@gmail.com apenas

---

## Contexto

A página /admin actual existe mas está incompleta (truncada na linha 83).
O endpoint /api/admin/stats já existe e retorna dados agregados.
Este MP transforma o /admin numa sala de controlo real.

---

## Arquitectura da página

A página /admin tem 4 secções principais em navegação por tabs:

```
/admin
  ├── [Overview]     — métricas globais + gráficos
  ├── [Users]        — tabela com filtros, busca, paginação
  ├── [Devices]      — tabela de dispositivos por user
  └── [Health]       — alertas, issues, users inactivos
```

---

## PEÇA 1 — Overview Tab

### 1.1 Hero metrics (4 cards no topo)

```
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│  Users   │ │ Devices  │ │Decisions │ │ Savings  │
│    1     │ │    2     │ │   607    │ │  $71.55  │
│ +0 today │ │ 2/user   │ │ 70% avg  │ │ all time │
└──────────┘ └──────────┘ └──────────┘ └──────────┘
```

### 1.2 Hardware distribution

Barra horizontal por tier:
- gpu-high (RTX 4090+): N users — █████ 100%
- apple-silicon: N users — ░░░░░ 0%
- gpu-mid: N users
- cpu-only: N users

### 1.3 AI Stack distribution

Por subscrição (Claude Max, Claude API, GPT Plus, etc.):
- Claude Max: N — █████
- GPT Plus: N — ███

### 1.4 Setup completion funnel

```
Signed up     → 1  (100%)
Onboarded     → 1  (100%)
Installed     → 1  (100%)
First sync    → 1  (100%)
Setup 5/5     → 0  (0%)   ← gap actual
```

### 1.5 Recent activity feed (últimas 10 acções)

```
[hoje 14:41]  paulo@gmail.com — sync from Windows RTX4090 — 607 decisions
[hoje 14:27]  paulo@gmail.com — login via GitHub OAuth
[ontem]       paulo@gmail.com — onboarding completed
```

---

## PEÇA 2 — Users Tab

### 2.1 Toolbar

```
[Search by email or name...    ] [Hardware ▼] [Subscription ▼] [Status ▼] [Export CSV]
```

Filtros:
- Hardware: All / gpu-high / apple-silicon / cpu-only
- Subscription: All / Claude Max / GPT Plus / API only
- Status: All / Active (7d) / Inactive (30d+) / Never synced

### 2.2 Tabela de users

Colunas: Email | Hardware | OS | Devices | Decisions | Savings | Version | Last sync | Status

```
Email                    Hw          OS      Dev  Dec  Savings  Ver    Last sync  Status
paulo@gmail.com          RTX 4090    Win+Mac  2   607  $71.55  0.9.8  hoje       ● Active
```

- Clicável por linha → expande detail view inline (accordion)
- Ordenação por qualquer coluna (asc/desc)
- Paginação: 20 por página, botões Prev/Next + "Showing 1-20 of N"

### 2.3 User detail view (accordion expandido)

```
▼ paulo@gmail.com
  ┌─────────────────────────────────────────────────────┐
  │ Profile                                             │
  │ GitHub: pauloloureiroshp-ship-it  Repos: 12        │
  │ Experience: advanced  Subscriptions: Max, API, GPT  │
  │ Onboarding: ✓  Install: ✓  Created: 2026-03-01     │
  │                                                     │
  │ Devices (2)                                         │
  │ 🪟 Paulo Windows  RTX4090  v0.9.8  590dec  $70  hoje│
  │ 🍎 Paulo MacBook  M-series pending install          │
  │                                                     │
  │ AI Stack                                            │
  │ ✓ Anthropic key  ✓ Claude Max  ✓ GPT Plus          │
  │ ✗ OpenAI key  ✗ Ollama (Windows) ✓ Ollama (Mac)   │
  │                                                     │
  │ Config flags                                        │
  │ has_ollama: true  has_anthropic_key: false          │
  │ ollama_models: qwen2.5:7b                          │
  └─────────────────────────────────────────────────────┘
```

---

## PEÇA 3 — Devices Tab

### 3.1 Tabela de todos os devices

Colunas: User | Device name | OS | Arch | HW tier | Ollama | Models | Decisions | Savings | Last sync

Filtros: OS (Windows/Mac/Linux) / HW tier / Has Ollama / Has Anthropic key

```
User             Device           OS      HW        Ollama  Decisions  Savings   Last sync
paulo@gmail.com  Paulo Windows    win32   gpu-high  ✓       607        $71.55    hoje
paulo@gmail.com  Paulo MacBook    darwin  —         —       0          $0        never
```

### 3.2 Ollama models distribution

```
qwen2.5:7b    1 device  █████
qwen3:30b     0 devices ░░░░░
qwen2.5:3b    0 devices ░░░░░
```

---

## PEÇA 4 — Health Tab

### 4.1 Alertas activos

Cards coloridos por severidade:

```
🔴 CRITICAL (0)
🟡 WARNING (2)
  - paulo@gmail.com: Ollama shows "not installed" — legacy field mismatch
  - paulo@gmail.com: MacBook never synced since install
🟢 OK (3)
  - All users on latest frugal version
  - All users have valid auth tokens
  - Sync frequency normal
```

### 4.2 Users inactivos

Tabela de users sem sync há >30 dias:
- Email | Last sync | Days inactive | Action [Send reminder email]

### 4.3 Version distribution

```
v0.9.8  1 device  (latest ✓)
v0.9.7  0 devices
```

### 4.4 Data quality issues

```
⚠ Legacy fields detected: 1 profile has frugal_config.decision_count (vs decisions_count)
⚠ Devices table: 0 rows (MP-12 migration pending)
```

---

## PEÇA 5 — Novos endpoints necessários

### 5.1 GET /api/admin/stats (estender existente)

Adicionar query params:
- `?hardware=gpu-high` — filtrar por hardware tier
- `?subscription=claude_max` — filtrar por subscrição
- `?status=active` — active (7d) / inactive (30d+) / never
- `?limit=20&offset=0` — paginação
- `?sort=decisions&dir=desc` — ordenação

Response adicionar:
```typescript
{
  // existente...
  total: number,           // para paginação
  funnel: {
    signed_up: number,
    onboarded: number,
    installed: number,
    first_sync: number,
    setup_complete: number,
  },
  activity: Array<{
    user_email: string,
    action: string,
    timestamp: string,
  }>,
}
```

### 5.2 GET /api/admin/export

Retorna CSV com todos os users + devices.
Headers: email,hardware,os,devices,decisions,savings,version,last_sync,subscriptions

### 5.3 POST /api/admin/notify (P1 — futuro)

Envia email para um user ou todos os users inactivos.

---

## PEÇA 6 — decisions_log table (histórico)

Cria `landing/migrations/003_decisions_log.sql`:

```sql
CREATE TABLE IF NOT EXISTS decisions_log (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES profiles(id) ON DELETE CASCADE,
  device_id   TEXT REFERENCES devices(device_id) ON DELETE SET NULL,
  decisions   INTEGER NOT NULL,
  savings_usd DECIMAL(10,2) NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX decisions_log_user_idx ON decisions_log(user_id, recorded_at DESC);
CREATE INDEX decisions_log_device_idx ON decisions_log(device_id, recorded_at DESC);
```

O `/api/install-complete` faz INSERT nesta tabela a cada sync.
Permite mostrar trend de decisões ao longo do tempo.

---

## PEÇA 7 — Navigation e layout

A página /admin tem:

```
┌──────────────────────────────────────────────────────┐
│  F. frugal admin              paulo@gmail.com  [↗]  │
├──────────────────────────────────────────────────────┤
│  [Overview] [Users] [Devices] [Health]               │
├──────────────────────────────────────────────────────┤
│                                                      │
│  [tab content here]                                  │
│                                                      │
└──────────────────────────────────────────────────────┘
```

- Tab activa: underline accent (#4ec9b0)
- Dark theme consistente com dashboard
- Botão [↗] abre /dashboard (vista de utilizador normal)
- Indicador "Admin mode" subtil no header

---

## Commits

```
feat(admin): overview tab — hero metrics + hardware dist + funnel (PEÇA 1)
feat(admin): users tab — tabela paginada + filtros + detail accordion (PEÇA 2)
feat(admin): devices tab + health tab + alertas (PEÇA 3+4)
feat(api): admin/stats query params + paginação + export CSV (PEÇA 5)
feat(db): decisions_log migration para histórico de trends (PEÇA 6)
feat(admin): nav tabs layout + admin mode indicator (PEÇA 7)
```

---

## Ordem de execução

1. PEÇA 7 (layout + tabs) — estrutura primeiro
2. PEÇA 1 (overview) — mais visível, mais impacto
3. PEÇA 5 (endpoints) — desbloqueia PEÇA 2+3
4. PEÇA 2 (users tab)
5. PEÇA 3+4 (devices + health)
6. PEÇA 6 (decisions_log) — adiciona histórico

---

## Notas de implementação

- Tudo server-side rendering onde possível (Next.js App Router)
- Paginação client-side para MVP (carregar todos e paginar em JS) → server-side quando >100 users
- CSV export: construir string CSV em JavaScript, download via Blob URL
- Sem dependências externas de charts — usar barras CSS simples (como já feito no dashboard)
- O activity feed é construído a partir dos updated_at dos profiles/devices — não há event log ainda
