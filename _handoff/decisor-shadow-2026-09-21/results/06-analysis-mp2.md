# decisor-shadow — análise MP2 · 2026-09-21T10:15:42.736Z

Pré-registo: `protocol.json#mp2` (commit `14c205c5`). Candidato que conta para o gate: **D_v1** (vencedor da CV no treino, fixado antes dos 40). n = 40 (P1) + **57** (60b real; o pool deu 57 com tecto 10/sessão) = **97**, não 100.

| Braço | acc40 | acc60b (n=57) | **acc97** [IC95] | ECE97 | p50 ms | McNemar vs «T2 sempre» nos 97 (b/c, p) | McNemar vs regra nos 97 |
|---|---|---|---|---|---|---|---|
| regra classify.js (nokey) | 0.325 | 0.439 | **0.392** (38/97) [0.30–0.49] | n/d | 0.493 in-proc | 37/35, p=0.4531 | — |
| «T2 sempre» (referência pré-registada) | 0.450 | 0.316 | **0.371** (36/97) [0.28–0.47] | n/d | — | — | 35/37, p=0.6380 |
| «T3 sempre» (extra: maioritária nos 57) | 0.200 | 0.404 | **0.320** (31/97) [0.24–0.42] | n/d | — | 31/36, p=0.7681 | 21/28, p=0.8736 |
| juiz B qwen2.5-coder:14b (só 40) | 0.525 | n/d | n/d (só 40: 0.525) | n/d | 76 (40) | 14/11, p=0.3450 | 12/4, p=0.0384 |
| D v0 argmax | 0.600 | 0.614 | **0.608** (59/97) [0.51–0.70] | 0.095 | 147 | 43/20, p=0.0026 | 25/4, p=0.0001 |
| D v0+T (T=1,55) | 0.600 | 0.614 | **0.608** (59/97) [0.51–0.70] | 0.076 | 147 | 43/20, p=0.0026 | 25/4, p=0.0001 |
| D v1 λ=0.01 (vencedor CV) **← conta para o gate** | 0.550 | 0.544 | **0.546** (53/97) [0.45–0.64] | 0.190 | 147 | 38/21, p=0.0182 | 21/6, p=0.0030 |

Rótulos: 40 do P1 (Codex, cego, 2026-09-09) + 57 do 60b (Codex, cego, 2026-09-21T10:10:45.596Z); distribuição 60b **T3 23 · T0 16 · T2 18**. «T2 sempre» nos 97: 36/97 = 0.371; «T3 sempre»: 31/97 = 0.320.

## Gates do pré-registo, avaliados no vencedor da CV (D_v1) nos 97

| Gate | Alvo | Valor | |
|---|---|---|---|
| acc > «T2 sempre», McNemar unilateral | p < 0,05 | acc 0.546 vs 0.371; b/c 38/21, **p=0.0182** | ✅ |
| ECE (10 bins, n=97) | ≤ 0,10 | **0.190** | ❌ |
| p50 quente (4 perguntas) | ≤ 250 ms | **147 ms** | ✅ |
| egress (nettap no braço D, 60b) | 0 hosts externos | 2 ligações · hosts {"127.0.0.1:11434":2} · externos **0** · bytes out 551529 / in 261538 | ✅ |

Melhor braço D por acc97 (transparência, **não** é o que conta): D v0 argmax = 0.608 — **diferente do vencedor da CV; não se troca**.

## Sensibilidade — 1 prompt por sessão (a regra pré-registada, estrita): 40 + 13 = 53

| Braço | acc | McNemar vs «T2 sempre» |
|---|---|---|
| regra classify.js (nokey) | 0.302 (16/53) | 16/23, p=0.9002 |
| «T2 sempre» (referência pré-registada) | 0.434 (23/53) | — |
| D v0 argmax | 0.566 (30/53) | 19/12, p=0.1405 |
| D v0+T (T=1,55) | 0.566 (30/53) | 19/12, p=0.1405 |
| D v1 λ=0.01 (vencedor CV) | 0.509 (27/53) | 17/13, p=0.2923 |

## Confusão e previsões nos 97 (vencedor D_v1)

previsões {"T0":62,"T2":22,"T3":13} · confusão {"T2->T0":19,"T2->T2":15,"T0->T0":27,"T1->T0":3,"T3->T2":7,"T3->T3":11,"T3->T0":13,"T2->T3":2}
bins ECE: [["0.3",3,0.67,0.37],["0.4",12,0.42,0.46],["0.5",11,0.36,0.54],["0.6",15,0.4,0.66],["0.7",16,0.56,0.75],["0.8",27,0.56,0.85],["0.9",13,0.92,0.91]]

⚠️ Nada aqui é decisão: o adversário (codex, round 2) ataca esta tabela antes de qualquer PR.

VEREDICTO (06-analyse): ENTRE → F6 (Laya fine-tune nos 214 rotulados) OU mais rótulos
