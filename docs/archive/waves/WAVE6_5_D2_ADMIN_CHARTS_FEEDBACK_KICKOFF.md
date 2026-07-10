# Wave 6.5 D2 — Admin Charts + Feedback Widget

> **Como usar**: cola no Claude Code. Self-contained.
>
> **Pré-requisitos**: tag `v0.6.5-admin-panel-skeleton` em dev (W6.5 D1).

---

=== START ===

## 0. Quem és e missão

És Claude Code Opus 4.8 no `~/mooter/`, branch `wave6.5-d2-admin-charts-feedback`. `--permission-mode bypassPermissions`.

**Missão Wave 6.5 D2**: shippar charts + feedback no admin panel. 5 sub-features:

1. **Subscription chart** — distribution Max/Team/Enterprise/API (pie/bar)
2. **Persona chart** — distribution Solo Founder / Senior IC / OSS Maintainer / Other
3. **Hardware class chart** — distribution high-end / discrete / integrated / none
4. **CLI feedback widget** — `mooter feedback "..."` comando + admin view
5. **Activity timeline** — joinings + onboardings per day (line chart)

### Recon OBRIGATÓRIO (lição 5×)

```bash
# Charts libs disponíveis em landing?
grep -rn 'recharts\|chart.js\|d3' landing/package.json 2>/dev/null

# Feedback table existe?
grep -rn 'feedback' landing/migrations/ landing/app/api/ 2>/dev/null

# Admin layout (W6.5 D1)
ls landing/app/\(admin\)/admin/ 2>/dev/null
```

**Reporta findings ao Paulo antes de implementar.**

## 1. Invariantes

- ❌ classify.js byte-identical (P11)
- ❌ schemas v1 INTACTOS
- ❌ hub/ NOT touched
- ❌ landing/ A+B+C+W6+W6.5 D1 INTACTOS — só ADICIONA charts + feedback
- ❌ NÃO instalar libs charts pesadas — usar SVG inline OR existing W4 A patterns
- ❌ NÃO inventar metrics — "No data yet" honest
- ❌ Não `git add -A` · `--no-verify` · merge `main`
- ✅ Final-reviewer T3-gate
- ✅ Auto-merge dev
- ✅ Tag v0.6.6-admin-charts-feedback
- ✅ GLOSSARY
- ✅ Honesty: feedback nunca contains user PII unless explicit consent

## 2. Branch + recon

```bash
cd ~/mooter
git checkout dev
git pull origin dev
git checkout -b wave6.5-d2-admin-charts-feedback
```

## 3. Sub-feature 1 — Subscription chart

### 3.1 UI

```
Subscription distribution
  Max         ████████████████ 65%
  Team        ████ 18%
  API only    ██ 12%
  Enterprise  █ 3%
  None        █ 2%
```

ASCII-style bars inline (no libs). OR adapt existing W4 A SimpleBarChart se existir.

### 3.2 Implementação

`landing/app/(admin)/admin/_components/SubscriptionChart.tsx`:
- Server component lê profiles + group by
- Bar chart inline (CSS divs)
- Mostra count + percentage

### 3.3 Tests

- Renders 5 categorias
- Calcula percentages corretos
- Empty state honest

## 4. Sub-feature 2 — Persona chart

Similar a §3 mas grouped by persona (4 personas).

## 5. Sub-feature 3 — Hardware class chart

Similar grouped by hardware_class.

## 6. Sub-feature 4 — CLI feedback widget

### 6.1 CLI command

```bash
$ mooter feedback "the dashboard chart loads slow on M1"

🐮 Mooter feedback

Topic: <leave empty or pick: bug | feature | performance | docs>
> bug

Severity: <pick: low | medium | high>
> low

✓ Feedback sent (id: fb_abc123). Thank you!
ℹ Anonymous · pseudonymous user_id_hash · no PII attached
```

### 6.2 Implementação

`packages/cli/src/commands/feedback.ts` (NEW):

```typescript
export async function runFeedback(args: { message: string }): Promise<void> {
  const auth = await readAuth();
  if (!auth?.access_token) {
    console.log('✗ Run `mooter login` first.');
    process.exit(1);
  }
  
  const topic = await prompt('Topic [bug/feature/performance/docs]:');
  const severity = await prompt('Severity [low/medium/high]:');
  
  const userIdHash = computeUserIdHash(auth);  // pseudonymous
  
  const res = await fetch(`${landingUrl}/api/feedback`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${auth.access_token}` },
    body: JSON.stringify({
      message: args.message.slice(0, 1000),  // cap length
      topic,
      severity,
      mooter_version: getVersion(),
      hardware_class: await readHardwareClass(),
      // NO email, NO real user_id
    })
  });
  
  if (res.ok) {
    const { id } = await res.json();
    console.log(`✓ Feedback sent (id: ${id})`);
  }
}
```

### 6.3 Landing endpoint

`landing/app/api/feedback/route.ts`:
- Validate auth
- Save to mooter_feedback table
- Cap message length 1000 chars
- Reject if PII detected (email regex)

### 6.4 Migration

`landing/migrations/008_feedback.sql`:
```sql
create table public.mooter_feedback (
  id text primary key default ('fb_' || lower(encode(gen_random_bytes(8), 'base64url'))),
  user_id_hash text not null,
  topic text,
  severity text,
  message text not null check (length(message) <= 1000),
  mooter_version text,
  hardware_class jsonb,
  created_at timestamptz default now()
);
```

## 7. Sub-feature 5 — Admin feedback view

### 7.1 UI

`/admin/feedback` — table com:
- Date
- Topic + Severity
- Message (first 100 chars)
- Mooter version
- Hardware class
- Status (new / read / resolved)

Filters: topic · severity · status · version.

## 8. Tests aggregate

- Pre-W6.5 D2: landing 64
- W6.5 D2: +25 (charts 12 + feedback CLI 5 + landing endpoint 4 + admin view 4)
- Total: ~89 landing

## 9. Final-reviewer T3-gate

```
Task tool, subagent_type: "general-purpose"
Prompt: "Review wave6.5-d2-admin-charts-feedback vs dev.

Verifica:
- classify.js BYTE-IDENTICAL (P11)
- schemas INTACTOS
- hub/ NOT touched
- landing/ A+B+C+W6+W6.5 D1 INTACTOS
- Charts inline (no heavy deps)
- Feedback: NO PII (email regex reject server-side)
- message capped 1000 chars
- Admin feedback view + filters
- Vocabulário GLOSSARY
- Cost sanity: $0

Reporta: APPROVE | APPROVE_WITH_NOTES | REQUEST_CHANGES com NITs."
```

## 10. PR + auto-merge + tag

```bash
git push -u origin wave6.5-d2-admin-charts-feedback
gh pr create --base dev --title "Wave 6.5 D2: Admin Charts + Feedback (subscription/persona/hardware + mooter feedback CLI + admin view)" --body-file - <<'EOF'
## Summary
5 sub-features: 3 charts (subscription/persona/hardware) + CLI feedback + admin feedback view.

## Tests
- Landing ~89
- Sanity cost: $0

## Manual setup
- Aplica migration 008_feedback.sql

## Reviewer
final-reviewer: <APPROVE | APPROVE_WITH_NOTES>
EOF

sleep 30
gh pr merge $PR --squash --delete-branch
```

## 11. Closure D2

```bash
git checkout dev && git pull origin dev
git tag -a v0.6.6-admin-charts-feedback -m "Wave 6.5 D2: Admin Charts + Feedback"
git push origin v0.6.6-admin-charts-feedback
```

## 12. Resumo final

```
✅ Wave 6.5 D2 — Admin Charts + Feedback COMPLETA
- Tag: v0.6.6-admin-charts-feedback
- 5 sub-features: 3 charts · CLI feedback · admin view

⏸ Para. Sprint C complete. Wave 7 (multi-agent local) precisa de adapters reais antes — aguarda Docker training.
```

=== END ===
