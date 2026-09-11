# MATRIZ 12 — tabelas

Gerado por `agregar.mjs`. Nenhuma celula e escrita a mao.

## SMOKE-1

Rota do Mooter: **T0** -> qwen2.5-coder:14b · porque: trivial_local / risco minimal / confianca 0.8 · classify 125.1 ms

| braco | J1 | J2 | J3 | tok in | tok out | cache w/r | custo resposta $ | custo faturado $ | s |
|---|---|---|---|---|---|---|---|---|---|
| A · Opus 5 | 10/10 | 10/10 | n/d | 2 | 127 | 3719/0 | 0.0032 | 0.0264 | 5.9 |
| B · Mooter | 7/10 | 6/10 | n/d | 109 | 8 | 0/0 | 0.0000 | 0.0000 | 0.6 |
| B2 · Mooter T0=qwen3:30b | 5/10 | 6/10 | n/d | 111 | 654 | 0/0 | 0.0000 | 0.0000 | 19.3 |
| C · Haiku 4.5 | 10/10 | 10/10 | n/d | 10 | 208 | 6624/0 | 0.0010 | 0.0093 | 5.4 |
| D · Codex (agente) | 10/10 | 10/10 | n/d | 27145 | 19 | 0/0 | 0.0000 | 0.0000 | 7.4 |

## SMOKE-2 · [RISCO]

Rota do Mooter: **T3** -> claude-opus-5 · porque: architecture_or_critical / risco high / confianca 0.75 · classify 95.4 ms

| braco | J1 | J2 | J3 | tok in | tok out | cache w/r | custo resposta $ | custo faturado $ | s |
|---|---|---|---|---|---|---|---|---|---|
| A · Opus 5 | 6/12 | 12/12 | n/d | 2 | 2488 | 3816/0 | 0.0622 | 0.0861 | 41.7 |
| B · Mooter | 9/12 | 11/12 | n/d | 2 | 2997 | 3812/0 | 0.0749 | 0.0988 | 50.8 |
| B2 · Mooter T0=qwen3:30b | n/d | n/d | n/d | n/d | n/d | n/d | n/d | n/d | n/d |
| C · Haiku 4.5 | 8/12 | 7/12 | n/d | 10 | 700 | 6686/0 | 0.0035 | 0.0119 | 11.8 |
| D · Codex (agente) | 9/12 | 8/12 | n/d | 27145 | 231 | 0/0 | 0.0000 | 0.0000 | 12.9 |

## Agregado

Pontos = media de J1 e J2 (o J3 entra quando a folha voltar). Um braco que
nao corre num prompt nao soma maximo nesse prompt — as colunas nao sao
comparaveis sem olhar para `n`.

| braco | n | pontos | maximo | custo resposta $ | custo faturado $ | pontos por $ (faturado) | tempo total s |
|---|---|---|---|---|---|---|---|
| A · Opus 5 | 2 | 19.0 | 22 | 0.0654 | 0.1125 | 169 | 47.5 |
| B · Mooter | 2 | 16.5 | 22 | 0.0749 | 0.0988 | 167 | 51.5 |
| B2 · Mooter T0=qwen3:30b | 1 | 5.5 | 10 | 0.0000 | 0.0000 | sem divisao: $0 de fornecedor | 19.3 |
| C · Haiku 4.5 | 2 | 17.5 | 22 | 0.0046 | 0.0212 | 826 | 17.2 |
| D · Codex (agente) | 2 | 18.5 | 22 | 0.0000 | 0.0000 | n/d (1 resposta(s) sem preco de lista) | 20.3 |

## Controlo de ruido (A vs B nos T3 — mesmo modelo, mesma configuracao)

| prompt | juiz | A | B | diferenca |
|---|---|---|---|---|
| SMOKE-2 | J1 | 6 | 9 | 3 |
| SMOKE-2 | J2 | 12 | 11 | 1 |

Diferenca **maxima** entre dois bracos que correm o mesmo motor: **3 ponto(s)**; media 2.0 em 2 par(es).
Uma vantagem de ate esse tamanho, em qualquer linha acima, nao se distingue de ruido.

