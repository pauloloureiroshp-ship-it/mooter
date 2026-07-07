# Wave 56 — Day 0 Recon (Admin Data Layer)

> Doctrine V4 #2 (Honest > Forced): verificar cada premissa do brief contra o repo
> vivo + a D1 de produção antes de escrever código. Produzido 2026-06-11 no branch
> `wave56-admin-data-layer` (fresh from main após Wave 55 V3 #160). Síntese de 4
> probes read-only. Companion: nenhum — este doc é o deliverable Phase 0.

## State of the world (verificado)

| Item | Check | Resultado |
|---|---|---|
| `classify.js` sha | sha256 | ✅ `427d8c0b…364bc48f` — **INTACT** (confirmado pelo orquestrador) |
| Wave 55 V3 em main | `git log` | ✅ `943283b Wave 55 V3` (#160) |
| Branch base | git | ✅ `wave56-admin-data-layer` fresh from main |
| wrangler + config | versão | ✅ wrangler 4.83.0 + `hub/wrangler.mooter.toml` (binding `DB`, db `mooter-hub` `3659b56e…`) |
| D1 live `frugal_events` | `PRAGMA table_info` | ✅ **34 colunas** (cid 0–33), servido por v3-prod ENAM/ORD |
| `d1_migrations` tracker | `SELECT * FROM d1_migrations` | ⚠️ só **2 entries** (001, 002) — 003–018 aplicadas **manualmente**, efeitos presentes na schema live |
| Próximo nº de migração | `ls hub/migrations/` | ✅ **019** (sequência termina em `018_user_dashboard_index.sql`) |
| Brief SQL no repo | grep | ❌ **AUSENTE** — o texto SQL exacto (nomes/tipos das colunas) não está em nenhum ficheiro |

## Refutations (P1–P7)

| ID | Claim (predição do brief) | Verdict | Evidence |
|---|---|---|---|
| P1 | `frugal_events` tem coluna `subscriptions` (predito FALSE → Phase A cria) | **FALSE** (confirma predição) | [LIVE] `PRAGMA table_info(frugal_events)` → 34 colunas, `subscriptions` AUSENTE. ADD COLUMN é seguro. Caso esperado, não-alarmante. |
| P2 | `frugal_events` tem `packs_installed` (predito FALSE) | **FALSE** (confirma predição) | [LIVE] mesma query — `packs_installed` AUSENTE. ADD COLUMN seguro. |
| P3 | `frugal_events` tem `local_models_reason` (predito FALSE) | **FALSE** (confirma predição) | [LIVE] mesma query — `local_models_reason` AUSENTE. ADD COLUMN seguro. |
| P4 | `isAdminEmail()` existe no hub (verify) | **FALSE quanto ao nome/mecanismo · gate reutilizável existe** | `isAdminEmail()` e `ADMIN_EMAILS` **não existem no hub**. O que existe é `adminAuthorized(authHeader, env)` exportado de `hub/routes/feedback.js:67` — gate por **Bearer token** (`MOOTER_ADMIN_TOKEN` canónico, `FRUGAL_ADMIN_TOKEN` fallback, comparação constant-time). O conceito (gate admin reutilizável) é TRUE, mas a API é diferente. **Nota:** `isAdminEmail()` SÍ existe, mas em `landing/` (`landing/app/(app)/admin/_lib/privacy.ts`), gate por email allowlist — outro sistema, não o hub. |
| P5 | Tabela `audit_admin_views` existe (predito FALSE → Phase A cria) | **FALSE** (confirma predição) | [LIVE] `SELECT name FROM sqlite_master` → 26 objectos; `audit_admin_views` não está entre eles (query alvo devolveu zero linhas). CREATE TABLE seguro. **Nota:** existe `mooter_admin_audit` mas no **Supabase** (`landing/migrations/007`), não na D1. |
| P6 | `frugal_events` tem `is_synthetic` (predito FALSE) | **FALSE** (confirma predição) | [LIVE] `PRAGMA table_info` — `is_synthetic` AUSENTE. ADD COLUMN seguro. Probe 4 marcou este id como UNKNOWN mas referia-se a *outra* questão (segurança do SQL do brief, não a presença da coluna) — quanto à **presença**, a D1 live é autoritativa: AUSENTE. |
| P7 | Landing admin tem tabs estruturados (atribuído a Wave 10 B.2b) | **FALSE como enunciado · tabs existem mas de Wave 6.5** | `landing/app/(app)/admin/page.tsx` (1167 linhas) implementa **5 tabs production-grade**: Overview, Users, Devices, Health, Feedback (`TABS` em ~L1105). Introduzidos em **Wave 6.5 D1/D2**, não Wave 10 B.2b (que era onboarding). Painel polido, não stub. |

**Veredicto global:** 6 dos 7 confirmados FALSE são todos do tipo **predicted-false/non-alarming**
(P1/P2/P3/P5/P6 — o ADD COLUMN / CREATE TABLE do brief é correcto porque o objecto
não existe). P4/P7 são **drift de nomenclatura**, não surpresas bloqueantes: o gate e os
tabs existem, com nomes/mecanismos diferentes. **Zero surpresas de re-scope-trigger**
(nenhuma coluna que o brief quer ADD já existe; nenhum endpoint `/v1/admin` já existe).
A regra ">=3/7 false → re-scope" não dispara STOP — os falses são esperados.

## Structural drift que o build TEM de honrar

1. **Não existe `hub/src/`.** O brief assume `hub/src/auth/*.ts` e `hub/src/audit/*.ts`.
   **Não existem.** A estrutura real é flat:
   - Handlers de rota → `hub/routes/*.js`
   - Lib partilhada → `hub/lib/*.js`
   - Entrypoint → `hub/worker.js`
   - Migrações → `hub/migrations/NNN_*.sql`
   - Testes → `hub/routes/__tests__/*.test.js`
2. **JS vanilla ESM, não TypeScript.** `hub/package.json` tem `"type":"module"`,
   sem `tsconfig.json`, sem build step. **Qualquer ficheiro novo TEM de ser `.js`** ou
   o worker falha a carregar. Usar JSDoc `@ts-check` se quiser type-safety (padrão de `hub/lib/`).
3. **Registo de rotas = `switch (path)` flat em `hub/worker.js`.** Não há Express/itty-router.
   Para uma família `/v1/admin/*`: `import { handleAdminX } from './routes/admin.js'` no topo +
   um `case '/v1/admin/x': response = await handleAdminX(request, env); break;` por path.
   Sub-routing GET vs POST faz-se dentro do handler via `request.method`. Sentry envolve tudo
   transparentemente (`Sentry.withSentry`) — rotas novas não precisam de imports Sentry.
4. **Reusar o gate existente — NÃO duplicar.** `import { adminAuthorized } from './feedback.js'`.
   Padrão (de `feedback.js` ~L88): `if (!adminAuthorized(request.headers.get('Authorization')||'', env)) return errorResponse('unauthorized','unauthorized');`
   **Gate do hub é por token Bearer (`MOOTER_ADMIN_TOKEN`), NÃO por email.** Não introduzir
   `isAdminEmail()`/`ADMIN_EMAILS` no hub — esse mecanismo vive só no `landing/`.
5. **Não há `profiles.role` em lado nenhum (BLOCKER se Wave 56 depender disso).** Zero
   migrações Supabase ou D1 adicionam `role` a `profiles`. RBAC do landing é email allowlist
   (`ADMIN_EMAIL_FALLBACK = 'paulo.loureiro.shp@gmail.com'` em `audit.server.ts:10`). Se o
   build precisar de `profiles.role`, é **migração manual Supabase** do Paulo (padrão MEMORY.md),
   não migração D1 — e fica fora do que o agente pode fazer autonomamente.
6. **`mooter_feedback` não existe na D1** — a tabela equivalente chama-se `feedback`
   (`010_feedback.sql`). Qualquer trabalho que aponte a `mooter_feedback` redireciona para `feedback`.
7. **Respostas:** erros via `hub/lib/errors.js` `errorResponse(code, category)` (envelope
   `{isError, error, errorCategory, isRetryable, message}`; `unauthorized→401`, `forbidden→403`,
   `validation→422`, `bad_request→400`, `internal→500`). Sucesso via helper local `const J = (obj,status)=>new Response(...)` no topo do módulo (padrão `feedback.js:31`), sem helper partilhado.
8. **D1 acedida sempre como `env.DB.prepare(...).bind(...).first()/.all()/.run()/.batch()`.**
   `hub/lib/env.js` usa Zod com `.passthrough()` — `MOOTER_ADMIN_TOKEN` não precisa de schema (já é lido directo).
9. **Harness de testes:** `node --test routes/__tests__/*.test.js` (de `hub/package.json`).
   `node:test` + `node:assert/strict`, ESM, **fakeDb() stub inline** por ficheiro (sem D1 real;
   D1 real é só E2E smoke contra prod). Padrão por ficheiro: validador aceita/rejeita +
   handler 202/200 + handler 405 method + verificação do shape do INSERT no stub.

## Plano de Migração 019

**Ficheiro:** `hub/migrations/019_admin_data_layer.sql` (próximo nº confirmado; header no estilo 014–018:
`-- 019_… — Wave 56 …` + `-- Created: 2026-06-11` + bloco de contexto + nota "Additive — migrations 001-018 untouched").

**ADD COLUMNs realmente necessários (todos AUSENTES → todos a criar, nenhum a saltar):**
- `subscriptions` — ADD (AUSENTE, P1 FALSE)
- `packs_installed` — ADD (AUSENTE, P2 FALSE)
- `local_models_reason` — ADD (AUSENTE, P3 FALSE)
- `is_synthetic` — ADD (AUSENTE, P6 FALSE)

**Regras obrigatórias para os 4 ADD COLUMN:**
- **`ALTER TABLE ADD COLUMN` NÃO tem `IF NOT EXISTS` em SQLite/D1** (documentado em 006/008/009).
  Cada ALTER corre **UMA vez por base de dados** — incluir o comentário "run ONCE — re-run
  fails with duplicate column name" sobre cada um.
- Cada coluna **nullable OU com `DEFAULT`** — `frugal_events` tem linhas existentes; um
  `NOT NULL` sem `DEFAULT` faz a migração falhar. Sugestão: `is_synthetic INTEGER DEFAULT 0`
  (boolean-as-int, default 0 = real), as outras três `TEXT` nullable.
- **Idempotência:** os ALTERs **não são** idempotentes. Estratégia: o ficheiro 019 corre uma
  vez (como 003–018 que foram aplicadas manualmente e não estão no tracker). Para re-aplicar,
  verificar `PRAGMA table_info(frugal_events)` antes.

**CREATE TABLE (`audit_admin_views`, P5 FALSE → criar):**
- `CREATE TABLE IF NOT EXISTS audit_admin_views (...)` — idempotente, seguro.
- Sem RLS nativa em D1 — controlo de acesso é no handler (via `adminAuthorized`). Modelo de
  privacidade: guardar `target_user_id_hash` pseudónimo, não emails em claro (padrão `transparency_events`/`forget_me_requests`).

**INDEXes:**
- `CREATE INDEX IF NOT EXISTS idx_<table>_<cols> ...` — idempotente.
- **Não colidir** com os 9 índices existentes de `frugal_events`: `idx_frugal_events_instance_date`,
  `idx_frugal_events_tier_quality`, `idx_frugal_events_actual_model`, `idx_frugal_events_algorithm`,
  `idx_frugal_events_outcome`, `idx_frugal_events_category_outcome`, `idx_events_user_id_hash`,
  `idx_events_user_date`, `idx_events_user_tier_savings`.

**Ficheiro de teste de regressão — ajuste vs brief:**
O brief / regra `hub/.claude/rules/migration-safety.md` aponta para `hub/test/migrations.test.js`.
**Esse path e a directoria `hub/test/` NÃO existem e o runner glob (`routes/__tests__/*.test.js`)
não os apanharia.** Criar o teste em:
- ✅ **`hub/routes/__tests__/admin.test.js`** (apanhado pelo runner actual sem tocar em `package.json`).

Cobertura mínima (padrão dos `__tests__` existentes): validador aceita payload válido;
validador rejeita campo inválido; handler GET autenticado → 200 + dados; token ausente → 401;
método errado → 405; INSERT em `audit_admin_views` aparece no `state.rows` do fakeDb.
(Alternativa só se o brief insistir no path da regra: criar `hub/test/migrations.test.js`
**E** alargar o glob do script `test` em `hub/package.json` — mas o caminho `__tests__` é
o de menor risco e zero alterações de config.)

## Blockers

**Nenhum HARD blocker para a Phase A (migração 019 + rota admin no hub).** Os seguintes são
**condicionais**, só bloqueiam se o build escolher caminhos específicos:

- **`profiles.role` não existe** (BLOCKER *condicional*): se o RBAC de Wave 56 depender de
  `profiles.role`, isso exige migração manual Supabase do Paulo (não-D1, fora do agente). O
  build deve usar o gate por token já existente (`adminAuthorized`) e não depender de `profiles.role`.
- **SQL exacto do brief ausente do repo** (verificar antes de merge): os nomes/tipos das 4
  colunas não estão em ficheiro — devem ser confirmados contra o brief antes do merge final.
  Não bloqueia o overnight: a forma (4 ADD + 1 CREATE + índices) é segura e aditiva.
- **`hub/test/migrations.test.js` referenciado pela regra mas inexistente** — resolvido pelo
  ajuste acima (teste em `__tests__`); não é stop.

## Recommendation: **PROCEED_WITH_RESCOPE**

Construir conforme planeado, com as **correcções estruturais obrigatórias** acima. Não há
surpresa de re-scope-trigger (nenhum objecto que o brief quer criar já existe). O re-scope é
de **forma e nomenclatura**, não de âmbito:

1. **Path/linguagem:** tudo em `hub/routes/*.js` + `hub/lib/*.js` (JS ESM), **não** `hub/src/*.ts`.
2. **Auth:** reusar `adminAuthorized` (Bearer token), **não** inventar `isAdminEmail`/`ADMIN_EMAILS` no hub.
3. **Migração 019:** os 4 ADD COLUMN são todos necessários (nenhum existe); `audit_admin_views` via
   `CREATE TABLE IF NOT EXISTS`; ALTERs com aviso "run ONCE" e default/nullable; índices `IF NOT EXISTS`
   sem colisão.
4. **Teste:** em `hub/routes/__tests__/admin.test.js` (não `hub/test/`).
5. **Evitar dependência de `profiles.role`** (não existe; usar token gate).

`classify.js` permanece FROZEN — nada nesta wave lhe toca.
