# Replay de 50 — para o DONO rotular

Gerado em 2026-09-01T13:06:07.194Z por `tools/cockpit/runner/replay-sample.mjs`.
Zero geracao nova: sao achados que ja existiam no ledger, com contexto acrescentado.

## Como rotular

1. Abre `01-*.md` … `50-*.md` por ordem. Cada um tem um bloco `yaml` no fim.
2. Preenche `decisao` e (se descartares) `motivo`. Nao abras o `gabarito.json`.
3. So no fim: compara com o `gabarito.json` — as decisoes da primeira vez.

**As cegas de proposito.** A primeira vez estes achados foram julgados CRUS.
Estes vao enriquecidos, e a diferenca entre os dois julgamentos e exactamente
o que se quer medir. Ver o rotulo antigo mediria outra coisa: se concordas
contigo proprio.

## A amostra

Populacao: 1070 achados triados que ainda existem no ledger.
Amostra: 50. Estratificada por motivo, maiores restos (Hare).
Ordem determinística: sha256(semente | chave). Repetivel em qualquer maquina.

| estrato | na populacao | % | na amostra | % |
|---|---:|---:|---:|---:|
| `aceite` | 3 | 0.3% | 0 | 0.0% |
| `citacao-certa-conclusao-errada` | 2 | 0.2% | 0 | 0.0% |
| `instrumento-nao-discrimina` | 607 | 56.7% | 28 | 56.0% |
| `issue` | 1 | 0.1% | 0 | 0.0% |
| `nao-e-um-problema` | 11 | 1.0% | 1 | 2.0% |
| `trivial` | 446 | 41.7% | 21 | 42.0% |

A celula que o gate mede — `instrumento-nao-discrimina` — vale 56.7% na
populacao e 56.0% na amostra.

## O que esta amostra NAO pode dizer

- **Nao mede keep-rate.** Os aceites e os issues sao 4 em toda a populacao;
  a quota proporcional deles e menor do que meio item. Um keep-rate tirado
  daqui seria um numero sobre uma populacao errada.
- **Nao mede o instrumento contra si proprio.** Ela so vale depois de
  rotulada pelo dono. Ate la nao ha veredicto nenhum.
- **50 e uma amostra pequena.** Uma diferenca de 1 item vale 2 pontos
  percentuais. Comparar 56,7% com um numero destes exige dize-lo.
