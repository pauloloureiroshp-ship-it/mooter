# Council Quality Eval — Master Prompt (pronto a colar no CC / Mooter slash-loop)

**Branch:** `wave-council-d` · **Plano:** `docs/strategy/COUNCIL_QUALITY_EVAL_PLAN.md` · **Dataset:** `_handoff/council-eval/dataset.jsonl` (42 itens, estratificado, verifiable + rubric)

Este é o handoff do Cowork → Claude Code. O CC corre o eval autónomo e **escreve de volta** no contrato abaixo, para o Cowork ler na volta seguinte (loop via `SYNC.md`).

---

## Contrato de handoff (o loop Cowork ⇄ CC)
- **Input (já no repo):** este ficheiro + `dataset.jsonl` + o plano em `docs/strategy/`.
- **Output que o CC DEVE escrever no fim:**
  1. `packages/council/scripts/quality-eval-results.json` (números + caveat embebido).
  2. Uma entrada nova no topo do `SYNC.md` com o cabeçalho **`### 🏛 Council Quality Eval — <data>`** contendo: barra pré-registada, win/tie/loss + IC, accuracy delta (verifiable), custo+latência por win, calibração, breakdown por categoria, e a **recomendação (1 das 3 saídas)**.
  3. `_handoff/council-eval/RESULTS.md` — resumo de 10 linhas legível pelo Cowork (espelho da entrada do SYNC).
- O Cowork lê o `SYNC.md`/`RESULTS.md` na próxima volta e decide o passo seguinte. **Não fechar o loop com merge/tag — só recomendar.**

---

## ════════ COLAR NO CC (sessão Mooter, slash-loop / ultracode) ════════

```
És o CC em ultracode no repo ~/frugal (Mooter). Primeiro: fecha sessões CC penduradas se
"claude.exe in use" e confirma que dá para checkout limpo. Faz checkout de wave-council-d
(council completo, 4 gates PASS). Lê docs/strategy/COUNCIL_QUALITY_EVAL_PLAN.md e
_handoff/council-eval/MASTERPROMPT.md. Vais implementar e correr o EVAL DE QUALIDADE do Council:
provar se o council MELHORA (não só MUDA) a resposta vs single-model, com higiene de juiz que o
Gate A não teve.

REGRAS DURAS:
- classify.js FROZEN (não tocar; prova a sha no fim). Trabalho aditivo: packages/council/scripts/
  + packages/council/eval/. git add seletivo. NUNCA merge/tag para main. Branch: eval off wave-council-d.
- Doctrine §5: pre-regista a barra ANTES de correr; reporta empates E derrotas; sem cherry-pick;
  dataset + prompt do juiz committed; caveat embebido no results.json (como value-gate-results.json).

PASSO 1 — Dataset: copia _handoff/council-eval/dataset.jsonl para packages/council/eval/dataset.jsonl.
São 42 itens (verifiable:true|false). NÃO inventes ground truth; os verifiable são self-contained.
Se quiseres, acrescenta itens reais do meu vault, mas mantém ground truth honesto.

PASSO 2 — Harness packages/council/scripts/quality-eval.ts. Por item, 3 braços:
A = single-model que decideAgent escolhe (TES-optimal honesto);
B = veredicto Council Advisory (deliberate → verdict);
C = all-Opus single (opcional, tecto de referência).
Mede custo/latência reais via CallOutcome. Reusa makeOllamaModel/makeAnthropicModel + decideAgent.

PASSO 3 — Grading com higiene (NÃO repitas o erro do Gate A):
- verifiable:true → graded por execução/gabarito segundo o campo 'grading' do item (exact_number,
  exact_yesno, exact_label, set_match, refusal_correct, test:..., contains:...). NUNCA por LLM.
- verifiable:false → pairwise CEGO: A e B como "Resposta 1/2", ordem RANDOMIZADA, corre AS DUAS
  ordens e cruza (mata position bias). Juiz CROSS-FAMILY (se o council usa Opus, o juiz é outra
  família da matriz: gpt-5 / gemini / deepseek). Rubric LENGTH-NEUTRAL explícita (usa o campo 'rubric').

PASSO 4 — Métricas → packages/council/scripts/quality-eval-results.json (caveat embebido):
win/tie/loss + IC binomial; accuracy delta no subset verifiable; custo+latência por win;
calibração (quando council diz alta-confiança/ACT, acerta mais?); breakdown por categoria.
Barra pré-registada: council deve WIN−LOSS>0 com IC a excluir 0 (aberto) E accuracy delta ≥0 (verifiable).

PASSO 5 — Decisão (3 saídas do plano) + handoff:
- net-win (IC>0) e não regride accuracy → recomenda MERGE+TAG flagship.
- muda muito mas não net-win → recomenda GATED a alto-risco (válvula ESCALATE), não vender como qualidade.
- net-loss → recomenda FIX do juiz length-neutral/winner-selection antes de mergear.
Escreve: (a) a entrada "### 🏛 Council Quality Eval — <data>" no topo do SYNC.md, (b)
_handoff/council-eval/RESULTS.md (resumo 10 linhas), (c) abre PR do eval. NÃO mergeies nem tagueies.
Prova no fim que a sha de classify.js está intacta e que a suite council continua verde.
```
