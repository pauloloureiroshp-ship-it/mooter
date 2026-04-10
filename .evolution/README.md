# frugal — Algorithm Evolution Archive

Este directorio preserva snapshots do estado do algoritmo de routing ao longo do tempo.
**Nunca apagar ficheiros deste directorio sem aprovacao explicita.**

## Convencao de nomes

`v{semver}-snapshot.json` — estado do algoritmo na versao correspondente

## Snapshots actuais (7)

| Ficheiro | Versao | Metrica chave | Data |
|---|---|---|---|
| `replay-v3-snapshot.json` | v0.3.0 | 90.2% savings (1,370 prompts) | 2026-04-06 |
| `v0.9.2-snapshot.json` | v0.9.2 | 58.1% savings | 2026-04-10 |
| `v0.9.3-snapshot.json` | v0.9.3 | 83% stress accuracy | 2026-04-10 |
| `v0.9.3-b-snapshot.json` | v0.9.3-b | 89.9% savings (T1 rebalance) | 2026-04-10 |
| `v0.9.3-c-snapshot.json` | v0.9.3-c | Creative test batch | 2026-04-10 |
| `v0.9.3-final-snapshot.json` | v0.9.3-final | 100% adj accuracy (stress) | 2026-04-10 |
| `v0.9.3-mega-snapshot.json` | v0.9.3-mega | 100% adj (170 prompts, 102 patterns) | 2026-04-10 |

## O que preservamos

- Hashes SHA-256 dos ficheiros criticos (classify.js, patterns.js, inject_context.js)
- Metricas validadas (savings, prompt count, tier distribution)
- Contagem de patterns por array (HIGH_RISK, MED_RISK, LOW_RISK, TRIVIAL)
- Resultados de stress-test e mega-test
- Git HEAD no momento do snapshot

## Como criar novo snapshot

```bash
# Manual — seguir o formato dos snapshots anteriores
sha256sum tools/router/classify.js tools/router/patterns.js tools/router/inject_context.js
git rev-parse HEAD
# Preencher o JSON com os valores actuais
```

## Ficheiros de dados para retroalimentacao (em ~/.claude/tools/router/)

- `decisions.log` — JSONL de cada prompt classificado
- `router-tuning.json` — sugestoes de demote/promote do backtest
- `ux-insights-history.json` — historico de sinais de friccao
- `adversarial-history.json` — historico de testes adversariais
