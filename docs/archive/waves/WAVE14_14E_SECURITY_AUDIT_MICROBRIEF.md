# Wave 14 — 14E: Security Audit Completa

> **Goal**: auditoria sistemática de segurança Mooter — OAuth scopes, secrets,
> RBAC, hub auth, schema vulnerabilities, dependencies CVE, logging PII.
> Outputs: findings document categorized por severity + remediation plan.
>
> **Trigger**: Paulo pediu auditoria completa pre-validation. Wave 10 C.1 fez 1
> wave de hardening (rate-limits hub) + Wave 13.x D2 fix (timing-safe admin auth)
> — mas nunca foi feito audit sistemático completo.
>
> **Scope**: 1 dia CC autonomous + Cowork review. Output: `WAVE14_14E_SECURITY_AUDIT_FINDINGS.md`
> (interno, NÃO publicar). Remediation plan separado se findings critical.
>
> **Non-negotiables**:
> - Audit READ-ONLY — NÃO aplicar fixes durante audit
> - Findings críticos requerem Paulo gate antes de remediation
> - Audit doc NÃO publicado em repo público (gitignored ou archive)
> - Zero changes to `classify.js`, hub schemas, CLI during audit

---

## 0. Categories to audit

### Category A — OAuth + Auth

- GitHub OAuth scopes solicitadas (minimal? `user:profile`?)
- Refresh token rotation policy
- Session storage (localStorage vs httpOnly cookie)
- CSRF protection
- Logout invalidates server-side session?
- Multi-device login behavior
- Token expiry handling

### Category B — Secrets

- Inventory all secrets (env vars, wrangler secrets, Vercel env, GitHub Actions secrets)
- Rotation policy (none? manual?)
- Naming convention (MOOTER_* canonical post-Wave 13.x)
- Are any secrets exposed in client bundle?
- Are any secrets in git history? (`git log -p | grep -i secret`)

### Category C — RBAC

- `/admin` ADMIN_EMAILS env var policy
- Audit log table existence + entries (Wave 10 C.1)
- Escalation paths (user vs admin checks)
- API endpoint authorization (which require auth, which are public)
- `mooter feedback` anonymous flow (Wave 12) — abuse protection?

### Category D — Hub Auth + Rate-limits

- Dual-token MOOTER_ADMIN_TOKEN / FRUGAL_ADMIN_TOKEN (Wave 13.x D2)
- Rate-limits coverage (Wave 10 C.1: `/api/delta` + `/api/device-heartbeat`)
- Are there endpoints sem rate-limit que deveriam ter?
- Per-IP vs per-profile_hash limits
- Burst tolerance configured?
- Bypass paths (admin override?)

### Category E — Schema + Injection

- Cloudflare D1 queries — prepared statements consistently?
- Supabase RLS policies on `profiles`, `audit_log`, `feedback`, etc.
- Public endpoints sem auth (`/api/cli-token`, `/i/<token>`) — token expiry + single-use?
- SQL injection risk vectors (user input → query)
- Schema enforcement (tipos, constraints)

### Category F — Dependencies CVE

- `npm audit` on `landing/`, `packages/cli/`, `tools/`, `hub/`
- High/critical findings categorized
- Outdated packages (`npm outdated`)
- Dependency tree depth (transitive risk)
- Removed packages still in package-lock?

### Category G — Logging + PII

- Hub logs — any prompt text? user emails? IPs?
- Vercel logs (function logs)
- GitHub Actions logs (secrets masked?)
- Sentry / error tracking — PII stripping?
- Client telemetry — Mooter swears zero prompt text — verify code path

---

## 1. Audit methodology

1. CC reads code in each category
2. For each category, produce:
   - **Findings**: bullet list per finding com severity 🔴/🟠/🟡 + reproduce + impact
   - **Verdict**: Pass / Pass with notes / Fail
3. Compile master `WAVE14_14E_SECURITY_AUDIT_FINDINGS.md` (gitignored or in `docs/internal/`)
4. Cowork reviews + flags Paulo gate items

---

## 2. Output structure

```markdown
# Wave 14 — 14E Security Audit Findings

## TL;DR
[X critical, Y important, Z polish across 7 categories]

## Category A — OAuth + Auth
### Findings
- [F-A1] ...
### Verdict: ...

## Category B — Secrets
### Findings
- [F-B1] ...
### Verdict: ...

[... etc ...]

## Remediation plan (priority order)
1. 🔴 Critical findings — patch + tag
2. 🟠 Important — fix backlog
3. 🟡 Polish — Wave 16+
```

---

## 3. Sequência (~1 dia CC autonomous + Cowork review)

### Manhã CC (~4h)
1. **Category A — OAuth** (1h) — Read auth code + Supabase auth config
2. **Category B — Secrets** (45 min) — inventory + git log check
3. **Category C — RBAC** (1h) — admin checks + audit log + abuse
4. **Category D — Hub** (1.5h) — rate-limits coverage + bypass paths

### Tarde CC (~3h)
5. **Category E — Schema** (1h) — D1 prepared + RLS Supabase + public endpoints
6. **Category F — Deps** (1h) — npm audit + outdated review
7. **Category G — Logs** (1h) — PII in logs grep + client telemetry verify

### Cowork review (~1h)
- Read findings
- Flag Paulo gate items (critical findings)
- Recommend remediation order

---

## 4. Definition of Done

1. ✅ `docs/internal/WAVE14_14E_SECURITY_AUDIT_FINDINGS.md` (gitignored ou docs/internal/)
2. ✅ Each category has findings + verdict
3. ✅ Severity-categorized remediation plan
4. ✅ Cowork review completed
5. ✅ Paulo gate items flagged
6. ✅ NÃO publicado em repo público

---

## 5. Anti-patterns

- ❌ NÃO aplicar fixes durante audit — apenas documentar
- ❌ NÃO publicar audit findings em repo público
- ❌ NÃO inventar findings — só reproducible
- ❌ NÃO criar attack scenarios — apenas describe what we observe
- ❌ NÃO mexer em classify.js, schemas, CLI durante audit

---

## 6. Master prompt para CC

```
Inicia Wave 14 14E Security Audit conforme docs/strategy/WAVE14_14E_SECURITY_AUDIT_MICROBRIEF.md.

Scope: audit READ-ONLY de OAuth + Secrets + RBAC + Hub + Schema + Deps + Logs. NÃO aplicar fixes. Output em docs/internal/ (NÃO público).

Lê PRIMEIRO:
  - docs/strategy/WAVE14_14E_SECURITY_AUDIT_MICROBRIEF.md inteiro
  - Auth code (Supabase config + OAuth flow)
  - hub/wrangler.mooter.toml (secrets binding)
  - hub/routes/* (endpoint auth)
  - landing/app/api/* (api routes)
  - .github/workflows/* (CI secrets)
  - package.json files (deps)

Non-negotiables:
  - READ-ONLY (NÃO aplicar fixes)
  - Output gitignored ou docs/internal/
  - Findings reproducible (não inventados)
  - classify.js intacto
  - Hub schema intacto

Sequência (~1 dia autonomous):
  Manhã: Category A OAuth + B Secrets + C RBAC + D Hub
  Tarde: Category E Schema + F Deps + G Logs

Output WAVE14_14E_SECURITY_AUDIT_FINDINGS.md em docs/internal/.

Reporta para Cowork review. Findings critical → Paulo gate.
```

---

**Composed by Cowork, 2026-06-04 evening. 14E security audit ~1 dia CC + 1h Cowork review. Output gitignored interno. Paulo gate em findings critical.**
