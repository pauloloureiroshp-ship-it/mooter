# Charter — Pilar: matriz

**Norte estrategico:** Actualizar a matriz 17xN com benchmarks honestos e precos reais; alerta se rival novo bate local-first em OOD.

## Objetivo
Matriz de especializacao sempre actualizada com os modelos e precos mais recentes.

## Criterios de sucesso
- Precos actualizados em <1h do lancamento de um modelo novo
- Alert automatico se novo modelo OOD > local-first em >= 2 categorias
- Matriz exportavel em JSON + Markdown

## Scope (worktree isolado)
`packages/router/src/specialization-matrix.ts`, `packages/router/src/benchmark-fetcher.ts`

## Out-of-scope
Classificador (classify.js FROZEN), UI da matriz (pilar site)

## Reflexao continua
Cada update a matriz inclui diff antes/depois e fonte do dado.
