# Wave 6.5 D1 — Admin Panel Skeleton + User Table

> **Como usar**: cola no Claude Code. Self-contained.
>
> **Pré-requisitos**: tag `v0.6.1-install-url` em dev (W6 D2). Working dir = `~/mooter`.
>
> **⚠️ LIÇÃO 5× consolidada**: Recon obrigatório PRIMEIRO. Reportar. Adaptar se já existir. Procura `/admin` + `profiles` table + RBAC patterns.

---

=== START ===

## 0. Quem és e missão

És Claude Code Opus 4.8 no `~/mooter/`, branch `wave6.5-d1-admin-panel`. `--permission-mode bypassPermissions`.

**Missão Wave 6.5 D1**: shippar admin panel skeleton + user table para Paulo gerir users. 5 sub-features:

1. **`/admin` route** com RBAC (só user Paulo)
2. **User table** — list users com setup, subscription, persona, joined date
3. **Filters + sort** — por hardware class, subscription, activity
4. **User detail page** — `/admin/users/[user_id_hash]` com profile completo
5. **Privacy guardrails** — masking de dados, audit log de acessos admin

### Recon OBRIGATÓRIO (lição 5×)

```bash
# Admin já existe?
find landing/app -type d -name 'admin' 2>/dev/null

# RBAC patterns existentes
grep -rn 'role\|rbac\|admin' landing/app/lib/ 2>/dev/null | head -20

# Profile table schema
cat landing/migrations/*.sql 2>/dev/null | grep -A 10 'create table.*profiles'

# Admin emails / allow list
grep -rn 'ADMIN_EMAIL\|admin@\|allowed_admin' landing/ 2>/dev/null | head -10
```

**Reporta ao Paulo antes de implementar.**

## 1. Invariantes (NÃO-NEGOCIÁVEIS)

- ❌ **classify.js byte-identical** (P11)
- ❌ **safety_boost + adapter_selection + schemas INTACTOS**
- ❌ **hub/ produção INTACTO**
- ❌ **landing/ Phases A+B+C+W6 D1+D2 INTACTOS** — só ADICIONA `/admin/*`
- ❌ **NÃO armazenar PII em logs** — audit usa user_id_hash
- ❌ **NÃO permitir acesso admin sem RBAC** — middleware enforce
- ❌ **Não `git add -A`** · **`--no-verify`** · merge `main`
- ✅ **Final-reviewer T3-gate**
- ✅ **Auto-merge para dev**
- ✅ **Tag v0.6.5-admin-panel-skeleton**
- ✅ **GLOSSARY** (Mooter/Moos)
- ✅ **Honesty**: "no usage data yet" quando vazio · não inventar metrics

## 2. Branch + recon

```bash
cd ~/mooter
git checkout dev
git pull origin dev
git checkout -b wave6.5-d1-admin-panel
```

## 3. Sub-feature 1 — `/admin` route + RBAC

### 3.1 RBAC strategy

Allow list `ADMIN_EMAILS` env var (comma-separated). Middleware enforce:

```typescript
// landing/app/(admin)/admin/layout.tsx OR middleware extension
const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map(s => s.trim().toLowerCase());

export default async function AdminLayout({ children }) {
  const user = await getCurrentUser();
  if (!user || !adminEmails.includes(user.email?.toLowerCase() ?? '')) {
    redirect('/');
  }
  return children;
}
```

Add to `.env.example`:
```
ADMIN_EMAILS=paulo.loureiro.shp@gmail.com
```

### 3.2 Audit log

`landing/migrations/007_admin_audit_log.sql`:

```sql
create table if not exists public.mooter_admin_audit (
  id bigserial primary key,
  admin_user_id uuid not null references auth.users(id),
  action text not null,  -- 'view_users_list' | 'view_user_detail' | 'export_data'
  target_user_id_hash text,  -- pseudonymous, only if applicable
  metadata jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_admin_audit_user on public.mooter_admin_audit(admin_user_id, created_at desc);
```

## 4. Sub-feature 2 — User table

### 4.1 UI

```
/admin/users

┌──────────────────────────────────────────────────────────────────┐
│ Users (47 total) · last 30d active: 23                          │
│                                                                  │
│ Filter: [ subscription ▼ ] [ hardware ▼ ] [ active ▼ ]          │
│                                                                  │
│ Email (masked)    Persona       Plan      GPU       Joined      │
│ ───────────────────────────────────────────────────              │
│ p***@gmail.com    solo-founder  max       high-end  2026-05-30  │
│ m***@faang.com    senior-ic     team      mid       2026-05-29  │
│ y***@oss.io       oss-maintainer max       high-end  2026-05-28  │
│ ...                                                              │
│                                                                  │
│ Showing 1-50 of 47 · [Next]                                     │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 Implementação

`landing/app/(admin)/admin/users/page.tsx`:
- Server component que lê `profiles` table (via existing Supabase REST wrapper)
- Email mask: `p***@gmail.com`
- Sort by joined_at desc
- Pagination 50 per page

### 4.3 Tests

- RBAC redirect non-admin
- User list renders profiles
- Email masking applied
- Filters work
- Audit log entry on view

## 5. Sub-feature 3 — Filters + sort

### 5.1 Filters disponíveis

- Subscription plan: Max / Team / Enterprise / API / None / All
- Hardware class: high-end / discrete / integrated / none / All
- Activity: active last 7d / 30d / 90d / inactive

### 5.2 Sort

- Joined date (default desc)
- Last seen (when telemetry data available)
- Total events (when available)

Honesty: "No telemetry data yet" se W4 D / hub events vazio.

## 6. Sub-feature 4 — User detail page

### 6.1 Rota

`landing/app/(admin)/admin/users/[user_id_hash]/page.tsx`

Mostra:
- Profile info (hardware class, persona, plan)
- Onboarding journey (steps completed)
- Install token status (used / pending / expired)
- Activity stats (when telemetry available)
- Feedback submissions (Wave 6.5 D2)

### 6.2 Honest stubs

Quando dados telemetry vazios:
```
Activity stats
  ⓘ No telemetry data yet for this user
  ℹ Sync ships when Wave 4 Phase E (hub integration) ships
```

### 6.3 Tests

- Detail page renders profile
- Honest empty states
- Audit log entry on view

## 7. Sub-feature 5 — Privacy guardrails

### 7.1 Rules

| Data | Action |
|---|---|
| Email | Masked (`p***@domain.com`) |
| User ID | Show only hash (truncated 12 chars) |
| Hardware | Class only (never modelo exacto) |
| Subscription | Self-reported value |
| Install token | Never show value, só status |
| Prompt content | NUNCA mostrar |

### 7.2 Audit every view

Cada page load do admin escreve em `mooter_admin_audit`:
- action: 'view_users_list' | 'view_user_detail' | 'export_data'
- target_user_id_hash (se applicable)
- metadata: filters used

### 7.3 Tests

- Email masking visible
- Hardware shows class not model
- Audit entry per view

## 8. Verification

```bash
git diff dev tools/router/classify.js                    # VAZIO
git diff dev hub/                                         # VAZIO
git diff dev landing/middleware.ts                       # extend para /admin/* OR VAZIO + layout enforce
git diff dev landing/app/api/cli-token/                   # VAZIO

# Admin route exists
ls landing/app/\(admin\)/admin/users/ 2>/dev/null
```

## 9. Tests aggregate

- Pre-W6.5 D1: landing 39, CLI 175
- W6.5 D1: +25 landing (RBAC 5 + table 6 + filters 4 + detail 5 + audit 5)
- Total: ~64 landing · 175 CLI

## 10. Final-reviewer T3-gate

```
Task tool, subagent_type: "general-purpose"
Prompt: "Review wave6.5-d1-admin-panel vs dev.

Verifica:
- classify.js BYTE-IDENTICAL (P11)
- safety_boost + adapter_selection + schemas INTACTOS
- hub/ NOT touched
- landing/ Phases A+B+C+W6 D1+D2 INTACTOS
- RBAC enforced (allow list ADMIN_EMAILS env var)
- Email masking p***@domain visible em user table
- Hardware: 'high-end' class (não 'RTX 4090')
- mooter_admin_audit table records cada view
- Audit log uses user_id_hash (não email/uuid raw)
- Honest empty states quando sem telemetry
- ZERO prompt_content em qualquer página
- Vocabulário GLOSSARY
- Sem git add -A
- Cost sanity: $0

Reporta: APPROVE | APPROVE_WITH_NOTES | REQUEST_CHANGES com NITs."
```

## 11. PR + auto-merge + tag

```bash
git push -u origin wave6.5-d1-admin-panel
gh pr create --base dev --title "Wave 6.5 D1: Admin Panel Skeleton (RBAC + user table + filters + detail + privacy)" --body-file - <<'EOF'
## Summary
5 sub-features de admin panel:
- /admin RBAC via ADMIN_EMAILS env var
- User table (masked email, hardware class, persona, plan)
- Filters: subscription · hardware · activity
- /admin/users/[user_id_hash] detail page
- Privacy guardrails + audit log

## Invariants
- classify.js byte-identical (P11) ✓
- hub/ NOT touched ✓
- landing/ Phases A+B+C+W6 D1+D2 INTACTOS ✓

## Honesty
- Email masking visible
- Hardware CLASS only
- Audit log via user_id_hash
- "No telemetry yet" honest

## Tests
- Landing ~64 · CLI 175
- Sanity cost: $0

## Manual setup (Paulo)
1. Aplica migration 007_admin_audit_log.sql
2. Set ADMIN_EMAILS=paulo.loureiro.shp@gmail.com em landing/.env.local

## Reviewer
final-reviewer: <APPROVE | APPROVE_WITH_NOTES>
EOF

sleep 30
gh pr merge $PR --squash --delete-branch
```

## 12. Closure D1

```bash
git checkout dev && git pull origin dev
git tag -a v0.6.5-admin-panel-skeleton -m "Wave 6.5 D1: Admin Panel Skeleton"
git push origin v0.6.5-admin-panel-skeleton
```

+ Notion + SYNC + memória.

## 13. Resumo final

```
✅ Wave 6.5 D1 — Admin Panel Skeleton COMPLETA
- Tag: v0.6.5-admin-panel-skeleton
- 5 sub-features: RBAC · user table · filters · detail · privacy + audit
- Privacy guardrails enforced
- landing/ Phases A+B+C+W6 D1+D2 INTACTOS

⏸ Para. Wave 6.5 D2 (charts + feedback widget) precisa novo kickoff.
```

=== END ===
