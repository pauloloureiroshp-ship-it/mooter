# v1.47.0 — Gate de Vazio + Suite do Moo

## O que entra

### retry.js — Motor de Retry com Gauntlet
Motor completo de retry com gauntlet de diagnóstico. Reconhece 10 classes de falha: lock-git-preso, aprovacao-presa, prep-estoura-sempre, vram-nao-chega, timeout-motor, parado-fora-do-historico, orfao-de-reinicio, caminho-com-espaco, codex-worktree-windows, cancelado-pelo-dono. Escala motor automaticamente na segunda tentativa e requer confirmação em casos de custo.

### terminal.js — Definição Única de Terminalidade
Uma só leitura, uma só ordem. Unifica 13 predicados divergentes de terminalidade anteriormente espalhados pelo cockpit. O job está terminal se: done, resolvido, cancelled, ou running com exit_code medido.

### cockpit.html — Três Fontes com Rótulo Honesto + Bloco de Retry
Painel que anuncia qual a fonte (bridge, HTTP, snapshot) com rótulo que diz "frozen" quando está desatualizado, com idade em horas/minutos. Novo bloco de retry integrado no drawer de job, com formulário para pedir confirmação em casos de custo.

### tools/cockpit/build-snapshot.js — Gate de Vazio
Gerador que recusa fotografias vazias. Valida:
- `jobs`: array com ids e totais não-null
- `board`: scorecard com pelo menos uma métrica de valor não-null
- `pastas`: repo dentro do próprio repo, array com pastas
- `setup`: contexto não-null

Se alguma vista fica vazia, o gerador sai com code 1 e marca explicitamente o motivo.

### skills/retry + skills/cockpit
Skills do Mooter: retry (despacha planos de retentativa) e cockpit (abre o painel).

## Testes

- `tools/cockpit/build-snapshot.test.js`: 3/3 (idempotência, escape de </script>, origem intocada)
- `packages/mooter-bridge/retry.test.js`: 41/41 (gauntlet, receitas, anti-stale, invariantes)
- `plugin/mooter/skills/cockpit/cockpit-invariants.test.js`: 78/78 (sintaxe, fontes, bugs históricos, bloco MOO, snapshot)

## Build

```
node tools/cockpit/build-snapshot.js
exit 0 · 5 ids · 11 métricas · 50 pastas · setup=sim · 531431 bytes
```

## Release (corrigido)

Commit: `336288d26cf8d7ad017ffb655e5aedf86c80902e` (fix: versão única para conector)
Push: `origin/main` atualizado
Tag: v1.47.0
Teste novo: `packages/mooter-bridge/versao-coerente.test.js` — gate de divergência de versão
