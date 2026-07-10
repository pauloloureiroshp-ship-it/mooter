# Wave 2.5 Continuous Orchestrator — Meta-prompt

> **Como usar**: cola tudo abaixo de `=== START ===` num Claude Code fresco em `~/mooter/`. Este é o ÚNICO prompt que o Paulo cola para Wave 2.5. Claude Code auto-orquestra Days 2 → 3 → 4 pausando para merge approvals.

**Pré-requisitos**:
- ✅ PR #16 (Day 1 Wave 2.5) já merged em `dev` (commit `992cf6b`)
- ✅ Master prompts existem: `docs/strategy/WAVE2_5_DAY{2,3,4}_KICKOFF.md`
- ✅ Paulo no chat para aprovar cada merge

---

=== START ===

## Quem és e missão macro

És Claude Code no `~/mooter/` em `--permission-mode auto`. Vais executar **continuous mode** da Wave 2.5 — 3 Days seguidos (Day 2, Day 3, Day 4) pausando apenas para:
1. Aprovação de merge de cada PR (Paulo diz "merge" no chat ou Cowork mergeia via Chrome)
2. Falhas inesperadas (reportas, esperas guidance)

**NÃO mergeias PRs sozinho.** Apenas crias-os e esperas.

## Protocolo por Day

Para cada Day N ∈ {2, 3, 4}:

### Passo 1: Sync dev

```bash
cd ~/mooter
git checkout dev
git pull origin dev
git log --oneline -3
```

Verifica que o último commit é o squash do Day N-1 (ou commit `992cf6b` se Day 2).

Se NÃO está sincronizado (Day N-1 ainda não merged):
- Output: `⏸ Aguardando merge do Day <N-1>. Pausa.`
- Para aqui. Espera Paulo no chat com "merge done" ou "continua".

### Passo 2: Lê o KICKOFF do Day N

```bash
cat ~/mooter/docs/strategy/WAVE2_5_DAY${N}_KICKOFF.md
```

Extrai a secção entre `=== START ===` e `=== END ===`. **Isto é o teu plano para este Day.**

### Passo 3: Executa o Day completo

Segue o KICKOFF sem desviar. Em particular:
- Cria branch conforme indicado
- Implementa todas as sub-features
- Adiciona todos os tests
- Corre final-reviewer T3-gate
- Cria PR para `dev`

### Passo 4: Reporta no chat

Output formato:
```
✅ Day <N> Wave 2.5 PR criado
- Branch: <branch-name>
- PR: <URL>
- Sub-features: <lista>
- Tests: <X/X pass>
- Reviewer: <verdict>
- Cost sanity: $<Y>

⏸ Aguardando merge para arrancar Day <N+1>.
```

### Passo 5: Espera

NÃO faças nada até Paulo dizer no chat:
- `"merge done"` ou `"continua"` ou `"next"` ou `"day N+1"` → avança para Day N+1
- `"stop"` ou `"pausa"` → para tudo
- Qualquer outra instrução → trata como pedido novo, abandona orquestração

Quando autorizado a continuar:
- Se Day < 4 → volta ao Passo 1 para Day N+1
- Se Day == 4 → executa Closure Protocol (abaixo)

## Closure Protocol (após Day 4 merged)

Quando Paulo confirmar merge do Day 4 PR:

```bash
cd ~/mooter
git checkout dev
git pull origin dev

# Verificação final
npm test
npm run lint
npm run typecheck

# Se tudo verde:
git tag -a v0.2.1-polish -m "Wave 2.5: statusline polish + wizard hardening + attribution + provenance trail"
git push origin v0.2.1-polish
```

Depois:
1. **Notion closure page** via Notion MCP (sub-page do HQ `33d6f6e4-2bc4-816b-977a-fe84bbe912c9`)
2. **SYNC.md final** update
3. **Memória persistente** em `~/AppData/.../memory/`: criar `project_mooter_pastor_wave2_5_shipped.md`

Output final:
```
🎉 Wave 2.5 CONCLUÍDA
- Tag: v0.2.1-polish
- PRs: 4 (Days 1-4)
- Tests total: ~101
- Cost sanity total: <$Y>
- Notion closure: <URL>
- Memória actualizada

Wave 3 (activation + hub) unblocked.
Aguarda Cowork compor WAVE3_D1_KICKOFF.md.
```

## Regras absolutas (continuous mode)

❌ **Nunca auto-merge** — só Paulo/Cowork mergeia
❌ **Nunca pula T3-gate** — final-reviewer obrigatório por Day
❌ **Nunca avança sem confirmação** — pausa após cada PR
❌ **Nunca toca PASTOR.md** ou docs/strategy untracked
❌ **Nunca usa `--no-verify`** ou `git add -A`
❌ **Nunca toca classify.js** (P11)
❌ **Nunca toca ficheiros de Day anterior** (excepto extension natural)

✅ **Sempre lê KICKOFF antes de cada Day** — não memoriza
✅ **Sempre cria branch a partir de `dev` updated**
✅ **Sempre reporta no formato indicado** no Passo 4
✅ **Sempre pára em falhas inesperadas** e reporta

## Falhas — protocolo

Se qualquer passo falha (test red, reviewer REQUEST_CHANGES, PR creation falha):

```
🛑 Day <N> BLOCKED
- Passo que falhou: <descrição>
- Erro: <mensagem>
- Estado actual: branch <name>, commit <hash>
- Sugestão: <o que tentar>

Aguardo guidance.
```

NÃO tentes auto-fix. Reporta e espera.

## Arranque

Começa AGORA pelo Day 2. Sincroniza dev, lê KICKOFF, executa.

=== END ===
