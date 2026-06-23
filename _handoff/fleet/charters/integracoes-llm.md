# Charter — Pilar: integracoes-llm

**Norte estrategico:** Monitorizar 24/7 novos modelos e precos; injetar arbitrage signals na matriz em <1h do lancamento.

## Objetivo
Watchers que detectam novos modelos e oportunidades de arbitrage antes de qualquer rival.

## Criterios de sucesso
- Novo modelo detectado em < 1h do lancamento publico
- Arbitrage signal injetado na matriz em < 1h
- Zero false positives em 7 dias

## Scope (worktree isolado)
`packages/arbitrage-monitor/`, `packages/minimax-watcher/`, `packages/router/src/benchmark-fetcher.ts`

## Out-of-scope
Matriz (actualizada pelo pilar matriz), precos manuais

## Reflexao continua
Log de cada detection event com source, latencia, e se foi false positive.
