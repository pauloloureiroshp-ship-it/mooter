# Round 1 — instrução do Cowork para o CC

Faz checkout de `wave-council-d` (council completo, 4 gates PASS). Lê `docs/strategy/COUNCIL_QUALITY_EVAL_PLAN.md` e `_handoff/council-eval/MASTERPROMPT.md`. Vais implementar e correr o EVAL DE QUALIDADE do Council: provar se o council MELHORA (não só MUDA) a resposta vs single-model, com higiene de juiz que o Gate A não teve.

REGRAS DURAS:
- `classify.js` FROZEN (não tocar; prova a sha no fim). Trabalho aditivo: `packages/council/scripts/` + `packages/council/eval/`. `git add` seletivo. NUNCA merge/tag/push para `main`. Branch de trabalho off `wave-council-d`.
- Doctrine §5: pre-regista a barra ANTES de correr; reporta empates E derrotas; sem cherry-pick; dataset + prompt do juiz committed; caveat embebido no `results.json`.

PASSO 1 — Dataset: copia `_handoff/council-eval/dataset.jsonl` para `packages/council/eval/dataset.jsonl` (42 itens, `verifiable:true|false`, ground truth honesto e self-contained).

PASSO 2 — Harness `packages/council/scripts/quality-eval.ts`. Por item, 3 braços: A = single-model que `decideAgent` escolhe; B = veredicto Council Advisory (`deliberate`→`verdict`); C = all-Opus (opcional, tecto). Custo/latência reais via `CallOutcome`. Reusa `makeOllamaModel`/`makeAnthropicModel` + `decideAgent`.

PASSO 3 — Grading com higiene:
- `verifiable:true` → graded por execução/gabarito segundo o campo `grading` (exact_number, exact_yesno, exact_label, set_match, refusal_correct, test:…, contains:…). NUNCA por LLM.
- `verifiable:false` → pairwise CEGO: A/B como "Resposta 1/2", ordem RANDOMIZADA, corre AS DUAS ordens e cruza. Juiz CROSS-FAMILY (se o council usa Opus, juiz = outra família: gpt-5/gemini/deepseek). Rubric LENGTH-NEUTRAL (campo `rubric`).

PASSO 4 — Métricas → `packages/council/scripts/quality-eval-results.json` (caveat embebido): win/tie/loss + IC binomial; accuracy delta (verifiable); custo+latência por win; calibração (alta-confiança/ACT vs acerto); breakdown por categoria. Barra: council WIN−LOSS>0 com IC a excluir 0 (aberto) E accuracy delta ≥0 (verifiable).

PASSO 5 — Decisão (3 saídas) + handoff: net-win→MERGE+TAG flagship; muda-mas-não-net-win→GATED a alto-risco; net-loss→FIX juiz. Escreve a entrada `### 🏛 Council Quality Eval — <data>` no topo do `SYNC.md` + `_handoff/council-eval/RESULTS.md`. Abre PR do eval. NÃO mergeies nem tagueies. Prova a sha de `classify.js` intacta e suite council verde.

Começa o Passo 1 desta ronda. Quando parares, termina com o bloco ```status``` (DID/TESTS/BLOCKERS/NEXT/DONE).
