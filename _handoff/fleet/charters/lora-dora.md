# Charter — Pilar: lora-dora

**Norte estrategico:** Treinar adaptadores LoRA/DoRA que especializam o roteamento por dominio sem degradar o classificador base.

## Objetivo
Adaptadores leves que permitem ao Mooter especializar-se em dominios verticais (codigo, medicina, legal).

## Criterios de sucesso
- Accuracy +5% no dominio-alvo vs baseline
- Sem regressao >1% nos outros dominios (OOD)
- Adapter size < 100 MB por dominio

## Scope (worktree isolado)
`.venv-lora/`, scripts de treino em `docs/foundation/`

## Out-of-scope
Modelo base (pilar quantizacao), infraestrutura de avaliacao (pilar bench-eval)

## Reflexao continua
Cada run de treino regista loss curves + eval OOD antes de aceitar o adapter.
