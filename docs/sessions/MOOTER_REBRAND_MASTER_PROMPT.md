# 🐮 MOOTER REBRAND — MASTER PROMPT

**Criado:** 2026-04-13
**Destinado a:** Claude Code (Opus), com Paulo no loop
**Estimativa:** 3-5 sessões, ~6-10h de trabalho total
**Risco:** ALTO — toca em infra live (Cloudflare Worker, Supabase DB com dados reais, Vercel projects). Qualquer passo destrutivo requer confirmação explícita do Paulo.

---

## Contexto

Rebrand `frugal` → `mooter`. O domínio `mooter.ai` e o npm `@mooter/cli@0.0.1` já estão live (2026-04-13). Agora é preciso migrar **o resto do stack** sem partir nada que já está em produção.

**O que JÁ está feito (não tocar):**
- ✅ Domínio `mooter.ai` registado e DNS apontado para Vercel
- ✅ Vercel project `mooter-landing` (prj_GLyS0L3q0Fc8Yd842o92addKZAGu) deployed com static HTML
- ✅ npm `@mooter/cli@0.0.1` publicado; scope `@mooter/*` reservado
- ✅ Org npm `mooter` criada; 2FA activo (Authorization only)
- ✅ Handle X `@mooter_ai` reservado
- ✅ Página Notion de log (id 3416f6e4-2bc4-812d-8781-e92ad1a50343) criada

**O que AINDA TEM "frugal" e precisa de migração:**

### Infra cloud
- **Cloudflare** (account `b1093c8a6e663afd02f98a1e87d0fa34`):
  - Worker `frugal-hub` (id `a8b8a0a3808c4b359325fb213b3899fc`) — modified 2026-04-13
  - D1 `frugal-hub` (id `320b55f6-9444-4deb-bcd5-e8227739546e`) — 0 tables (migrations ainda não aplicadas)
  - R2 `frugal-hub-storage`
- **Supabase** project `frugal` (id `eymtobwinevywmmlmxqa`) — ACTIVE_HEALTHY, **8 tabelas com dados reais**:
  - `waitlist` (3 rows), `url_analyses` (10 rows), `profiles` (1 row), `devices` (1 row), `decisions_log` (1 row), `router_deltas` (0), `sessions` (0), `usage_sessions` (0)
- **Vercel** project `landing` (prj_2aZMQagzjYOtLyvofeWPnEA0mM1b) — Next.js antiga, ainda deployed
- **GitHub** repo `pauloloureiroshp-ship-it/frugal` — conta pessoal, não org
- **Org GitHub `mooter-ai`** — ainda não criada

### Código (17 ficheiros com `frugal-hub` hardcoded)
```
dashboard/app/api/community/route.ts
hub/jobs/notify.js
hub/migrations/001_init.sql
hub/migrations/002_frugal_events.sql
hub/worker.js
hub/wrangler.toml
landing/app/page.tsx
tools/audit/preflight-audit.js
tools/router/backtest.js
tools/router/frugal-doctor.js
tools/router/hub-pull.js
tools/router/hub-push.js
tools/router/hub-status.js
tools/router/hub-submit-events.js
tools/router/model-catalog.json
tools/router/model-manager.js
tools/router/update-metrics.js
```

### Estado em disco dos utilizadores (3 ficheiros de código, com refs a `.frugal-mode.json`)
```
tools/router/frugal-mode.js
tools/router/inject_context.js
tools/router/paths.js
```

### Skills (11 skills)
```
frugal-auto, frugal-beast, frugal-dashboard, frugal-doctor, frugal-hello,
frugal-route, frugal-savings, frugal-status, frugal-summary, frugal-update, frugal-zen
```

### package.json (3)
```
vscode-extension/package.json (name, publisher, command IDs, config keys)
dashboard/package.json (name: "frugal-dashboard")
landing/package.json (name: "frugal-landing")
```

### Env vars
```
FRUGAL_HUB_URL (em .env.example, auto-sync.js, hub-status.js, hub-push.js, hub-pull.js)
FRUGAL_LANDING_URL (auto-sync.js, frugal-login.js)
```

### SQL
- Tabela `frugal_events` (migration pronta mas não aplicada) + 3 indices

### Docs (~79 ficheiros .md)
CLAUDE.md, SYNC.md, INFRA.md, ARCHITECTURE.md + 75 outros

---

## Princípios fundamentais (ler antes de qualquer acção)

1. **Não é find/replace cego.** `frugal` aparece em git history (imutável), em file names de config (`.frugal-mode.json` no disco de users), em URLs imutáveis de Workers Cloudflare. Migração tem de ser coordenada.
2. **Backward-compat obrigatório** em env vars e state files durante ≥30 dias. Aceita `FRUGAL_HUB_URL` *e* `MOOTER_HUB_URL`; procura `.frugal-mode.json` *e* `.mooter-mode.json`.
3. **Não destruir nada live** sem janela de deprecation. Worker antigo fica 30 dias a servir; D1/R2 antigos só são apagados após confirmar zero tráfego.
4. **Preservar dados Supabase**. A tabela `waitlist` tem signups reais; `url_analyses` tem 10 análises. Não dropar.
5. **Confirmação explícita do Paulo** antes de qualquer operação destrutiva (DROP, DELETE, RENAME de recursos cloud, force push, git filter-branch).

---

## Estratégia — 4 fases

```
Fase 1 (1-2h)  — Infra nova em paralelo (zero impacto nos users)
Fase 2 (2-3h)  — Migrar runtime com backward-compat (users existentes não sentem nada)
Fase 3 (1-2h)  — Public surface swap (user-visible, mas reversível)
Fase 4 (1h,    — Cleanup após 30 dias (destrutivo, só com ok explícito)
 agendado)
```

---

## FASE 1 — Infra nova em paralelo

**Objectivo:** criar todos os recursos `mooter-*` na cloud, deployar o mesmo código, validar, **sem tocar em `frugal-*`**.

### 1.1 Criar Cloudflare Worker `mooter-hub`

```bash
cd hub

# Criar novo wrangler config apontando para recursos novos
cp wrangler.toml wrangler.mooter.toml
```

Editar `wrangler.mooter.toml`:
```toml
name = "mooter-hub"
main = "worker.js"
compatibility_date = "2026-04-01"

[[d1_databases]]
binding = "DB"
database_name = "mooter-hub"
database_id = "<TBD — criar D1 primeiro>"

[[r2_buckets]]
binding = "STORAGE"
bucket_name = "mooter-hub-storage"

[triggers]
crons = ["0 * * * *", "0 6 * * *", "0 6 * * 1"]

[vars]
DELTA_TTL_DAYS = "7"
MIN_TRUST_SCORE = "0.4"
NEW_MODEL_THRESHOLD = "10"
ACCURACY_DROP_THRESHOLD = "0.15"
```

### 1.2 Criar D1 `mooter-hub` (via MCP Cloudflare)

```
Use mcp__cloudflare__d1_database_create:
- name: "mooter-hub"
Capture: database_id no response → meter no wrangler.mooter.toml
```

### 1.3 Criar R2 `mooter-hub-storage` (via MCP)

```
Use mcp__cloudflare__r2_bucket_create:
- name: "mooter-hub-storage"
```

### 1.4 Preparar migrations renomeadas

Criar `hub/migrations/mooter/`:
- `001_init.sql` — copy de `001_init.sql` com `frugal` → `mooter` nos nomes de tabelas
- `002_mooter_events.sql` — copy de `002_frugal_events.sql`:
  - `frugal_events` → `mooter_events`
  - indices: `idx_frugal_events_*` → `idx_mooter_events_*`
  - **MANTER** coluna `frugal_version` (é semantic, referente à versão do router — renomear para `mooter_version` mais tarde, mas NÃO nesta migration)
- `003_deltas_savings.sql` — inspeccionar e renomear se necessário

### 1.5 Deploy do worker novo

```bash
cd hub
wrangler deploy --config wrangler.mooter.toml
wrangler d1 execute mooter-hub --file migrations/mooter/001_init.sql --config wrangler.mooter.toml
wrangler d1 execute mooter-hub --file migrations/mooter/002_mooter_events.sql --config wrangler.mooter.toml
wrangler d1 execute mooter-hub --file migrations/mooter/003_deltas_savings.sql --config wrangler.mooter.toml
```

### 1.6 Validação

```bash
# Healthcheck
curl https://mooter-hub.<account>.workers.dev/health

# Verificar tables no D1
wrangler d1 execute mooter-hub --command "SELECT name FROM sqlite_master WHERE type='table'" --config wrangler.mooter.toml

# Comparar com frugal-hub (devem ser estruturalmente idênticos)
wrangler d1 execute frugal-hub --command "SELECT name FROM sqlite_master WHERE type='table'"
```

**Checkpoint Paulo:** confirmar que worker novo está up e respondendo antes de Fase 2.

### 1.7 Criar novo Supabase project `mooter` (OPCIONAL — avaliar trade-off)

**Opção A — Novo projecto:** mais limpo long-term, nome correcto na URL (`db.<id>.supabase.co` não muda, mas o display name é `mooter`), mas requer **migração de dados** (waitlist, url_analyses, profiles, devices, decisions_log).

**Opção B — Renomear display do projecto existente:** mais fácil, zero migração de dados, mas nome do projecto continua "frugal" internamente.

**Recomendação:** Opção B por agora. A URL do Supabase (`eymtobwinevywmmlmxqa.supabase.co`) é opaca, ninguém vê. Fazer Opção A só se Paulo quiser "brand pure" na dashboard.

Se Opção B escolhida:
```
Dashboard Supabase → Project Settings → General → Name: "mooter"
```

---

## FASE 2 — Migrar runtime com backward-compat

**Objectivo:** código novo aponta para `mooter-hub`, mas aceita fallbacks para `frugal-hub` se users tiverem env vars antigas.

### 2.1 Env var abstraction

Criar `tools/router/env.js` (novo ficheiro):
```js
// Unified env var reader com backward-compat.
// Prefere MOOTER_*, falha para FRUGAL_* se não existir.
function getHubUrl() {
  return process.env.MOOTER_HUB_URL
      || process.env.FRUGAL_HUB_URL
      || 'https://mooter-hub.<account>.workers.dev';
}

function getLandingUrl() {
  return process.env.MOOTER_LANDING_URL
      || process.env.FRUGAL_LANDING_URL
      || 'https://mooter.ai';
}

module.exports = { getHubUrl, getLandingUrl };
```

### 2.2 State file migration

`tools/router/paths.js`:
```js
// Procurar novo, fallback para antigo, migrar se necessário.
const fs = require('fs');
const path = require('path');

const NEW_MODE_FILE = path.join(os.homedir(), '.mooter-mode.json');
const OLD_MODE_FILE = path.join(os.homedir(), '.frugal-mode.json');

function getModeFile() {
  if (fs.existsSync(NEW_MODE_FILE)) return NEW_MODE_FILE;
  if (fs.existsSync(OLD_MODE_FILE)) {
    // Migrate inline
    fs.copyFileSync(OLD_MODE_FILE, NEW_MODE_FILE);
    console.log('[mooter] migrated .frugal-mode.json → .mooter-mode.json');
    return NEW_MODE_FILE;
  }
  return NEW_MODE_FILE; // will be created on first write
}

module.exports = { getModeFile };
```

### 2.3 Replace hardcoded URLs nos 17 ficheiros

Para cada um dos 17 ficheiros com `frugal-hub`, substituir literal por `getHubUrl()`:

```
dashboard/app/api/community/route.ts       → use env var
hub/jobs/notify.js                          → use env var or hardcode mooter-hub
hub/migrations/001_init.sql                 → manter comment apenas
hub/migrations/002_frugal_events.sql        → deixar como está (já aplicado no D1 antigo)
hub/worker.js                                → self-URL não deve ser hardcoded
hub/wrangler.toml                           → MANTER frugal-hub (não tocar no antigo)
landing/app/page.tsx                         → use NEXT_PUBLIC_MOOTER_HUB_URL
tools/audit/preflight-audit.js              → use getHubUrl()
tools/router/backtest.js                    → use getHubUrl()
tools/router/frugal-doctor.js                → use getHubUrl() (4 locations)
tools/router/hub-pull.js                    → use getHubUrl()
tools/router/hub-push.js                    → use getHubUrl()
tools/router/hub-status.js                  → use getHubUrl()
tools/router/hub-submit-events.js           → use getHubUrl()
tools/router/model-catalog.json              → grep & decide manual (pode ser URL ou string)
tools/router/model-manager.js                → use getHubUrl()
tools/router/update-metrics.js              → use getHubUrl()
```

**Delegar a um subagent T1 `cheap-triage` com lista exacta de line numbers do radar.**

### 2.4 Skills — aliases primeiro, rename depois

**Estratégia:** criar skills novos `mooter-*` como duplicados, manter `frugal-*` como aliases que apontam para os novos (deprecation message).

Para cada um dos 11 skills:
```bash
cp -r skills/frugal-doctor skills/mooter-doctor
# Editar SKILL.md de mooter-doctor: remover prefixo "frugal" no nome e descrição
# Editar SKILL.md de frugal-doctor: adicionar "DEPRECATED: use /mooter-doctor instead"
```

Utilizadores com `/frugal-doctor` no muscle memory continuam a funcionar. Novos users aprendem `/mooter-doctor`.

### 2.5 package.json renames

**vscode-extension/package.json:**
```diff
- "name": "frugal-vscode"
+ "name": "mooter-vscode"
- "displayName": "Frugal"
+ "displayName": "Mooter"
- "publisher": "paulo-frugal"
+ "publisher": "mooter"
```
⚠️ **Extensão deployed no marketplace:** se já estiver publicada, rename quebra update path. Verificar primeiro.

**dashboard/package.json:**
```diff
- "name": "frugal-dashboard"
+ "name": "mooter-dashboard"
```

**landing/package.json:**
```diff
- "name": "frugal-landing"
+ "name": "mooter-landing"  # conflita com o nome do projecto Vercel novo?
```
⚠️ Escolher: `mooter-legacy-landing` ou `mooter-next-landing` para não colidir semanticamente com `mooter-landing/` (a static HTML que está live).

### 2.6 Validação runtime

```bash
# Instalar do zero num sandbox (simular new user)
npm install
npm test

# Verificar que flags novas funcionam
MOOTER_HUB_URL=https://mooter-hub.workers.dev npm run router:status

# Verificar backward-compat
FRUGAL_HUB_URL=https://frugal-hub.workers.dev npm run router:status

# Verificar state migration
echo '{"mode":"zen"}' > ~/.frugal-mode.json
npm run router:status  # should migrate and echo message
ls ~/.mooter-mode.json   # should exist
```

**Checkpoint Paulo:** correr uma sessão completa com o router para ver se tudo responde.

---

## FASE 3 — Public surface swap

**Objectivo:** tudo que os users veem passa a dizer "Mooter".

### 3.1 Criar org GitHub `mooter-ai`

Manual (Paulo):
1. github.com → Settings → Organizations → New organization
2. Plan: Free
3. Name: `mooter-ai`

### 3.2 Transfer repo `pauloloureiroshp-ship-it/frugal` → `mooter-ai/mooter`

Manual (Paulo):
1. github.com/pauloloureiroshp-ship-it/frugal → Settings → Transfer ownership
2. New owner: `mooter-ai`
3. Name to confirm: `frugal`
4. **Depois de transfer:** rename repo de `frugal` → `mooter` na org nova (Settings → General → Repository name)

Actualizar git remote localmente:
```bash
git remote set-url origin git@github.com:mooter-ai/mooter.git
git remote -v  # verify
```

### 3.3 Landing Next.js antiga — decidir destino

**Opção A (recomendada):** redirect `landing/` → `mooter.ai`. Mantém SEO/backlinks intactos.
- Editar `landing/next.config.js` para redirect 301 de todas as rotas para `https://mooter.ai$path`
- Redeploy

**Opção B:** deprecar totalmente e desligar o Vercel project `landing`. Perde qualquer backlink existente.
- Vercel dashboard → project `landing` → Settings → Delete

**Opção C:** rebrand in-place (mais trabalho). Substituir copy em `landing/app/page.tsx`, `layout.tsx`, `methodology/page.tsx`, swap `frugal-logo.svg` por `mooter-logo.svg`.

**Decisão:** Opção A (redirect 301) se SEO matters; Opção B se não há backlinks; Opção C se a Next.js landing tem funcionalidades que `mooter.ai` ainda não replicou (auth, dashboard, setup wizard).

### 3.4 READMEs públicos

- `README.md` (root) — rewrite: "Mooter is the LLM router that keeps your wallet happy"
- `landing/README.md` — update
- `dashboard/README.md` — update

### 3.5 Logo swap

- Swap `landing/public/frugal-logo.svg` → `mooter-logo.svg` (🐮 usar design consistente com `mooter-landing/index.html`)
- Update imports

---

## FASE 4 — Cleanup (só após 30 dias sem tráfego nos recursos antigos)

⚠️ **Não executar antes de 2026-05-13.** Destrutivo.

### 4.1 Deprecate `frugal-hub` worker

1. Verificar último request nos logs do worker antigo:
   ```
   mcp__cloudflare__get_logs (worker: frugal-hub, last 30 days)
   ```
2. Se = 0 requests → delete worker
3. Se > 0 → investigar quem ainda chama, contactar

### 4.2 Delete D1 `frugal-hub` + R2 `frugal-hub-storage`

Apenas após backup:
```bash
# Export D1 antes de deletar
wrangler d1 export frugal-hub --output backup-frugal-hub-$(date +%Y%m%d).sql

# Delete
mcp__cloudflare__d1_database_delete (id: 320b55f6-...)
mcp__cloudflare__r2_bucket_delete (name: frugal-hub-storage)
```

### 4.3 Bulk find/replace docs (P2)

Usar sed com confirmação per-file. Não tocar em:
- `CHANGELOG.md` (histórico — mencionar rebrand como entry, não substituir)
- Git history
- `.evolution/` JSON snapshots
- Files em `docs/sessions/` que são master prompts históricos (têm valor como referência)

```bash
# Dry-run primeiro
grep -l "frugal" --include="*.md" -r . | while read f; do
  echo "Would edit: $f"
done

# Aplicar só aos que Paulo aprovar
for f in $APPROVED_LIST; do
  sed -i 's/Frugal/Mooter/g; s/frugal/mooter/g' "$f"
done
```

### 4.4 Deletar `tools/router/frugal-*.js`

Depois de 30 dias de backward-compat:
```bash
rm tools/router/frugal-mode.js tools/router/frugal-doctor.js tools/router/frugal-login.js
# (mantendo os novos: mooter-mode.js, mooter-doctor.js, mooter-login.js)
```

### 4.5 Deletar skills antigas

```bash
rm -rf skills/frugal-*
# (mantendo skills/mooter-*)
```

### 4.6 Rename de colunas SQL

Nos mooter_events:
```sql
ALTER TABLE mooter_events RENAME COLUMN frugal_version TO mooter_version;
ALTER TABLE mooter_events RENAME COLUMN classifier_version TO classifier_version;  -- não mudou
```

### 4.7 Notion cleanup

- Renomear "frugal — Model Router HQ" → "mooter — Model Router HQ" (ID mantém-se)
- Páginas históricas (sessão X, v0.9.2, evolution timeline) — manter nomes antigos (são histórico)
- Criar nova secção "Archive — frugal era" para organizar

---

## Rollback plans

### Se Fase 1 falha (worker novo não deploya)
- Zero impacto — `frugal-hub` continua a servir
- Debug: `wrangler tail mooter-hub`

### Se Fase 2 quebra runtime
- Revert commits no git
- Users com env vars `FRUGAL_HUB_URL` continuam a funcionar (antigos)
- Se state file migration falhou, restaurar de `.frugal-mode.json` (ainda existe)

### Se Fase 3 transfer GitHub falha
- GitHub transfer é reversível em 48h pelos próprios settings
- Remote local: `git remote set-url origin <old url>`

### Se Fase 4 cleanup apagou algo importante
- D1 export existe (`backup-frugal-hub-*.sql`) — restore via `wrangler d1 execute mooter-hub --file <backup>`
- R2 objects — não recuperáveis (confirmar lista antes de delete)
- Git history preserva sempre ficheiros apagados

---

## Guardrails para o executor

1. **Nunca** executar `wrangler d1 execute` com `DROP` ou `DELETE FROM` sem o Paulo ver o comando exacto.
2. **Nunca** fazer `git push --force` no repo transferido.
3. **Nunca** deletar o worker `frugal-hub` na Fase 1-3. Só após verificar 30 dias de zero tráfego na Fase 4.
4. **Sempre** commitar mudanças incrementalmente (1 commit por sub-fase) para rollback granular.
5. **Sempre** delegar a subagents:
   - T1 `cheap-triage` para os 17 find/replaces de URL
   - T2 `model-reasoner` para refactors que envolvem lógica (env var abstraction, state file migration)
   - T3 `final-reviewer` antes de qualquer deploy ou git push
6. **Pedir confirmação** antes de:
   - Criar qualquer recurso Cloudflare (D1, R2, Worker)
   - Modificar qualquer env var em produção (Vercel dashboard)
   - Transferir o repo GitHub
   - Apagar o worker `frugal-hub`
   - Correr find/replace em bulk nos 79 docs

---

## Checklist de execução (imprimir e picar)

### Fase 1 — Infra paralela
- [ ] Criar D1 `mooter-hub`
- [ ] Criar R2 `mooter-hub-storage`
- [ ] Criar `wrangler.mooter.toml` com IDs correctos
- [ ] Duplicar migrations em `hub/migrations/mooter/`
- [ ] Deploy worker `mooter-hub`
- [ ] Aplicar migrations no D1 novo
- [ ] Healthcheck: `curl mooter-hub.workers.dev/health`
- [ ] Validar schema: tables criadas
- [ ] Decidir: renomear Supabase project display? (Opção B)

### Fase 2 — Runtime com backward-compat
- [ ] Criar `tools/router/env.js`
- [ ] Criar `tools/router/paths.js` com migration automática
- [ ] Replace nos 17 ficheiros (delegar a T1)
- [ ] Duplicar skills: `frugal-*` → `mooter-*` aliases
- [ ] Rename 3 package.json (com cuidado no vscode-extension)
- [ ] Teste: npm test passa
- [ ] Teste: router responde com MOOTER_HUB_URL
- [ ] Teste: router ainda responde com FRUGAL_HUB_URL (backward-compat)
- [ ] Teste: .frugal-mode.json migra para .mooter-mode.json

### Fase 3 — Public surface
- [ ] Criar org GitHub `mooter-ai`
- [ ] Transfer repo e rename para `mooter`
- [ ] Actualizar git remote local
- [ ] Decidir destino da Next.js landing (A/B/C)
- [ ] Rewrite READMEs públicos
- [ ] Swap logo file

### Fase 4 — Cleanup (após 2026-05-13)
- [ ] Verificar zero tráfego no worker `frugal-hub` (30 dias)
- [ ] Export D1 antes de delete
- [ ] Delete worker/D1/R2 antigos
- [ ] Bulk find/replace nos docs aprovados
- [ ] Delete ficheiros `tools/router/frugal-*.js`
- [ ] Delete skills `frugal-*`
- [ ] Rename colunas SQL
- [ ] Renomear Notion HQ

---

## Inputs que Paulo precisa fornecer antes de começar

1. **Domínio `frugal.dev` — existe e está apontado?**
   - Verificar em `landing/.env.local.example:7` (NEXT_PUBLIC_SITE_URL=https://frugal.dev)
   - Se existe, precisamos adicionar redirect 301 para mooter.ai
   - Se não existe, ignorar

2. **Extensão VSCode `frugal-vscode` já foi publicada no marketplace?**
   - Se sim, rename quebra update path — Paulo precisa de avisar users
   - Se não, rename livre

3. **Há users externos (não-Paulo) a correr o CLI agora?**
   - Se sim, backward-compat obrigatório, deprecation window mínimo 30 dias
   - Se não, migração pode ser mais agressiva

4. **Preferência sobre Supabase project?**
   - Opção B (renomear display, manter project) — recomendado
   - Opção A (novo project, migrar dados) — mais limpo mas mais trabalho

5. **Destino da landing Next.js antiga (`landing/`)?**
   - Opção A: redirect 301 para mooter.ai
   - Opção B: desligar
   - Opção C: rebrand in-place

---

## Notas finais

- O `CLAUDE.md` do projecto aponta para **Notion HQ id `33d6f6e4-2bc4-816b-977a-fe84bbe912c9`**. Esse ID mantém-se mesmo após rename da página. Não precisa de update no CLAUDE.md.
- O `SYNC.md` na secção "Notion HQ — Páginas de Referência" deve ser actualizada com o link da página de log desta sessão (id `3416f6e4-2bc4-812d-8781-e92ad1a50343`).
- Radar completo em memória persistente: `/sessions/*/mnt/.auto-memory/project_mooter_rebrand_radar.md`.
- Este master prompt é vivo — actualizar conforme as fases forem completando.

---

**Quando começar Fase 1, abrir nova sessão com:**
> "Estou no Claude Code. Li o MOOTER_REBRAND_MASTER_PROMPT.md. Vou executar Fase 1 (infra paralela Cloudflare). Paulo, confirma que posso criar D1 `mooter-hub`, R2 `mooter-hub-storage` e deployar worker novo sem tocar em `frugal-hub`?"
