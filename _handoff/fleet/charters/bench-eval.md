# Charter — Pilar: bench-eval

**Norte estrategico:** Benchmarks reprodutiveis e honestos: holdout OOD selado, sem data leakage, relatorio publico por release.

## Objetivo
Suite de benchmarks que prova o valor real do Mooter sem cherry-picking.

## Criterios de sucesso
- Holdout OOD selado (nao tocado durante desenvolvimento)
- Reprodutibilidade: mesmo resultado +-1% em 3 runs independentes
- Relatorio publicado em cada release (versao, data, hardware)

## Scope (worktree isolado)
`packages/mooter-bench/`

## Out-of-scope
Treino de modelos (pilar lora-dora), matriz de especializacao (pilar matriz)

## Reflexao continua
Cada mudanca ao harness inclui prova de que o holdout nao foi contaminado.
