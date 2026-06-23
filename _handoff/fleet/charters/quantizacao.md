# Charter — Pilar: quantizacao

**Norte estrategico:** Manter VRAM <14 GB a Q4_K_M com fallback automatico, sem regressao de qualidade >2% vs FP16.

## Objetivo
Gestao adaptativa de quantizacao para caber na RTX 4090 com qualidade maxima.

## Criterios de sucesso
- VRAM peak < 14 GB em Q4_K_M (32B)
- Fallback automatico para Q3 se VRAM > 15 GB
- Quality delta vs FP16 < 2% em benchmark padrao

## Scope (worktree isolado)
`turboquant-backend/`, config GGUF em `docs/foundation/ADAPTIVE_QUANTIZATION.md`

## Out-of-scope
Treino de adaptadores (pilar lora-dora), scheduling de GPU (fleet-orchestrator)

## Reflexao continua
Apos cada mudanca de config, mede VRAM + quality antes de aceitar.
