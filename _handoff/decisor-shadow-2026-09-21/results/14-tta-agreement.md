# decisor-shadow — MP7 (ii) · concordância das 4 rotações TTA como confiança · 2026-09-21T14:40:30.847Z

Pré-registo: `protocol.json#mp7.part_ii_tta_agreement` (`_registered_at` 2026-09-21T14:25:30.415Z). Ficheiros TTA do MP6 (gravados 2026-09-21T13:44Z), sem correr modelo, sem ajuste. `votos` = rotações cujo argmax coincide com o argmax da média; `p_agree` = votos/4. Exploração = 40 e 57; 60c só reportado.

| corpus | nível | n | acc [IC95] | p_agree | p_max médio (média TTA) | acc do v0 (rotação 0) nos mesmos itens |
|---|---|---|---|---|---|---|
| 40 | 4/4 | 26 | 0.577 [0.39–0.74] | 1.00 | 0.80 | 0.577 |
| 40 | 3/4 | 7 | 0.571 [0.25–0.84] | 0.75 | 0.47 | 0.714 |
| 40 | 2/4 | 6 | 0.500 [0.19–0.81] | 0.50 | 0.43 | 0.667 |
| 40 | 0/4 | 1 | 0.000 [0.00–0.79] | 0.00 | 0.30 | 1.000 |
| 40 | **ECE** | 40 | acc TTA 0.550 | **ECE(p_agree) 0.306** | ECE(p_max TTA) 0.187 · ECE(v0) 0.110 | monotonia 4/4>3/4>2/4 (n≥5): ✅ (0.58 > 0.57 > 0.50) · voto modal ≠ argmax da média: 1 · rotação 0 == ficheiro v0: tier 38/40, p_max 0/40 |
| 57 | 4/4 | 42 | 0.690 [0.54–0.81] | 1.00 | 0.78 | 0.690 |
| 57 | 3/4 | 7 | 0.286 [0.08–0.64] | 0.75 | 0.50 | 0.286 |
| 57 | 2/4 | 8 | 0.625 [0.31–0.86] | 0.50 | 0.42 | 0.500 |
| 57 | **ECE** | 57 | acc TTA 0.632 | **ECE(p_agree) 0.303** | ECE(p_max TTA) 0.196 · ECE(v0) 0.124 | monotonia 4/4>3/4>2/4 (n≥5): ❌ (0.69 > 0.29 > 0.63) · voto modal ≠ argmax da média: 0 · rotação 0 == ficheiro v0: tier 55/57, p_max 0/57 |
| 60c | 4/4 | 24 | 0.708 [0.51–0.85] | 1.00 | 0.80 | 0.708 |
| 60c | 3/4 | 5 | 0.600 [0.23–0.88] | 0.75 | 0.48 | 0.400 |
| 60c | 2/4 | 6 | 0.833 [0.44–0.97] | 0.50 | 0.40 | 0.500 |
| 60c | 1/4 | 2 | 0.500 [0.09–0.91] | 0.25 | 0.33 | 0.500 |
| 60c | **ECE** | 37 | acc TTA 0.703 | **ECE(p_agree) 0.277** | ECE(p_max TTA) 0.221 · ECE(v0) 0.146 | monotonia 4/4>3/4>2/4 (n≥5): ❌ (0.71 > 0.60 > 0.83) · voto modal ≠ argmax da média: 2 · rotação 0 == ficheiro v0: tier 37/37, p_max 36/37 |

## Veredicto (regra pré-registada, 40 e 57): **REFUTADA**

- monotonia em ambos: não · ECE(p_agree) < ECE(p_max TTA) em ambos: não (40: 0.306 vs 0.187; 57: 0.303 vs 0.196). Contra o v0 (só informativo): 40 0.306 vs 0.110; 57 0.303 vs 0.124.
- 60c (só reportado): ECE(p_agree) 0.277 · ECE(p_max TTA) 0.221 · ECE(v0) 0.146 · monotonia ❌.

Nada disto entra no mp4 (mp7.part_ii.not_a_gate).
