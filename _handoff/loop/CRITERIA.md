# Wave success criteria — council-quality-eval

O avaliador (Cowork) declara `DONE` quando TODOS existem e estão honestos:

1. `packages/council/eval/dataset.jsonl` presente (≥40 itens, ground truth não fabricado).
2. `packages/council/scripts/quality-eval.ts` implementado e **executado** (corrida real, não mock).
3. `packages/council/scripts/quality-eval-results.json` com: win/tie/loss + IC binomial · accuracy delta (verifiable) · custo+latência por win · calibração · breakdown por categoria · **caveat embebido**.
4. Grading honesto: verifiable por execução/gabarito (não LLM); aberto por pairwise cego cross-family, ordem randomizada nas duas direções, rubric length-neutral.
5. Entrada `### 🏛 Council Quality Eval — <data>` no topo do `SYNC.md` com a **recomendação** (1 das 3 saídas) + `_handoff/council-eval/RESULTS.md` (resumo 10 linhas).
6. Prova: sha de `classify.js` `427d8c0b…364bc48f` intacta; suite council verde; PR do eval aberto (não mergeado).

## Stop conditions (o avaliador termina o loop)
- ✅ **done** — critérios 1–6 cumpridos (qualquer das 3 recomendações é um resultado válido, incl. net-loss → "fix juiz").
- ⛔ **stopped/blockers** — o CC reporta `BLOCKERS` que exigem humano (credenciais, ground truth ambíguo, ação irreversível). O avaliador escreve o que o humano tem de fazer.
- ⛔ **stopped/maxRounds** — esgotou `maxRounds` (12) sem cumprir critérios.
- 🚫 NUNCA aceitar merge/tag/push para `main` como parte do done — isso é gate humano separado.
