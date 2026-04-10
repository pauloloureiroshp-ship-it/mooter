# frugal — Overnight Autonomous Session
## Master Prompt para Claude Code · Sessão nocturna · 2026-04-10

> **Instrução primária**: Executa tudo neste prompt de forma autónoma.
> Não peças aprovação do Paulo excepto nas 3 situações explicitamente marcadas como `⛔ PEDE APROVAÇÃO`.
> Paulo está a dormir. Usa o frugal como cobaia em tempo real. Regista tudo.
> Ao terminar (ou se ficares sem contexto), escreve o relatório na secção `📤 CLAUDE CODE → COWORK` do `SYNC.md`.

---

## Regras de autonomia

**FAZ sem perguntar:**
- Editar qualquer ficheiro em `~/frugal/` e `~/.claude/`
- Criar ficheiros, skills, snapshots, git tags
- Correr testes, benchmarks, backtests
- Commits (nunca `git add -A` — selecciona ficheiros explicitamente)
- Instalar/actualizar skills em `~/.claude/skills/`

**⛔ PEDE APROVAÇÃO (só nestes 3 casos):**
1. `git push` — não faças push sem o Paulo confirmar
2. Operações destrutivas irreversíveis (drop table, rm -rf fora de `/tmp`)
3. Alteração de secrets Cloudflare/Supabase

**Em caso de erro bloqueante**: regista no SYNC.md, passa para o próximo item. Não abortes a sessão.

---

## Prioridade 1 — Aplicar Beast/Zen/Auto Modes (MODES_MASTER_PROMPT.md)

> Ficheiro de referência: `~/frugal/MODES_MASTER_PROMPT.md` (tem o patch exacto, copia de lá)

### 1a. Patch inject_context.js (runtime E source)

Edita **ambos**:
- `~/.claude/tools/router/inject_context.js` (runtime activo)
- `~/frugal/tools/router/inject_context.js` (source do repo)

Localiza o bloco `applyBudgetCap` (procura a string `budget_cap` ou `applyBudgetCap`).
Insere **imediatamente depois** a função `applyActiveMode()` conforme descrita em `MODES_MASTER_PROMPT.md` Step 1.

Depois, localiza o bloco que constrói a string do hint (procura `router-hint` ou `TIER:`).
Adiciona o output `MODE:` e `FORCED:` conforme Step 2.

### 1b. Instalar frugal-mode.js no runtime

```bash
cp ~/frugal/tools/router/frugal-mode.js ~/.claude/tools/router/frugal-mode.js
chmod +x ~/.claude/tools/router/frugal-mode.js
```

### 1c. Instalar as 3 skills de modos

```bash
for skill in frugal-beast frugal-zen frugal-auto; do
  mkdir -p ~/.claude/skills/$skill
  cp ~/frugal/skills/$skill/SKILL.md ~/.claude/skills/$skill/SKILL.md
done
echo "✓ Mode skills installed"
```

### 1d. Smoke test completo

```bash
node ~/.claude/tools/router/frugal-mode.js beast
node ~/.claude/tools/router/frugal-mode.js --read
node ~/.claude/tools/router/frugal-mode.js zen
node ~/.claude/tools/router/frugal-mode.js --read
node ~/.claude/tools/router/frugal-mode.js auto
node ~/.claude/tools/router/frugal-mode.js --read
ls ~/.claude/tools/router/.frugal-mode.json 2>/dev/null && echo "FAIL" || echo "PASS: ficheiro ausente"
```

### 1e. Actualizar install.sh

Abre `~/frugal/install.sh`. Verifica que:
- `frugal-mode.js` está incluído na cópia dos ficheiros do router
- As 3 skills de modos (frugal-beast, frugal-zen, frugal-auto) estão no loop de instalação de skills
- O doctor check (`node frugal-mode.js --read`) está na lista de verificações finais

### 1f. Commit

```bash
cd ~/frugal
git add tools/router/inject_context.js tools/router/frugal-mode.js skills/frugal-beast/SKILL.md skills/frugal-zen/SKILL.md skills/frugal-auto/SKILL.md install.sh
git commit -m "feat(v0.9.3): Beast/Zen/Auto mode system — applyActiveMode() in inject_context.js"
```

---

## Prioridade 2 — frugal como cobaia: Sessão de dogfood com telemetria

> O objectivo é usar o frugal em si mesmo como guinea pig durante esta sessão,
> registar as decisões reais, correr o backtest, e fazer push para o hub.
> Isto demonstra o MVP end-to-end: prompt → classify → route → log → backtest → hub → stats.

### 2a. Verificar que decisions.log está activo

```bash
ls ~/.claude/tools/router/decisions.log 2>/dev/null && wc -l ~/.claude/tools/router/decisions.log || echo "decisions.log ausente — verificar gsd-turn-end.js"
```

Se ausente, verifica se `gsd-turn-end.js` está configurado como stop hook:
```bash
cat ~/.claude/settings.json | grep -A5 "StopHook\|TurnEnd"
```

### 2b. Correr classify em prompts representativos (telemetria sintética)

Usa estes prompts variados para simular o espectro completo de tiers.
Para cada um, corre o classify e regista o output:

```bash
node ~/.claude/tools/router/classify.js "muda a cor do botão para azul"
node ~/.claude/tools/router/classify.js "resume o ficheiro hub/src/worker.js"
node ~/.claude/tools/router/classify.js "porque é que o websocket falha às vezes"
node ~/.claude/tools/router/classify.js "redesenha o sistema de auth para multi-tenant"
node ~/.claude/tools/router/classify.js "gera a commit message para este diff"
node ~/.claude/tools/router/classify.js "explica o erro TypeError: x is not a function"
node ~/.claude/tools/router/classify.js "vou fazer push para produção agora"
node ~/.claude/tools/router/classify.js "cria um endpoint REST para user profile"
node ~/.claude/tools/router/classify.js "qual é a diferença entre map e flatMap"
node ~/.claude/tools/router/classify.js "optimiza a query SQL do dashboard"
```

Regista os resultados (tier, confidence, fast_path) num ficheiro temporário:
```bash
node ~/.claude/tools/router/classify.js "muda a cor do botão para azul" >> /tmp/frugal-dogfood-classify.json
# ... repete para todos
```

### 2c. Backtest com export para hub

```bash
cd ~/.claude/tools/router
node backtest.js --last 50 2>/dev/null || node ~/frugal/tools/router/backtest.js --last 50 2>/dev/null
```

Se decisions.log tiver entradas suficientes (>10):
```bash
node ~/frugal/tools/router/backtest.js --export-delta
```

Isto chama `hub-push.js` automaticamente (L4 fix já aplicado).

### 2d. Verificar hub recebeu o delta

```bash
node ~/frugal/tools/router/hub-status.js
```

Confirma que `last push` é recente e que o hub responde com stats actualizadas.

---

## Prioridade 3 — Snapshot de evolução do algoritmo (arquivo protegido)

> O frugal é o "tesouro". A evolução do classify.js, patterns.js e dos pesos nunca deve perder-se.
> Criamos um mecanismo de snapshot que preserva cada estado significativo.

### 3a. Criar directório de snapshots no repo

```bash
mkdir -p ~/frugal/.evolution
```

### 3b. Criar snapshot da versão actual

Cria o ficheiro `~/frugal/.evolution/v0.9.2-snapshot.json` com:

```json
{
  "_version": "v0.9.2",
  "_date": "2026-04-10",
  "_description": "Sessão Cowork #5 — hub deployed, 8 skills, Beast/Zen/Auto modes",
  "_savings_validated": 0.902,
  "_prompt_count": 1437,
  "_t0_absorption": 0.839,
  "classify_hash": "<SHA-256 do classify.js actual>",
  "patterns_hash": "<SHA-256 do patterns.js actual>",
  "inject_context_hash": "<SHA-256 do inject_context.js actual>",
  "key_thresholds": {
    "high_risk_floor": "T2",
    "trivial_ceiling": "T0",
    "confidence_arbiter_threshold": 0.75
  },
  "fast_paths": "<lista das fast_paths actuais do classify.js>",
  "git_head": "<output de git rev-parse HEAD>"
}
```

Calcula os hashes reais com:
```bash
sha256sum ~/frugal/tools/router/classify.js
sha256sum ~/frugal/tools/router/patterns.js
sha256sum ~/frugal/tools/router/inject_context.js
git rev-parse HEAD
```

### 3c. Criar git tag protegido

```bash
cd ~/frugal
git tag -a "algo-v0.9.2" -m "Algorithm snapshot v0.9.2 — 90.2% savings, 1437 prompts, hub live"
echo "✓ Tag algo-v0.9.2 criada (não fazer push sem aprovação do Paulo)"
```

### 3d. Criar README para .evolution/

Cria `~/frugal/.evolution/README.md`:

```markdown
# frugal — Algorithm Evolution Archive

Este directório preserva snapshots do estado do algoritmo de routing ao longo do tempo.
**Nunca apagar ficheiros deste directório sem aprovação explícita.**

## Convenção de nomes

`v{semver}-snapshot.json` — estado do algoritmo na versão correspondente

## O que preservamos

- Hashes SHA-256 dos ficheiros críticos (classify.js, patterns.js, inject_context.js)
- Métricas validadas (savings, prompt count, tier distribution)
- Thresholds e fast_paths activos
- Git HEAD no momento do snapshot

## Como criar novo snapshot

```bash
node ~/frugal/tools/router/classify.js --snapshot > ~/frugal/.evolution/v{X.Y.Z}-snapshot.json
```

(Ou manualmente seguindo o formato dos snapshots anteriores.)
```

### 3e. Adicionar .evolution/ ao .gitignore correctamente

```bash
# Verifica se .evolution/ está ignorado (NÃO deve estar — queremos preservá-lo)
grep ".evolution" ~/frugal/.gitignore 2>/dev/null && echo "ATENÇÃO: .evolution está em .gitignore — remover" || echo "OK: .evolution não está ignorado"
```

Se estiver ignorado, remove a linha.

### 3f. Commit do snapshot

```bash
cd ~/frugal
git add .evolution/
git commit -m "chore(evolution): snapshot v0.9.2 — algorithm archive iniciado"
```

---

## Prioridade 4 — Auditoria e organização de todos os ficheiros MD

> Objectivo: garantir que nenhum MD está stale, contraditório, ou com URLs antigas.
> Não perder informação — só actualizar e consolidar.

### 4a. Verificar e actualizar ARCHITECTURE.md

```bash
cat ~/frugal/ARCHITECTURE.md | head -50
```

Verifica se reflecte:
- v0.9.2 (não v0.9.1 ou anterior)
- frugal-hub live em `frugal-hub.frugal-hub.workers.dev`
- 8 skills (não 5)
- Beast/Zen/Auto modes (após Prioridade 1 estar aplicada)
- 4-tier routing com percentagens actuais (T0: 83.9%, savings: 90.2%)

Se desactualizado, actualiza. Mantém o mesmo estilo/estrutura.

### 4b. Verificar e actualizar ROADMAP.md

```bash
cat ~/frugal/ROADMAP.md | head -80
```

Verifica que:
- v0.9.2 está marcado como ✅ DONE
- v0.9.3 está marcado como a versão actual (Beast/Zen/Auto)
- L1, L3, L4, L6 estão marcados como fechados
- L5, L7, L8 estão marcados como pendentes

### 4c. Verificar URLs em todos os MDs

```bash
grep -r "frugal-hub.workers.dev" ~/frugal/ --include="*.md" | grep -v "frugal-hub.frugal-hub" | grep -v ".evolution"
```

Se encontrar URLs antigas (`frugal-hub.workers.dev` sem o subdomain duplo), corrige.

```bash
grep -r "frugal-hub.workers.dev" ~/frugal/ --include="*.js" | grep -v "frugal-hub.frugal-hub" | grep -v "node_modules"
```

Mesma verificação nos JS.

### 4d. Commit das actualizações de MD

```bash
cd ~/frugal
git add ARCHITECTURE.md ROADMAP.md
# (adiciona outros MDs alterados)
git commit -m "docs: actualizar ARCHITECTURE + ROADMAP para v0.9.3"
```

---

## Prioridade 5 — Auditoria e melhoria das 8 skills

> Cada skill deve ter: trigger correcto, comando funcional, output útil.
> Verificar que todas estão instaladas em `~/.claude/skills/`.

### 5a. Verificar skills instaladas

```bash
ls ~/.claude/skills/ | grep frugal
```

Devem existir: `frugal-status`, `frugal-savings`, `frugal-route`, `frugal-summary`, `frugal-update`, `frugal-beast`, `frugal-zen`, `frugal-auto`.

Qualquer que falte:
```bash
cp -r ~/frugal/skills/<nome>/ ~/.claude/skills/<nome>/
```

### 5b. Verificar frugal-status

Lê `~/frugal/skills/frugal-status/SKILL.md`.
Verifica que o comando principal faz:
1. `node ~/.claude/tools/router/hub-status.js` (verifica hub)
2. Lê as últimas 5 entradas de `decisions.log`
3. Verifica que Ollama está a correr

Se o script de status não faz estas 3 coisas, actualiza.

### 5c. Verificar frugal-savings

Lê `~/frugal/skills/frugal-savings/SKILL.md`.
O report deve incluir:
- Savings % da sessão actual (do decisions.log)
- Projecção mensal/anual a preços Anthropic actuais
- Tier distribution da sessão

### 5d. Verificar frugal-update

Lê `~/frugal/skills/frugal-update/SKILL.md`.
Deve incluir na sequência de update:
1. `git pull origin main` (no repo frugal)
2. Cópia dos ficheiros router para `~/.claude/tools/router/`
3. Cópia das skills para `~/.claude/skills/`
4. `node ~/.claude/tools/router/hub-pull.js` (sync do hub)
5. Verificação de saúde pós-update

Se faltar algum destes passos, adiciona.

### 5e. Actualizar skills nos dois locais (repo + runtime)

Após qualquer edição em `~/frugal/skills/`, sincroniza:
```bash
for skill in frugal-status frugal-savings frugal-route frugal-summary frugal-update frugal-beast frugal-zen frugal-auto; do
  cp ~/frugal/skills/$skill/SKILL.md ~/.claude/skills/$skill/SKILL.md 2>/dev/null || true
done
echo "✓ Todas as skills sincronizadas"
```

### 5f. Commit das skills actualizadas

```bash
cd ~/frugal
git add skills/
git commit -m "feat(skills): audit + sync all 8 frugal skills"
```

---

## Prioridade 6 — Melhorias ao algoritmo baseadas em telemetria real

> Usa os dados do decisions.log para identificar misroutings e melhorar o classify.

### 6a. Analisar decisions.log

```bash
node ~/frugal/tools/router/backtest.js --last 100 2>/dev/null
```

Procura por:
- Prompts com `confidence < 0.7` (arbiter activado) — são candidatos a melhoria de patterns
- Prompts T0 que foram escalados para T2/T3 (false negatives do T0)
- Prompts T3 em tarefas triviais (false positives)

### 6b. Identificar gaps em patterns.js

Lê `~/frugal/tools/router/patterns.js`.

Com base nos misroutings encontrados em 6a, identifica se faltam padrões em:
- `HIGH_RISK` — tarefas que deviam ser T2/T3 mas foram classificadas T0
- `TRIVIAL` — tarefas que deviam ser T0 mas foram classificadas T2/T3

### 6c. Adicionar padrões com cuidado

**Regras para editar patterns.js:**
- Só adicionar padrões com evidência de pelo menos 2 misroutings similares
- Cada padrão novo deve ter comentário: `// added v0.9.3 — reason: <misrouting observado>`
- Testar imediatamente com `node classify.js "<prompt que misrouteou>"`
- Nunca remover padrões existentes sem análise de impacto

Se não houver evidência suficiente de misroutings → não editar patterns.js. Regista a observação no SYNC.md.

### 6d. Actualizar snapshot se patterns.js foi alterado

Se editaste patterns.js, actualiza `~/frugal/.evolution/v0.9.3-snapshot.json` com os novos hashes.

### 6e. Commit

```bash
cd ~/frugal
git add tools/router/patterns.js tools/router/classify.js .evolution/
git commit -m "perf(classifier): add patterns based on dogfood telemetry v0.9.3"
```

---

## Prioridade 7 — Relatório final no SYNC.md

> Quando tudo estiver feito (ou se ficares sem contexto), escreve o relatório.

Abre `~/frugal/SYNC.md`. Na secção `📤 CLAUDE CODE → COWORK`, **substitui** o conteúdo actual pelo relatório desta sessão nocturna.

Estrutura mínima do relatório:

```markdown
### Sessão Overnight 2026-04-10 → 2026-04-11 — relatório

**Início:** [hora]
**Fim:** [hora]
**Commits feitos:** [lista]

#### ✅ Completado
- [lista do que foi feito]

#### ⚠️ Parcial / Bloqueado
- [o que não foi completado e porquê]

#### 📊 Telemetria frugal (dogfood)
- Prompts classificados: N
- Tier distribution: T0=X% T1=X% T2=X% T3=X%
- Savings estimados: X%
- Misroutings identificados: N
- Padrões adicionados: N

#### 🔗 Links úteis
- Hub stats: https://frugal-hub.frugal-hub.workers.dev/api/stats
- Git log: [últimos commits]

#### 📋 Para o Paulo fazer manualmente
- [ ] `git push` (não foi feito — requer aprovação)
- [ ] Configurar PAULO_WEBHOOK_URL real
- [ ] Fix RLS Supabase waitlist
```

Depois de escrever o relatório, faz commit do SYNC.md:
```bash
cd ~/frugal
git add SYNC.md
git commit -m "chore(sync): overnight session report — $(date +%Y-%m-%d)"
```

---

## Checklist final antes de encerrar

```
[ ] applyActiveMode() aplicado em inject_context.js (runtime + source)
[ ] frugal-mode.js instalado em ~/.claude/tools/router/
[ ] 3 skills de modos instaladas em ~/.claude/skills/
[ ] Smoke test: beast/zen/auto funcionam
[ ] install.sh actualizado
[ ] .evolution/ criado com snapshot v0.9.2
[ ] git tag algo-v0.9.2 criada
[ ] decisions.log tem entradas da sessão
[ ] backtest correu com sucesso
[ ] hub-push foi chamado (via --export-delta)
[ ] hub-status mostra hub online
[ ] ARCHITECTURE.md e ROADMAP.md actualizados
[ ] 8 skills verificadas e sincronizadas
[ ] patterns.js auditado (com ou sem alterações)
[ ] SYNC.md tem relatório completo desta sessão
[ ] Todos os commits selectivos (nunca git add -A)
[ ] git push NÃO foi feito (aguarda Paulo)
```

---

## Nota final para o Claude Code

Usa o frugal em ti mesmo enquanto trabalhas neste prompt.
Cada vez que classificares internamente uma tarefa deste prompt, é uma demonstração real do sistema.
Regista no relatório qual tier usaste para cada prioridade desta lista.

Boa sessão. O Paulo vai ver o trabalho de manhã.
