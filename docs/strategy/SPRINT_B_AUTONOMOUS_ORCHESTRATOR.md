# Sprint B — Autonomous Orchestrator (W6 D1 + W6 D2)

> **Como usar**: cola num Claude Code fresco em `~/mooter/`. Self-contained.
>
> **Pré-requisitos**: Sprint A complete (tag `v0.5.3-bash-badge-always-on`). Working dir = `~/mooter`.

---

=== START ===

## Quem és e missão

És Claude Code Opus 4.8 em `~/mooter/` em `--permission-mode bypassPermissions`.

**Sprint B**: 2 waves seguidas:
1. **Wave 6 D1** — Web Onboarding Wizard (extend landing /dashboard pattern)
2. **Wave 6 D2** — Install URL Personalizado + Script

**Tag final esperado**: `v0.6.1-install-url`.
**Total ETA**: ~10-12h.
**Cap budget**: $80 cumulative.

## Vocabulário canónico

GLOSSARY: Mooter (entidade) · Moos (workers) · "to pastor" (verb).

## Safety invariants

- ❌ classify.js byte-identical (P11)
- ❌ safety_boost + adapter_selection + glyphs INTACTOS
- ❌ schemas v1 (mooter_event/sync_event/adapter_manifest) INTACTOS
- ❌ **hub/ produção INTACTO** (Wave 6 usa Supabase RPC, NUNCA hub)
- ❌ landing/ Phases A+B+C INTACTOS — só ADICIONA `/onboarding` + `/install/[token]`
- ❌ Merge apenas `dev` (NUNCA `main`)
- ❌ Cap subagents 10
- ❌ NUNCA `--no-verify` ou `git add -A`
- ❌ NÃO armazenar PII (só hardware class + persona + plan anonymous)
- ✅ Final-reviewer T3-gate por Wave
- ✅ Auto-merge para dev após APPROVE
- ✅ Tokens 24h expiry + single-use

## Stop conditions

| Condition | Acção |
|---|---|
| Cost > $80 cumulative | Para. Reporta. |
| Reviewer REQUEST_CHANGES 3× seguidas | Para. |
| Bug em classify.js / safety_boost / hub | Para. |
| 1h sem progress | Para. |
| Branch `main` mentioned | Para SEMPRE. |
| Tentar tocar `hub/` worker | Para SEMPRE. |
| Paulo escreve "stop" | Para imediato. |

## Per-Wave protocol

Para cada Wave em sequência:

### Passo 1 — Sync dev

```bash
cd ~/mooter
git checkout dev
git pull origin dev
git log --oneline -3
```

### Passo 2 — Lê kickoff

```bash
cat ~/mooter/docs/strategy/WAVE6_D<N>_*_KICKOFF.md
```

### Passo 3 — Recon obrigatório (lição 4×)

Para Wave 6 D1: verificar se `/onboarding` já existe em landing/
Para Wave 6 D2: verificar Supabase migrations existentes

**Reporta findings ao Paulo via chat antes de implementar.**

### Passo 4 — Implementa + tests

### Passo 5 — Final-reviewer T3-gate (OBRIGATÓRIO)

### Passo 6 — Auto-merge para dev

```bash
gh pr create ...
sleep 30
gh pr merge $PR_NUM --squash --delete-branch
```

### Passo 7 — Tag + Notion + SYNC + memória

### Passo 8 — Avança para próxima Wave (sem pausa)

## Após Sprint B complete

```
🎯 SPRINT B CONCLUÍDA
  Wave 6 D1: tag v0.6.0-web-onboarding ✓
  Wave 6 D2: tag v0.6.1-install-url ✓
  Cost: $X

⏸ Para. Sprint C (Admin panel) requer novo kickoff explícito.
```

PÁRA. NÃO arranca Sprint C sem novo kickoff.

## ⚠ Manual setup pendente (Paulo após Sprint B)

Após Sprint B fechar, Paulo precisa configurar Supabase:

1. Apply migration: `supabase db push` ou via SQL editor
2. Test onboarding flow: localhost:3000/onboarding (com login válido)
3. Test install URL: curl localhost:3000/install/<token>

Detalhes em `docs/strategy/WAVE6_SUPABASE_SETUP.md` (CC cria).

## Arranque

Sincroniza dev, verifica tag v0.5.3-bash-badge-always-on, arranca Wave 6 D1 lendo `~/mooter/docs/strategy/WAVE6_D1_WEB_ONBOARDING_KICKOFF.md`.

=== END ===
