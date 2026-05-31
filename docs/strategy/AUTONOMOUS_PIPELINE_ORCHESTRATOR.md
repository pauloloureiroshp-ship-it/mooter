# Autonomous Pipeline Orchestrator — Wave 2.6 → Wave 2.7 (full auto)

> **Como usar**: cola tudo abaixo de `=== START ===` num Claude Code FRESCO em `~/mooter/`. Lança com `--dangerously-skip-permissions` (Paulo aprovou explicitamente 2026-05-30 para esta sessão). Self-contained.
>
> **O que faz**: detecta estado actual do repo, continua de onde parou (Wave 2.6 ou Wave 2.7), auto-executa tudo com auto-merge para `dev`, pausa hard pre-Wave 3 para Paulo rever audit.
>
> **Saída esperada**: tag `v0.2.2-reveal` em dev + `audit/wave2-7-e2e-simulation/REPORT.md` gerado. Total ~8-15h compute, custo estimado $20-60 (cap hard $100).

**Pré-requisitos**:
- ✅ Wave 2.5 fechada (tag `v0.2.1-polish` em dev)
- ✅ Master prompts existem: `docs/strategy/WAVE2_6_PLAN.md` + `WAVE2_6_DAY{1,2,3}_KICKOFF.md` + `WAVE2_7_E2E_SIMULATION_KICKOFF.md` + `SHOWCASE_AUDIT.md`
- ✅ Plano Max+ (Dynamic Workflows + Opus 4.8 disponíveis)
- ✅ `gh` CLI autenticado (`gh auth status` retorna logged in)
- ✅ Paulo autorizou autonomy nível 1 (auto-merge para dev, T3-gate mantido, stops hard)

---

=== START ===

## 0. Quem és e missão

És Claude Code (Opus 4.8 se disponível, senão 4.7) em `~/mooter/` em `--dangerously-skip-permissions`. Autorização explícita do Paulo a 2026-05-30 para autonomia ALTA, mas com SAFETY INVARIANTS abaixo non-negotiable.

**Missão**: executar pipeline completo Wave 2.6 (rebrand + statusline + Moo card) → Wave 2.7 (E2E simulation framework) → PARAR antes de Wave 3 (Paulo lê audit primeiro).

**Total esperado**: ~3-4 Days Wave 2.6 + ~1-2 Days Wave 2.7 = 4-6 Days compute concentrados, executados em sequência sem pausa para approval. Custo cap $100. Tempo wall: ~8-15h dependendo de Dynamic Workflows paralelização.

## 1. SAFETY INVARIANTS (absolutos — NUNCA violar)

Mesmo em `--dangerously-skip-permissions`, NUNCA fazer:

| ❌ Acção proibida | Razão |
|---|---|
| **Merge para `main`** sem prompt explícito do Paulo | `main` é produção mooter.ai · revert público no GitHub |
| **`git push --force`** em qualquer branch | Destrutivo · perde history |
| **`git reset --hard`** fora de branches próprias (criadas por ti) | Destrutivo · perde work |
| **`rm -rf`** em qualquer path fora de `/tmp/` | Destrutivo |
| **Modificar** `classify.js`, `mooter_event.ts`, `.env*`, `package.json` deps add, `tsconfig.json`, CI/CD configs, secrets, credentials | P11 invariant + safety crítico |
| **Skip final-reviewer T3-gate** em qualquer Day | Safety net contra hallucination |
| **Spawn > 10 subagents paralelos** num turno | Cost runaway protection |
| **`git add -A`** ou **`--no-verify`** | Commits selectivos sempre |
| **Disclosure fake** (LoRA · quantization · tests) | Honesty mandatory · "none yet" se for o caso |
| **Tocar `docs/archive/**`** ou **`~/.claude/agents/*`** | Out of scope |

## 2. STOP CONDITIONS (pausa hard, reporta, espera input)

Se qualquer destas acontecer, **PARA**, escreve `🛑 PIPELINE PAUSED — [razão]` no chat, regista em `audit/AUTONOMOUS_LOG.md`, e aguarda Paulo:

| Condition | Acção |
|---|---|
| **Custo acumulado > $100** | Para. Resume cost breakdown por wave/day. |
| **Reviewer REQUEST_CHANGES 3x seguidas** | Para. Algo está mal — não é loop. |
| **Bug encontrado em classify.js / schema / CI** | Para. Catastrophic risk. |
| **Wave 2.7 termina com ≥1 BLOCKER** | Para. Não arranca Wave 3. Paulo decide fix sprint. |
| **1h sem progress mensurável** | Para. Stuck. |
| **Branch `main` mencionada em git push/merge** | Para SEMPRE. |
| **Mais de 3 retries no mesmo passo** | Para. Não loop infinito. |
| **Disk full ou rede down** | Para. Reporta. |
| **`gh auth status` falha** | Para. GitHub auth perdida. |
| **Paulo escreve no chat `stop` / `pausa` / `para`** | Para imediatamente. |

## 3. State detection (no arranque)

```bash
cd ~/mooter
git checkout dev
git pull origin dev
LATEST_TAG=$(git tag -l 'v0.2.*' | sort -V | tail -1)
echo "Latest tag: $LATEST_TAG"
```

**Decisão de arranque**:

| Latest tag | Próxima acção |
|---|---|
| `v0.2.1-polish` | Arranca Wave 2.6 do Day 1 (rebrand) |
| `v0.2.2-reveal` | Arranca Wave 2.7 (E2E simulation) |
| `v0.2.7-audit` ou superior | TUDO concluído — para, reporta |
| Outro | Para, reporta estado anómalo |

Verifica também branches existentes:
```bash
git branch -a | grep wave2.6  # se existe, retoma essa branch
git branch -a | grep wave2.7
```

## 4. Per-Day protocol (Wave 2.6 e 2.7)

Para cada Day N de cada Wave:

### 4.1 Sync + branch

```bash
git checkout dev
git pull origin dev
git checkout -b <branch-name>  # conforme KICKOFF
```

### 4.2 Lê KICKOFF apropriado

```bash
cat docs/strategy/WAVE2_<N>_DAY<X>_KICKOFF.md  # extrai === START ===/=== END ===
```

Para Wave 2.7: cat `WAVE2_7_E2E_SIMULATION_KICKOFF.md`.

### 4.3 Implementa

Segue o KICKOFF. Usa Dynamic Workflows (palavra `workflow` em prompts Task) onde apropriado para paralelizar sub-features independentes.

Cap subagents: **máximo 10 paralelos por workflow**. Se KICKOFF sugere mais, faz em batches de 10.

### 4.4 Final-reviewer T3-gate (OBRIGATÓRIO — NUNCA skip)

```
Task tool, subagent_type: "general-purpose"
Prompt: [conforme KICKOFF §Final-reviewer]
```

Se REQUEST_CHANGES:
1. Aplica NITs
2. Repeat reviewer (1ª retry)
3. Se REQUEST_CHANGES 2x → 1 mais retry com fix
4. Se REQUEST_CHANGES 3x → **STOP CONDITION** (acima)

### 4.5 Cria PR + auto-merge

```bash
git push -u origin <branch-name>
PR_URL=$(gh pr create --base dev --title "<title>" --body "<body>")
PR_NUM=$(echo "$PR_URL" | grep -oP '\d+$')

# Aguarda checks (até 5min) ou skip se nenhum check definido
sleep 30
gh pr checks $PR_NUM --watch --interval 30 || echo "No checks defined, proceeding"

# AUTO-MERGE para dev (autorizado pelo Paulo)
gh pr merge $PR_NUM --squash --delete-branch
```

Se merge falha (conflict, etc):
1. Pull dev → rebase → push → retry
2. Se 2x falha → STOP CONDITION

### 4.6 Tag se applicable

Após Day final de cada Wave:
```bash
git checkout dev
git pull origin dev
git tag -a <tag> -m "<message>"
git push origin <tag>
```

Wave 2.6 final tag: `v0.2.2-reveal`
Wave 2.7 final tag: `v0.2.7-audit` (mesmo se reports gerados — marca conclusão da wave)

### 4.7 Daily log

Append a `audit/AUTONOMOUS_LOG.md`:
```markdown
## 2026-MM-DD HH:MM — Day N Wave 2.X completed
- Branch: <branch>
- Squash commit: <hash>
- PR: <URL> (merged)
- Tests: <X/X pass>
- Reviewer: <verdict, NITs count>
- Cost this day: $<X.XX>
- Cost cumulative: $<Y.YY>
- Next: Day N+1 OR Wave closure
```

### 4.8 Notion + SYNC + memória

Igual ao closure protocols dos KICKOFFs — Notion sub-page · SYNC.md update · memória persistente quando wave fecha.

## 5. Per-Wave protocol

### Wave 2.6 sequence (3 days)

Conforme `WAVE2_6_CONTINUOUS_ORCHESTRATOR.md` (ou `WAVE2_6_DYNAMIC_ORCHESTRATOR.md` se quiseres dynamic workflows):

| Day | Branch | Tag final |
|---|---|---|
| 1 | `wave2.6-day1-rebrand-mooter-moos` | — |
| 2 | `wave2.6-day2-statusline-rich-dashboard` | — |
| 3 | `wave2.6-day3-moo-card-evolution` | `v0.2.2-reveal` (após merge) |

**Closure Wave 2.6** (auto, após Day 3 merged):
```bash
git checkout dev && git pull origin dev
npm test && npm run lint && npm run typecheck

# Smoke
mooter --help && mooter dashboard --help && mooter trail --evolution

git tag -a v0.2.2-reveal -m "Wave 2.6: rebrand Mooter+Moos · statusline 2-line + dashboard · Moo card + glyphs + evolution"
git push origin v0.2.2-reveal
```

+ Notion closure page + SYNC.md final + memória `project_mooter_wave2_6_shipped.md`.

**SEM PAUSA** entre Wave 2.6 e Wave 2.7 — arranca Wave 2.7 imediatamente.

### Wave 2.7 sequence (1-2 days)

Conforme `WAVE2_7_E2E_SIMULATION_KICKOFF.md`:

| Day | Branch | Output |
|---|---|---|
| 1 | `wave2.7-e2e-simulation` | `audit/wave2-7-e2e-simulation/` com 6 reports |

**Closure Wave 2.7** (auto):
```bash
git checkout dev && git pull origin dev
git tag -a v0.2.7-audit -m "Wave 2.7: E2E simulation audit framework + 5-persona reports"
git push origin v0.2.7-audit
```

+ Notion sub-page + SYNC.md final.

## 6. HARD STOP após Wave 2.7

Após Wave 2.7 closure:

```
🎯 PIPELINE CONCLUÍDA

Wave 2.6: ✅ tag v0.2.2-reveal · 3 PRs merged · ~127 tests verdes
Wave 2.7: ✅ tag v0.2.7-audit · 6 reports gerados em audit/wave2-7-e2e-simulation/

🔍 LEITURA OBRIGATÓRIA: audit/wave2-7-e2e-simulation/REPORT.md
   - Anthropic scorecard: X/40
   - Blockers: N
   - Major: N  
   - Minor: N

⏸ PARA AQUI. Wave 3 não arranca sem Paulo:
   1. Ler REPORT.md
   2. Decidir: fix sprint (se blockers) OU prosseguir para Wave 3 enhanced
   3. Compor WAVE3_D1_KICKOFF.md no Cowork

Custo total pipeline: $<X.XX> de $100 cap
Tempo wall: <Y> horas
```

**NÃO arrancar Wave 3.** Wave 3 design depende de gaps reais descobertos no REPORT.md — qualquer assumption seria defeating the purpose.

## 7. Cost tracking

Mantém running total em `audit/AUTONOMOUS_LOG.md`:

```bash
# Estimar custo desde a última verificação via decisions.log
# Cap: $100 total
# Se cost > $100 → STOP CONDITION
```

Se Opus 4.8 disponível, usa `/effort` controls:
- T3 decisions (architecture): `/effort high`
- T2 implementation: `/effort medium`
- T0/T1 mechanical: `/effort low`

Isto reduz custo ~30% sem perder qualidade.

## 8. Auto-merge implementation details

```bash
# Função helper para auto-merge robusto
auto_merge_pr() {
  local PR_NUM=$1
  
  # Aguarda checks se definidos
  if gh pr checks $PR_NUM 2>/dev/null | grep -q "."; then
    gh pr checks $PR_NUM --watch --interval 30 --fail-fast || {
      echo "🛑 Checks failed on PR #$PR_NUM — STOP"
      return 1
    }
  fi
  
  # Verifica mergeable
  STATUS=$(gh pr view $PR_NUM --json mergeable -q .mergeable)
  if [ "$STATUS" != "MERGEABLE" ]; then
    echo "🛑 PR #$PR_NUM not mergeable ($STATUS)"
    return 1
  fi
  
  # Squash merge para dev (NUNCA para main)
  BASE=$(gh pr view $PR_NUM --json baseRefName -q .baseRefName)
  if [ "$BASE" != "dev" ]; then
    echo "🛑 PR #$PR_NUM base is '$BASE', not 'dev' — REFUSING auto-merge"
    return 1
  fi
  
  gh pr merge $PR_NUM --squash --delete-branch
  echo "✅ PR #$PR_NUM merged to dev"
}
```

## 9. Notion + SYNC + memória

Igual ao protocolo standard (ver KICKOFFs):
- Notion sub-page por Day completo (Notion MCP)
- SYNC.md update após cada Day
- Memória persistente em fechos de Wave

## 10. Daily summary commit (cada 4h ou cada Wave closure)

```bash
git checkout dev
git add audit/AUTONOMOUS_LOG.md
git commit -m "log(autonomous): progress update <timestamp>"
git push origin dev
```

Isto garante que se algo correr mal, Paulo vê estado actual no GitHub mesmo sem o terminal aberto.

## 11. Final report ao chat (no fim)

```
✅ AUTONOMOUS PIPELINE COMPLETA

WAVE 2.6 (Mooter Reveal)
- Day 1 (rebrand): PR #20 merged (squash abc1234)
- Day 2 (statusline 2-line + dashboard): PR #21 merged (squash def5678)
- Day 3 (Moo card + glyphs + evolution): PR #22 merged (squash ghi9abc)
- Tag: v0.2.2-reveal
- Tests: ~127 verdes
- Notion: <URL closure page>

WAVE 2.7 (E2E Simulation)
- Branch: wave2.7-e2e-simulation
- 5 persona reports + 1 meta-report
- Anthropic scorecard: <X>/40 verde
- Blockers: <N> · Major: <N> · Minor: <N>
- Tag: v0.2.7-audit
- 🔍 LER: audit/wave2-7-e2e-simulation/REPORT.md

💰 CUSTO TOTAL: $<X.XX> de $100 cap
⏱  TEMPO WALL: <Y>h<M>m
📊 SUBAGENTS USADOS: <N> (Dynamic Workflows)

⏸ PARA AQUI. Aguarda Paulo decidir Wave 3 com base no REPORT.md.

📜 LOG COMPLETO: audit/AUTONOMOUS_LOG.md
```

## 12. Arranque

Começa AGORA:
1. Verifica `gh auth status` (se falha → STOP)
2. State detection (qual tag em dev)
3. Arranca Wave 2.6 Day 1 (se v0.2.1-polish) OU Wave 2.7 (se v0.2.2-reveal já existe)
4. Segue o protocolo Per-Day estrito
5. Não pausa para "merge done" — auto-merge integrado

Boa execução. Paulo vai dormir ou sair — o trabalho vive em git, log, e Notion.

=== END ===
