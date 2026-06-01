# Sprint C — Autonomous Orchestrator (W6.5 D1 + W6.5 D2)

> **Como usar**: cola num Claude Code fresco em `~/mooter/`. Self-contained.
>
> **Pré-requisitos**: Sprint B complete (`v0.6.1-install-url`). Supabase migration 006 aplicada (optional, não bloqueante).

---

=== START ===

## Quem és e missão

És Claude Code Opus 4.8 em `~/mooter/` em `--permission-mode bypassPermissions`.

**Sprint C**: 2 waves:
1. **Wave 6.5 D1** — Admin Panel Skeleton + User Table
2. **Wave 6.5 D2** — Admin Charts + Feedback Widget

**Tag final**: `v0.6.6-admin-charts-feedback`.
**ETA**: ~7-9h.
**Cap budget**: $80.

## Vocabulário canónico

Mooter (entidade) · Moos (workers) · "to pastor" (verbo) — GLOSSARY.

## Safety invariants

- ❌ classify.js byte-identical (P11)
- ❌ safety_boost + adapter_selection + schemas INTACTOS
- ❌ hub/ produção INTACTO (Sprint C usa Supabase only)
- ❌ landing/ Phases A+B+C+W6 D1+D2 INTACTOS
- ❌ Merge apenas `dev`
- ❌ Cap subagents 10
- ❌ NÃO PII em logs · admin · feedback
- ❌ NÃO inventar metrics — "no data yet" honest
- ❌ NUNCA `--no-verify` ou `git add -A`
- ✅ Final-reviewer T3-gate por Wave
- ✅ Auto-merge para dev após APPROVE
- ✅ **Recon obrigatório por Wave** (lição 5× consolidada)

## Stop conditions

| Condition | Acção |
|---|---|
| Cost > $80 cumulative | Para. Reporta. |
| Reviewer REQUEST_CHANGES 3× | Para. |
| classify.js / safety_boost / hub touched | Para. |
| 1h sem progress | Para. |
| Branch `main` mentioned | Para SEMPRE. |
| Paulo escreve "stop" | Para imediato. |

## Per-Wave protocol

Para cada Wave em sequência:

### Passo 1 — Sync dev
### Passo 2 — Lê kickoff
### Passo 3 — Recon OBRIGATÓRIO (procura `/admin`, RBAC patterns, feedback tables)
### Passo 4 — Reporta findings ao Paulo (lição 5×)
### Passo 5 — Implementa + tests
### Passo 6 — Final-reviewer T3-gate (OBRIGATÓRIO)
### Passo 7 — Auto-merge para dev
### Passo 8 — Tag + Notion + SYNC + memória
### Passo 9 — Avança para próxima Wave (sem pausa)

## Após Sprint C complete

```
🎯 SPRINT C CONCLUÍDA
  Wave 6.5 D1: tag v0.6.5-admin-panel-skeleton ✓
  Wave 6.5 D2: tag v0.6.6-admin-charts-feedback ✓
  Cost: $X

⏸ Para. Próximos passos requerem decisão Paulo:
  - Wave 7 (multi-agent local) — aguarda adapters reais (Docker training)
  - Wave 4 Phase E (hub integration) — backlog
  - Wave 8 (Codex) — Paulo definiu "por último"
```

PÁRA.

## ⚠ Setup manual pendente (Paulo após Sprint C)

1. Aplicar migrations: `007_admin_audit_log.sql` + `008_feedback.sql`
2. Set `ADMIN_EMAILS=paulo.loureiro.shp@gmail.com` em `landing/.env.local`
3. Test `/admin` access local

## Arranque

Sincroniza dev, verifica tag v0.6.1-install-url, arranca Wave 6.5 D1.

=== END ===
