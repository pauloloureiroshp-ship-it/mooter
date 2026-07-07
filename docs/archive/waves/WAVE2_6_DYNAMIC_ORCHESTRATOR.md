# Wave 2.6 Dynamic Orchestrator — Meta-prompt (Dynamic Workflows enabled)

> **Substitui** `WAVE2_6_CONTINUOUS_ORCHESTRATOR.md` quando tens plano Max/Team/Enterprise e queres acelerar via Dynamic Workflows (Claude Code + Opus 4.8, lançado 2026-05-28).
>
> Mantém o mesmo safety (1 PR por Day, final-reviewer T3-gate, pausa para merge approval) mas paraleliza sub-features dentro de cada Day via subagents em paralelo.

**Pré-requisitos**:
- ✅ Wave 2.5 fechada (tag `v0.2.1-polish` em dev, commit `3bb94b8`)
- ✅ Master prompts existem: `docs/strategy/WAVE2_6_PLAN.md` + `WAVE2_6_DAY{1,2,3}_KICKOFF.md` + `WAVE2_6_DYNAMIC_ORCHESTRATOR.md` (este)
- ✅ Plano Max/Team/Enterprise (Dynamic Workflows disponível)
- ✅ Opus 4.8 disponível (auto-default em Max)
- ✅ Paulo no chat para aprovar cada merge

---

=== START ===

## Quem és e missão macro

És Claude Code no `~/mooter/` em `--permission-mode auto`, com acesso a **Dynamic Workflows** (Claude Code 28 Mai 2026). Vais executar **continuous mode acelerado** da Wave 2.6 — 3 Days seguidos pausando para merge approvals, **mas dentro de cada Day usas dynamic workflows para paralelizar sub-features independentes**.

**Princípio rector**: bazuca para a parede de betão (T3 decisions + final-reviewer), enxame de subagents para o trabalho mecânico em paralelo (text replacements, tests scaffolding, file edits independentes).

**NÃO mergeias PRs sozinho.** Apenas crias-os e esperas.

## Vocabulário canónico (lê antes de começar)

Lê `docs/strategy/WAVE2_6_PLAN.md` e `docs/strategy/GLOSSARY.md` (criado no Day 1) para o vocabulário.

- **Mooter** = entidade pastora (THE router)
- **Moos** = colectivo workers (models · agents · packs)
- **A Moo** = worker individual
- **to pastor** = verbo (rotear/distribuir)

Aplica em commits, PR descriptions, Notion, SYNC.md e qualquer output user-facing.

## Estratégia de paralelização (por Day)

| Day | Bloco sequencial (T3) | Bloco paralelo (subagents) |
|---|---|---|
| **1** | (a) Renames `git mv` + GLOSSARY.md + decisões semânticas → (b) Final-reviewer → (c) PR | Workflow paralelo de 12+ subagents, 1 por ficheiro target em `docs/strategy/**`, `SYNC.md`, `README.md`, `landing/**`. Cada subagent faz find-replace coerente conforme GLOSSARY no SEU ficheiro. |
| **2** | (a) Decisões arquitecturais 2-line + ANSI strategy → (b) Final-reviewer → (c) PR | Workflow paralelo de 2 subagents: 1 owns `tools/router/statusline-multi.js` extension, 1 owns `packages/cli/src/commands/dashboard.ts` NEW. Tests scaffolding em paralelo (3º subagent). |
| **3** | (a) `tools/router/glyphs.js` foundation + Stop hook wiring → (b) Final-reviewer → (c) PR | Após `glyphs.js` shippado para branch: workflow paralelo de 3 subagents — Moo card (`stop_hook.js`) · trail `--evolution` · `quiet --moo-card`. Cada subagent ownership de ficheiros próprios. |

**Como activar Dynamic Workflows**: usa a palavra `workflow` no prompt da Task tool ou descreve "fan out N parallel subagents to do X". Claude Code escreve o JavaScript orchestration script automaticamente.

## Protocolo por Day

Para cada Day N ∈ {1, 2, 3}:

### Passo 1: Sync dev

```bash
cd ~/mooter
git checkout dev
git pull origin dev
git log --oneline -3
```

Verifica squash Day N-1 no topo (ou `3bb94b8` / `b59191a` se Day 1).

Se NÃO está sincronizado:
- Output: `⏸ Aguardando merge do Day <N-1> W2.6. Pausa.`
- Para aqui. Espera Paulo.

### Passo 2: Lê o KICKOFF do Day N + GLOSSARY (Day 1 já criou)

```bash
cat ~/mooter/docs/strategy/WAVE2_6_DAY${N}_KICKOFF.md
cat ~/mooter/docs/strategy/GLOSSARY.md 2>/dev/null
```

Extrai a secção `=== START ===` / `=== END ===` do KICKOFF. É o teu plano.

### Passo 3: Executa o Day com dynamic workflow

#### 3.1 Bloco sequencial primeiro

Executa as decisões arquitecturais / foundation files que não dá para paralelizar:
- Day 1: `git mv` renames + criar GLOSSARY.md + decidir vocab edge cases
- Day 2: definir layout 2-line + ANSI strategy + truncate algorithm
- Day 3: implementar `glyphs.js` + wirar Stop hook em `~/.claude/settings.json`

#### 3.2 Fan-out paralelo

Após foundation, usa Task tool com prompt que CONTÉM a palavra `workflow` para fan-out:

**Exemplo para Day 1 (rebrand find-replace)**:
```
Task tool, subagent_type: "general-purpose"
Prompt: "Run a workflow with 12 parallel subagents, each owning ONE file from this list:
1. docs/strategy/STRATEGY.md
2. docs/strategy/ARCHITECTURE_V4.md
3. docs/strategy/ROUTING.md
4. docs/strategy/MASTER_PROMPT.md
5. docs/strategy/FLOWCHART.md
6. docs/strategy/BRIEFING.md
7. docs/strategy/MOOTER_PLAYBOOK.md (was PASTOR.md)
8. SYNC.md
9. README.md
10. packages/cli/README.md (if exists)
11. packages/router/README.md (if exists)
12. landing/ copy review (any *.tsx/*.md mentioning Pastor)

Each subagent: read file → identify each 'Pastor' occurrence → decide entity vs collective based on context (per GLOSSARY rules: Pastor entity → Mooter; Pastor collective → Moos) → apply Edit tool with precise old_string/new_string.

Subagents work in parallel on shared filesystem. After all complete, return list of (file, edits_count, any_ambiguous_cases_left).

Reviewer subagent: grep 'Pastor' across all 12 files post-edit. If zero indevidos → APPROVE. Else → flag ambiguous cases."
```

**Exemplo para Day 2 (statusline + dashboard paralelos)**:
```
Task tool with 2 parallel subagents:

Subagent A: "Owner of tools/router/statusline-multi.js extension. Add renderTwoLine() + renderOneLineFallback() per WAVE2_6_DAY2_KICKOFF §3. Truncate-safe chips. ANSI reset between chips. Update tests in tools/router/tests/statusline-two-line.test.js + statusline-snapshots.test.js. Touch ONLY these files."

Subagent B: "Owner of packages/cli/src/commands/dashboard.ts NEW. Implement runDashboard with alternate screen, refresh loop, SIGINT cleanup per WAVE2_6_DAY2_KICKOFF §4. Wire in packages/cli/src/cli.ts. Add packages/cli/tests/dashboard.test.ts. Touch ONLY these files."

Run as workflow with parallel agents. After both complete, you (coordinator) verify zero overlap + run npm test."
```

**Exemplo para Day 3 (após glyphs foundation, fan-out 3-way)**:
```
Task tool with 3 parallel subagents (workflow):

Subagent A: "Owner of tools/router/stop_hook.js NEW + ~/.claude/settings.json Stop hook wiring + tools/router/tests/stop-hook.test.js. Use require('./glyphs.js'). Silent fail on error."

Subagent B: "Owner of packages/cli/src/commands/trail.ts extension (--evolution flag) + packages/cli/tests/trail.test.ts new cases. Per WAVE2_6_DAY3_KICKOFF §5. Honest LoRA disclosure."

Subagent C: "Owner of packages/cli/src/commands/quiet.ts extension (--moo-card[-off] flags). Per §6. Preserve existing toggle logic."

Run as workflow. Coordinator (you) verifies zero file overlap + integrates glyphs use across all 3 + npm test."
```

### Passo 4: Final-reviewer T3-gate

Mesmo padrão dos KICKOFFs — final-reviewer audit antes do PR.

### Passo 5: Criar PR + reportar

```
✅ Day <N> Wave 2.6 PR criado (dynamic workflow)
- Branch: <branch-name>
- PR: <URL>
- Sub-features: <lista>
- Parallel subagents used: <N> (workflow ID: <if available>)
- Tests: <X/X pass>
- Reviewer: <verdict>
- Cost sanity: $<Y> (note: parallel runs use more tokens — expected)

⏸ Aguardando merge para arrancar Day <N+1>.
```

### Passo 6: Espera

Mesma regra: `merge done` / `continua` → avança. `stop` / `pausa` → para.

## Closure Protocol (após Day 3 merged)

Igual ao `WAVE2_6_CONTINUOUS_ORCHESTRATOR.md` §Closure:

```bash
cd ~/mooter
git checkout dev
git pull origin dev
npm test && npm run lint && npm run typecheck

# Smoke manual
mooter --help && mooter dashboard --help && mooter trail --evolution && mooter quiet --help

# Tag
git tag -a v0.2.2-reveal -m "Wave 2.6: rebrand Mooter+Moos · statusline 2-line + dashboard · Moo card + glyphs + evolution"
git push origin v0.2.2-reveal
```

Depois: Notion closure page + SYNC.md final + memória `project_mooter_wave2_6_shipped.md`.

Output final:
```
🎉 Wave 2.6 CONCLUÍDA (Dynamic Workflows acelerado)
- Tag: v0.2.2-reveal
- PRs: 3 (Days 1-3)
- Tests total: ~127
- Cost: $<X> (more than sequential — expected with parallel subagents)
- Time saved vs sequential: ~<Y>% (parallel sub-features dentro de cada Day)
- Notion closure: <URL>

Wave 3 (activation + hub) unblocked.
```

## Regras absolutas (continuous mode + dynamic)

❌ **Nunca auto-merge** — só Paulo/Cowork mergeia
❌ **Nunca pula T3-gate** — final-reviewer obrigatório por Day
❌ **Nunca paralelizes ENTRE Days** — só dentro de cada Day
❌ **Nunca paraleliza foundation files** — Day 3 `glyphs.js` é foundation, faz primeiro
❌ **Nunca permite file overlap entre subagents** — cada subagent owna ficheiros distintos (define explicitamente no prompt)
❌ **Nunca `--no-verify`** ou `git add -A`
❌ **Nunca toca `classify.js`** (P11), `docs/archive/**`, `~/.claude/agents/*`, schema `mooter_event.ts`
❌ **Nunca inventa LoRA** — sempre "none yet · Adapter Forge ships Wave 5"

✅ **Sempre lê KICKOFF + GLOSSARY antes de cada Day**
✅ **Sempre define ownership explícito** para cada subagent paralelo
✅ **Sempre coordinator verifica overlap + npm test** após fan-out
✅ **Sempre pausa após cada PR** para merge approval
✅ **Sempre usa palavra `workflow`** em prompts de fan-out para activar Dynamic Workflows runtime

## Falhas — protocolo

Se um subagent falha, coordinator (tu) tem 2 opções:
1. **Retry o subagent específico** (não relançar workflow inteiro)
2. **Fallback sequencial**: faz tu mesmo o trabalho desse subagent inline

Se foundation falha (Day 1 GLOSSARY, Day 2 layout, Day 3 glyphs):
```
🛑 Day <N> W2.6 FOUNDATION BLOCKED
- O que falhou: <descrição>
- Não consegui arrancar fan-out paralelo porque foundation incompleta
- Aguardo guidance.
```

## Arranque

Começa AGORA pelo Day 1 W2.6. Sincroniza dev, lê `WAVE2_6_DAY1_KICKOFF.md`, executa Day 1:
- Foundation sequencial: `git mv` PASTOR.md → MOOTER_PLAYBOOK.md + criar GLOSSARY.md
- Fan-out workflow paralelo: 12+ subagents fazem find-replace em ficheiros target
- Final-reviewer T3-gate
- PR para dev
- Pausa para merge

=== END ===
