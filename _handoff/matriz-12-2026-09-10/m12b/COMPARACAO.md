# M12-b — uma variável: a linha das 3 frases

Pré-registo: `m12b/protocol.json` (2026-09-11T22:45:40.184Z). Gerado por `m12b.mjs comparar`; nenhuma célula à mão.

| prompt | máx | B (3 frases) | **B (m12b)** | Δ B | tokens B → m12b | C (ronda 1 → 2) | A (1 → 2) | D (1 → 2) |
|---|---|---|---|---|---|---|---|---|
| DATA-1 | 10 | 4.0 | **1.0** | -3.0 | 81 → 2048 (truncou) | 5.0 → 5.0 | 8.0 → 8.5 | 9.5 → 9.5 |
| LEGAL-1 | 10 | 3.0 | **4.0** | +1.0 | 45 → 96 | 6.0 → 6.0 | 7.5 → 7.5 | 8.5 → 8.0 |
| MKT-2 | 10 | 4.5 | **4.0** | -0.5 | 107 → 120 | 7.0 → 7.0 | 7.5 → 7.0 | 8.0 → 8.0 |
| LEGAL-3 | 10 | 2.5 | **4.5** | +2.0 | 280 → 637 | 6.5 → 6.0 | 8.0 → 7.5 | 9.5 → 10.0 |
| MKT-3 | 10 | 5.5 | **5.0** | -0.5 | 150 → 402 | 5.5 → 6.5 | 6.5 → 7.0 | 9.5 → 9.5 |
| DEV-2 | 10 | 5.0 | **5.0** | +0.0 | 79 → 266 | 8.0 → 8.0 | 8.5 → 8.0 | 9.5 → 9.5 |
| OPS-3 | 12 | 5.0 | **0.0** | -5.0 | 60 → 130 | 11.5 → 11.5 | 11.0 → 10.5 | 11.0 → 12.0 |
| P5 | 12 | 4.0 | **8.0** | +4.0 | 23 → 40 | 6.5 → 7.0 | 9.5 → 10.0 | 8.5 → 7.5 |
| MKT-4 | 10 | 1.0 | **5.0** | +4.0 | 251 → 465 | 5.5 → 5.5 | 7.5 → 7.5 | 9.0 → 9.5 |
| DATA-3 | 10 | 2.0 | **1.5** | -0.5 | 84 → 508 | 4.0 → 5.0 | 7.5 → 8.5 | 9.5 → 10.0 |
| **total** | 104 | 36.5 | **38.0** | +1.5 | | 65.5 → 67.5 | 81.5 → 82.0 | 92.5 → 93.5 |

## Ruído do juiz, medido de borla

A, C e D têm o MESMO texto nas duas rondas; só o vizinho B mudou. Diferença por (resposta, juiz): **máx 2**, média 0.42, em 60 pares.

## Previsões pré-registadas

| previsão | registado | resultado |
|---|---|---|
| B(m12b) > B | SIM | SIM (38.0 vs 36.5) |
| B(m12b) ≥ C | NÃO | NÃO (38.0 vs C ronda 2 67.5) |
| recupera ≥ metade de B→C (≥ 51.0) | não sei | NÃO |
| paragem: B(m12b) ≥ A (81.5) | — | não disparou |

## B2 na segunda ronda

O B2 (qwen3:30b, texto idêntico nas duas rondas) também foi re-pontuado: **33.5 → 32** em 10 prompts. Mais um braço que não mudou e se deslocou — na mesma ordem de grandeza do +1,5 do B.
