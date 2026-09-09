# P2 · O tier que recomendamos vale alguma coisa — veredicto (v2, depois do adversário)

**Corrida:** 2026-09-09 · protocolo congelado antes da primeira corrida (`protocol.json`, 13:07:06Z; ordem real dos ficheiros em `AMENDMENT-1.md`) · oráculos dos 10 casos novos revistos por Codex antes de congelar (10/10 concordam) · **uma emenda de instrumento** (`AMENDMENT-1.md`) · bruto em `results/` · `node run.mjs --analyse`. v1 deste ficheiro no git (`22388a20`).

## Veredicto em uma linha

**Neste conjunto sintético de 20 tarefas, a política binária local/Haiku (reconstruída a partir do tier do `classify.js` com chave) obteve 17 respostas aceites; local apenas obteve 7; Haiku em todas obteve 19.** O sinal «escala» cobriu 11 das 13 falhas locais e o Haiku reparou 10 dessas 11. **Sem chave — o estado desta máquina — o `classify.js` diz T0 em 20/20 e a composição fica em 7/20.**

## Os números

| Braço | 20 casos | dev (10, do estudo Codex) | 10 casos novos (escritos pelo autor, revistos por Codex) | Repara falhas do local |
|---|---|---|---|---|
| A · local `qwen2.5-coder:14b` | **7/20 = 35 %** [18; 57] | 4/10 | 3/10 | — (13 falhas) |
| B · política local/Haiku pelo tier com chave (T0 → resposta de A; T1 → resposta de C) — **reconstruída, não executada como fluxo** | **17/20 = 85 %** [64; 95] | 8/10 | 9/10 | **10 de 13** |
| C · Haiku em todos os 20 | **19/20 = 95 %** [76; 99] | 9/10 | 10/10 | 12 de 13 |

- **Sinal descritivo:** dos 13 casos marcados T1, o local falhou em 11; dos 7 marcados T0, o local falhou em 2. (11/13 vs 2/7.) Isto merece investigação; **não é o que o McNemar testa**.
- **McNemar direccional, B > A** (pré-registado; testa aceitação emparelhada, não a qualidade da selecção): 20 casos B_wins=10, A_wins=0 → **p = 0,00098** (bilateral 0,0020); só os 10 novos B_wins=6, A_wins=0 → **p = 0,0156** (bilateral 0,031).
- **B vs C** (exploratório; direcção não congelada): C_wins=2, B_wins=0 → p(C>B) = 0,25. Não demonstra equivalência nem superioridade. As 2 são L3-b e L3-d: marcadas T0, o local falhou, o Haiku acertou. **T2/T3 nunca foram recomendados**: o «tier» aqui é binário.
- **Recursos (não «custo»):** local 55–171 tokens in, 10–19 out, p50 300 ms. Haiku via `claude -p`: 10 tokens in + 142–5 435 out (média 794) + 16–48 k tokens de cache lidos por chamada, p50 8,2 s, máx 52,8 s. Estimativa de lista do CLI para as 20 chamadas: US$ 1,32 — **não é factura**; desembolso incremental de API = 0 (subscrição); capacidade da subscrição, hardware e energia local consumidos e não contabilizados.
- «Evita 7 chamadas ao Haiku» = 35 % das chamadas mas **8,8 % dos tokens de saída** (1 402 de 15 881): as chamadas evitadas são as curtas.
- Única falha do Haiku (L4-b): `[1,5]` em vez de `["1","5"]`. O prompt pede «sorted allowed IDs as strings»; o critério é exacto e fica; é erro de tipo, não de lógica.

## Leitura honesta

1. O que sobrevive: as três contagens, os ganhos emparelhados (10 a 0), a cobertura 11/13, o custo por chamada. Como descrição destas 20 tarefas.
2. O que não se pode dizer: «o router selecciona bem» (o teste mede aceitação emparelhada); «B ≈ C» (2 discordâncias); «o tier vale» em geral (só T0/T1; 20 tarefas sintéticas; 10 escritas por mim depois de conhecer o dev — um conjunto reservado, não uma replicação independente).
3. O «sem chave» é uma **composição offline**: `classify.js` sem chave dá T0 em 20/20 e a política reconstruída cai para a resposta local. Não é um ensaio ponta a ponta do produto instalado.
4. Pré-registado **com uma emenda de instrumento** e uma errata de metadados (`AMENDMENT-1.md`). Não «sem desvios».

## O que isto NÃO prova

- Selecção inteligente entre tiers. Equivalência B = C. Poupança monetária. Sucesso operacional do produto instalado. Prompts reais longos. Robustez a instruções adversariais.

## Reproduzir

```
node _handoff/provas-v1-2026-09-09/P2-o-tier-vale-alguma-coisa/run.mjs --classify
node _handoff/provas-v1-2026-09-09/P2-o-tier-vale-alguma-coisa/run.mjs --local --set holdout
node _handoff/provas-v1-2026-09-09/P2-o-tier-vale-alguma-coisa/run.mjs --cloud --model haiku
node _handoff/provas-v1-2026-09-09/P2-o-tier-vale-alguma-coisa/run.mjs --analyse
```
