# DATA_INFRASTRUCTURE_MASTER_PROMPT_V2.md
# frugal — Multi-Tenant Data Architecture + Perpetual Feedback Loop
# Versão: 2026-04-11 | Sessão #10

> **Esta é a decisão de arquitectura mais importante do frugal até à data.**
> Lê este ficheiro inteiro antes de tocar em qualquer código.
> Implementa na ordem exacta dos blocos. Não saltes, não improvises.
>
> Contexto de onde viemos: DATA_INFRASTRUCTURE_MASTER_PROMPT.md (v1) — single-tenant.
> Este v2 estende tudo o que foi definido lá, sem quebrar nada.

---

## PRINCÍPIO FUNDADOR — antes de qualquer implementação

O frugal tem uma promessa que NÃO PODE ser violada:

> **"Os teus prompts nunca saem da tua máquina. Nunca."** — PRIVACY.md

Isto significa que a arquitectura multi-tenant NÃO é uma base de dados central com os dados de routing de cada utilizador. É o oposto:

```
❌ ERRADO (SaaS tradicional):
  Utilizador → prompts → servidor central → DB com dados do utilizador

✅ CORRECTO (frugal multi-tenant):
  Utilizador → prompts ficam na máquina → apenas DELTAS ANÓNIMOS → hub
  Hub conhece o PERFIL do utilizador (hw, plano, versão)
  Hub devolve CONFIG PERSONALIZADA ao utilizador
  Config personalizada melhora o algoritmo LOCAL de cada utilizador
```

**"Multi-tenant no frugal" = cada utilizador tem um frugal local customizado
para o seu perfil. O hub é o orquestrador que aprende e melhora esses perfis.
Os dados de routing nunca centralizam.**

---

## O QUE EXISTE HOJE (baseline — não tocar)

```
[Utilizador instala frugal]
        │
        ▼
Local: ~/.claude/tools/router/
  decisions.log (JSONL — prompts classificados, anónimo)
  subscription-profile.json (plano do utilizador)
  hw-capability.json (hardware detectado)
  router-tuning.json (tuning pulled do hub)
        │
  [backtest.js nocturnamente]
        │ gera delta anonimizado
        ▼
Hub: frugal-hub.frugal-hub.workers.dev
  POST /api/delta → D1 (deltas table)
  GET /api/version → verifica se há novo tuning
  GET (R2) router-tuning-latest.json → tuning comunitário
        │
  [Cron diário: generate.js]
        │ agrega deltas → novo router-tuning
        ▼
  R2: router-tuning-latest.json (genérico, para todos)
```

**Problema actual:** o `router-tuning-latest.json` é ONE-SIZE-FITS-ALL.
Um utilizador Mac M3 + Claude Max recebe o mesmo tuning que um Windows + API-only.
Isso é sub-óptimo — o algoritmo podia ser muito mais preciso se soubesse o perfil.

---

## ARQUITECTURA ALVO — MULTI-TENANT COM PRIVACIDADE

```
╔══════════════════════════════════════════════════════════════════╗
║  LAYER 0 — REGISTO (landing page → Supabase)                   ║
╠══════════════════════════════════════════════════════════════════╣
║  Utilizador preenche waitlist/registo na landing                ║
║  Supabase: users table (email, name, created_at, status)        ║
║  → Gera install_token (ULID único, não reversível para email)   ║
║  → Email com link de instalação personalizado                   ║
╚══════════════════════════════════════════════════════════════════╝
        │ install_token no installer
        ▼
╔══════════════════════════════════════════════════════════════════╗
║  LAYER 1 — INSTALAÇÃO LOCAL (máquina do utilizador)            ║
╠══════════════════════════════════════════════════════════════════╣
║  install.sh recebe install_token como argumento:                ║
║    bash install.sh --token=ulid_abc123                          ║
║  → Gera user_hash = SHA-256(install_token + machine_id)        ║
║  → Guarda user_hash em ~/.claude/tools/router/identity.json    ║
║  → APAGA install_token da memória (nunca persiste em disco)     ║
║  → Onboarding: hw-capability.json + subscription-profile.json  ║
║  → Primeiro hub-pull: busca config personalizada para o perfil ║
╚══════════════════════════════════════════════════════════════════╝
        │ user_hash (anónimo, não reversível)
        │ hw_tier, sub_profile, frugal_version
        ▼
╔══════════════════════════════════════════════════════════════════╗
║  LAYER 2 — HUB (Cloudflare Worker + D1 + R2)                  ║
╠══════════════════════════════════════════════════════════════════╣
║  D1: users_profiles table                                       ║
║    user_hash (PK) | hw_tier | sub_profile | frugal_version      ║
║    cohort | install_date | last_seen | delta_count              ║
║    custom_tuning_version | routing_quality_score                ║
║                                                                  ║
║  D1: deltas table (já existe — sem mudanças)                   ║
║    + user_hash FK para users_profiles                           ║
║                                                                  ║
║  R2: profile-tunings/{cohort_id}/tuning-latest.json            ║
║    Tuning específico por cohort (Mac GPU + Max ≠ Win CPU + API) ║
╚══════════════════════════════════════════════════════════════════╝
        │ hub devolve config personalizada
        ▼
╔══════════════════════════════════════════════════════════════════╗
║  LAYER 3 — FEEDBACK LOOP PERPÉTUO                               ║
╠══════════════════════════════════════════════════════════════════╣
║  Local: backtest.js → delta com user_hash + cohort             ║
║  Hub: agrega por cohort → gera tuning por cohort               ║
║  Local: hub-pull → descarrega tuning do cohort correcto        ║
║  Local: update-router.js → aplica tuning ao classify.js        ║
║  Local: auto-snapshot → regista a melhoria                     ║
║  Hub: tuning_versions → rastreia qual versão cada user tem     ║
╚══════════════════════════════════════════════════════════════════╝
        │
        ▼
╔══════════════════════════════════════════════════════════════════╗
║  LAYER 4 — LANÇAMENTO DE NOVAS VERSÕES                         ║
╠══════════════════════════════════════════════════════════════════╣
║  Hub: quando N utilizadores têm tuning melhor → nova versão     ║
║  GitHub: release automático com frugal-{version}.tar.gz        ║
║  Hub: notifica utilizadores via webhook/email (opcional)        ║
║  Local: hub-pull detecta nova versão → actualiza silenciosamente║
╚══════════════════════════════════════════════════════════════════╝
```

---

## MODELO DE DADOS COMPLETO

### Supabase (gestão de utilizadores — Layer 0)

```sql
-- users: identidade real (só Paulo vê isto)
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  name          TEXT,
  status        TEXT DEFAULT 'waitlist',  -- 'waitlist' | 'active' | 'churned'
  install_token TEXT UNIQUE,              -- ULID, apagado após instalação
  token_used_at TIMESTAMPTZ,             -- quando o token foi consumido
  created_at    TIMESTAMPTZ DEFAULT now(),
  last_seen_at  TIMESTAMPTZ,
  source        TEXT,                     -- 'landing' | 'friend_kit' | 'referral'
  referrer_id   UUID REFERENCES users(id)
);

-- user_metadata: dados opcionais que o utilizador partilha
CREATE TABLE user_metadata (
  user_id       UUID PRIMARY KEY REFERENCES users(id),
  github_login  TEXT,                     -- se fez GitHub OAuth
  github_langs  TEXT[],                  -- linguagens dos repos públicos
  github_active BOOLEAN,                 -- commits nos últimos 30 dias
  plan_self_reported TEXT,               -- 'claude_max' | 'claude_pro' | 'api_only'
  os_platform   TEXT,                    -- 'mac' | 'windows' | 'linux'
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- install_events: rastreio do funil de instalação
CREATE TABLE install_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id),
  event_type    TEXT NOT NULL,           -- 'token_generated' | 'install_started' | 'install_complete' | 'onboarding_done'
  platform      TEXT,                    -- 'mac' | 'windows' | 'linux'
  frugal_version TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- POLÍTICAS RLS (Row Level Security):
-- Paulo (service role) → acesso total
-- Anon → só INSERT na waitlist com campo específico
-- Utilizador autenticado (se implementar auth futuramente) → só os seus dados
```

**NOTA CRÍTICA:** A Supabase NÃO recebe `user_hash`. O `user_hash` é gerado localmente. A ligação entre `user_id` (Supabase) e `user_hash` (hub D1) é **unidireccional e intencional**: o hub nunca pode saber o email de um `user_hash`, e a Supabase nunca sabe os dados de routing de um `user_id`. Esta separação é a garantia de privacidade.

---

### Cloudflare D1 — frugal-hub (Layer 2)

**Migration 003_multi_tenant.sql** (a criar):

```sql
-- Perfis de utilizadores anonimizados
-- user_hash = SHA-256(install_token + machine_id) — gerado localmente
-- NUNCA armazena email, nome, ou qualquer PII
CREATE TABLE IF NOT EXISTS user_profiles (
  user_hash         TEXT PRIMARY KEY,           -- 64 hex chars
  first_seen        TEXT NOT NULL,              -- ISO 8601
  last_seen         TEXT NOT NULL,
  hw_tier           TEXT NOT NULL,              -- 'gpu-high' | 'apple-silicon' | etc.
  sub_profile       TEXT NOT NULL,             -- 'max' | 'api-paid' | 'none'
  os_platform       TEXT,                      -- 'mac' | 'windows' | 'linux'
  frugal_version    TEXT,                       -- última versão reportada
  cohort_id         TEXT,                       -- derivado: hw_tier + sub_profile
  delta_count       INTEGER DEFAULT 0,          -- nº de deltas enviados
  total_prompts     INTEGER DEFAULT 0,          -- prompts acumulados
  routing_quality   REAL DEFAULT 0.5,           -- score de qualidade (0-1)
  current_tuning_v  TEXT,                       -- versão do tuning activo neste user
  active            INTEGER DEFAULT 1           -- 1 = activo, 0 = silenciou/desinstalou
);

CREATE INDEX IF NOT EXISTS idx_profiles_cohort ON user_profiles(cohort_id);
CREATE INDEX IF NOT EXISTS idx_profiles_hw ON user_profiles(hw_tier);
CREATE INDEX IF NOT EXISTS idx_profiles_active ON user_profiles(active);

-- Tunings específicos por cohort
-- Cohort = combinação de hw_tier + sub_profile + (futuramente) stack
CREATE TABLE IF NOT EXISTS cohort_tunings (
  id              TEXT PRIMARY KEY,
  cohort_id       TEXT NOT NULL,              -- ex: 'apple-silicon_max'
  version         TEXT NOT NULL,              -- semver: '1.2.3'
  generated_at    TEXT NOT NULL,
  r2_key          TEXT NOT NULL,              -- path no R2
  sample_size     INTEGER,                    -- utilizadores neste cohort
  avg_quality     REAL,                       -- quality score médio
  keyword_count   INTEGER,
  is_current      INTEGER DEFAULT 0,          -- só 1 por cohort
  sha256          TEXT
);

CREATE INDEX IF NOT EXISTS idx_cohort_tunings_cohort ON cohort_tunings(cohort_id, is_current);

-- Versões do frugal em circulação
CREATE TABLE IF NOT EXISTS version_registry (
  version         TEXT PRIMARY KEY,           -- '0.9.4'
  released_at     TEXT NOT NULL,
  release_notes   TEXT,                       -- resumo do que mudou
  r2_installer_key TEXT,                      -- path do install.sh no R2
  active_users    INTEGER DEFAULT 0,          -- utilizadores nesta versão
  is_latest       INTEGER DEFAULT 0
);

-- Alterar tabela deltas para incluir user_hash e cohort
-- (sem quebrar queries existentes — só ADD COLUMN)
ALTER TABLE deltas ADD COLUMN IF NOT EXISTS user_hash TEXT;
ALTER TABLE deltas ADD COLUMN IF NOT EXISTS cohort_id TEXT;
ALTER TABLE deltas ADD COLUMN IF NOT EXISTS os_platform TEXT;
ALTER TABLE deltas ADD COLUMN IF NOT EXISTS frugal_version TEXT;

-- Índice para queries por user
CREATE INDEX IF NOT EXISTS idx_deltas_user ON deltas(user_hash);
CREATE INDEX IF NOT EXISTS idx_deltas_cohort ON deltas(cohort_id);

-- Versão 2 da tabela de audit (adiciona user_hash quando relevante)
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_hash TEXT;
```

**Derivação do cohort_id:**
```javascript
// Regra: cohort_id = hw_tier + '_' + sub_profile
// Exemplos:
//   'apple-silicon_max'     → Mac + Claude Max (maior cohort esperado)
//   'gpu-high_api-paid'     → PC gaming/workstation + API pay-per-token
//   'cpu-only_none'         → sem GPU, sem subscrição paga
//   'apple-silicon_api-paid' → Mac + API (Paulo actual)
//
// Futuramente (v1.5+), cohort pode incluir stack:
//   'apple-silicon_max_typescript' → Mac + Max + Next.js/TypeScript
```

---

### R2 Storage — Estrutura Final

```
frugal-hub-storage/
│
├── tunings/
│   ├── community/
│   │   ├── router-tuning-latest.json          ← tuning genérico (actual)
│   │   └── router-tuning-{date}-{hash}.json   ← versões arquivadas
│   │
│   └── cohorts/                                ← NOVO (multi-tenant)
│       ├── apple-silicon_max/
│       │   ├── tuning-latest.json              ← cohort-specific tuning
│       │   └── tuning-{date}-{hash}.json       ← versões arquivadas
│       ├── gpu-high_api-paid/
│       │   └── tuning-latest.json
│       ├── cpu-only_none/
│       │   └── tuning-latest.json
│       └── ... (um dir por cohort)
│
├── logs/
│   └── {YYYY-MM}/
│       ├── decisions-{YYYY-MM-DD}.jsonl.gz    ← exportados localmente
│       └── manifest.json
│
├── versions/
│   ├── router-tuning/
│   │   └── {date}-{hash}/
│   │       ├── data.json                       ← snapshot do tuning
│   │       └── metadata.json
│   └── frugal/
│       ├── 0.9.4/
│       │   ├── install.sh                      ← versão archivada do installer
│       │   └── checksums.json
│       └── {version}/...
│
└── audit/
    └── {YYYY-MM}.ndjson.gz                     ← audit log exportado
```

---

## IDENTIDADE DO UTILIZADOR — Fluxo Exacto

Este é o componente mais delicado. Acerta aqui e tudo o resto flui.

```
1. LANDING PAGE (Supabase)
   ─────────────────────────
   Paulo vê: email do utilizador, data de registo, status
   Paulo pode: ver quantos utilizadores existem por cohort (sem ver quem)

   user submete email → Supabase insere em users(email, status='waitlist')
   Paulo aprova (manual ou automático) → status = 'active'
   Supabase gera install_token = ulid() [ex: 01HV8X3J4Z...]
   Envia email: "O teu frugal está pronto: bash install.sh --token=01HV8X3J4Z"

2. INSTALL.SH (máquina do utilizador)
   ─────────────────────────────────────
   Recebe --token=01HV8X3J4Z
   
   # Gera identidade local (NUNCA sai da máquina)
   machine_id = sha256(hostname + os_username + disk_serial) [truncado a 16 hex]
   user_hash = sha256(install_token + machine_id) [64 hex]
   
   # Guarda localmente
   ~/.claude/tools/router/identity.json = {
     "user_hash": "a1b2c3...",  # 64 hex chars — vai ao hub
     "install_date": "2026-04-11",
     "frugal_version": "0.9.4"
     # install_token: NUNCA guardado
   }
   
   # Notifica o hub que a instalação aconteceu
   POST /api/install {
     user_hash: "a1b2c3...",
     hw_tier: "apple-silicon",      # de hw-capability.json
     sub_profile: "max",            # de subscription-profile.json
     os_platform: "mac",
     frugal_version: "0.9.4"
   }
   # Hub: upsert em user_profiles, INSERT em audit_log
   # Hub: regista install_event → Supabase via queue (sem PII) [opcional]
   
   # Apaga o token da memória — variável bash descartada
   # O token nunca toca em disco

3. PRIMEIRO HUB-PULL (após instalação)
   ─────────────────────────────────────
   hub-pull.js envia: user_hash + hw_tier + sub_profile
   Hub calcula: cohort_id = hw_tier + '_' + sub_profile
   Hub devolve: tunings/cohorts/{cohort_id}/tuning-latest.json
   
   Se cohort não tem tuning ainda → fallback para tunings/community/router-tuning-latest.json
   Local: escreve router-tuning.json + regista cohort_id em identity.json

4. PUSH NOCTURNO (backtest.js → hub-push.js)
   ─────────────────────────────────────────────
   Payload inclui: user_hash + cohort_id (já existentes em identity.json)
   Hub: faz upsert em user_profiles (last_seen, total_prompts, routing_quality)
   Hub: insere delta com user_hash FK
   Hub: actualiza delta_count no user_profiles
   
5. GERAÇÃO DE TUNING POR COHORT (cron diário)
   ──────────────────────────────────────────────
   generate.js:
     Para cada cohort_id com >= MIN_COHORT_SIZE deltas (ex: 3 utilizadores):
       Agrega deltas desse cohort
       Gera tuning específico
       Publica em R2: tunings/cohorts/{cohort_id}/tuning-latest.json
       Regista em cohort_tunings (D1)
     
     Publica também tuning genérico (todos os cohorts combined)
     → tunings/community/router-tuning-latest.json
   
6. PULL DE ACTUALIZAÇÃO (hub-pull.js regular)
   ─────────────────────────────────────────────
   Verifica: GET /api/version?user_hash=...&cohort_id=...
   Hub devolve: versão do tuning do cohort + versão genérica
   Se cohort tuning > local → descarrega cohort tuning (mais relevante)
   Se só genérico disponível → descarrega genérico
   Valida checksum → aplica → auto-snapshot
```

---

## IMPLEMENTAÇÃO — 7 BLOCOS (inclui tudo do v1)

Os blocos 1-5 do v1 mantêm-se. Este v2 adiciona os blocos 6 e 7 e refina os anteriores.

---

### BLOCO 1-5 — Da versão anterior (manter, adaptar onde indicado)

Blocos do DATA_INFRASTRUCTURE_MASTER_PROMPT.md (v1) aplicam-se na íntegra.
Diferenças/adições para multi-tenant:

**Bloco 1 (log-manager.js):** Sem mudanças — já é correcto.

**Bloco 2 (auto-snapshot.js):** Adicionar ao snapshot:
```javascript
// No createSnapshot():
const identity = (() => {
  try { return require(path.join(ROUTER_DIR, 'identity.json')); } catch { return {}; }
})();
snapshot.user_hash = identity.user_hash ? identity.user_hash.slice(0, 8) + '...' : 'unknown';
snapshot.cohort_id = identity.cohort_id || 'unknown';
snapshot.frugal_version = identity.frugal_version || version;
```

**Bloco 3 (D1 migrations):** Aplicar 002_audit_log.sql (v1) E 003_multi_tenant.sql (v2, acima).

**Bloco 4 (hub-pull.js):** Modificar para ser cohort-aware (ver Bloco 6 abaixo).

**Bloco 5 (GitHub Actions):** Adicionar workflow de release (ver Bloco 7 abaixo).

---

### BLOCO 6 — install.sh + identity.json + hub-push/pull multi-tenant

**Ficheiros:** `install.sh` (patch), `tools/router/identity.js` (NOVO),
`tools/router/hub-push.js` (patch), `tools/router/hub-pull.js` (patch),
`hub/routes/install.js` (NOVO), `hub/worker.js` (patch)

**Tempo:** ~90 min | **Risco:** Médio-Alto (modifica fluxo de instalação)

#### VERIFICAR PRIMEIRO:
```bash
# Existe já identity.json?
cat ~/.claude/tools/router/identity.json 2>/dev/null || echo "NOT FOUND"

# O install.sh já aceita argumentos?
grep -n "token\|install_token\|--token" ~/frugal/install.sh | head -10

# hub-push.js já envia user_hash?
grep -n "user_hash\|identity" ~/.claude/tools/router/hub-push.js | head -10
```

#### Criar `tools/router/identity.js`:

```javascript
#!/usr/bin/env node
/**
 * identity.js — frugal anonymous identity management.
 *
 * Manages user_hash (the only identifier that leaves the machine).
 * user_hash = SHA-256(install_token + machine_fingerprint)
 *
 * Privacy contract:
 *   - install_token is NEVER persisted to disk
 *   - user_hash is a one-way function (cannot recover email from it)
 *   - machine_fingerprint stays local forever
 *   - The hub only knows user_hash, hw_tier, sub_profile — no PII
 */

'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const IDENTITY_PATH = path.join(ROUTER_DIR, 'identity.json');

// Machine fingerprint — reproducible on same machine, useless elsewhere.
// Uses hostname + username + platform. NOT disk serial (too invasive).
function machineFp() {
  const raw = `${os.hostname()}|${os.userInfo().username}|${os.platform()}|${os.arch()}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

// Generate user_hash from install_token (called once during install).
// install_token is passed as argument, NEVER written to disk.
function generateUserHash(installToken) {
  const fp = machineFp();
  return crypto.createHash('sha256').update(installToken + fp).digest('hex');
}

// Load identity from disk (called on every push/pull).
function loadIdentity() {
  try {
    return JSON.parse(fs.readFileSync(IDENTITY_PATH, 'utf8'));
  } catch {
    return null;
  }
}

// Save identity (called once during install — token already consumed, not stored).
function saveIdentity({ userHash, frugalVersion, cohortId, installDate }) {
  const identity = {
    user_hash: userHash,              // 64 hex — sent to hub
    frugal_version: frugalVersion,
    cohort_id: cohortId || null,      // set after first hub-pull
    install_date: installDate || new Date().toISOString().split('T')[0],
    // machine_fp: NOT stored (recomputed when needed)
    // install_token: NEVER stored
  };
  fs.mkdirSync(ROUTER_DIR, { recursive: true });
  fs.writeFileSync(IDENTITY_PATH, JSON.stringify(identity, null, 2));
  return identity;
}

// Update cohort after first hub-pull resolves it.
function updateCohort(cohortId) {
  const identity = loadIdentity();
  if (!identity) return;
  identity.cohort_id = cohortId;
  identity.last_seen = new Date().toISOString();
  fs.writeFileSync(IDENTITY_PATH, JSON.stringify(identity, null, 2));
}

// Update version after update.
function updateVersion(version) {
  const identity = loadIdentity();
  if (!identity) return;
  identity.frugal_version = version;
  fs.writeFileSync(IDENTITY_PATH, JSON.stringify(identity, null, 2));
}

// CLI: node identity.js generate <token>
if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === 'generate') {
    const token = process.argv[3];
    if (!token) { console.error('Usage: node identity.js generate <install_token>'); process.exit(1); }
    const hash = generateUserHash(token);
    // Write to identity.json
    saveIdentity({ userHash: hash, frugalVersion: process.argv[4] || 'unknown' });
    console.log(`[identity] user_hash generated and saved.`);
    console.log(`[identity] First 8 chars: ${hash.slice(0, 8)}...`);
    // IMPORTANT: token was only in argv — OS clears it after process exits.
    // The token is NOT in the saved file.
    process.exit(0);
  } else if (cmd === 'show') {
    const id = loadIdentity();
    if (!id) { console.log('No identity found. Run install.sh first.'); process.exit(1); }
    console.log(JSON.stringify({ ...id, user_hash: id.user_hash.slice(0, 8) + '...' }, null, 2));
  }
}

module.exports = { generateUserHash, loadIdentity, saveIdentity, updateCohort, updateVersion, machineFp };
```

#### Patch em `install.sh` — suporte a `--token`:

Adicionar no início do install.sh, após o banner:
```bash
# Parse --token argument
INSTALL_TOKEN=""
for arg in "$@"; do
  case $arg in
    --token=*) INSTALL_TOKEN="${arg#*=}" ;;
  esac
done

# Generate identity if token provided
if [ -n "$INSTALL_TOKEN" ]; then
  echo "  🔑 Setting up your personal frugal..."
  FRUGAL_VERSION=$(cat "$ROUTER_DIR/version.json" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('version','unknown'))" 2>/dev/null || echo "unknown")
  node "$ROUTER_DIR/identity.js" generate "$INSTALL_TOKEN" "$FRUGAL_VERSION"
  # Token consumed — clear from shell variable immediately
  unset INSTALL_TOKEN
  echo "  ✓ Identity configured (anonymous)"
else
  echo "  ℹ️  No --token provided — running in anonymous mode"
  echo "     For personalized routing, register at https://frugal.dev"
fi
```

#### Criar `hub/routes/install.js` (NOVO endpoint):

```javascript
/**
 * install.js — POST /api/install
 *
 * Called once per installation, immediately after identity.js runs.
 * Records the user profile in D1 (anonymized — only user_hash, no PII).
 * Returns the cohort_id and the URL of the cohort-specific tuning.
 */

import { uuid } from '../lib/anomaly.js';

async function handleInstall(request, env) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405 });
  }

  let body;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'invalid JSON' }), { status: 400 });
  }

  const { user_hash, hw_tier, sub_profile, os_platform, frugal_version } = body;
  if (!user_hash || user_hash.length !== 64) {
    return new Response(JSON.stringify({ error: 'invalid user_hash' }), { status: 422 });
  }

  const now = new Date().toISOString();
  const cohort_id = `${hw_tier || 'unknown'}_${sub_profile || 'unknown'}`;

  // Upsert user profile
  await env.DB.prepare(`
    INSERT INTO user_profiles (user_hash, first_seen, last_seen, hw_tier, sub_profile,
      os_platform, frugal_version, cohort_id, delta_count, total_prompts)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
    ON CONFLICT(user_hash) DO UPDATE SET
      last_seen = excluded.last_seen,
      frugal_version = excluded.frugal_version,
      cohort_id = excluded.cohort_id
  `).bind(user_hash, now, now, hw_tier, sub_profile, os_platform, frugal_version, cohort_id).run();

  // Audit log
  await env.DB.prepare(`
    INSERT INTO audit_log (id, timestamp, year_month, action, user_hash, resource_id, details, success)
    VALUES (?, ?, ?, 'user.install', ?, ?, ?, 1)
  `).bind(uuid(), now, now.substring(0, 7), user_hash, user_hash,
    JSON.stringify({ hw_tier, sub_profile, os_platform, frugal_version, cohort_id })).run();

  // Check if cohort-specific tuning exists
  const cohortTuning = await env.DB.prepare(`
    SELECT r2_key, version FROM cohort_tunings
    WHERE cohort_id = ? AND is_current = 1
  `).bind(cohort_id).first();

  // Check latest community tuning
  const communityTuning = await env.DB.prepare(`
    SELECT version_str FROM tuning_versions WHERE is_current = 1
  `).first();

  return new Response(JSON.stringify({
    user_hash: user_hash.slice(0, 8) + '...', // echo back truncated for debugging
    cohort_id,
    tuning: cohortTuning ? {
      type: 'cohort',
      version: cohortTuning.version,
      url: `${env.HUB_URL || ''}/api/tuning/${cohort_id}`,
    } : {
      type: 'community',
      version: communityTuning?.version_str || '0.0.0',
      url: `${env.HUB_URL || ''}/api/tuning/community`,
    },
    message: cohortTuning
      ? `Welcome! Your ${cohort_id} profile has a dedicated router config.`
      : `Welcome! Using community config — your cohort will get a dedicated config soon.`,
  }), { status: 201, headers: { 'Content-Type': 'application/json' } });
}

export { handleInstall };
```

#### Adicionar endpoint `GET /api/tuning/:cohort` ao `worker.js`:

```javascript
// Novo case em switch(path):
case path.startsWith('/api/tuning/') && true:
  response = await handleTuning(request, env);
  break;
```

```javascript
// hub/routes/tuning.js (NOVO):
async function handleTuning(request, env) {
  const url = new URL(request.url);
  const cohortId = url.pathname.replace('/api/tuning/', '');
  
  // 'community' → serve generic tuning
  const r2Key = cohortId === 'community'
    ? 'tunings/community/router-tuning-latest.json'
    : `tunings/cohorts/${cohortId}/tuning-latest.json`;
  
  const obj = await env.STORAGE.get(r2Key);
  if (!obj) {
    // Fallback to community if cohort doesn't exist yet
    if (cohortId !== 'community') {
      const fallback = await env.STORAGE.get('tunings/community/router-tuning-latest.json');
      if (!fallback) return new Response(JSON.stringify({ error: 'no tuning available' }), { status: 404 });
      const body = await fallback.text();
      return new Response(body, {
        headers: { 'Content-Type': 'application/json', 'X-Tuning-Type': 'community-fallback',
          'X-Frugal-SHA256': crypto.createHash('sha256').update(body).digest('hex') }
      });
    }
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
  }
  
  const body = await obj.text();
  const sha256 = crypto.createHash('sha256').update(body).digest('hex');
  
  // Audit: quem descarregou (user_hash pode vir como query param opcional)
  const userHash = url.searchParams.get('user_hash');
  if (userHash && userHash.length === 64) {
    await env.DB.prepare(`
      INSERT INTO audit_log (id, timestamp, year_month, action, user_hash, details, success)
      VALUES (?, ?, ?, 'tuning.pull', ?, ?, 1)
    `).bind(uuid(), new Date().toISOString(), new Date().toISOString().substring(0,7),
      userHash, JSON.stringify({ cohort_id: cohortId })).run();
  }
  
  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'X-Tuning-Type': cohortId === 'community' ? 'community' : 'cohort',
      'X-Cohort-Id': cohortId,
      'X-Frugal-SHA256': sha256,
      'Cache-Control': 'no-store',
    }
  });
}
```

#### Patch em `hub-pull.js` — ser cohort-aware:

```javascript
// No hub-pull.js, após carregar identity.json:
const identity = require('./identity').loadIdentity();
const cohortId = identity?.cohort_id || 'community';
const userHash = identity?.user_hash || null;

// Verificar versão do cohort primeiro
const versionUrl = `${HUB_URL}/api/version?cohort_id=${cohortId}`;
// ...

// Pull URL cohort-specific:
const tuningUrl = `${HUB_URL}/api/tuning/${cohortId}${userHash ? '?user_hash=' + userHash : ''}`;
// (em vez do antigo: HUB_URL + '/router-tuning-latest.json')

// Após pull bem-sucedido, actualizar cohort_id no identity.json:
const responseHeaders = response.headers;
const pulledCohort = responseHeaders.get('X-Cohort-Id');
if (pulledCohort && pulledCohort !== cohortId) {
  identity.updateCohort(pulledCohort); // actualiza se mudou
}
```

#### Patch em `hub-push.js` — incluir user_hash e cohort:

```javascript
// No enrichDelta():
const identity = require('./identity').loadIdentity();
if (identity) {
  delta.user_hash = identity.user_hash;       // hash anónimo — vai ao hub
  delta.cohort_id = identity.cohort_id || `${delta.hw_tier}_${delta.sub_profile}`;
  delta.frugal_version = identity.frugal_version;
}
```

---

### BLOCO 7 — generate.js multi-cohort + version registry + release automation

**Ficheiros:** `hub/jobs/generate.js` (refactor), `hub/routes/version.js` (patch),
`.github/workflows/release.yml` (NOVO)
**Tempo:** ~60 min | **Risco:** Médio (modifica cron principal)

#### Refactor `hub/jobs/generate.js` para gerar por cohort:

```javascript
async function runGenerate(env) {
  const db = env.DB;
  const minTrust = parseFloat(env.MIN_TRUST_SCORE || '0.4');
  const MIN_COHORT_SIZE = parseInt(env.MIN_COHORT_SIZE || '3', 10);

  // 1. Gerar tuning genérico (lógica existente — manter)
  await generateForCohort(db, env, null, minTrust); // null = community

  // 2. Descobrir cohorts com dados suficientes
  const cohorts = await db.prepare(`
    SELECT cohort_id, COUNT(DISTINCT user_hash) as user_count,
           COUNT(*) as delta_count
    FROM deltas
    WHERE received_at > datetime('now', '-7 days')
      AND trust_score >= ?
      AND cohort_id IS NOT NULL
    GROUP BY cohort_id
    HAVING user_count >= ? AND delta_count >= 5
    ORDER BY user_count DESC
  `).bind(minTrust, MIN_COHORT_SIZE).all();

  // 3. Gerar tuning por cohort
  for (const cohort of (cohorts.results || [])) {
    await generateForCohort(db, env, cohort.cohort_id, minTrust);
  }
}

async function generateForCohort(db, env, cohortId, minTrust) {
  const whereClause = cohortId
    ? `AND cohort_id = '${cohortId}'`
    : ''; // community = todos

  const r2Prefix = cohortId
    ? `tunings/cohorts/${cohortId}`
    : 'tunings/community';
  
  const r2LatestKey = `${r2Prefix}/tuning-latest.json`;

  // [resto da lógica de geração existente, filtrada por cohort]
  // ...

  // Publicar no R2 com estrutura de pasta correcta
  await env.STORAGE.put(r2LatestKey, tuningJson);
  await env.STORAGE.put(`${r2Prefix}/tuning-${timestamp}-${shortHash}.json`, tuningJson);

  // Registar em cohort_tunings (se cohort específico) ou tuning_versions (se community)
  if (cohortId) {
    await db.prepare(`UPDATE cohort_tunings SET is_current = 0 WHERE cohort_id = ?`).bind(cohortId).run();
    await db.prepare(`
      INSERT INTO cohort_tunings (id, cohort_id, version, generated_at, r2_key, sample_size, is_current, sha256)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `).bind(uuid(), cohortId, newVersion, now, r2LatestKey, rows.length, sha256).run();
  } else {
    // Community tuning — update tuning_versions (lógica existente do v1)
    // ...
  }
}
```

#### Patch em `version.js` — incluir versões por cohort:

```javascript
// Adicionar ao response:
// Cohorts disponíveis com versões
const cohortVersions = await env.DB.prepare(`
  SELECT cohort_id, version, generated_at
  FROM cohort_tunings
  WHERE is_current = 1
  ORDER BY cohort_id
`).all();

return new Response(JSON.stringify({
  // ... campos existentes ...
  cohort_tunings: (cohortVersions.results || []).reduce((acc, r) => {
    acc[r.cohort_id] = { version: r.version, generated: r.generated_at };
    return acc;
  }, {}),
}), { ... });
```

#### Criar `.github/workflows/release.yml`:

```yaml
name: frugal-release

on:
  push:
    tags:
      - 'v*'   # trigger em qualquer tag vX.Y.Z

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Extract version
        id: version
        run: echo "VERSION=${GITHUB_REF#refs/tags/v}" >> $GITHUB_OUTPUT

      - name: Create release archive
        run: |
          VERSION=${{ steps.version.outputs.VERSION }}
          mkdir -p dist/frugal-${VERSION}
          
          # Copiar ficheiros essenciais (sem secrets, sem .evolution, sem dashboard)
          cp install.sh install-windows.ps1 LICENSE README.md CHANGELOG.md dist/frugal-${VERSION}/
          cp -r tools/ skills/ agents/ docs/ dist/frugal-${VERSION}/
          
          # Criar checksums
          cd dist && sha256sum frugal-${VERSION}/* > frugal-${VERSION}/checksums.sha256
          
          # Comprimir
          tar czf frugal-${VERSION}.tar.gz frugal-${VERSION}/

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          files: dist/frugal-*.tar.gz
          body: |
            ## frugal v${{ steps.version.outputs.VERSION }}
            
            ### Install
            ```bash
            bash <(curl -fsSL https://frugal.dev/install.sh) --token=YOUR_TOKEN
            ```
            
            ### What changed
            See [CHANGELOG.md](CHANGELOG.md) for details.
          draft: false
          prerelease: ${{ contains(github.ref, '-beta') || contains(github.ref, '-rc') }}

      - name: Update version registry in D1
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        run: |
          VERSION=${{ steps.version.outputs.VERSION }}
          # Actualizar version_registry via wrangler
          npx wrangler d1 execute frugal-hub \
            --command="INSERT OR REPLACE INTO version_registry (version, released_at, is_latest)
                       VALUES ('${VERSION}', '$(date -u +%Y-%m-%dT%H:%M:%SZ)', 1);
                       UPDATE version_registry SET is_latest = 0 WHERE version != '${VERSION}';" \
            --remote
```

---

## SUPABASE — CONFIGURAÇÃO PARA MULTI-TENANT

### Tables a criar no Supabase SQL Editor:

```sql
-- Colar no Supabase SQL Editor (Dashboard → SQL Editor)

-- 1. users table
CREATE TABLE IF NOT EXISTS public.users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  name          TEXT,
  status        TEXT DEFAULT 'waitlist' CHECK (status IN ('waitlist','active','churned')),
  install_token TEXT UNIQUE,
  token_used_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  last_seen_at  TIMESTAMPTZ,
  source        TEXT DEFAULT 'landing',
  referrer_id   UUID REFERENCES public.users(id)
);

-- 2. install_events table
CREATE TABLE IF NOT EXISTS public.install_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES public.users(id),
  event_type     TEXT NOT NULL,
  platform       TEXT,
  frugal_version TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- 3. Políticas RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.install_events ENABLE ROW LEVEL SECURITY;

-- Anon só pode fazer INSERT no waitlist (com campos restritos)
CREATE POLICY "anon_waitlist_insert" ON public.users
  FOR INSERT TO anon
  WITH CHECK (status = 'waitlist' AND install_token IS NULL);

-- Service role (Paulo / backend) tem acesso total
CREATE POLICY "service_full_access_users" ON public.users
  FOR ALL TO service_role USING (true);

CREATE POLICY "service_full_access_events" ON public.install_events
  FOR ALL TO service_role USING (true);

-- 4. Função para gerar e associar install_token (chamada pelo Paulo manualmente ou por Edge Function)
CREATE OR REPLACE FUNCTION public.approve_user_and_generate_token(user_email TEXT)
RETURNS TEXT AS $$
DECLARE
  new_token TEXT;
BEGIN
  -- Gera um token pseudo-aleatório (o ULID real será gerado no Edge Function)
  new_token := encode(gen_random_bytes(20), 'hex');
  
  UPDATE public.users
  SET status = 'active',
      install_token = new_token
  WHERE email = user_email AND status = 'waitlist';
  
  RETURN new_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Variáveis de ambiente Vercel (landing):
```
NEXT_PUBLIC_SUPABASE_URL=https://eymtobwinevywmmlmxqa.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key — só no Vercel, nunca público>
```

---

## MODELO DE DADOS — VISÃO DE PRODUTO (o que o Paulo vê)

### Dashboard do Paulo (futuro — quando tiver 100+ utilizadores):

```
Utilizadores
─────────────────────────────────────────────────────────
Total registados: 127    Activos (7d): 43    Novos esta semana: 12

Por cohort:
  apple-silicon_max      → 34 utilizadores  | tuning dedicado v1.2
  gpu-high_api-paid      → 18 utilizadores  | tuning dedicado v1.1
  cpu-only_none          → 41 utilizadores  | community tuning
  apple-silicon_api-paid → 12 utilizadores  | community tuning (falta 3 para tuning próprio)
  ...

Qualidade do routing (média comunidade): 0.83 / 1.00
Savings totais reportados: $2,340.50
Versões em circulação: v0.9.4 (67%), v0.9.3 (23%), v0.9.5-beta (10%)

Anomalias activas: 1
  ⚠️ Followup rate subiu 18% nas últimas 24h vs baseline
```

### O que o utilizador vê (na landing / futuramente no dashboard):
```
O teu frugal
─────────────────────────────────────────────────────────
Perfil:  Mac Apple Silicon + Claude Max
Cohort:  apple-silicon_max (34 utilizadores como tu)
Tuning:  v1.2 (específico para o teu perfil)
Savings: $45.20 este mês | $312.80 total

Routing esta semana:
  83.1% → Ollama (grátis)
  12.4% → Haiku
  3.1%  → Sonnet
  1.4%  → Opus (só o que realmente precisa)

Comunidade:
  frugal poupou $2,340 este mês para 43 utilizadores activos
```

---

## VERIFICAÇÕES ANTES DE COMEÇAR (ORDEM EXACTA)

```bash
# 1. Migrations D1 — o que já existe?
npx wrangler d1 execute frugal-hub \
  --command="SELECT name FROM sqlite_master WHERE type='table';" --remote

# 2. R2 — o que existe?
npx wrangler r2 object list frugal-hub-storage --prefix="tunings/"

# 3. Supabase — tabela users existe?
# Ir a https://app.supabase.com/project/eymtobwinevywmmlmxqa/editor
# SELECT table_name FROM information_schema.tables WHERE table_schema='public';

# 4. identity.json existe localmente?
cat ~/.claude/tools/router/identity.json 2>/dev/null || echo "NOT FOUND — normal para instalaçao sem token"

# 5. hub-push.js — versão actual do payload
node ~/.claude/tools/router/hub-push.js --dry-run 2>&1 | head -30
```

---

## O QUE NÃO MUDAR (guardrails críticos)

1. **NUNCA** armazenar `install_token` em disco. Apenas em memória durante a instalação.
2. **NUNCA** associar `user_hash` (D1) a `email` (Supabase) em nenhum sistema.
   A separação é intencional e é a garantia de privacidade.
3. **NUNCA** enviar conteúdo de prompts no payload do hub. Apenas: tier, confidence,
   prompt_len, hw_tier, cohort_id, user_hash.
4. **NUNCA** alterar a API pública `/api/delta` de forma breaking.
   Utilizadores com versões antigas continuam a funcionar (add-only).
5. **NUNCA** apagar deltas antes do TTL de 7 dias (já configurado).
6. **NUNCA** criar endpoint que associe user_hash a qualquer PII.
7. O `MIN_COHORT_SIZE` deve ser >= 3 utilizadores antes de gerar tuning de cohort.
   Com menos de 3, o tuning pode ser individualizado (violação de privacidade).

---

## RESUMO — O QUE IMPLEMENTAR, POR ONDE COMEÇAR

```
Sessão Claude Code #10:
  Bloco 1-5 do v1 (log-manager, auto-snapshot, D1 migrations, hub-pull checksum, CI)
  + migration 003_multi_tenant.sql para o D1 do frugal-hub
  + identity.js (novo ficheiro, sem alterar nada existente)
  + Supabase: criar tabelas users + install_events + RLS

Sessão Claude Code #11:
  + Patch install.sh para aceitar --token
  + hub/routes/install.js (novo endpoint POST /api/install)
  + hub/routes/tuning.js (novo endpoint GET /api/tuning/:cohort)
  + worker.js: adicionar os novos routes
  + Aplicar migration D1 em produção

Sessão Claude Code #12:
  + hub-push.js: incluir user_hash + cohort_id no payload
  + hub-pull.js: ser cohort-aware
  + generate.js: gerar por cohort (refactor)
  + version.js: incluir cohort versions
  + .github/workflows/release.yml

Sessão Claude Code #13 (futuramente):
  + Dashboard Paulo (visualização de cohorts, anomalias, savings)
  + Auto-aprovação de utilizadores da waitlist (Supabase Edge Function)
  + Notificação por email após aprovação (Resend ou similar)
```

---

## SNAPSHOT NOTION NO FIM

Título: `🏗️ Sessão 2026-04-11 — Multi-Tenant Architecture Design`
HQ ID: `33d6f6e4-2bc4-816b-977a-fe84bbe912c9`

Registar:
- Decisão de arquitectura: user_hash local, nunca PII no hub
- Supabase: gestão de utilizadores (email, token)
- D1: perfis anónimos (user_hash, cohort_id)
- Separação intencional Supabase ↔ D1 (privacidade)
- Cohort system: apple-silicon_max, gpu-high_api-paid, etc.
- R2: tunings/cohorts/ vs tunings/community/
- Sequência de 4 sessões para implementação completa
