# pré-visualização do gate F2 (mp4-3, v2 pós-round 7) nos corpora já rotulados · 2026-09-21T15:04:36.006Z

Implementação única `16-gate-f2.mjs#gateF2`. Política composta: v0 argmax + abstenção (<0,4) → T2 + guardrail HIGH_RISK (`HIGH_RISK_HINT` de produção, sha12 `652823a99712`). Regra por item = A-*.json run 1 (`risk_level` da regra reportado ao lado do hint). **Informativo — não é o 60d.**

| corpus | n | acc raw / +abst / +guard | vs regra (acc, b/c, p) | vs constantes (best, p do best; todas?) | sub-rota D vs regra | HIGH_RISK hint/classify · cru · guard · pós | p50 | ECE raw | TODOS |
|---|---|---|---|---|---|---|---|---|---|
| 40 | 40 | 0.600 / 0.650 / 0.625 | 0.325, 13/1, p=0.0009 ✅ | T2 0.450, p=0.1148; ❌ | 7/26 vs 23/26 ✅ | 4/3 (fonte: text_fallback 40) · cru 1 · guard 1 · pós 0 ✅ | 165 ✅ | 0.110 | não |
| 57 | 57 | 0.614 / 0.596 / 0.579 | 0.439, 12/4, p=0.0384 ✅ | T3 0.404, p=0.0607; ❌ | 15/41 vs 29/41 ✅ | 4/11 (fonte: text_fallback 57) · cru 1 · guard 1 · pós 0 ✅ | 140 ✅ | 0.124 | não |
| 60c | 37 | 0.622 / 0.595 / 0.568 | 0.324, 9/0, p=0.0020 ✅ | T3 0.324, p=0.0466; ✅ | 3/21 vs 15/21 ✅ | 6/4 (fonte: text_fallback 37) · cru 2 · guard 2 · pós 0 ✅ | 162 ✅ | 0.146 | **PASSA** |

`+abst` = abstenção→T2; `+guard` = e guardrail HIGH_RISK (a política que conta). «vs constantes» exige superioridade (McNemar unilateral p<0,05) contra CADA uma das 4; imprime-se a mais forte. Sub-rota = expected∈{T2,T3} → routed T0. HIGH_RISK: n pelo hint de produção / n pelo `risk_level` da regra; «cru» = tier_D abaixo da regra; «pós» tem de ser 0 (invariante do sistema).
