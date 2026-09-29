# @mooter/m1-proxy — v0

Esqueleto do proxy loopback do M1. **Desligado por omissão.**

Decisão: `~/paulo-vault/20-decisions/2026-08-25-adr-m1-hook-para-proxy.md`
(«DECISÃO: B · 2026-08-25 · Paulo»). Desenho e refutação pendente:
`~/paulo-vault/_handoff/design-m1-v0.md`.

## Ligar (e só o dono liga)

```sh
MOOTER_M1_PROXY=1 node -e "import('./proxy.mjs').then(m => m.criarProxy().then(s => s.escutar()))"
```

Sem a variável, `criarProxy()` **recusa-se a construir** e não abre socket nenhum.

## O que o v0 faz, e o que não faz

| Faz | Não faz |
|---|---|
| escuta em `127.0.0.1` e só aí | **nunca** `0.0.0.0` |
| `GET /v1/models` — os modelos locais | não inventa modelos que o Ollama não declare |
| `POST /v1/chat/completions` — classifica e serve pelo local | **não tem degrau de nuvem** (v1) |
| recibo append-only por chamada | **nunca** grava o conteúdo do prompt |
| chama `classify.js` (FROZEN) | não o modifica, não o reimplementa |

Um pedido que o local não sirva é **recusado com o motivo** (`501`), nunca
escalado em silêncio.

## Contagens

O v0 publica **duas**, e a distinção não é cosmética: a obediência do hook
(0,23%, 7/3026) e a obediência da porta têm denominadores diferentes e não se
misturam. Ver `§1` do desenho.

## Testes

```sh
cd packages/m1-proxy && npm test
```
