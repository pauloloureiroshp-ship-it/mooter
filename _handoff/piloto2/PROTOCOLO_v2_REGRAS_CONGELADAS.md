# Piloto nº2 — regras congeladas ANTES de existir protocolo

**Data:** 2026-08-07 · **Estado:** 🔒 estas regras entram congeladas; o resto do protocolo escreve-se por cima delas, nunca contra elas.

## R1 — X=40 · N=40 NÃO se ajustam

> **A régua que chumbou o B é a que tem de aprovar o B′.**
> — Paulo, 2026-08-07, depois de o piloto nº1 falhar (b) 43,7% > 40% e (c) 100% > 40%.

O pré-commitment do piloto nº1 (`_handoff/PILOTO_CONVICCAO_2026-08-06.md` §0, congelado em
`0737767c714956bb7912a708b126f77f230bb4ed`) fixou **X=40** (custo-proxy de B ≤ 40% de A) e
**N=40** (≤ 40% dos tokens de B em T3). O piloto correu e **falhou os dois**.

**Nenhum dos dois número se move no nº2.** Nem para cima, nem "recalibrado", nem "ajustado ao
que aprendemos". Um limiar que se afrouxa depois de o vermos falhar deixa de ser um limiar e
passa a ser uma descrição do resultado.

Isto vale mesmo que — sobretudo se — o braço **B′** (Mooter + cascata) ficar perto de passar.
Ficar perto não é passar. Se o B′ falhar por 1 ponto percentual, o registo diz que falhou por
1 ponto percentual.

**O que PODE mudar no nº2** (e tem de ser declarado antes de correr): as tarefas, o corpus, o
número de execuções, os juízes, e a introdução do braço B′. **O que NÃO pode:** X, N, e a regra
de que amplitudes sobrepostas são INCONCLUSIVO e não empate.

## R2 — o resultado do nº1 é o baseline, não o esquecimento

O nº2 mede o **delta da cascata**: B′ (Mooter+cascata) vs **B (Mooter pré-cascata, os números de
hoje)** vs A vs C. O B de hoje não se re-corre para "dar outra hipótese": está medido, está no
`resultado.md` e no vault (`50-lab/piloto-ab-2026-08-07/`), e é contra ele que o B′ se compara.

Números do nº1 a bater (T1, n=3 por braço, `base_sha e8f9b25c`):

| braço | mediana | custo-proxy | T3 |
|---|---|---|---|
| A TECTO (fable-5) | 6,64 | 8,94 | 0% |
| **B MOOTER** | **6,66** | **3,91** | **100%** |
| C ESTATICO (sonnet-5) | 7,40 | 1,87 | 0% |

## R3 — accuracy nunca sem baseline nem sem recall da classe minoritária

Herdada do VERIFICADOR-0 (`_handoff/verificador-0/VEREDICTO.md`): qualquer número de acerto vai
acompanhado do baseline do acaso e do recall na classe minoritária. Um verificador que responde
sempre "S" fez 78,8% de accuracy com 0% de recall nas falhas — e teria passado por "quase bom".

## R4 — a sonda de proveniência declara sempre o acaso ao lado

No nº1: 45,5% (10/22) contra acaso de 33,3%, com n=22 — dentro do ruído, a cegueira aguentou.
Sem o "33,3%" ao lado, "45,5%" lê-se como painel comprometido.
