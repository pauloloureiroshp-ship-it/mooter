# frugal — Algorithm Evolution Archive

Este directorio preserva snapshots do estado do algoritmo de routing ao longo do tempo.
**Nunca apagar ficheiros deste directorio sem aprovacao explicita.**

## Convencao de nomes

`v{semver}-snapshot.json` — estado do algoritmo na versao correspondente

## O que preservamos

- Hashes SHA-256 dos ficheiros criticos (classify.js, patterns.js, inject_context.js)
- Metricas validadas (savings, prompt count, tier distribution)
- Thresholds e fast_paths activos
- Git HEAD no momento do snapshot

## Como criar novo snapshot

```bash
# Manual — seguir o formato dos snapshots anteriores
sha256sum tools/router/classify.js tools/router/patterns.js tools/router/inject_context.js
git rev-parse HEAD
# Preencher o JSON com os valores actuais
```
