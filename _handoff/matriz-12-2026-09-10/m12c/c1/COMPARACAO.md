# M12-c1 — a chave presente, o arbiter desligado: o T1 passa a existir

Pré-registo: `m12c/c1/protocol.json` (2026-09-12T01:00:06.612Z). Gerado por `m12c.mjs comparar --variante=c1`.

| prompt | máx | rota principal | **rota m12c** | arbiter | B | **B(m12c)** | Δ | custo B → m12c $ |
|---|---|---|---|---|---|---|---|---|
| DATA-1 | 10 | T0 qwen2.5-coder:14b | **T0** qwen2.5-coder:14b | não correu (nenhuma linha ARBITER no hint) | 4.0 | **4.0** (=) | +0.0 | 0.0000 → 0.0000 |
| LEGAL-1 | 10 | T0 qwen2.5-coder:14b | **T1** claude-haiku-4-5-20251001 | não correu (nenhuma linha ARBITER no hint) | 3.0 | **6.5** | +3.5 | 0.0000 → 0.0117 |
| MKT-2 | 10 | T0 qwen2.5-coder:14b | **T0** qwen2.5-coder:14b | não correu (nenhuma linha ARBITER no hint) | 4.5 | **4.5** (=) | +0.0 | 0.0000 → 0.0000 |
| LEGAL-3 | 10 | T0 qwen2.5-coder:14b | **T1** claude-haiku-4-5-20251001 | não correu (nenhuma linha ARBITER no hint) | 2.5 | **7.0** | +4.5 | 0.0000 → 0.0177 |
| MKT-3 | 10 | T0 qwen2.5-coder:14b | **T0** qwen2.5-coder:14b | não correu (nenhuma linha ARBITER no hint) | 5.5 | **5.5** (=) | +0.0 | 0.0000 → 0.0000 |
| DEV-2 | 10 | T0 qwen2.5-coder:14b | **T1** claude-haiku-4-5-20251001 | não correu (nenhuma linha ARBITER no hint) | 5.0 | **8.0** | +3.0 | 0.0000 → 0.0119 |
| DATA-4 | 12 | T3  | **T3** claude-opus-5 | não correu (nenhuma linha ARBITER no hint) | 10.0 | **10.0** (=) | +0.0 | 0.0547 → 0.0547 |
| OPS-4 | 12 | T3  | **T3** claude-opus-5 | não correu (nenhuma linha ARBITER no hint) | 10.0 | **10.0** (=) | +0.0 | 0.1073 → 0.1073 |
| OPS-3 | 12 | T0 qwen2.5-coder:14b | **T0** qwen2.5-coder:14b | não correu (nenhuma linha ARBITER no hint) | 5.0 | **5.0** (=) | +0.0 | 0.0000 → 0.0000 |
| P5 | 12 | T0 qwen2.5-coder:14b | **T0** qwen2.5-coder:14b | não correu (nenhuma linha ARBITER no hint) | 4.0 | **4.0** (=) | +0.0 | 0.0000 → 0.0000 |
| MKT-4 | 10 | T0 qwen2.5-coder:14b | **T1** claude-haiku-4-5-20251001 | não correu (nenhuma linha ARBITER no hint) | 1.0 | **5.0** | +4.0 | 0.0000 → 0.0175 |
| DATA-3 | 10 | T0 qwen2.5-coder:14b | **T0** qwen2.5-coder:14b | não correu (nenhuma linha ARBITER no hint) | 2.0 | **2.0** (=) | +0.0 | 0.0000 → 0.0000 |
| **total** | 128 | | | 0 correu · 0 refused | 56.5 | **71.5** | +15.0 | 0.1620 → 0.2209 |

Rotas que mudaram: **4** de 12 · subiram de degrau: **4** · prompts no gatilho do arbiter: 7 · arbiter correu em: 0.
Referência (mesmos juízes, mesma ronda): C 80.5 · A 100.5.

## Previsões pré-registadas (c1)

| previsão | registado | resultado |
|---|---|---|
| exactamente LEGAL-1, LEGAL-3, DEV-2, MKT-4 sobem para T1; os outros 8 não mudam | SIM | SIM (DEV-2, LEGAL-1, LEGAL-3, MKT-4; mudaram 4) |
| nenhuma linha ARBITER no hint | SIM | SIM |
| B(c1) > B | SIM | SIM (71.5 vs 56.5) |
| B(c1) ≥ C | NÃO | NÃO (71.5 vs 80.5) |
| custo B(c1) > custo C (0,1527) | SIM | SIM (0.2209) |
| paragem: B(c1) ≥ A (100.5) | — | não disparou |

## Adenda à mão (2026-09-13, depois do portão de pré-push) — não gerada pelo `comparar`

- 6.ª previsão do `protocol.json` («nos 4 que sobem, B(c1) fica a ≤ 2 pontos de C»): **SIM** —
  0, 0, −0,5, −0,5 (J1+J2, C re-julgado na mesma ronda).
- Proveniência: as 12 rotas vieram da `.classify-cache.json` do sandbox (`cache_hit:true` nas 12
  linhas de `sandbox/.claude/tools/router/decisions.log`), escrita pela ronda inválida. Re-derivadas
  a $0 com `classify.js` directo: as mesmas 4 sobem, as mesmas 8 ficam. «Nenhuma linha ARBITER» é
  verdade por cache hit (`inject_context.js:928`), não pelo kill-switch. Ver `verdict.md` §M12-c.
