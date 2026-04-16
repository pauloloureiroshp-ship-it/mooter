# Master Prompt — Overnight Auto-tuning (Ollama only, sem aprovação)

> **Executor:** Claude Code no directório `~/frugal/`
> **Restrição crítica:** APENAS Ollama local (qwen3:30b ou qwen2.5:3b). Zero chamadas a Haiku/Sonnet/Opus. Zero custos de API.
> **Modo:** autónomo — executa tudo sem pedir aprovação. Só para se encontrar algo destrutivo.
> **Objectivo:** melhorar o algoritmo de classify.js com base nos dados reais do decisions.log, sem tocar em prod até validar offline.

---

## O que podes fazer SEM pedir aprovação

Qualquer melhoria que passe nestes três critérios está autorizada:

1. **Validável offline** — pode ser testada contra `gold-labels.json` (62 labels, 95.2% baseline) antes de ir a prod
2. **Não-destrutiva** — o ficheiro original tem backup `.bak` antes de qualquer escrita
3. **Reversível** — `git diff` mostra exactamente o que mudou; `git checkout` desfaz tudo

---

## O que NÃO podes fazer (para sem perguntar)

- Tocar em `.env*`, `package.json`, `tsconfig`, CI/CD, secrets
- Modificar `patterns.js` HIGH_RISK sem validar que accuracy >= 95.2% no gold-labels
- Fazer push para o GitHub
- Chamar qualquer API paga (Haiku/Sonnet/Opus)
- Modificar `CLAUDE.md`, `SYNC.md`, `INFRA.md`
- Spawnar mais de 3 subagents em simultâneo (custo Ollama)

---

## Ciclo de trabalho (repete até não haver mais melhorias ou chegar às 06:00)

```
LOOP:
  1. ANALISA → lê decisions.log + backtest --explain
  2. HIPÓTESE → identifica 1 padrão concreto para melhorar
  3. EXPERIMENTA → implementa em memória / ficheiro temp
  4. VALIDA → corre replay.js --gold-labels → accuracy >= 95.2%?
     - Se SIM → aplica → commit local → log no OVERNIGHT_LOG.md
     - Se NÃO → descarta → regista tentativa falhada no log → próxima hipótese
  5. REPETE
```

**Ferramenta principal para cada hipótese:** `qwen3:30b` via Ollama — usa para raciocínio sobre padrões, não para classificação em produção.

---

## Áreas de melhoria autorizadas (por prioridade)

### P1 — Melhorar coverage de T1 (Haiku) — gap crítico (0.2% actual)

O tier T1 está subaproveitado. Há uma zona morta entre T0 (trivial) e T2/T3 (complexo) que devia ser capturada por T1. Exemplos típicos: "explica este conceito em 2 parágrafos", "traduz este texto", "formata este JSON", "gera um exemplo simples de X".

**O que fazer:**
- Analisa os prompts de T2 com confidence < 0.7 no decisions.log — são candidatos a T1
- Para cada candidato, verifica se o resultado final foi uma resposta curta/simples (proxy: `turn_end` com latência baixa)
- Propõe novos padrões LOW_RISK para `patterns.js` que capturem estas tarefas
- Valida com gold-labels antes de aplicar

### P2 — Melhorar S3 do Prompt Optimizer (category framing com 14 hits apenas)

O `prompt-optimizer.js` tem S3 (category framing) mas só fez 14 hits no corpus de 363. Os padrões de detecção de categoria podem ser demasiado estritos.

**O que fazer:**
- Lê `prompt-optimizer.js` → função `detectCategory()` (ou equivalente)
- Analisa os eventos `classified` do decisions.log com `task_category` definido que NÃO foram optimizados por S3
- Alarga os padrões de detecção de forma conservadora (não quebra guardrails)
- Valida com `prompt-optimizer.test.js` — todos os 46 testes têm de continuar a passar

### P3 — Refinar TUNED_DEMOTE com base nos 508 prompts reais

O backtest identificou 3 candidatos de demote (todos dos stress-tests). Mas o corpus real pode ter padrões mais subtis.

**O que fazer:**
- Corre `backtest.js --explain` e analisa os candidatos em detalhe
- Usa `qwen3:30b` para avaliar se cada padrão proposto é seguro para demotar (não é HIGH_RISK disfarçado)
- Para os padrões aprovados, actualiza `router-tuning.json` manualmente (não usa `update-router.js` ainda — só em P4)
- Regista raciocínio no OVERNIGHT_LOG.md

### P4 — Aplicar TUNED_DEMOTE validado ao classify.js

Só executa este passo se P3 tiver pelo menos 2 padrões aprovados E accuracy no gold-labels mantiver >= 95.2%.

**O que fazer:**
- Corre `update-router.js` (já cria backup .bak automaticamente)
- Confirma com `node --check tools/router/classify.js`
- Corre `node tools/router/replay.js --gold-labels` → regista accuracy no log
- Commit local: `git add tools/router/classify.js && git commit -m "feat(tuning): overnight auto-tuning YYYY-MM-DD — N patterns, XX.X% accuracy"`

### P5 — Adicionar `--optimizer-dryrun` flag ao backtest.js

Uma flag permanente que simula o optimizer contra o histórico completo (como o dry-run manual que correu hoje). Permite correr em qualquer altura para ver impacto retrospectivo.

**O que fazer:**
- Adiciona `--optimizer-dryrun` ao `main()` do backtest.js
- Lê todos os eventos `classified` do decisions.log
- Para cada um, chama `optimizer.optimize(d.prompt_preview, d)` 
- Agrega: total optimizados, tokens saved est, estratégias por tier
- Imprime tabela no stdout (mesmo formato que o report existente)
- Valida: `node tools/router/backtest.js --optimizer-dryrun` corre sem erros

---

## Ferramenta de raciocínio (Ollama)

Para cada hipótese que precisar de raciocínio (ex: "este padrão é seguro para demotar?"), usa:

```bash
echo "Prompt: [texto do candidato]\nTier actual: T2\nPergunta: é seguro demotar para T1? Razões?\n[contexto do padrão]" | \
ollama run qwen3:30b --nowordwrap
```

Ou via Node.js se precisares de integração:
```js
const { spawnSync } = require('child_process');
const r = spawnSync('ollama', ['run', 'qwen3:30b', '--nowordwrap'], {
  input: `Analisa este padrão de prompt: "${pattern}"\nÉ seguro demotar de T2/T3 para T1? Tem risco de ser arquitectura, deploy, segurança? Responde em 3 linhas.`,
  encoding: 'utf8', timeout: 30000
});
const reasoning = r.stdout.trim();
```

---

## Ficheiro de log obrigatório: `OVERNIGHT_LOG.md`

Cria este ficheiro no directório `~/frugal/` e appenda cada acção:

```markdown
# Overnight Auto-tuning Log — 2026-04-11/12

## [HH:MM] P1 — T1 coverage
- Hipótese: padrão "formata este JSON" → T1
- Resultado: APROVADO — gold-labels 95.8% (era 95.2%)
- Acção: patterns.js actualizado, commit abc1234

## [HH:MM] P2 — S3 optimizer
- Hipótese: alargar detecção de category "summarize"
- Resultado: FALHADO — 2 testes quebraram (caso edge: summarize com código)
- Acção: descartado

## [HH:MM] Resumo
- Melhorias aplicadas: N
- Accuracy gold-labels: XX.X% (era 95.2%)
- Tokens saved optimizer: +X% no dryrun
- Commits: N (locais, não pushed)
```

---

## Critérios de paragem

Para imediatamente e não faças mais nada se:
- Accuracy no gold-labels cair abaixo de 94.0% em qualquer ponto
- `node --check` falhar em qualquer ficheiro modificado
- Qualquer operação precisar de API paga
- Qualquer modificação tocar em HIGH_RISK patterns

---

## O que o Paulo encontra de manhã

Quando acordares, corre:
```bash
cat ~/frugal/OVERNIGHT_LOG.md        # o que foi feito
git log --oneline -10                # commits aplicados
node tools/router/replay.js --gold-labels  # accuracy actual
node tools/router/backtest.js --optimizer-dryrun  # impacto do optimizer
```

E tens os números concretos para avaliar o valor do que foi construído.
