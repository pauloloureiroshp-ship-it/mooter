# P2 · Adversário (motor diferente) e resposta

**Adversário:** Codex CLI 0.153.4 (`gpt-6-astra`), read-only, prompt em `adversary-prompt-sent.txt`. Relatório integral: `adversary-codex-round1.md` (18 ataques). Veredicto do adversário: **SLIDE PUBLISHABLE WITH THESE EDITS**. Autor: Claude (Fable 5.1).

| # | Sev. | Ataque | Resposta | Mudou |
|---|---|---|---|---|
| A01 | fatal | Cronologia impossível (`_written_at` 13:40 > congelamento 13:07) | **Aceite.** Timestamp escrito à mão, errado. Ordem real por mtimes e transcript: holdout → revisão Codex → protocolo → corridas. O ficheiro não se toca (sha congelado); errata em `AMENDMENT-1.md`. Regra nova: nunca timestamps à mão. | Errata escrita. |
| A02 | fatal | v1 atingiu a regra de paragem e foi repetida sem emenda | **Aceite.** `AMENDMENT-1.md` declara a v1 como falha de instrumento (shim + hooks), o que mudou (só o instrumento) e que a v2 é a corrida válida. O P2 passa a «com uma emenda». | Emenda escrita; v2 do veredicto. |
| A03 | serious | «Holdout» não é replicação independente | Aceite: passa a «10 casos novos escritos pelo autor, revistos por Codex»; declarado que foram escritos depois de conhecer o dev. | Reformulado. |
| A04 | serious | Escada não calibrada; tecto | Aceite; declarado. | Reformulado. |
| A05 | fatal | Só T0/T1 → política binária, não «tier» | **Aceite.** «Política binária local/Haiku». | Título e tabela. |
| A06 | serious | B é reconstruído, não executado | **Aceite.** Declarado em cada menção a B. | Reformulado. |
| A07 | serious | Condições não comparáveis (temp 0,2 vs 0; 256 vs 5 435 tokens; contexto) | Aceite; declarado como comparação de sistemas completos. | Declarado. |
| A08 | fatal | McNemar não prova selecção | **Aceite.** «Testa aceitação emparelhada»; sinal descritivo 11/13 vs 2/7 impresso à parte. | Reformulado. |
| A09 | serious | Nomes dos campos do McNemar contradizem os braços | **Aceite.** `run.mjs` passa a exportar `B_tier_wins`, `A_local_wins`, `p_B_tier_gt_A_local` etc. | Código + análise regenerada. |
| A10 | serious | Confirmação não é limpa (dev conhecido, família, multiplicidade) | Aceite; resultados classificados como descritivos/exploratórios; os 10 novos são o número «menos sujo», não «limpo». | Reformulado. |
| A11 | serious | B vs C não mostra equivalência | Aceite. | Reformulado. |
| A12 | minor | Wilson não incorpora selecção/dependência | Declarado. | — |
| A13 | serious | «Poupa 7 chamadas» como poupança | Aceite: 35 % das chamadas, **8,8 % dos tokens de saída**; sem palavra «poupança». | Reformulado. |
| A14 | serious | «API US$ 0» não caracteriza custo | Aceite: «recursos», «desembolso incremental», «estimativa de lista do CLI, não factura», capacidade/hardware não contabilizados. | Reformulado. |
| A15 | serious | «Sem chave → 7/20» é composição offline | Aceite; declarado. | Reformulado. |
| A16 | serious | L4-b é erro de tipo | Aceite: «erro de tipo, não de lógica»; o prompt pede strings; a métrica exacta fica. | Declarado. |
| A17 | serious | L4-d precedência ambígua | Anotado; o oráculo segue a leitura «(admin ou editor) E …» e o Codex derivou o mesmo; sensibilidade não medida. | Declarado. |
| A18 | serious | Headline categórica; referências a P1/P3 | Headline substituída pela frase descritiva sugerida pelo adversário; referências cruzadas mantidas apenas no rodapé, como ponteiros. | Reformulado. |

**Sobrevive:** 7/20, 17/20, 19/20; 10 a 0; 11/13; 7 chamadas evitadas; L4-b. **Reformulado:** holdout, tier, «tem razão», custo, sem chave. **Morto:** validação geral dos tiers; McNemar como prova de selecção; B ≈ C; poupança; «sem desvios».
