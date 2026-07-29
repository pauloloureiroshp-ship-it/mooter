# BRIEF Y4 — o trabalho passa a saber de que departamento é

**O que já existe e o que falta.** O `board.js:41` já mapeia cada métrica ao seu
M-level (`DONOS`: MOO, MTO, MFO, MIO, MEO). Os sete cargos já existem como
skills em `skills/meo-*`. O `fleet.js` já grava cada `handoff` com quem passou
trabalho a quem, com que agente, que modelo, se foi local e o que se poupou.

**As métricas têm dono. O trabalho não.** O ledger sabe a wave, o agente e o
custo — não sabe de quem é o trabalho. Sem esse campo, qualquer frase sobre "o
que o MTO entregou" é inventada.

**Decisões tomadas, não reabrir:**
- o cargo é **declarado por quem dispara**, nunca inferido do texto (já pagámos
  hoje o preço de adivinhar uma dimensão a partir de palavras: a categoria
  passou meses a classificar rodapés de regras em vez de trabalho);
- o pulso por cargo aparece **quando uma wave fecha**;
- o veredicto interpretativo é escrito pelo **moo local**, marcado como opinião.

---

## S1 — `cargo` como dimensão de primeira classe

- `mooter_work` aceita `cargo` (`MOO` · `MTO` · `MFO` · `MIO` · `MRO` · `MCC` · `MEO`).
- Vai para o ledger no `dispatched`/`started`, e todos os eventos do job herdam.
- **Sem declaração ⇒ `cargo: null` com `porque`.** Nunca inferir, nunca omitir.
- Waves anteriores a esta onda ficam `n/d — anterior à instrumentação de cargos`.
  **Não reclassificar o passado.**
- Valida a lista: um cargo desconhecido é recusado com a lista dos válidos ao
  lado, não aceite em silêncio.

## S2 — `recibo.js`: o recibo por M-level

Uma função que projecta, a partir do ledger, **por cargo**:

| Campo | Como se mede |
|---|---|
| waves | waves distintas com aquele cargo |
| **entregas** | waves cujos jobs terminaram todos em `done` — **não** contagem de jobs |
| custo | soma de `cost_usd`, **declarada parcial** quando há jobs sem medição |
| trabalho a $0 | jobs `local:true` sobre o total, e tokens locais |
| passou trabalho a | dos `handoffs` já existentes: `from → to`, agente e o que se poupou |
| excepções | as do `board.js` cujo `DONOS` bate com este cargo |

Regras:

1. Um cargo **sem trabalho** aparece na mesma, com zero e o porquê — a ausência
   de trabalho num departamento é informação, não é nada.
2. Todo o número sem medição sai `n/d` **com o porquê colado**, nunca 0.
3. Âmbito por argumento: `sessao` (desde um instante), `dia`, `semana`. O mesmo
   gerador, três janelas — não três implementações.

## S3 — O pulso, quando a wave fecha

Quando todos os jobs de uma wave chegam a estado terminal, o `mooter_check`
passa a devolver um bloco `pulso` compacto para essa wave: cargo, agentes que
trabalharam, duração, custo, e quanto veio do moo a $0.

**Curto de propósito.** Duas ou três linhas. O detalhe vive no recibo; isto é
só para se saber, no momento, o que acabou de acontecer e a quem pertence.

## S4 — O veredicto do moo, marcado como opinião

`recibo.js` pede ao moo local (via o caminho que já existe para a preparação de
handoffs) **um parágrafo** que responda a uma só pergunta:

> **Que cargos é que o MEO pode ignorar hoje, e porquê?**

Requisitos que não se negoceiam:

- o veredicto vem num campo **próprio**, rotulado como interpretação, com os
  números sempre visíveis ao lado — nunca embebido nos factos;
- se o moo estiver em baixo, o recibo **entrega na mesma** e o campo fica
  `n/d — o moo não respondeu`. Um veredicto ausente não pode derrubar o recibo;
- o moo **não recebe** poder de alterar um número. Recebe os números já
  calculados e escreve texto sobre eles.

Este é o único sítio do produto onde uma opinião é bem-vinda — porque é a única
coisa que a aritmética não sabe fazer: dizer ao MEO **onde não olhar**.

## S5 — Testes

1. wave sem cargo declarado ⇒ `n/d` com porquê, e **não** um cargo adivinhado;
2. cargo inválido ⇒ recusado, com a lista dos válidos na mensagem;
3. entregas conta **waves fechadas**, não jobs: uma wave com 3 jobs `done` é 1 entrega;
4. um cargo sem trabalho nenhum aparece com zero e porquê, não desaparece;
5. custo com jobs sem medição sai declarado como parcial, com a contagem;
6. os handoffs aparecem como `from → to` com o agente e o que se poupou;
7. o moo em baixo ⇒ recibo completo com `veredicto: n/d`, e nenhum número afectado;
8. o histórico anterior a esta onda mantém-se `n/d` e **não** é reclassificado.

## Regras da casa

*(este bloco é exactamente o tipo de texto que NÃO pode decidir a categoria —
e desde a onda Y1 já não decide)*

- `git add` **selectivo**, ficheiro a ficheiro. Nunca `git add -A`. Sem push, sem PR.
- Não tocar em `tools/router/classify.js` (FROZEN) nem em `landing/app/page.tsx`.
- Português nos comentários, inglês nos identificadores.
- Nenhum número sem origem. Se não foi medido, é `n/d` **com o porquê**.
- Se um passo não puder ser feito com honestidade, **parar e escrever o porquê**.
