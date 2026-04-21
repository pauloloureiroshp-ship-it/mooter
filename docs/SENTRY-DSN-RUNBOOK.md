# Sentry DSN Rollout — Runbook

**Data:** 2026-04-21
**Status:** pendente (acções Paulo, ~30 min total)
**Contexto:** 4 Sentry SDKs instalados no repo (landing, dashboard, hub, router) mas em no-op silencioso — fail-safe por Zod schema quando DSN absente. Sem DSN, produção está cega.

## Inventário técnico (já auditado no código)

| Projecto | Integração | Env var esperada | Fail-safe quando absente |
|---|---|---|---|
| **landing** | Next.js App Router — `landing/instrumentation.ts` + 3 configs | `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_ORG` + `SENTRY_PROJECT` + `SENTRY_AUTH_TOKEN` | `landing/app/lib/env.ts:50` Zod `.optional()` |
| **dashboard** | Next.js — `dashboard/instrumentation.ts` + 3 configs | idem landing | `dashboard/next.config.mjs:16` double-check both DSN+TOKEN |
| **hub** | Cloudflare Worker — `hub/worker.js` wrap | `SENTRY_DSN` (Worker env binding) | `hub/worker.js:145` returns null when absent |
| **router** | Node CLI — `tools/router/sentry-helper.js` | `MOOTER_SENTRY_DSN` (fallback `FRUGAL_SENTRY_DSN`) | `sentry-helper.js:42` returns early, never throws |

**Nada no repo hardcoded.** Instalar é puramente preencher env vars em 3 stores (Vercel × 2, Cloudflare, shell profile).

---

## Passo 1 — Criar 4 projectos em sentry.io (10 min)

Se ainda não tens org Sentry, cria gratuitamente em https://sentry.io/signup/ (free tier 5k events/mo, suficiente para friends beta).

Depois, para cada um dos 4:

1. https://sentry.io → **Projects → Create Project**
2. Platform:
   - `mooter-landing` → Next.js
   - `mooter-dashboard` → Next.js
   - `mooter-hub` → Node.js (ou Cloudflare Workers se listado; hub/worker.js usa `@sentry/cloudflare`)
   - `mooter-router` → Node.js
3. Alert frequency: "Alert me on every new issue" (friends beta)
4. Nomea exactamente como listado em cima (usado em `SENTRY_PROJECT` env var)
5. Após criação → **Settings → Client Keys (DSN)** → copia o DSN (formato `https://xxx@oYYY.ingest.us.sentry.io/ZZZ`)

Também precisas duma vez (global):
- **Org name** (URL da org, ex: `mooter` ou `paulo-mooter`): ver em Settings → Organization Settings
- **Auth Token** (para source map upload em build):
  - https://sentry.io/orgs/<org>/api/auth-tokens/new-token/
  - Scopes: `project:releases`, `org:read`
  - Copia — só se vê uma vez

Guarda tudo num sítio seguro (1Password / .env local). **Não commitar.**

---

## Passo 2 — Vercel Landing (5 min)

```bash
# Local CLI (se já tens vercel CLI; se não, usa dashboard Vercel)
cd landing
vercel env add NEXT_PUBLIC_SENTRY_DSN production
# paste: https://xxx@oYYY.ingest.us.sentry.io/ZZZ  (landing DSN)

vercel env add SENTRY_ORG production
# paste: <org-slug>

vercel env add SENTRY_PROJECT production
# paste: mooter-landing

vercel env add SENTRY_AUTH_TOKEN production
# paste: <auth-token>
```

Alternativa UI: https://vercel.com/<user>/mooter-landing/settings/environment-variables → `+ Add` cada uma delas como Production (e opcionalmente Preview + Development).

**Redeploy** para activar: `vercel --prod` ou dashboard → Deployments → `...` → Redeploy.

---

## Passo 3 — Vercel Dashboard (5 min)

Idêntico ao Passo 2 mas no projecto Vercel do dashboard (se for separado). Usa o DSN `mooter-dashboard` e `SENTRY_PROJECT=mooter-dashboard`.

```bash
cd dashboard
vercel env add NEXT_PUBLIC_SENTRY_DSN production
vercel env add SENTRY_ORG production
vercel env add SENTRY_PROJECT production  # mooter-dashboard
vercel env add SENTRY_AUTH_TOKEN production
```

Redeploy idem.

---

## Passo 4 — Cloudflare Hub (3 min)

```bash
cd hub

# Worker principal
wrangler secret put SENTRY_DSN
# paste: https://xxx@oYYY.ingest.us.sentry.io/ZZZ  (hub DSN)

# Worker mooter (se mooter.wrangler.toml está activo)
wrangler secret put SENTRY_DSN -c wrangler.mooter.toml
# paste: mesmo DSN
```

`wrangler.toml:42` tem `SENTRY_DSN = ""` em plaintext (fallback). O `secret put` sobrepõe em produção. Verifica em Cloudflare Dashboard → Workers → Settings → Variables.

**Deploy para activar:** `wrangler deploy`.

---

## Passo 5 — Router / Shell Profile (2 min)

Windows (PowerShell, permanent user-level):
```powershell
[Environment]::SetEnvironmentVariable('MOOTER_SENTRY_DSN', 'https://xxx@oYYY.ingest.us.sentry.io/ZZZ', 'User')
```

Depois **restart VS Code** completo (env vars não herdam em shells existentes — ver SYNC.md débito técnico MOOTER_TERMINAL).

Mac/Linux (`~/.zshrc` ou `~/.bashrc`):
```bash
echo 'export MOOTER_SENTRY_DSN="https://xxx@oYYY.ingest.us.sentry.io/ZZZ"' >> ~/.zshrc
source ~/.zshrc
```

---

## Passo 6 — Smoke test por projecto (5 min)

**Landing:** `npm run dev` → abre localhost → dispara erro intencional (ex: `/api/xxx` URL inválido). Confirma em sentry.io → Projects → mooter-landing → Issues.

**Dashboard:** idem `cd dashboard && npm run dev`.

**Hub:** `wrangler dev` → chama `curl localhost:8787/api/xxx-broken`. Confirma em mooter-hub.

**Router:** o teste existente em `tools/router/env.test.js:107` já testa `MOOTER_SENTRY_DSN` — correr `cd tools/router && npm test`. Para smoke ao vivo: disparar qualquer erro via um prompt que quebre classify.js (não há uma forma clean — mais fácil confiar no test + no-op fallback).

---

## Passo 7 — Actualizar SYNC.md (eu faço automaticamente quando confirmares)

Remover a secção "Acções PENDENTES para Paulo (runtime config)" linhas 26-36 e adicionar observação em LOOP.md:

```
### 2026-04-21-sentry-live-4-projects

**Contexto:** Sprint 8.1-8.4 Sentry integration shipped a canonical 2026-04-18,
DSN-conditional SDKs ficaram no-op silencioso até hoje.

**Resultado observado:** 4 projectos Sentry provisionados + DSN configurados em
3 stores (Vercel×2, Cloudflare, shell). Smoke tests passaram.

**Dados brutos:**
- sentry.io/<org>/mooter-landing (DSN em Vercel env)
- sentry.io/<org>/mooter-dashboard (DSN em Vercel env)
- sentry.io/<org>/mooter-hub (DSN em CF Worker secret)
- sentry.io/<org>/mooter-router (DSN em shell profile)

**Quem observou:** Paulo + Claude session #36

**Status:** live, primeira métrica operacional em produção.
```

---

## Checklist final

- [ ] 4 projectos criados em sentry.io
- [ ] Org slug + Auth Token copiados (usados em 2 Vercel configs)
- [ ] Vercel landing: 4 env vars + redeploy
- [ ] Vercel dashboard: 4 env vars + redeploy
- [ ] Cloudflare hub: `wrangler secret put SENTRY_DSN` (×1 ou ×2) + deploy
- [ ] Shell profile: `MOOTER_SENTRY_DSN` + restart VS Code
- [ ] Smoke test ×4 (erro disparado, evento visível em Sentry)
- [ ] SYNC.md + LOOP.md actualizados
