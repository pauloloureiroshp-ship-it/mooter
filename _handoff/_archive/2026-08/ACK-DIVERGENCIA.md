# ACK — divergência da wave `egress-parar-heartbeat`

Data: 2026-08-18

O BLOCO ACK foi executado antes de qualquer alteração em `packages/slack-spike/`.

## ACK-1

```text
v24.14.0
```

Resultado esperado satisfeito: Node >= 22.

## ACK-2

```text
true [
  'CANARY_PRIVATE_WAVE',
  'CANARY_PRIVATE_AUTHOR',
  'CANARY_PRIVATE_HASH',
  'CANARY_PRIVATE',
  'CANARY_PRIVATE_HASH',
  'CANARY_PRIVA',
  'CANARY_PRIVATE'
]
```

Resultado esperado satisfeito: `publicado=true` e sete ocorrências de canários.

## ACK-3

```text
botao_parar: false
heartbeat: "campo(s) fora da allowlist de publicacao: passos, segundos — so saem campos derivados, nunca conteudo"
```

Resultado esperado satisfeito.

## ACK-4

```text
estadoDoJob: function
JOB_ID_VALIDO: /^(?!\.+$)[A-Za-z0-9._-]+$/
true 64
```

Resultado esperado satisfeito.

## ACK-5 — DIVERGÊNCIA

Comando executado em `packages/slack-spike/`: `node --test`.

```text
at runTestFile (node:internal/test_runner/runner:497:32)
at node:internal/test_runner/runner:809:25
at node:internal/per_context/primordials:561:37
at new Promise (<anonymous>) {
  errno: -4048,
  code: 'EPERM',
  syscall: 'spawn'
}
```

O processo terminou com código 1. Não houve contagem `# tests 251`, `# pass 251`, `# fail 0`; a linha de base não pôde ser confirmada porque o test runner não conseguiu criar o processo filho.

## Decisão fail-closed

Implementação parada conforme a secção 0 do masterprompt. Nenhum ficheiro em `packages/slack-spike/` foi alterado.
