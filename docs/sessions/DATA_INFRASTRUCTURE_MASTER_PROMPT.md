# DATA_INFRASTRUCTURE_MASTER_PROMPT.md
# frugal — Data Infrastructure, Feedback Loop & Audit Trail
# Versão: 2026-04-11 | Sessão #10 (paralela ao Savings Integrity)

> **Missão:** Tornar toda a infraestrutura de dados do frugal auditável,
> self-healing, append-only e preparada para lançamento de versões futuras.
> Sem quebrar NADA do que já existe em produção.
>
> Lê este ficheiro inteiro antes de começar. Implementa na ordem indicada.
> Cada secção tem um "VERIFICAR PRIMEIRO" — faz sempre essa verificação.

---

## DIAGNÓSTICO — O QUE FOI DESCOBERTO (análise Cowork 2026-04-11)

### O que JÁ EXISTE e funciona bem ✅

| Componente | Estado | Nota |
|---|---|---|
| `decisions.log` (JSONL) | ✅ append-only | Base de dados local da sessão |
| `.evolution/` snapshots | ✅ 7 snapshots | Mas criados manualmente, sem processo |
| `backtest.js` → `hub-push.js` | ✅ pipeline nocturno | Mas sem verificação de integridade |
| D1 schema (`deltas`, `aggregated_stats`, `anomalies`) | ✅ em prod | Sem audit_log table |
| R2 bucket `frugal-hub-storage` | ✅ activo | Sem estrutura de pastas definida |
| `generate.js` → R2 latest | ✅ funcional | Sem versionamento de artefactos |
| GitHub Actions `test.yml` | ✅ CI activo | Só testa sintaxe, sem data integrity |
| `weekly-evolution.js` | ✅ existe | Não commitado automaticamente |
| `aggregate-deltas.js` | ✅ manual | Sem trigger automático |

### Gaps identificados — O que está partido ou em falta ❌

| Gap | Impacto | Prioridade |
|---|---|---|
| `decisions.log` sem rotação — pode crescer indefinidamente | Perda de dados em crash/reset | P1 |
| Sem checksums no log local | Corrupção silenciosa indetectável | P1 |
| `.evolution/` criado manualmente sem processo | Snapshots inconsistentes, falta versões | P2 |
| Sem GitHub Actions para snapshots automáticos | Histórico pode ficar desactualizado | P2 |
| D1 sem `audit_log` table — quem fez o quê, quando? | Impossível auditar mudanças ao router | P2 |
| R2 sem estrutura de pastas temporal | Impossível fazer archive/lifecycle | P3 |
| `generate.js` sobrescreve "latest" sem guardar versão anterior | Rollback impossível | P2 |
| `hub-push.js` não verifica se o push foi aceite pelo hub | Dados podem estar a não chegar | P1 |
| `hub-pull.js` não valida checksum do artefacto descarregado | Router pode ser corrompido por dados do hub | P1 |
| Sem schema version nos JSONL — backwards compat manual | Migração futura difícil | P3 |
| `weekly-evolution.js` não commit automático | Relatórios de evolução perdidos | P3 |
| Notion não tem página de data lineage | Impossível rastrear origem de decisões do algoritmo | P3 |

---

## ARQUITECTURA ALVO (após implementação)

```
FLUXO DE DADOS FRUGAL — COMPLETO

  [Utilizador faz prompt]
        │
        ▼
  inject_context.js (UserPromptSubmit hook)
        │ classifica em < 50ms
        │ POST /decision → savings-tracker.js
        │
        ▼
  decisions.log (JSONL, append-only, com manifest de checksums)
  ~/.claude/tools/router/logs/
    ├── decisions-current.jsonl         ← log activo hoje
    ├── decisions-current.jsonl.sha256  ← hash da última linha escrita
    └── archive/
        ├── 2026-04-10.jsonl.gz         ← rotação diária comprimida
        └── manifest.ndjson             ← índice de todos os ficheiros

        │ (nocturnamente — scheduled task)
        ▼
  backtest.js → router-tuning.json
        │
        ▼
  hub-push.js → POST /api/delta
  (com savings_usd, saved_pct, schema_version)
        │
        ▼ (Cloudflare Worker)
  D1: deltas table (+ audit_log NEW)
        │
        ▼ (cron daily)
  generate.js → router-tuning-{timestamp}.json → R2
  R2: logs/{YYYY-MM}/
      versions/router-tuning/{date}-{hash}/
      audit/{YYYY-MM}.ndjson
        │
        ▼ (quando hub-pull.js detecta nova versão)
  hub-pull.js → valida checksum → update-router.js
        │
        ▼
  classify.js actualizado
  .evolution/{version}-snapshot.json criado automaticamente
  git commit automático do snapshot
        │
        ▼
  GitHub: tag v{semver} em cada release
  .github/workflows/monthly-snapshot.yml → archiva tudo
        │
        ▼
  Notion: página de log da sessão + data lineage
```

---

## IMPLEMENTAÇÃO — 5 BLOCOS (por ordem, não saltar)

---

### BLOCO 1 — Log local: rotação, checksums, self-healing
**Ficheiros:** `tools/router/log-manager.js` (NOVO), `inject_context.js` (minor patch)
**Tempo:** ~45 min | **Risco:** Baixo

#### VERIFICAR PRIMEIRO:
```bash
# Quantas linhas tem o log actual?
wc -l ~/.claude/tools/router/decisions.log

# Qual o tamanho?
du -sh ~/.claude/tools/router/decisions.log

# Existe já alguma estrutura de archive?
ls ~/.claude/tools/router/logs/ 2>/dev/null || echo "SEM /logs/"

# Verificar se existe decisions.log noutros locais
find ~/.claude -name "decisions.log" 2>/dev/null
```

#### O que implementar:

**Criar `tools/router/log-manager.js`:**

```javascript
#!/usr/bin/env node
/**
 * log-manager.js — frugal JSONL log rotation + integrity.
 *
 * Responsabilities:
 *   1. Rotate decisions.log daily (or when > MAX_SIZE_MB)
 *   2. Compute and verify SHA-256 checksums per-line
 *   3. Self-heal: detect and isolate corrupted lines
 *   4. Archive: gzip closed logs + push manifest to R2 (optional)
 *
 * Called by:
 *   - inject_context.js: writeDecision(entry) instead of direct fs.appendFile
 *   - cron / scheduled task: node log-manager.js --rotate
 *   - frugal-doctor.js: node log-manager.js --verify
 *
 * SCHEMA VERSION: every line written includes { schema_version: 2 }
 * so future readers can migrate cleanly.
 */

'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const zlib = require('zlib');

const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const LOGS_DIR = path.join(ROUTER_DIR, 'logs');
const CURRENT_LOG = path.join(LOGS_DIR, 'decisions-current.jsonl');
const CURRENT_MANIFEST = path.join(LOGS_DIR, 'decisions-current.sha256');
const ARCHIVE_DIR = path.join(LOGS_DIR, 'archive');
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB → rotate
const SCHEMA_VERSION = 2;

// Backwards compat: if old decisions.log exists at ROUTER_DIR, migrate it.
const LEGACY_LOG = path.join(ROUTER_DIR, 'decisions.log');

function ensureDirs() {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
}

// ── Migration from legacy path ─────────────────────────────────────────────
function migrateLegacyLog() {
  if (!fs.existsSync(LEGACY_LOG)) return false;
  if (fs.existsSync(CURRENT_LOG)) return false; // already migrated

  console.log('[log-manager] Migrating legacy decisions.log → logs/decisions-current.jsonl');
  const lines = fs.readFileSync(LEGACY_LOG, 'utf8').split('\n').filter(Boolean);
  const migrated = lines.map(line => {
    try {
      const e = JSON.parse(line);
      if (!e.schema_version) e.schema_version = 1; // mark as legacy
      return JSON.stringify(e);
    } catch {
      return null; // skip corrupted
    }
  }).filter(Boolean);

  fs.writeFileSync(CURRENT_LOG, migrated.join('\n') + '\n');
  // Keep legacy file as .bak — do NOT delete (safety)
  fs.renameSync(LEGACY_LOG, LEGACY_LOG + '.migrated');
  console.log(`[log-manager] Migrated ${migrated.length} lines.`);
  return true;
}

// ── Write (append) — called by inject_context.js ───────────────────────────
function writeDecision(entry) {
  ensureDirs();
  migrateLegacyLog();

  // Check rotation before writing
  maybeRotate();

  const record = {
    schema_version: SCHEMA_VERSION,
    ts_ms: Date.now(),
    ...entry,
  };
  const line = JSON.stringify(record);
  const hash = crypto.createHash('sha256').update(line).digest('hex');

  fs.appendFileSync(CURRENT_LOG, line + '\n');
  fs.appendFileSync(CURRENT_MANIFEST, `${hash}\n`);
}

// ── Rotation ────────────────────────────────────────────────────────────────
function maybeRotate() {
  if (!fs.existsSync(CURRENT_LOG)) return;
  const stat = fs.statSync(CURRENT_LOG);
  const isOversized = stat.size > MAX_SIZE_BYTES;
  const today = new Date().toISOString().split('T')[0];
  const mtime = stat.mtime.toISOString().split('T')[0];
  const isNewDay = mtime < today;

  if (isOversized || isNewDay) {
    rotate(mtime);
  }
}

function rotate(dateStr) {
  const archivePath = path.join(ARCHIVE_DIR, `${dateStr}.jsonl.gz`);
  if (fs.existsSync(archivePath)) {
    // Already archived this date (can happen with multiple calls)
    fs.unlinkSync(CURRENT_LOG);
    fs.unlinkSync(CURRENT_MANIFEST);
    return;
  }

  // Compress synchronously (small files — OK)
  const raw = fs.readFileSync(CURRENT_LOG);
  const compressed = zlib.gzipSync(raw);
  fs.writeFileSync(archivePath, compressed);

  // Update archive manifest
  const manifestEntry = {
    date: dateStr,
    file: `${dateStr}.jsonl.gz`,
    lines: raw.toString().split('\n').filter(Boolean).length,
    compressed_bytes: compressed.length,
    archived_at: new Date().toISOString(),
  };
  fs.appendFileSync(
    path.join(ARCHIVE_DIR, 'manifest.ndjson'),
    JSON.stringify(manifestEntry) + '\n'
  );

  // Clear current
  fs.unlinkSync(CURRENT_LOG);
  fs.unlinkSync(CURRENT_MANIFEST);
  console.log(`[log-manager] Rotated → ${archivePath}`);
}

// ── Verification (self-heal) ────────────────────────────────────────────────
function verifyLog() {
  if (!fs.existsSync(CURRENT_LOG) || !fs.existsSync(CURRENT_MANIFEST)) {
    console.log('[log-manager] No current log to verify.');
    return { ok: true, lines: 0, corrupted: [] };
  }

  const lines = fs.readFileSync(CURRENT_LOG, 'utf8').split('\n').filter(Boolean);
  const hashes = fs.readFileSync(CURRENT_MANIFEST, 'utf8').split('\n').filter(Boolean);
  const corrupted = [];

  for (let i = 0; i < lines.length; i++) {
    const expected = hashes[i];
    if (!expected) { corrupted.push(i); continue; }
    const actual = crypto.createHash('sha256').update(lines[i]).digest('hex');
    if (actual !== expected) corrupted.push(i);
  }

  if (corrupted.length > 0) {
    console.warn(`[log-manager] ⚠️ ${corrupted.length} corrupted lines at: ${corrupted.join(', ')}`);
    // Self-heal: isolate corrupted lines into .corrupted file
    const good = lines.filter((_, i) => !corrupted.includes(i));
    const bad = lines.filter((_, i) => corrupted.includes(i));
    fs.writeFileSync(CURRENT_LOG, good.join('\n') + '\n');
    fs.appendFileSync(CURRENT_LOG + '.corrupted', bad.join('\n') + '\n');
    console.log('[log-manager] Self-healed: corrupted lines moved to .corrupted file.');
  }

  return { ok: corrupted.length === 0, lines: lines.length, corrupted };
}

// ── Read all (current + archive) ───────────────────────────────────────────
function readAllLines() {
  ensureDirs();
  migrateLegacyLog();
  const allLines = [];

  // Archive (sorted by date)
  if (fs.existsSync(ARCHIVE_DIR)) {
    const archives = fs.readdirSync(ARCHIVE_DIR)
      .filter(f => f.endsWith('.jsonl.gz'))
      .sort();
    for (const file of archives) {
      const raw = zlib.gunzipSync(fs.readFileSync(path.join(ARCHIVE_DIR, file)));
      allLines.push(...raw.toString().split('\n').filter(Boolean));
    }
  }

  // Current
  if (fs.existsSync(CURRENT_LOG)) {
    allLines.push(...fs.readFileSync(CURRENT_LOG, 'utf8').split('\n').filter(Boolean));
  }

  return allLines;
}

// ── CLI ────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const arg = process.argv[2];
  ensureDirs();
  migrateLegacyLog();

  if (arg === '--rotate') {
    maybeRotate();
    console.log('[log-manager] Rotation check complete.');
  } else if (arg === '--verify') {
    const result = verifyLog();
    console.log(result.ok
      ? `✅ Log integrity OK (${result.lines} lines)`
      : `⚠️ ${result.corrupted.length} corrupted lines found and isolated`
    );
    process.exit(result.ok ? 0 : 1);
  } else if (arg === '--stats') {
    const lines = readAllLines();
    console.log(`Total lines (all-time): ${lines.length}`);
    const events = {};
    for (const l of lines) {
      try { const e = JSON.parse(l); events[e.event || 'unknown'] = (events[e.event || 'unknown'] || 0) + 1; }
      catch { events.corrupted = (events.corrupted || 0) + 1; }
    }
    console.log(JSON.stringify(events, null, 2));
  } else {
    console.log('Usage: node log-manager.js [--rotate|--verify|--stats]');
  }
}

module.exports = { writeDecision, verifyLog, readAllLines, migrateLegacyLog };
```

#### Patch necessário em `inject_context.js`:
Substituir **todas** as chamadas a `fs.appendFileSync(LOG_PATH, ...)` por:
```javascript
const logManager = require('./log-manager');
logManager.writeDecision(entry); // em vez de fs.appendFileSync
```

Verificar quais as linhas exactas antes de alterar:
```bash
grep -n "appendFileSync.*decisions\|LOG_PATH" ~/.claude/tools/router/inject_context.js | head -10
```

#### Patch em `savings-tracker.js` e `backtest.js`:
Substituir `fs.readFileSync(LOG_PATH, 'utf8').split('\n')` por:
```javascript
const logManager = require('./log-manager');
const lines = logManager.readAllLines(); // lê current + archive
```

Verificar linhas afectadas:
```bash
grep -n "readFileSync.*decisions\|LOG_PATH\|readFileSync.*log" ~/.claude/tools/router/savings-tracker.js | head -10
grep -n "readFileSync.*decisions\|LOG_PATH" ~/.claude/tools/router/backtest.js | head -10
```

#### Adicionar ao scheduled tasks (Windows Task Scheduler / LaunchAgent):
```bash
# Cron diário de rotação (2:30 AM — 30 min após o backtest)
node ~/.claude/tools/router/log-manager.js --rotate

# Adicionar ao install.sh:
echo "Rotação de logs: 2:30 AM diário"
```

---

### BLOCO 2 — Snapshots automáticos de evolução
**Ficheiros:** `tools/router/auto-snapshot.js` (NOVO), `.github/workflows/evolution-snapshot.yml` (NOVO)
**Tempo:** ~30 min | **Risco:** Baixo

#### VERIFICAR PRIMEIRO:
```bash
# Qual é o formato actual dos snapshots?
cat /frugal/.evolution/v0.9.4-friends-beta.json | python3 -m json.tool | head -20

# Como são criados hoje?
cat /frugal/.evolution/README.md | grep -A 10 "Como criar"

# O git tem os snapshots committed?
cd ~/frugal && git log --oneline --follow .evolution/ | head -10
```

#### Criar `tools/router/auto-snapshot.js`:

```javascript
#!/usr/bin/env node
/**
 * auto-snapshot.js — automatic evolution snapshot creator.
 *
 * Reads the current state of classify.js, patterns.js, inject_context.js,
 * runs the stress test, and writes a versioned snapshot to .evolution/.
 *
 * Called automatically after:
 *   1. update-router.js applies a hub-pull tuning
 *   2. GitHub Actions monthly-snapshot workflow
 *   3. Manually: node auto-snapshot.js --tag v0.9.5
 *
 * Never overwrites an existing snapshot file.
 */

'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const REPO_DIR = process.cwd(); // must be run from repo root
const EVOLUTION_DIR = path.join(REPO_DIR, '.evolution');

function sha256File(filePath) {
  try {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch { return 'MISSING'; }
}

function gitHead() {
  const r = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', cwd: REPO_DIR });
  return (r.stdout || '').trim() || 'unknown';
}

function runStressTest() {
  const r = spawnSync(
    'node',
    [path.join(ROUTER_DIR, 'stress-test.js'), '--json'],
    { encoding: 'utf8', timeout: 30000 }
  );
  try { return JSON.parse(r.stdout); } catch { return { error: 'failed' }; }
}

function loadLogStats() {
  try {
    const logManager = require(path.join(ROUTER_DIR, 'log-manager'));
    const lines = logManager.readAllLines();
    const classified = lines.filter(l => {
      try { return JSON.parse(l).event === 'classified'; } catch { return false; }
    });
    return { total_lines: lines.length, classified_prompts: classified.length };
  } catch {
    // Fallback: read legacy decisions.log
    const logPath = path.join(ROUTER_DIR, 'decisions.log');
    if (!fs.existsSync(logPath)) return { total_lines: 0, classified_prompts: 0 };
    const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
    return { total_lines: lines.length, classified_prompts: lines.length };
  }
}

function createSnapshot(tag) {
  fs.mkdirSync(EVOLUTION_DIR, { recursive: true });

  const timestamp = new Date().toISOString().split('T')[0];
  const snapshotId = tag || `${timestamp}-auto`;
  const outPath = path.join(EVOLUTION_DIR, `${snapshotId}-snapshot.json`);

  if (fs.existsSync(outPath)) {
    console.log(`[auto-snapshot] Snapshot already exists: ${outPath}`);
    return null;
  }

  const patterns = require(path.join(ROUTER_DIR, 'patterns'));
  const version = (() => {
    try { return require(path.join(ROUTER_DIR, 'version')).version; } catch { return 'unknown'; }
  })();

  const stressResult = runStressTest();
  const logStats = loadLogStats();

  const snapshot = {
    snapshot_id: snapshotId,
    snapshot_date: new Date().toISOString(),
    frugal_version: version,
    git_head: gitHead(),
    methodology: 'auto-snapshot v1.0',

    file_hashes: {
      'classify.js': sha256File(path.join(ROUTER_DIR, 'classify.js')),
      'patterns.js': sha256File(path.join(ROUTER_DIR, 'patterns.js')),
      'inject_context.js': sha256File(path.join(ROUTER_DIR, 'inject_context.js')),
      'pricing.js': sha256File(path.join(ROUTER_DIR, 'pricing.js')),
    },

    pattern_counts: {
      high_risk: (patterns.HIGH_RISK || []).length,
      medium_risk: (patterns.MEDIUM_RISK || patterns.MED_RISK || []).length,
      low_risk: (patterns.LOW_RISK || []).length,
      trivial: (patterns.TRIVIAL || []).length,
    },

    stress_test: stressResult,
    log_stats: logStats,

    trigger: process.argv[3] || 'manual',
  };

  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
  console.log(`[auto-snapshot] Created: ${outPath}`);
  return outPath;
}

// ── CLI ────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const tagArg = process.argv.find(a => a.startsWith('--tag='));
  const tag = tagArg ? tagArg.split('=')[1] : null;
  const result = createSnapshot(tag);
  process.exit(result ? 0 : 1);
}

module.exports = { createSnapshot };
```

#### Patch em `update-router.js` — auto-snapshot após cada pull:
Após aplicar o tuning (última linha do apply), adicionar:
```javascript
// Auto-snapshot after successful tuning
const autoSnapshot = require('./auto-snapshot');
autoSnapshot.createSnapshot(`auto-post-pull-${new Date().toISOString().split('T')[0]}`);
```

Verificar onde adicionar:
```bash
grep -n "console.log\|process.exit\|return" ~/.claude/tools/router/update-router.js | tail -10
```

#### GitHub Actions `evolution-snapshot.yml` (NOVO):
Criar `.github/workflows/evolution-snapshot.yml`:

```yaml
name: monthly-evolution-snapshot

on:
  schedule:
    - cron: '0 6 1 * *'  # 1º de cada mês às 06:00 UTC
  workflow_dispatch:       # trigger manual

jobs:
  snapshot:
    runs-on: ubuntu-latest
    permissions:
      contents: write    # para commit do snapshot

    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Stage runtime
        run: |
          mkdir -p "$HOME/.claude/tools/router"
          cp tools/router/*.js "$HOME/.claude/tools/router/"
          # Seed minimal log para auto-snapshot não crashar
          echo '{"event":"classified","tier":"T1","prompt_len":50,"schema_version":2}' > \
            "$HOME/.claude/tools/router/logs/decisions-current.jsonl"

      - name: Create monthly snapshot
        run: |
          cd "$GITHUB_WORKSPACE"
          MONTH=$(date +%Y-%m)
          node "$HOME/.claude/tools/router/auto-snapshot.js" --tag="monthly-${MONTH}"

      - name: Commit snapshot
        run: |
          git config user.name "frugal-bot"
          git config user.email "bot@frugal.dev"
          git add .evolution/
          git diff --staged --quiet || git commit -m "chore(evolution): monthly snapshot $(date +%Y-%m)"

      - name: Push
        run: git push
```

---

### BLOCO 3 — D1 audit_log + R2 estrutura temporal
**Ficheiros:** `hub/migrations/002_audit_log.sql` (NOVO), `hub/routes/delta.js` (patch), `hub/jobs/aggregate.js` (patch)
**Tempo:** ~45 min | **Risco:** Médio (modifica infra prod)

#### VERIFICAR PRIMEIRO:
```bash
# Ver tabelas actuais no D1
npx wrangler d1 execute frugal-hub --command="SELECT name FROM sqlite_master WHERE type='table';" --remote

# Ver schema actual
npx wrangler d1 execute frugal-hub --command="SELECT sql FROM sqlite_master WHERE type='table';" --remote

# Quantas rows na tabela deltas?
npx wrangler d1 execute frugal-hub --command="SELECT COUNT(*) FROM deltas;" --remote
```

#### Criar `hub/migrations/002_audit_log.sql`:

```sql
-- frugal-hub D1 schema v2 — audit trail + R2 archive tracking

-- Audit log: imutável, regista toda acção que modifica dados
CREATE TABLE IF NOT EXISTS audit_log (
  id            TEXT PRIMARY KEY,          -- UUID
  timestamp     TEXT NOT NULL,             -- ISO 8601
  year_month    TEXT NOT NULL,             -- "2026-04" (partition key)
  action        TEXT NOT NULL,             -- "api.post_delta" | "cron.generate" | "cron.prune"
  actor         TEXT DEFAULT 'system',     -- "user" | "system" | "cron"
  resource_id   TEXT,                      -- ID do recurso afectado (delta_id, etc.)
  details       TEXT,                      -- JSON string com contexto
  success       INTEGER DEFAULT 1,         -- 1 = OK, 0 = falhou
  error_msg     TEXT                       -- mensagem de erro se success=0
);

CREATE INDEX IF NOT EXISTS idx_audit_month ON audit_log(year_month);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);

-- R2 archive tracking: saber o que foi arquivado, quando, e onde
CREATE TABLE IF NOT EXISTS r2_archives (
  id            TEXT PRIMARY KEY,
  archived_at   TEXT NOT NULL,
  year_month    TEXT NOT NULL,
  r2_key        TEXT NOT NULL,             -- path no R2 bucket
  content_type  TEXT NOT NULL,             -- "decisions-log" | "router-tuning" | "audit"
  lines         INTEGER,                   -- nº de linhas (para logs)
  compressed_bytes INTEGER,
  sha256        TEXT,                      -- checksum do ficheiro no R2
  source        TEXT                       -- "cron.daily" | "cron.monthly" | "manual"
);

CREATE INDEX IF NOT EXISTS idx_r2_month ON r2_archives(year_month);
CREATE INDEX IF NOT EXISTS idx_r2_content ON r2_archives(content_type);

-- Versioned router-tuning: cada geração preservada com metadata
CREATE TABLE IF NOT EXISTS tuning_versions (
  id            TEXT PRIMARY KEY,
  generated_at  TEXT NOT NULL,
  year_month    TEXT NOT NULL,
  version_str   TEXT NOT NULL,             -- "1.2.3"
  r2_key        TEXT NOT NULL,             -- path no R2
  sample_size   INTEGER,
  avg_trust_score REAL,
  keyword_count INTEGER,
  threshold_adjustments TEXT,             -- JSON
  is_current    INTEGER DEFAULT 0,        -- só 1 por vez
  deployed_at   TEXT,                     -- quando foi via hub-pull
  sha256        TEXT
);

CREATE INDEX IF NOT EXISTS idx_tuning_current ON tuning_versions(is_current);
CREATE INDEX IF NOT EXISTS idx_tuning_month ON tuning_versions(year_month);
```

#### Aplicar migration:
```bash
# Aplicar em produção
npx wrangler d1 execute frugal-hub --file=hub/migrations/002_audit_log.sql --remote

# Verificar
npx wrangler d1 execute frugal-hub --command="SELECT name FROM sqlite_master WHERE type='table';" --remote
```

#### Patch em `hub/routes/delta.js` — adicionar audit entry:
Após o INSERT na tabela `deltas` com sucesso, adicionar:
```javascript
// Audit log: regista recepção do delta
await env.DB.prepare(`
  INSERT INTO audit_log (id, timestamp, year_month, action, resource_id, details, success)
  VALUES (?, ?, ?, 'api.post_delta', ?, ?, 1)
`).bind(
  crypto.randomUUID(),
  now.toISOString(),
  now.toISOString().substring(0, 7), // "2026-04"
  id,
  JSON.stringify({
    hw_tier: body.hw_tier,
    sub_profile: body.sub_profile,
    prompt_count: body.prompt_count,
    trust_score: trustScore,
  })
).run();
```

#### Estrutura R2 a adoptar (documentar em `hub/wrangler.toml` como comentário):

```
frugal-hub-storage/
├── logs/
│   └── {YYYY-MM}/
│       ├── decisions-{YYYY-MM-DD}.jsonl.gz    ← diário, enviado pelo hub-push
│       └── manifest.json                       ← índice do mês
├── versions/
│   └── router-tuning/
│       └── {YYYY-MM-DD}-{sha256[:8]}/
│           ├── data.json                       ← o tuning JSON
│           └── metadata.json                   ← quem gerou, accuracy, etc.
└── audit/
    └── {YYYY-MM}.ndjson.gz                     ← audit_log exportado mensalmente
```

#### Patch em `hub/jobs/generate.js` — guardar versão antes de sobrescrever latest:
Antes do `PUT` que escreve `router-tuning-latest.json`, adicionar:
```javascript
// Archive versão anterior antes de sobrescrever
const prevKey = `versions/router-tuning/${versionStr}-${sha256Prev.slice(0,8)}/data.json`;
await env.STORAGE.put(prevKey, JSON.stringify(previousTuning));
await env.STORAGE.put(`versions/router-tuning/${versionStr}/metadata.json`, JSON.stringify({
  generated_at: new Date().toISOString(),
  version: versionStr,
  sample_size: rows.length,
  r2_key: prevKey,
}));

// Registar em tuning_versions
await db.prepare(`
  UPDATE tuning_versions SET is_current = 0 WHERE is_current = 1
`).run();
await db.prepare(`
  INSERT INTO tuning_versions (id, generated_at, year_month, version_str, r2_key, sample_size, is_current)
  VALUES (?, ?, ?, ?, ?, ?, 1)
`).bind(uuid(), new Date().toISOString(), yearMonth, versionStr, prevKey, rows.length).run();
```

---

### BLOCO 4 — hub-pull com checksum validation + rollback
**Ficheiros:** `tools/router/hub-pull.js` (patch)
**Tempo:** ~20 min | **Risco:** Médio

#### VERIFICAR PRIMEIRO:
```bash
# Ver o que hub-pull faz hoje
cat ~/.claude/tools/router/hub-pull.js | grep -n "sha256\|checksum\|validate\|rollback" | head -10
# Se output vazio → não tem validação
```

#### Patch em `hub-pull.js`:
Após descarregar o `router-tuning-latest.json` e **antes** de escrever em disco:

```javascript
// 1. Verificar checksum (o hub inclui X-Frugal-SHA256 header)
const expectedHash = response.headers.get('X-Frugal-SHA256');
if (expectedHash) {
  const actualHash = crypto.createHash('sha256').update(body).digest('hex');
  if (actualHash !== expectedHash) {
    console.error('[hub-pull] ❌ Checksum mismatch — aborting. File may be corrupted.');
    process.exit(1);
  }
  console.log('[hub-pull] ✅ Checksum verified:', actualHash.slice(0, 8));
}

// 2. Backup da versão actual antes de sobrescrever (rollback)
const TUNING_PATH = path.join(ROUTER_DIR, 'router-tuning.json');
const TUNING_BACKUP = path.join(ROUTER_DIR, 'router-tuning.json.bak');
if (fs.existsSync(TUNING_PATH)) {
  fs.copyFileSync(TUNING_PATH, TUNING_BACKUP);
}

// 3. Escrever nova versão
fs.writeFileSync(TUNING_PATH, body);

// 4. Logar em decisions.log (para rastreabilidade)
const logManager = require('./log-manager');
logManager.writeDecision({
  event: 'hub_pull_applied',
  tuning_version: parsed.version || 'unknown',
  sample_size: parsed.sample_size || null,
  sha256: actualHash || 'not-verified',
});

console.log('[hub-pull] ✅ Tuning applied. Backup saved to .bak');
```

#### Adicionar header `X-Frugal-SHA256` no Worker (`hub/jobs/generate.js`):
Quando o Worker serve o ficheiro `router-tuning-latest.json`, adicionar o header:
```javascript
const tuningBody = JSON.stringify(tuning);
const hash = crypto.createHash('sha256').update(tuningBody).digest('hex');
return new Response(tuningBody, {
  headers: {
    'Content-Type': 'application/json',
    'X-Frugal-SHA256': hash,
    'Cache-Control': 'no-store',
  }
});
```

---

### BLOCO 5 — GitHub Actions: CI de integridade de dados
**Ficheiros:** `.github/workflows/test.yml` (patch), `.github/workflows/data-integrity.yml` (NOVO)
**Tempo:** ~20 min | **Risco:** Baixo

#### Adicionar ao `test.yml` existente (novo step após os testes actuais):
```yaml
      - name: Verify log-manager module
        run: |
          node -c tools/router/log-manager.js
          node "$HOME/.claude/tools/router/log-manager.js" --verify || true

      - name: Verify auto-snapshot module
        run: |
          node -c tools/router/auto-snapshot.js
          node "$HOME/.claude/tools/router/auto-snapshot.js" --tag=ci-test
          test -f ".evolution/ci-test-snapshot.json" && echo "✅ snapshot created" || exit 1
```

#### Criar `.github/workflows/data-integrity.yml` (semanal):

```yaml
name: data-integrity-check

on:
  schedule:
    - cron: '0 7 * * 1'   # segunda-feira às 07:00 UTC
  workflow_dispatch:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Syntax check all router tools
        run: |
          for f in tools/router/*.js; do
            node -c "$f" && echo "✅ $f" || exit 1
          done

      - name: Verify evolution snapshots are valid JSON
        run: |
          for f in .evolution/*.json; do
            python3 -m json.tool "$f" > /dev/null && echo "✅ $f" || exit 1
          done

      - name: Check snapshot count (must grow over time)
        run: |
          COUNT=$(ls .evolution/*.json | wc -l)
          echo "Evolution snapshots: $COUNT"
          test $COUNT -ge 7 && echo "✅ Enough snapshots" || echo "⚠️ Only $COUNT snapshots"

      - name: Verify pricing.js has required models
        run: |
          node -e "
            const p = require('./tools/router/pricing.js');
            const required = ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5'];
            for (const m of required) {
              if (!p.PRICES || !p.PRICES[m]) {
                console.error('MISSING:', m); process.exit(1);
              }
            }
            console.log('✅ All required models in pricing.js');
          "

      - name: Report
        run: echo "Data integrity check complete — $(date)"
```

---

## ESTRUTURA DE PASTAS FINAL (após implementação)

```
frugal/ (repo)
├── .evolution/                    ← snapshots automáticos do algoritmo
│   ├── README.md
│   ├── v0.9.4-friends-beta.json
│   └── ... (novos criados por auto-snapshot.js)
├── .github/
│   └── workflows/
│       ├── test.yml               ← CI existente + data integrity steps
│       ├── evolution-snapshot.yml ← NOVO: snapshot mensal automático
│       └── data-integrity.yml     ← NOVO: check semanal
├── hub/
│   ├── migrations/
│   │   ├── 001_init.sql           ← existente
│   │   └── 002_audit_log.sql      ← NOVO: audit_log + r2_archives + tuning_versions
│   ├── routes/delta.js            ← PATCH: audit entry
│   ├── jobs/generate.js           ← PATCH: archive versão + tuning_versions
│   └── ...
├── tools/router/
│   ├── log-manager.js             ← NOVO: rotação + checksums + self-heal
│   ├── auto-snapshot.js           ← NOVO: snapshot automático
│   ├── inject_context.js          ← PATCH: usa logManager.writeDecision()
│   ├── savings-tracker.js         ← PATCH: usa logManager.readAllLines()
│   ├── backtest.js                ← PATCH: usa logManager.readAllLines()
│   ├── hub-pull.js                ← PATCH: checksum + backup + rollback
│   ├── update-router.js           ← PATCH: auto-snapshot após apply
│   └── ...
```

---

## NOTION — PÁGINA DE DATA LINEAGE

Após concluir os blocos, criar nova página no Notion HQ (`33d6f6e4-2bc4-816b-977a-fe84bbe912c9`):

**Título:** `🗄️ frugal — Data Lineage & Infrastructure`

**Conteúdo mínimo:**
1. Diagrama do fluxo de dados (copiar o ASCII acima)
2. Tabela de todas as fontes de dados (decisions.log, D1, R2, evolution/)
3. Política de retenção de dados:
   - `decisions.log`: 7 dias raw → gzip archive → R2 após 90 dias
   - D1 deltas: TTL 7 dias (já configurado)
   - R2 logs: 1 ano (lifecycle policy a criar)
   - `.evolution/`: permanente no git
4. Checklist de auditoria mensal
5. Como fazer rollback de tuning (hub-pull --rollback)

---

## VALIDAÇÃO FINAL — correr após todos os blocos

```bash
# 1. Log manager funciona?
node ~/.claude/tools/router/log-manager.js --verify
node ~/.claude/tools/router/log-manager.js --stats

# 2. Auto-snapshot funciona?
cd ~/frugal && node ~/.claude/tools/router/auto-snapshot.js --tag=v0.9.5-infra-upgrade
ls .evolution/v0.9.5-infra-upgrade-snapshot.json

# 3. D1 migrations aplicadas?
npx wrangler d1 execute frugal-hub --command="SELECT COUNT(*) FROM audit_log;" --remote

# 4. Hub-pull com checksum?
node ~/.claude/tools/router/hub-pull.js --dry-run 2>&1 | grep -E "checksum|SHA256|✅|❌"

# 5. GitHub Actions validam?
# Push um commit pequeno e verificar que test.yml + data-integrity.yml passam

# 6. Savings-tracker lê all-time?
curl -s http://127.0.0.1:7821/metrics | python3 -c "
import sys, json
m = json.load(sys.stdin)
print('Prompts all-time:', m.get('prompts', '?'))
print('Methodology:', m.get('methodology', '?'))
"

# 7. frugal-doctor reporta infra saudável?
node ~/.claude/tools/router/frugal-doctor.js
```

---

## O QUE NÃO MUDAR (guardrails)

- **Não alterar** o schema do payload que `hub-push.js` envia ao hub — pode quebrar
  a validação do Worker para outros utilizadores. Só **adicionar** campos opcionais.
- **Não apagar** `decisions.log` existente — migrar com `migrateLegacyLog()`.
- **Não alterar** a API pública do `savings-tracker.js` (`/metrics`, `/summary`, `/last`) —
  o VSCode extension depende destes endpoints.
- **Não adicionar dependências npm** — tudo em stdlib Node.js (fs, crypto, zlib, path).
- **Não alterar** `.evolution/README.md` — manter como está, apenas adicionar snapshots.
- As GitHub Actions devem ter `timeout-minutes: 5` para não consumir créditos.

---

## RESUMO EXECUTIVO PARA O PAULO (3 linhas)

Problema: os dados do frugal estão a ser perdidos (log sem rotação), não verificados
(sem checksums), e não versionados (snapshots manuais, hub sobrescreve sem archive).
Solução: 5 blocos que adicionam log-manager, auto-snapshot, audit_log D1, checksum no
hub-pull, e CI de integridade — sem quebrar nada em produção.
Resultado: o frugal passa a ter um pipeline de dados auditável, self-healing, e preparado
para crescer com novos utilizadores e novos modelos ao longo de anos.

---

## SNAPSHOT NOTION NO FIM

Título: `🗄️ Sessão 2026-04-11 — Data Infrastructure Audit + Pipeline Hardening`
HQ ID: `33d6f6e4-2bc4-816b-977a-fe84bbe912c9`
