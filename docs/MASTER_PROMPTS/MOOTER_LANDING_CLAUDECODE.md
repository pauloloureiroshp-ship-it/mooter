# Master Prompt — Mooter Landing: Remaining P0/P1 changes (Claude Code)

> **Criado:** 2026-04-14 (Cowork)
> **Contexto:** A sessão Cowork completou o redesign visual da landing (`page.tsx`, `globals.css`, `layout.tsx`, `mooter-logo.svg`). Este prompt documenta o que sobra para o Claude Code fazer.

---

## O que o Cowork já fez (NÃO REPETIR)

| Ficheiro | O que foi feito |
|---|---|
| `landing/app/page.tsx` | Reescrito completo — Mooter branding, 13 secções, MooterLogo SVG, install block npm/bash, comparison table, before/after, evolution, competitor comparison |
| `landing/app/globals.css` | `--accent` → `#FF6B35`, todos os rgba teal → orange, CSS para novos sections adicionado |
| `landing/app/layout.tsx` | title/description/OG/JSON-LD/Plausible → mooter branding + mooter.ai domain |
| `landing/public/mooter-logo.svg` | Criado — cow head SVG 40×40 em #FF6B35 |

---

## Missão: P0 runtime fixes em `tools/router/`

### Contexto obrigatório antes de começar
Lê `INFRA.md` e `docs/MASTER_PROMPTS/MOOTER_REBRAND_RADAR.md` (se existir) ou `/auto-memory/project_mooter_rebrand_radar.md`.

O hub real está em `mooter-hub.frugal-hub.workers.dev`. O worker antigo `frugal-hub.frugal-hub.workers.dev` ainda está alive como fallback, mas o código novo deve apontar para o mooter-hub. O domínio `hub.mooter.ai` foi adiado (problema de cert HTTPS com Workers custom domain — precisa migração NS para Cloudflare).

### P0-A — Hub URLs hardcoded em `tools/router/`

Os seguintes ficheiros têm `frugal-hub.frugal-hub.workers.dev` hardcoded. Substituir por `mooter-hub.frugal-hub.workers.dev`. **Não usar find/replace cego** — verificar cada linha antes de editar:

```
tools/router/hub-submit-events.js     linha ~22
tools/router/hub-status.js            linha ~17
tools/router/hub-push.js              linha ~24
tools/router/hub-pull.js              linha ~23
tools/router/model-manager.js         linha ~335
tools/router/frugal-doctor.js         linhas ~302, 309, 471, 501
tools/router/audit/preflight-audit.js linhas ~14, 15
```

Pattern de substituição (verificar com grep antes):
```bash
grep -rn "frugal-hub\.frugal-hub\.workers\.dev" tools/router/
```

Substituição pretendida:
- `frugal-hub.frugal-hub.workers.dev` → `mooter-hub.frugal-hub.workers.dev`

**Backward compat obrigatório:** se os ficheiros já têm fallback chain (`MOOTER_HUB_URL || FRUGAL_HUB_URL || hardcoded`), mantém a chain mas muda o hardcoded default. Se não têm, adiciona:
```js
const HUB_URL = process.env.MOOTER_HUB_URL || process.env.FRUGAL_HUB_URL || 'https://mooter-hub.frugal-hub.workers.dev';
```

### P0-B — State file path em `tools/router/paths.js` e `inject_context.js`

- `paths.js` linha ~37: `MODE_FILE = '.frugal-mode.json'` → manter nome mas adicionar auto-migração:
  ```js
  // Auto-migrate legacy .frugal-mode.json to .mooter-mode.json
  const LEGACY_MODE_FILE = '.frugal-mode.json';
  const MODE_FILE = '.mooter-mode.json';
  // (no startup, if legacy exists and new doesn't, copy it)
  ```
- `inject_context.js` linhas ~783, 789: refs a `.frugal-mode.json` → `.mooter-mode.json` (mas manter leitura de ambos como fallback para utilizadores com ficheiro antigo)

**NOTA:** `frugal-mode.js` — renomear para `mooter-mode.js` e criar alias/require no ficheiro antigo:
```js
// frugal-mode.js — deprecated alias, kept for backward compat
module.exports = require('./mooter-mode.js');
```

### P0-C — Env var naming (backward compat)

Ficheiros afectados:
- `tools/router/.env.example` — `FRUGAL_HUB_URL` → adicionar `MOOTER_HUB_URL` (manter o antigo comentado)
- `tools/router/auto-sync.js` linha ~28 — `FRUGAL_LANDING_URL` → aceitar `MOOTER_LANDING_URL || FRUGAL_LANDING_URL`
- `tools/router/frugal-login.js` linha ~26 — `LANDING_URL` → sem mudança necessária (já genérico)
- `tools/router/hub-status.js` linha ~17 — ver P0-A acima

---

## Missão: P0 Cloudflare infra (wrangler.toml)

> **⚠️ ATENÇÃO:** O Worker `mooter-hub` já foi deployado em sessão anterior (commit 9821a92). Este P0 é só para confirmar o estado e corrigir o wrangler.toml local.

### P0-D — `hub/wrangler.toml`

```bash
# Verificar estado actual:
cat hub/wrangler.toml
```

Pretendido:
```toml
name = "mooter-hub"
# ... resto igual mas com database_name = "mooter-hub" se já migrado
```

Se o wrangler.toml ainda diz `frugal-hub`:
- `name = "frugal-hub"` → `name = "mooter-hub"`
- `database_name = "frugal-hub"` → `database_name = "mooter-hub"` (só se a D1 mooter-hub estiver criada)

**Antes de editar:** verificar se há D1 `mooter-hub` criada:
```bash
npx wrangler d1 list
```

### P0-E — SQL migration para `mooter_events`

Não dropar `frugal_events`. Criar migration nova:
```sql
-- hub/migrations/003_mooter_events_alias.sql
-- Creates mooter_events as a view over frugal_events for backward compat
-- NÃO dropar frugal_events até confirmar 0 active users dependem dela

CREATE VIEW IF NOT EXISTS mooter_events AS SELECT * FROM frugal_events;
```

Actualizar `hub/routes/events.js` para usar `mooter_events` nas queries novas mas manter `frugal_events` nas queries de leitura legacy.

---

## Missão: P1 user-visible (fazer antes de beta pública)

### P1-A — `landing/app/setup/page.tsx`

Linhas ~48 e ~85: URLs no setup guide ainda apontam para frugal-hub. Verificar e actualizar:
```bash
grep -n "frugal" landing/app/setup/page.tsx
```

### P1-B — `dashboard/app/api/community/route.ts`

```bash
grep -n "frugal" dashboard/app/api/community/route.ts
```
HUB_URL hardcoded → usar env var com fallback mooter.

### P1-C — `landing/.env.local.example`

`NEXT_PUBLIC_SITE_URL=https://frugal.dev` → `https://mooter.ai`

### P1-D — Skills renaming (fazer por último, não urgente para beta)

```bash
ls ~/.claude/skills/ | grep frugal
```

Para cada `frugal-*` skill: criar `mooter-*` como wrapper/alias. Não apagar os originais ainda — utilizadores existentes podem ter configurações.

---

## Ordem de execução recomendada

```
P0-A (hub URLs)        → impacta funcionalidade do hub em prod
P0-C (env vars)        → impacta setup de novos utilizadores
P0-D (wrangler.toml)   → só relevante se for fazer deploy do worker
P0-E (SQL migration)   → só fazer se D1 mooter-hub existir
P0-B (state files)     → impacta utilizadores com .frugal-mode.json existente
P1-C (.env.local)      → trivial, 1 linha
P1-A (setup page)      → user-visible
P1-B (dashboard API)   → user-visible
P1-D (skills)          → quando tiver tempo
```

---

## Safety gate antes de commit

```bash
# 1. Verificar que hub URL está correcta
curl -s https://mooter-hub.frugal-hub.workers.dev/api/stats | jq .

# 2. Verificar que o doctor não quebra
node tools/router/frugal-doctor.js

# 3. Classifier continua a funcionar
node tools/router/classify.js "fix the login bug"

# 4. Landing builda sem erro
cd landing && npm run build
```

---

## O que NÃO fazer

- **NÃO** dropar o Worker `frugal-hub` ou a D1 `frugal-hub` — podem ter utilizadores
- **NÃO** apagar `.frugal-mode.json` dos utilizadores — auto-migrar silenciosamente
- **NÃO** remover `FRUGAL_HUB_URL` env var — manter como fallback
- **NÃO** fazer `git add -A` — commits selectivos por componente
- **NÃO** tocar em `landing/app/page.tsx` ou `globals.css` — Cowork já fez o rewrite completo

---

## Referências

- Hub live: `https://mooter-hub.frugal-hub.workers.dev`
- Landing Vercel: `prj_2aZMQagzjYOtLyvofeWPnEA0mM1b` (auto-deploy em push main)
- Cloudflare account: `b1093c8a6e663afd02f98a1e87d0fa34`
- Rebrand radar completo: `/auto-memory/project_mooter_rebrand_radar.md`
