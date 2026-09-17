# holdout/ — as perguntas reservadas (R01/R02) e a sua custódia

**Estado (2026-09-16, condição C4 do Cowork Prisma):** README + directório. Sem código. Fica assim até existir um custodiante nomeado (pendência E-8 do plano `cc-plan-20260916-v1`).

## O que é

PROTOCOLO 0.2 §3: «R01/R02, duas repetições cada, só por custodiante independente antes de conhecer resultados de desenvolvimento. Textos ficam fora do contexto do optimizador. Sem custódia, não executar; não substituir por perguntas improvisadas. Com custódia, executar após W2 sem novas alterações e reportar separadamente.»

Contrato 0.3 `learning.holdout`: «Custody independent of optimizer; learning access forbidden.» Caso 12: a proibição de learning/contaminação **aplica-se já**; só o ensaio de integração automática está diferido.

## Onde vive (quando existir)

`<root>/holdout/` — no `prisma-data/` (fora do repo Mooter, E-2), **fora** de `waves/`. Nunca dentro de uma onda; nunca no repo; nunca em `~/.mooter` nem `~/.claude`.

Conteúdo previsto, escrito só pelo custodiante:

```
holdout/
  R01.json            # { id, text, role: 'eligible'|'negative', prompt_hash, sealed_at, custodian_id }
  R02.json
  custody.json        # { custodian_id, sealed_at, release_condition: 'after W2 closed, no further changes', released_at: null }
```

## Regras que o kit já aplica hoje (sem holdout.mjs)

1. **Nenhum módulo do kit lê `holdout/`.** `freeze` só congela o que está no manifesto; `scores.appendScore` recusa `slot_id` fora do manifesto (`slot_unknown`); `closeout` só percorre `waves/<wave_id>/`. Provado pelo teste 12 (parte estática: `grep` a `tools/experiment/*.mjs` e aos módulos de aprendizagem de `tools/router` e `packages/validation` — zero referências a `prisma-data`/`holdout`).
2. **R01/R02 não entram numa onda de desenvolvimento.** Um manifesto que os inclua antes da libertação é uma onda diferente, com `partition: 'independent-reserved'`, congelada **depois** de W2 fechar e de `custody.json.released_at` existir — e é o custodiante que a congela.
3. **Learning fora do ciclo.** `contrato 0.3 learning.automatic_learning_in_cycle = false`. `pastor-tune.js` e o bandit de `packages/validation` continuam a aprender routing entre ciclos; não têm caminho para `prisma-data/` (teste 12 estático).

## O que falta para passar de README a código

- custodiante nomeado (decisão do Paulo, E-8);
- evento `custody.sealed` e `custody.released` no diário de uma onda `independent-reserved` (o vocabulário de eventos de `journal.mjs` recebe-os nessa altura, com testes);
- `holdout.mjs` com `sealReserved()` / `releaseReserved()` que recusam abrir antes do `released_at` (o critério 12 dinâmico: «abrir holdout sem custody_release ⇒ erro + evento holdout_access_denied»).

Até lá, o directório vazio é a afirmação honesta: **não há holdout, logo não há nada que o optimizador possa ler.**
