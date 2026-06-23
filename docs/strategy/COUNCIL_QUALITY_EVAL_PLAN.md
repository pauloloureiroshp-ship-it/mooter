# Mooter Council — Plano de Eval de Qualidade (improvement, não change)

**Composto:** 2026-06-22, Cowork · **Corre em:** branch `wave-council-d` (council completo, 4 gates PASS)
**Porquê:** o Gate A provou que o council **MUDA** o veredicto (91,7%), mas assinou o caveat de que **NÃO está provado que MELHORA** (10/11 foram "different-winner", seleção ainda não length-neutral). Este eval responde à pergunta que falta: **o council produz respostas melhores que o melhor single-model — ou só diferentes?**

---

## A pergunta exata
> Em prompts de alto-CAS, a resposta do Council bate a resposta do single-model que o `decideAgent` escolheria — com higiene de juiz que o Gate A não teve (cross-family, cego, ordem randomizada, rubric length-neutral)?

Não é "muda?" (já sabemos: sim). É "**fica melhor, e a que custo?**".

---

## Desenho (pre-registado — fixa a barra ANTES de correr)

### 1. Dataset (N ≥ 40, estratificado, committed)
Duas naturezas, porque exigem julgamento diferente:
- **Verificável (ground truth existe):** raciocínio/factual/código-com-testes → graded objetivamente (resposta certa, ou testes passam). Fonte: seeds em `packages/mooter-bench/` + `docs/benchmarks/` + subset estilo HaluEval/TruthfulQA (as métricas do paper Council Mode).
- **Aberto (sem verdade única):** design/audit/refactor → graded por **rubric + pairwise cego**. Fonte: prompts reais do Paulo (vault/sessões) + categorias que disparam o CAS (architecture, security-audit, hard-debugging, large-refactor).

Estratificar pelas 24 task-categories que cruzam o CAS, para depois ter breakdown por categoria.

### 2. Três braços por prompt
| Braço | O que é | Para quê |
|---|---|---|
| **A** | single-model baseline = o que `decideAgent` escolhe (TES-optimal honesto) | a comparação justa |
| **B** | veredicto do Council (Advisory) | o candidato |
| C (opcional) | all-Opus single | tecto de qualidade (referência) |

### 3. Higiene de juiz — **o que o Gate A não fez** (decisivo)
- **Cross-family obrigatório:** se o juiz interno do council é Opus, o juiz do EVAL tem de ser **outra família** (GPT-5 / Gemini / DeepSeek da matriz) — senão o self-preference Anthropic contamina o resultado.
- **Cego + anonimizado + ordem randomizada:** A e B apresentados como "Resposta 1/2" em ordem aleatória; correr **as duas ordens** e cruzar (mata position bias).
- **Rubric length-neutral explícita:** "conciso ≥ verboso a igual correção".
- **Ground truth > juiz** onde existe: o braço verificável é graded por execução/gabarito, **não** por LLM.

### 4. Métricas (todas reportadas, incl. empates e derrotas)
- **Win-rate** do council vs single (win/tie/loss) + **IC binomial**. Barra pré-registada: council **WIN − LOSS > 0 com IC a excluir 0**.
- **Accuracy delta** no subset verificável (council − single) → a história de alucinação/correção (o paper mostrou +10,2 qualidade / −35,9% alucinação).
- **Custo e latência por win** → "$ por ponto de qualidade" (é o que decide se vale a pena ligar por defeito).
- **Calibração:** quando o council diz alta-confiança/ACT, acerta mais? (reliability curve) → valida a válvula ESCALATE do Bloco B.
- **Breakdown por categoria** → onde ganha vs desperdiça (alimenta o `bestCouncilPerCategory` e o threshold CAS do Pastor).

### 5. Regra de decisão (honesta, 3 saídas)
| Resultado | Leitura | Ação |
|---|---|---|
| Net-win com IC>0 **e** accuracy não regride | É ferramenta de **qualidade** | merge + tag flagship `v?.?.0-council-complete` |
| Muda muito mas **não** net-win | É ferramenta de **segurança/dissидência**, não de qualidade | manter gated a alto-risco (válvula ESCALATE); **não** vender como "respostas melhores" |
| Net-loss | A seleção de vencedor (length-neutral, Bloco C) precisa de fix primeiro | corrigir juiz antes de mergear |

### 6. Guardas Doctrine §5
Barra pré-registada antes de correr · dataset + prompt do juiz committed · resultados em `quality-eval-results.json` com caveat embebido (como o `value-gate-results.json` já faz) · zero cherry-picking · empates e derrotas reportados.

---

## ════════ MASTER PROMPT (cola no CC, na branch wave-council-d) ════════

```
És o CC em ultracode no repo ~/frugal (Mooter). Faz checkout de wave-council-d (council
completo). Vais implementar e correr o EVAL DE QUALIDADE do Council, seguindo
docs/strategy/COUNCIL_QUALITY_EVAL_PLAN.md. Objetivo: provar se o council MELHORA (não só muda)
a resposta vs single-model, com higiene de juiz.

REGRAS DURAS:
- classify.js FROZEN (não tocar). Trabalho aditivo em packages/council/scripts/ + datasets em
  packages/council/eval/. git add seletivo. NUNCA merge para main. Branch: eval off wave-council-d.
- Doctrine §5: pre-regista a barra ANTES de correr; reporta empates e derrotas; sem cherry-pick;
  dataset + prompt do juiz committed.

PASSO 1 — Dataset: cria packages/council/eval/dataset.jsonl com ≥40 prompts de alto-CAS,
estratificado pelas task-categories que disparam o CAS. Marca cada item verifiable:true|false e,
se verifiable, inclui ground_truth/testes. Reusa seeds de packages/mooter-bench e docs/benchmarks
onde fizer sentido; não inventes ground truth.

PASSO 2 — Harness: packages/council/scripts/quality-eval.ts. Por prompt corre 3 braços:
A = single-model que decideAgent escolhe; B = veredicto Council (Advisory, deliberate+verdict);
C = all-Opus (opcional, referência). Custo/latência metered do CallOutcome.

PASSO 3 — Juiz com higiene (NÃO repitas o erro do Gate A):
- Juiz CROSS-FAMILY (se o council usa Opus, o juiz do eval é outra família).
- Pairwise CEGO: A/B como "Resposta 1/2", ordem RANDOMIZADA, corre AS DUAS ordens e cruza.
- Rubric LENGTH-NEUTRAL explícita.
- No subset verifiable: graded por execução/gabarito, NUNCA por LLM.

PASSO 4 — Métricas → packages/council/scripts/quality-eval-results.json (com caveat embebido):
win/tie/loss + IC binomial; accuracy delta no verifiable; custo+latência por win; calibração
(ACT/alta-confiança vs acerto); breakdown por categoria.

PASSO 5 — Decisão e SYNC: aplica a regra de 3 saídas do plano. Escreve no SYNC.md o número final,
a barra pré-registada, e a recomendação honesta (merge+tag flagship / gated-a-alto-risco / fix-juiz).
NÃO mergeies nem tagueies — só recomenda. Abre PR do eval.

Entrega: dataset + harness + results.json + entrada no SYNC com recomendação. Suite verde.
classify.js sha provada intacta.
```

---

## Pendentes paralelos (não bloqueiam o eval)
- 🧹 Fechar sessões CC penduradas (HEAD da working copy "broken" + "claude.exe in use") antes de git ops.
- 🔀 Confirmar no GitHub se há PR para B/C/D (Cockpit sugere só #195 aberto); decidir merge depois do eval.
- 🛠 Wiring do chip 🏛 na statusline persistente (data layer `council-last.json` já existe).
