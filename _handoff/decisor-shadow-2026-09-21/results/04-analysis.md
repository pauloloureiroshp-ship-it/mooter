# decisor-shadow — análise 2026-09-21T09:47:53.274Z

Protocolo: PRE-REGISTO — congelar em commit ANTES de correr qualquer braco (o P1 falhou isto; nao repetir)

> **Leia a régua antes da tabela.** Responder sempre `T2` acerta **18/40 = 0.450** nestes 40. O critério pré-registado `acc40_min_to_beat_rule = 0,35` é a **regra**, não a régua: um braço pode «bater a regra» e ainda assim saber menos do que uma constante. Só acima de 0.450 há sinal.

| Braço | Modelo | Corpus | acc | IC95 | ECE | p50 ms | abstém | McNemar > regra (b/c, p) | Gate |
|---|---|---|---|---|---|---|---|---|---|
| A regra | classify.js 427d8c0b | 40 reais | 0.35 | [0,22, 0,51] | n/d (conf fixa) | ~0,002 in-proc / 207 hook | 0 | — | referência |
| B juiz | qwen2.5-coder:14b | 40 reais | 0.525 | [0,38, 0,67] | n/d | n/d | 0 | — | referência |
| baseline constante | always_T2 (classe maioritária) | 40 reais (n=40) | 0.450 | [0,31, 0,60] | — | 0 | 0 | — | **régua honesta** |
| C-laya | convaiinnovations/laya | corpus-40-unredacted.json (n=40) | 0.400 | [0.26, 0.55] | 0.136 | 28 | 5 | 14/11, p=0.345 | ✅ >regra ❌ ECE ✅ p50 |
| C-laya | convaiinnovations/laya | gold-84 (n=84) | 0.238 | [0.16, 0.34] | 0.211 | 25 | 44 | 0/0, p=n/d | TREINO — não conta |
| C-laya | convaiinnovations/laya/typed-decisions | corpus-40-unredacted.json (n=40) | 0.225 | [0.12, 0.38] | 0.167 | 28 | 34 | 7/11, p=0.881 | ❌ ≤regra ❌ ECE ✅ p50 |
| C-laya | convaiinnovations/laya/typed-decisions | gold-84 (n=84) | 0.262 | [0.18, 0.36] | 0.167 | 31 | 75 | 0/0, p=n/d | TREINO — não conta |
| D-logit | qwen2.5-coder:14b | corpus-40-unredacted.json (n=40) | 0.600 | [0.45, 0.74] | 0.110 | 165 | 3 | 12/1, p=0.002 | ✅ >regra ❌ ECE ✅ p50 |
| D-logit | qwen2.5-coder:14b | gold-84 (TREINO da regra) (n=84) | 0.690 | [0.59, 0.78] | 0.160 | 165 | 0 | 0/0, p=n/d | TREINO — não conta |
| D-logit | qwen2.5:3b | corpus-40-unredacted.json (n=40) | 0.400 | [0.26, 0.55] | 0.462 | 97 | 0 | 10/7, p=0.315 | ✅ >regra ❌ ECE ✅ p50 |
| D-logit | qwen2.5:3b | gold-84 (TREINO da regra) (n=84) | 0.512 | [0.41, 0.62] | 0.317 | 95 | 1 | 0/0, p=n/d | TREINO — não conta |

McNemar é contra **A-nokey** (regra a 0,325), que é o braço com predições por item em `P1/results/A-nokey.json`; o 0,350 da coluna de referência é o A-key.

Baseline sha ok: true · ECE proxy do ledger: n/d — o campo `outcome` do ledger e `deferred` em 675 de 676; o 0,899 que sai mede o campo em falta, nao calibracao (690 executados, 14 linhas `null` ignoradas)

⚠️ Nada aqui é decisão: o adversário (codex) ataca esta tabela antes de qualquer PR em arbiter.js.
