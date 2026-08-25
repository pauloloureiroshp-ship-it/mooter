# BRIEF X4 — o selector precisa de um tecto de VRAM

**O facto medido, hoje (2026-07-27, 15:00):**

```
qwen3.6:35b-a3b   19,3 GB residente
GPU               22 384 / 23 028 MiB   →   644 MiB livres
headroom          "sem folga — menos de 2 GB de VRAM livre"
```

O selector escolheu um modelo que ocupa **84% da placa**. Não é um bug de
limpeza — descarregá-lo resolve por trinta minutos. É a função de pontuação a
maximizar capacidade sem nunca perguntar *"e depois disto, ainda cabe alguma
coisa?"*.

**A consequência é silenciosa e cara:** com 644 MB livres, o próximo pedido
local não cabe, cai para a nuvem, e **ninguém é avisado**. O produto inteiro
existe para dizer a verdade sobre para onde foi o trabalho; aqui a decisão de
gastar dinheiro é tomada por um efeito lateral da escolha anterior.

---

## S1 — O selector passa a conhecer o tecto

Em `packages/mooter-bridge/moo.js`, na função `pontuar()` (a que hoje faz
`novidade * 3 + log2(gb)` e o bónus de `coder`):

1. Ler a VRAM **total e livre** antes de escolher (o `gpu.js` já sabe fazê-lo —
   reutilizar, não duplicar).
2. Um modelo cujo tamanho ultrapasse **`RESERVA` de folga** deixa de ser
   elegível para carregamento novo. Sugestão de arranque: manter sempre livre o
   maior de **2 GB** ou **10% da placa** — mas o número tem de ficar num sítio
   com nome (`FOLGA_MINIMA_GB`) e com um comentário a explicar de onde veio,
   não espalhado por três `if`.
3. **Excepção honesta:** se o modelo já está residente e cabe, usá-lo é grátis —
   não o penalizar. A regra é sobre *carregar*, não sobre *usar*.
4. Se nenhum modelo couber dentro da folga, **não escolher às cegas o menor**:
   devolver a escolha com `porque` explícito («o maior modelo que cabe na folga
   é X; o preferido Y ficaria com apenas Z MB livres»).

## S2 — A decisão fica visível

O campo `modelo_porque` (que já existe e já explica geração/tamanho/coder)
passa a incluir a conta da VRAM quando ela influenciou a escolha. Exemplo do
tipo de frase, não literal:

> «escolhi o qwen2.5-coder:14b: o qwen3.6:35b-a3b era melhor mas deixaria
> 644 MB livres, abaixo da folga mínima de 2 GB»

Se a VRAM **não** influenciou, não acrescentar ruído nenhum à frase.

## S3 — O aviso que hoje não existe

Quando um pedido **cai para a nuvem por falta de VRAM**, isso tem de aparecer
como motivo próprio no ledger — não misturado com «forcado_por_quota» nem com
um genérico «nao_local». Reutilizar o vocabulário de `motivos_nao_local` que já
existe em `board.js`/`aprender.js`; acrescentar o motivo novo lá, não inventar
uma segunda taxonomia.

## S4 — Testes em `moo.test.js` (ou `vram.test.js` se for mais limpo)

Com VRAM injectada por fixture, **nunca lendo a GPU real** (senão o teste muda
de resultado conforme o que está carregado):

1. placa com 23 GB e 20 GB ocupados ⇒ um modelo de 8 GB **não** é elegível para carregar;
2. o mesmo modelo, se **já residente**, continua elegível — a regra é sobre carregar;
3. quando a VRAM manda, `modelo_porque` di-lo com o número real; quando não manda, a frase não fala de VRAM;
4. nenhum modelo cabe ⇒ resposta com `porque` legível, e **não** uma escolha silenciosa;
5. o motivo `nao_local` por VRAM é distinto de `forcado_por_quota` no ledger;
6. leitura da GPU indisponível ⇒ o selector degrada para o comportamento actual **com** ressalva, nunca bloqueia o trabalho.

## Regras da casa

- `git add` **selectivo**, ficheiro a ficheiro. Nunca `git add -A`. Sem push, sem PR.
- Não tocar em `tools/router/classify.js` (FROZEN) nem em `landing/app/page.tsx`.
- Português nos comentários, inglês nos identificadores.
- **Nenhum número mágico sem nome e sem porquê.** Se não foi medido, é `n/d`.
- Se um passo não puder ser feito com honestidade, **parar e escrever o porquê**.
