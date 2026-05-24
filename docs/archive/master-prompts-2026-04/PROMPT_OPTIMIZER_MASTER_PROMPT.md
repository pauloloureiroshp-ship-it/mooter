# Master Prompt — frugal Prompt Optimizer (Sprint 5-A)

> **Executor:** Claude Code (Opus), sessão interactiva no directório `~/frugal/`
> **Contexto:** Lê `SYNC.md`, `ARCHITECTURE.md`, `CLAUDE.md` antes de começar.
> **Estimativa:** 4-6h de implementação. Sem tocar em prod sem confirmar.

---

## Visão do Feature

O frugal já sabe **para onde** enviar um prompt (tier routing). Este sprint adiciona uma camada nova: saber **como** enviar — reformatando o prompt antes de chegar ao modelo para que ele processe melhor, mais rápido e com menos tokens.

Chama-se **Prompt Optimizer** (`prompt-optimizer.js`). É chamado dentro do `inject_context.js`, após o classify e antes da emissão do `<router-hint>`. Acrescenta um `<optimized-task>` ao hint com a versão reformatada do prompt.

O resultado: o modelo recebe o prompt original do user (não alterado — Claude Code não permite intercepção) **mais** uma versão estruturada, densa e tier-aware no contexto de hint. O modelo usa a versão optimizada como âncora de resposta.

---

## Fundamentos técnicos (estado da arte relevante)

### O que foi investigado

| Técnica | Ganho | Decisão |
|---|---|---|
| **LLMLingua** (Microsoft) | 20x compressão, -30% latência | ❌ Requer Python + modelo BERT — overhead inaceitável no hook (<50ms budget) |
| **Prompt pruning** (selective context) | 80% redução | ❌ Mesmo problema — requer inferência de modelo secundário |
| **Prompt rewriting via LLM** | 10-30% qualidade | ⚠️ Possível via Ollama local, mas adiciona latência. Reservado para modo opcional |
| **Semantic cache com embeddings** | 100x em hits | ✅ Implementar como Fase 2 (requer vector store) |
| **Tier-aware reformatting (regex/heurístico)** | 15-25% tokens, +precisão | ✅ **Implementar agora — zero latência, puro Node.js** |
| **`<optimized-task>` no hint** | model usa como âncora | ✅ **Já funciona no frugal — extensão directa** |

### Decisão de arquitectura

A abordagem escolhida é **heurística + rule-based**, sem LLM secundário no caminho crítico. Razões:

1. O hook tem budget de 50ms. Um Ollama call adicional (mesmo 3B) seria 200-800ms — inaceitável.
2. O classify.js já extrai features ricas do prompt: `task_category`, `has_code_block`, `has_error_trace`, `is_question`, `lang_detected`, `file_ref_count`. Estas features são suficientes para reformatar de forma inteligente.
3. A reescrita via LLM fica para **Modo Profundo** (`--deep`), activável explicitamente, com Ollama async e cache.

---

## O que implementar

### Ficheiro principal: `tools/router/prompt-optimizer.js`

Módulo puro Node.js, sem dependências externas, exporta uma função:

```js
/**
 * optimize(prompt, decision) → { optimized_task, tokens_saved_est, strategy }
 *
 * prompt    — string original do user
 * decision  — objecto da classify.js com task_category, tier, features
 * returns   — { optimized_task: string, tokens_saved_est: number, strategy: string }
 *           — optimized_task é a versão reformatada para incluir no hint
 *           — null se o prompt já está óptimo ou é muito curto para beneficiar
 */
function optimize(prompt, decision) { ... }

module.exports = { optimize };
```

#### Estratégias a implementar (por ordem de prioridade)

**S1 — Verbal padding removal**
Remove ruído conversacional que não acrescenta informação ao modelo:
- Padrões: "podes fazer", "consegues", "olha lá", "por favor", "obrigado", "boa tarde", "would you", "can you please", "could you", "I would like you to", "hey", "hi there"
- Mantém intacto tudo o que é instrução, código, contexto técnico
- Estimativa: 5-15% token reduction em prompts conversacionais

**S2 — Tier-aware reformatting**
Depois de remover padding, reformata conforme o tier destino:

- **T0 (Ollama local)**: comprime ao máximo. Remove artigos, preposições redundantes, colapsa frases longas em imperativo directo. Ex: "Podes verificar se existe algum problema com a função authenticate no ficheiro auth.js?" → "Verifica: função `authenticate` em auth.js — identifica problema"
- **T1 (Haiku)**: instrução directa e curta. Remove contexto desnecessário, mantém o "o quê" e elimina o "porque" óbvio
- **T2 (Sonnet)**: estrutura como bullet points se o prompt for multi-step. Adiciona delimitadores claros para separar contexto de instrução
- **T3 (Opus)**: enriquece com estrutura — separa explicitamente "Context:", "Task:", "Constraints:" se o prompt mistura tudo

**S3 — Category-aware task framing**
Usa `task_category` do classify.js para adicionar framing específico:

- `bug_hunt_or_debug` → prefixar com "Debug:" + extrair o erro/sintoma em destaque
- `commit_or_docstring` → formato padronizado esperado pelo modelo
- `summarize_or_trivial` → "Summarize in N lines:" onde N é proporcional ao prompt_len
- `code_generation` → "Implement: [descrição limpa]. Output: [linguagem] code only."
- `math_or_reasoning` → "Solve step-by-step: [problema]"
- `architecture_or_critical` → mantém verbatim (não toca — risco de perder nuance)

**S4 — Error trace structuring**
Se `has_error_trace: true`, reestrutura automaticamente:
```
Bug: [mensagem de erro em destaque]
Stack: [primeiras 3 linhas relevantes]  
Context: [o que o user queria fazer]
Task: identifica root cause e propõe fix
```

**S5 — Multi-language normalization**
Se `lang_detected` não for `en`, e o tier destino for T1/T2 (modelos que respondem melhor em inglês), adiciona uma nota no hint: `[Note: user prompt in PT — respond in PT]` para garantir que o modelo não muda de idioma.

---

### Integração em `inject_context.js`

Localização: após `logDecision(...)` e antes da emissão do budget guardrail (linha ~682), adicionar:

```js
// ── Prompt Optimizer (v0.10+) ──────────────────────────────────────────────
// Reformata o prompt de forma heurística para o tier destino.
// Zero latência — puro regex/string, sem LLM call.
let optimizedTask = null;
if (!cacheHit) { // só otimiza se não foi cache hit (já foi otimizado antes)
  try {
    const optimizer = require('./prompt-optimizer');
    const optResult = optimizer.optimize(prompt, decision);
    if (optResult && optResult.optimized_task !== prompt) {
      optimizedTask = optResult;
      // log para telemetria
      logDecision({
        ts: new Date().toISOString(),
        event: 'prompt_optimized',
        strategy: optResult.strategy,
        tokens_saved_est: optResult.tokens_saved_est,
        tier: decision.tier,
      });
    }
  } catch { /* nunca falha loudly */ }
}
// ─────────────────────────────────────────────────────────────────────────
```

E no bloco de emissão do hint (onde se constrói o XML do `<router-hint>`), adicionar logo após os campos existentes:

```js
// Se existe versão optimizada, inclui-a no hint para o modelo usar como âncora
if (optimizedTask) {
  hintLines.push(`<optimized-task tier="${decision.tier}" strategy="${optimizedTask.strategy}" tokens-saved="${optimizedTask.tokens_saved_est}">`);
  hintLines.push(optimizedTask.optimized_task);
  hintLines.push(`</optimized-task>`);
}
```

O modelo vê:
```xml
<router-hint tier="T1" model="claude-haiku-4-5" ...>
  ...campos existentes...
  <optimized-task tier="T1" strategy="s1+s2+s3" tokens-saved="23">
  Debug: função `authenticate` em auth.js — verifica race condition no token refresh
  </optimized-task>
</router-hint>
```

---

### Ficheiro de testes: `tools/router/prompt-optimizer.test.js`

Escreve testes para cada estratégia usando o test runner existente do projecto. Inclui:

- 10 casos de padding removal (PT e EN)
- 5 casos por tier (T0, T1, T2, T3) com input/expected output
- 3 casos de error trace structuring
- 3 casos de category-aware framing
- Casos de edge: prompt muito curto (<20 chars) → retorna null
- Casos de edge: prompt já em formato óptimo → retorna null ou igual
- Garante que `architecture_or_critical` nunca é tocado

### Actualizar `backtest.js`

Adicionar análise dos eventos `prompt_optimized` ao report:
- Total de prompts optimizados vs total
- Estratégias mais usadas (S1/S2/S3/S4/S5)
- `tokens_saved_est` acumulado
- Incluir no `metrics-snapshot.json` via `update-metrics.js`

### Actualizar `savings-tracker.js` — endpoint `/optimizer-stats`

Novo endpoint `GET /optimizer-stats` que lê os eventos `prompt_optimized` do `decisions.log` e devolve:
```json
{
  "total_optimized": 847,
  "optimization_rate": 0.62,
  "tokens_saved_est_total": 12450,
  "top_strategies": ["s1+s2", "s1+s3", "s2"],
  "by_tier": { "T0": 312, "T1": 289, "T2": 198, "T3": 48 }
}
```

---

## Fase 2 — Modo Profundo (não implementar agora, documentar apenas)

Para sessões onde o user activa `/frugal-deep` ou passa `--deep` no prompt:

1. **Ollama rewrite async**: antes de emitir o hint, chama `qwen2.5:3b` com um meta-prompt de compressão. Resultado em ~200ms. Só activa se Ollama estiver quente (via `/gpu` endpoint).
2. **Semantic cache**: embeddings com `nomic-embed-text` (Ollama), armazenados em `semantic-cache.json` (flat file, max 500 entries, LRU). Cache hit quando similaridade coseno > 0.92.
3. **Cross-session learning**: prompts que foram optimizados e resultaram em `followup_immediate: false` (accepted) alimentam o backtest com os seus padrões.

Documentar no `ARCHITECTURE.md` mas não implementar. Criar issue/task no ROADMAP.md.

---

## Guardrails obrigatórios

- **NUNCA** alterar o prompt original enviado pelo user ao modelo (impossível pelo design do Claude Code — o hint é contexto adicional, não substituição)
- **NUNCA** activar optimizer em prompts HIGH_RISK (`hasHighRisk(prompt) === true`)
- **NUNCA** activar optimizer em prompts com `task_category === 'architecture_or_critical'`
- **NUNCA** activar se o prompt tiver menos de 30 caracteres (overhead > benefício)
- **NUNCA** activar se o prompt já tiver `<optimized-task>` (re-entrada via cache)
- O optimizer **falha silenciosamente** — qualquer erro → `null` → hint emitido sem `<optimized-task>`
- Orçamento de execução: < 5ms por prompt (sem I/O, sem network, puro CPU)

---

## Sequência de implementação sugerida

```
1. Criar prompt-optimizer.js com S1 (padding removal) + testes
2. Adicionar S2 (tier-aware reformatting) + testes
3. Adicionar S3 (category-aware) + S4 (error trace) + S5 (lang) + testes
4. Integrar em inject_context.js (lê do git a versão completa — ficheiro pode estar truncado no workspace)
5. Confirmar com `node --check inject_context.js`
6. Teste manual: `echo '{"prompt":"podes fazer um fix no auth.js que está a dar erro de timeout"}' | node inject_context.js`
   → verificar que o output tem <optimized-task> e que o conteúdo está correcto
7. Actualizar backtest.js para analisar eventos prompt_optimized
8. Adicionar /optimizer-stats ao savings-tracker.js
9. Actualizar ARCHITECTURE.md com nova camada
10. Documentar Fase 2 no ROADMAP.md
11. Commit e push
```

---

## Critérios de aceitação

- [ ] `prompt-optimizer.js` exporta `optimize(prompt, decision)` com todas as 5 estratégias
- [ ] Testes passam: `node tools/router/prompt-optimizer.test.js` — 0 falhas
- [ ] `inject_context.js` emite `<optimized-task>` quando optimizer retorna resultado não-nulo
- [ ] Guardrails: HIGH_RISK e `architecture_or_critical` nunca optimizados
- [ ] Latência do optimizer < 5ms (medida no teste)
- [ ] `GET /optimizer-stats` responde com JSON válido
- [ ] `node --check` em todos os ficheiros modificados
- [ ] ARCHITECTURE.md actualizado com diagrama da nova camada
- [ ] ROADMAP.md com Fase 2 documentada
- [ ] Commit com mensagem descritiva

---

## Ficheiros a NÃO tocar sem confirmar

- `classify.js` — apenas leitura dos campos, sem modificação
- `patterns.js` — sem modificação
- `CLAUDE.md` — sem modificação
- Qualquer ficheiro de CI/CD

---

## Nota sobre ficheiros truncados

Os ficheiros `inject_context.js`, `backtest.js` e `savings-tracker.js` podem estar truncados no workspace local. **Antes de editar qualquer um deles, faz sempre `git show HEAD:tools/router/<ficheiro>` para obter a versão completa e trabalha sobre essa.**

O inject_context.js em particular termina abruptamente na linha 691 — a versão completa está no git.
