# DESIGN.md — o spec canónico do Mooter

> Funde `landing/public/brand-guide.html` (9 secções) e `_handoff/…/handoff/SPEC.md`.
> Onde os dois discordam, a divergência está **declarada**, não resolvida em silêncio.
> Régua: valor medido traz fonte; valor não medido é `n/d` e nunca é zero.

## 1 · A tese visual

O Mooter é um router determinista. A marca tem de dizer isso antes de o texto o dizer:
**precisão, contenção, e um número que carrega a própria proveniência.**

Três consequências práticas:
1. **Um acento só.** O rosa `#E8888A` vem do focinho da vaca. Verde é reservado a sinal positivo
   genuíno — nunca um zero, nunca uma estimativa.
2. **Confiança mostra-se no que se remove.** (brand-guide §05) Uma ideia por ecrã. Se o conteúdo
   se explica sozinho, o parágrafo de introdução não existe.
3. **A honestidade é um componente, não uma política.** Ver §6.

## 2 · Cor

Fonte única: `tokens/moo-tokens.json`. Dois temas com os **mesmos nomes**: `tinta` (o site) e
`papel` (o shell autenticado e o cockpit). Nunca o mesmo nome com valores diferentes no mesmo tema.

Fundo `#0B0A09`, nunca `#000`. Texto `#F2EDE6`, nunca `#FFF`.

⚠️ **Duas colisões conhecidas, por resolver ao gerar:** `#E8888A` é `--accent` em tinta e
`--accent-soft` em papel; `#D4C090` carrega quatro papéis (aviso · externo · T2-terminal ·
divergência). Estão declaradas em `moo-tokens.json`.

⚠️ **Cinco pares abaixo de AA**, com a correcção já calculada em
`contraste.correccoes_propostas` — não aplicada, porque são valores de produção.

## 3 · Tipografia

**Space Grotesk** para o que se lê. **JetBrains Mono** para o que se mede. **Caveat** só para
anotação esparsa. Nunca ao contrário: um número em sans é um número sem régua.

Escala completa em `type.scale`. Corpo mínimo **13px**.

⚠️ Três divergências `globals.css` × `SPEC.md` — H1, corpo e tracking do eyebrow. O activo é o
`globals.css` (é o que está no ar). Declaradas em `$meta.divergencias_por_decidir`.

## 4 · A marca

Um só desenho: `brand/mooter-mark.svg`. Execução **A**, cinza-aço, decidida a 2026-08-27.
A silhueta é **intocável** — onze paths, coordenada a coordenada.

O que a execução acrescenta, e só isso: uma fonte de luz a 135°; oclusão em duas junções
(chifre↘cabeça, cabeça↘focinho); um especular a 20% no focinho; narinas côncavas; brilho a
`r 0.55` às 11 h com luz de retorno a 20%.

**Escada de redução** — cada tamanho perde exactamente uma coisa:
`512–96` tudo · `64` sem luz de retorno nem oclusão de chifres · `32` chapados · `16` duas formas.

**Assinatura** — altura da marca = 1,53 × o corpo do wordmark; intervalo = 0,385 × a altura da
marca. Área de respeito: meia altura de marca dos quatro lados.

⚠️ **Achado medido:** a marca é assimétrica. A orelha direita está inteiramente atrás da cabeça e
**não pinta um único pixel**; a esquerda assoma 4 unidades. Chifres divergem 0,30. Não corrigido
por decisão — fica escrito.

## 5 · Movimento

Só `transform` e `opacity`. `prefers-reduced-motion` obrigatório em qualquer ficheiro com animação.
Seis estados em `motion`, incluindo **`morto`**: quando o beacon passa o tecto, a marca perde a cor
**e pára de respirar**. É a regra `dead → grayscale` do `moo-pilot-shell` aplicada ao símbolo.

## 6 · Número honesto — o componente que carrega a régua

Quatro variantes: `medido` · `n/d` · `externo` · `regua`. Todas exigem **`fonte`** e **`janela`**
como propriedades. Um número sem proveniência não deve compilar.

As seis regras (SPEC §5) e os claims banidos estão em `numero` no JSON. A régua de preço de
tabela **nunca** é apresentada como poupança — decisão de 2026-08-24.

## 7 · O portão

`tools/moo-design-check.mjs`. Sete verificações, pesos que somam 10, **Índice de Coerência Visual**.
Não medido conta `n/d`, nunca zero — não medido não é falha, é ignorância declarada.

| # | verificação | peso |
|---|---|---|
| 1 | Fonte única de tokens | 2,0 |
| 2 | Marca única | 1,5 |
| 3 | Número honesto | 2,0 |
| 4 | Gerar, nunca copiar | 1,5 |
| 5 | Movimento seguro | 1,0 |
| 6 | Contraste AA | 1,5 |
| 7 | Superfícies vivas | 0,5 |

O índice publica-se no beacon como oitava linha do Índice do Harness. **Um design system que não se
pontua a si próprio é uma intenção com opiniões.**
