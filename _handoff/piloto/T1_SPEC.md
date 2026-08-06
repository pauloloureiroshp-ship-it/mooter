# T1 VISUAL — spec congelada (transcrita do §5 da v1.0 — "Moo Ranch")

> ⚠️ INPUT EM FALTA. A v1.0 do protocolo vive na conversa Cowork de 2026-08-06 e
> não está em disco. Este ficheiro é o único transportador da spec. O `driver.mjs`
> e o `dod_harness.mjs` RECUSAM arrancar enquanto existir `<<TODO` neste ficheiro.
> Preencher = colar verbatim o §5 da v1.0; nunca reescrever de memória.

## Prompt (idêntico nos 3 braços — protocolo v1.1 §3)

```
<<TODO: colar aqui o prompt exacto do §5 da v1.0 (Moo Ranch)>>
```

## Artefacto esperado

- Caminho relativo na worktree do run: `<<TODO: ex. moo-ranch/index.html>>`
- Tipo: `<<TODO: ex. página HTML autónoma, sem rede>>`

## DoD — 12 itens S/N (verificados pelo harness, NUNCA por LLM — v1.1 §4.1)

| # | Item (verbatim da v1.0) |
|---|---|
| 1 | <<TODO>> |
| 2 | <<TODO>> |
| 3 | <<TODO>> |
| 4 | <<TODO>> |
| 5 | <<TODO>> |
| 6 | <<TODO>> |
| 7 | <<TODO>> |
| 8 | <<TODO>> |
| 9 | <<TODO>> |
| 10 | <<TODO>> |
| 11 | <<TODO>> |
| 12 | <<TODO>> |

Depois de preencher esta tabela, implementar cada item como check executável em
`dod_checks.mjs` (mesmo id 1-12). Item não automatizável → marcar `humano: true`
no check e o harness reporta `n/d (humano)` em vez de fingir.
