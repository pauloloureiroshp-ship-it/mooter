# Wave 2.6 Continuous Orchestrator — Meta-prompt

> **Como usar**: cola tudo abaixo de `=== START ===` num Claude Code fresco em `~/mooter/`. Este é o ÚNICO prompt que o Paulo cola para Wave 2.6. Claude Code auto-orquestra Days 1 → 2 → 3 pausando para merge approvals.

**Pré-requisitos**:
- ✅ Wave 2.5 fechada (tag `v0.2.1-polish` em dev, commit `3bb94b8`)
- ✅ Master prompts existem: `docs/strategy/WAVE2_6_PLAN.md` + `WAVE2_6_DAY{1,2,3}_KICKOFF.md`
- ✅ Paulo no chat para aprovar cada merge

---

=== START ===

## Quem és e missão macro

És Claude Code no `~/mooter/` em `--permission-mode auto`. Vais executar **continuous mode** da Wave 2.6 — 3 Days seguidos (Day 1 rebrand, Day 2 statusline+dashboard, Day 3 Moo card+glyphs+evolution+closure) pausando apenas para:
1. Aprovação de merge de cada PR (Paulo diz "merge done" / "continua" no chat APÓS o Cowork mergear via Chrome MCP)
2. Falhas inesperadas (reportas, esperas guidance)

**NÃO mergeias PRs sozinho.** Apenas crias-os e esperas.

## Vocabulário canónico (lê antes de começar)

Lê `docs/strategy/WAVE2_6_PLAN.md` e `docs/strategy/GLOSSARY.md` (criado no Day 1) para o vocabulário. Resumo:
- **Mooter** = entidade pastora (THE router/decision-maker)
- **Moos** = colectivo workers (models · agents · packs)
- **A Moo** = worker individual
- **to pastor** = verbo (rotear/distribuir)

Aplica este vocabulário em commits, PR descriptions, Notion pages, SYNC.md, e qualquer output user-facing daqui em diante.

## Protocolo por Day

Para cada Day N ∈ {1, 2, 3}:

### Passo 1: Sync dev

```bash
cd ~/mooter
git checkout dev
git pull origin dev
git log --oneline -3
```

Verifica que o último commit é o squash do Day N-1 (ou `3bb94b8` / `b59191a` se Day 1).

Se NÃO está sincronizado:
- Output: `⏸ Aguardando merge do Day <N-1> W2.6. Pausa.`
- Para aqui. Espera Paulo no chat.

### Passo 2: Lê o KICKOFF do Day N

```bash
cat ~/mooter/docs/strategy/WAVE2_6_DAY${N}_KICKOFF.md
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
✅ Day <N> Wave 2.6 PR criado
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
- Se Day < 3 → volta ao Passo 1 para Day N+1
- Se Day == 3 → executa Closure Protocol (abaixo)

## Closure Protocol (após Day 3 W2.6 merged)

Quando Paulo confirmar merge do Day 3 W2.6 PR:

```bash
cd ~/mooter
git checkout dev
git pull origin dev

# Verificação final
npm test
npm run lint
npm run typecheck

# Smoke manual
mooter --help
mooter dashboard --help
mooter trail --evolution
mooter quiet --help

# Se tudo verde:
git tag -a v0.2.2-reveal -m "Wave 2.6: rebrand Mooter+Moos · statusline 2-line + dashboard · Moo card + glyphs + evolution"
git push origin v0.2.2-reveal
```

Depois:
1. **Notion closure page** via Notion MCP (sub-page do HQ `33d6f6e4-2bc4-816b-977a-fe84bbe912c9`) com title `🐮 Wave 2.6 CLOSURE — v0.2.2-reveal (YYYY-MM-DD)`
2. **SYNC.md final** update (Estado Actual + COWORK→Wave 3 + link Notion)
3. **Memória persistente**: criar `project_mooter_wave2_6_shipped.md` no memory dir + actualizar `MEMORY.md` index

Output final:
```
🎉 Wave 2.6 CONCLUÍDA
- Tag: v0.2.2-reveal
- PRs: 3 (Days 1-3)
- Tests total: ~127
- Cost sanity total: $0
- Notion closure: <URL>
- Memória actualizada

Wave 3 (activation + hub) unblocked.
Aguarda Cowork compor WAVE3_D1_KICKOFF.md.
```

## Regras absolutas (continuous mode)

❌ **Nunca auto-merge** — só Paulo/Cowork mergeia
❌ **Nunca pula T3-gate** — final-reviewer obrigatório por Day
❌ **Nunca avança sem confirmação** — pausa após cada PR
❌ **Nunca toca `docs/archive/**`** (histórico Pastor preservado)
❌ **Nunca toca `~/.claude/agents/*`** (subagent files internos)
❌ **Nunca renomeia variable names .ts/.js** (Wave 3 backlog)
❌ **Nunca `--no-verify`** ou `git add -A`
❌ **Nunca toca `classify.js`** (P11)
❌ **Nunca toca ficheiros de Day anterior** (excepto extension natural)
❌ **Nunca inventa LoRA** — sempre "none yet · Adapter Forge ships Wave 5"

✅ **Sempre lê KICKOFF antes de cada Day** — não memoriza
✅ **Sempre lê GLOSSARY** para vocabulário canónico
✅ **Sempre cria branch a partir de `dev` updated**
✅ **Sempre reporta no formato indicado** no Passo 4
✅ **Sempre pára em falhas inesperadas** e reporta

## Falhas — protocolo

Se qualquer passo falha (test red, reviewer REQUEST_CHANGES, PR creation falha):

```
🛑 Day <N> W2.6 BLOCKED
- Passo que falhou: <descrição>
- Erro: <mensagem>
- Estado actual: branch <name>, commit <hash>
- Sugestão: <o que tentar>

Aguardo guidance.
```

NÃO tentes auto-fix. Reporta e espera.

## Arranque

Começa AGORA pelo Day 1 W2.6. Sincroniza dev, lê `WAVE2_6_DAY1_KICKOFF.md`, executa rebrand semântico Pastor → Mooter+Moos.

=== END ===
