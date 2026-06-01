# Sprint A — Autonomous Orchestrator (W5 D3 + W5 D4)

> **Como usar**: cola num Claude Code fresco em `~/mooter/`. Self-contained. Auto-executa Wave 5 D3 → Wave 5 D4 → pára antes Sprint B.

---

=== START ===

## Quem és e missão

És Claude Code Opus 4.8 em `~/mooter/` em `--permission-mode bypassPermissions`.

**Sprint A**: 2 waves seguidas pausando para approvals automáticos:
1. **Wave 5 D3** — Statusline V2 (VRAM + quant tooltip + ctx bar + explain + hide flags)
2. **Wave 5 D4** — Bash Badge Always-On (NIT Paulo #4)

**Tag final esperado**: `v0.5.3-bash-badge-always-on`.
**Total ETA**: ~5-6h.
**Cap budget**: $50 cumulative (warn if exceeded).

## Vocabulário canónico (GLOSSARY)

- **Mooter** = entidade router
- **Moos** = colectivo workers
- **A Moo** = worker individual
- **to pastor** = verbo

## Safety invariants (NÃO violar)

- ❌ classify.js byte-identical (P11)
- ❌ safety_boost.js + adapter_selection.js + glyphs.js INTACTOS
- ❌ mooter_event + sync_event + adapter_manifest v1 INTACTOS
- ❌ hub/ produção + landing/ Phases A+B+C INTACTOS
- ❌ Merge apenas para `dev` (NUNCA `main`)
- ❌ Cap subagents 10 paralelos
- ❌ NUNCA `--no-verify` ou `git add -A`
- ❌ NUNCA inventar (VRAM null se nvidia-smi falhar · quant honest · confidence real)
- ✅ Final-reviewer T3-gate por Wave
- ✅ Auto-merge para dev após APPROVE
- ✅ Pausa após cada Wave para Paulo aprovar próximo

## Stop conditions

| Condition | Acção |
|---|---|
| Cost > $50 cumulative | Para. Reporta. |
| Reviewer REQUEST_CHANGES 3× seguidas | Para. Não loop. |
| Bug em classify.js / safety_boost / hub | Para. Catastrophic. |
| 1h sem progress | Para. Stuck. |
| Branch `main` mentioned | Para SEMPRE. |
| Paulo escreve "stop" no chat | Para imediato. |

## Per-Wave protocol

Para cada Wave em sequência:

### Passo 1 — Sync dev

```bash
cd ~/mooter
git checkout dev
git pull origin dev
git log --oneline -3
```

### Passo 2 — Lê kickoff apropriado

```bash
cat ~/mooter/docs/strategy/WAVE5_D<N>_*_KICKOFF.md
```

### Passo 3 — Implementa

Segue o kickoff sem desviar. Recon obrigatório primeiro (lição 4×).

### Passo 4 — Final-reviewer T3-gate

OBRIGATÓRIO. Sem skip.

### Passo 5 — Auto-merge para dev

```bash
gh pr create ...
sleep 30
gh pr merge $PR_NUM --squash --delete-branch
```

### Passo 6 — Tag + Notion + SYNC + memória

```bash
git checkout dev && git pull origin dev
git tag -a v0.5.<N>-... -m "..."
git push origin v0.5.<N>-...
```

### Passo 7 — Avança automaticamente para próxima Wave

NÃO pausa entre D3 e D4. Sprint A = autónomo.

## Após Sprint A completo

```bash
echo "🎯 SPRINT A CONCLUÍDA"
echo "  Wave 5 D3: tag v0.5.2-statusline-v2 ✓"
echo "  Wave 5 D4: tag v0.5.3-bash-badge-always-on ✓"
echo "  Cost: \$X"
echo ""
echo "⏸ Para. Sprint B (User lifecycle web↔CLI) requer novo kickoff do Paulo."
```

PÁRA. NÃO arranca Sprint B sem novo kickoff.

## Arranque

Sincroniza dev, verifica tags v0.5.1-forge-validation, arranca Wave 5 D3 lendo `~/mooter/docs/strategy/WAVE5_D3_STATUSLINE_V2_KICKOFF.md`.

=== END ===
