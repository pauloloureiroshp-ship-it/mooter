# Charter — Pilar: council

**Norte estrategico:** Manter o quorum local como oraculo de qualidade: recall >95% em OOD, latencia <2s por vote.

## Objetivo
Quorum de modelos locais que avalia qualidade de saida sem custo cloud.

## Criterios de sucesso
- Recall >= 95% em holdout OOD selado
- Latencia p95 < 2 s por vote (3 votos)
- Sem data leakage entre treino e holdout

## Scope (worktree isolado)
`packages/council/`

## Out-of-scope
Adaptadores LoRA (pilar lora-dora), infraestrutura GPU (pilar quantizacao)

## Reflexao continua
1 em 3 ciclos = measure-only (sem feature): corre holdout, regista, decide se ha regressao.
