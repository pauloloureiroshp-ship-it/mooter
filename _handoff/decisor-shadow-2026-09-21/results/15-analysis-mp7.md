# decisor-shadow — análise MP7 (exploratório) · 2026-09-21T14:41:29.492Z

Pré-registo: `protocol.json#mp7` (`_registered_at` 2026-09-21T14:25:30.415Z; commit `3e384307`). Exploração 40 e 57, 60c só reportado, zero ajuste. Sonda antes do pré-registo: no `/api/chat` nativo com `think:false` o 27b responde «A» (0,753) e o 30b continua «We». **A comparação é entre configurações completas** (27b + /api/chat + think:false vs 14b + /v1): endpoint e controlo de thinking mudam juntos com o modelo (round 7 A11); a equivalência do leitor de letras entre os dois caminhos foi verificada com o 14b nos dois (abaixo).

## (i) modelo maior pelo /api/chat nativo (think:false, logprobs, v0)

| linha | acc 40 | acc 57 | **acc 60c** | ECE 40 | ECE 57 | **ECE 60c** | p50 ms 4 perg. (só tier) | letra | veredicto C2-nativo |
|---|---|---|---|---|---|---|---|---|---|
| 14b v0 (/v1, ref.) | 0.600 (24/40) | 0.614 (35/57) | 0.622 (23/37) | 0.110 | 0.124 | 0.146 | 165 (42) / 140 (36) / 162 (46) | 100 % / 100 % / 100 % | referência |
| 27b nativo | 0.600 (24/40) | 0.702 (40/57) | 0.622 (23/37) · 2 no-letter (resp.: 0.657) | 0.305 | 0.244 | 0.285 | 1084 (270) / 1108 (283) / 1175 (297) | 100 % / 100 % / 95 % | ENTRE |
| 30b nativo | 0.000 (0/40) · 40 no-letter (resp.: n/d) | 0.000 (0/57) · 57 no-letter (resp.: n/d) | 0.000 (0/37) · 37 no-letter (resp.: n/d) | n/d | n/d | n/d | 154 (42) / 158 (44) / 165 (50) | 0 % / 0 % / 0 % | REFUTADA (letra em 0 % / 0 %) |

- **27b nativo: ENTRE segundo a regra exploratória — calibração pior e elegibilidade operacional reprovada (round 7 A12).** Responde com letra (100 % / 100 % / 95 %); acc 0.600 / 0.702 vs v0 0.600 / 0.614 (≥ v0 nos dois; +8,8 pp no 57); **ECE 0.305 / 0.244 — 2–3× pior que o v0** (0.110 / 0.124): sobre-confiante (bins abaixo). **Latência p50 1084 / 1108 / 1175 ms nas 4 perguntas — 4× o tecto de 250 ms do mp4-3**; só a pergunta do tier já dá 270–297 ms. No 60c (só reportado): acc 0.622 (= v0 0,622), ECE 0.285, 2 no-letter.
- **30b nativo: REFUTADA (letra em 0 % / 0 %)** — `think:false` esvazia o campo `thinking` mas o modelo continua a raciocinar em prosa no `content` («We» como 1.º token em 40/57/37 itens); acc 0 por construção, ECE n/d; p50 154 / 158 / 165 ms.

### Equivalência do harness (round 7 A11): 14b pelos dois caminhos, 60c

- `qwen2.5-coder:14b` corrido pelo `/api/chat` nativo (think:false, logprobs) no 60c e comparado item a item com o ficheiro `/v1` do MP3: **148/148 respostas idênticas** (valor e p_max a 1e-6), tier 37/37, acc 0,622 = 0,622, ECE 0,146 = 0,146, p50 144 ms. O leitor de letras e o endpoint são equivalentes para um modelo sem thinking; para os qwen3, `think:false` é um controlo comportamental — por isso a comparação é entre configurações completas.

### Bins do 27b nativo (sobre-confiança)

- 40: 0.3:1/0%/0.39 · 0.4:3/0%/0.46 · 0.5:1/100%/0.59 · 0.6:2/100%/0.65 · 0.7:6/0%/0.77 · 0.8:5/40%/0.85 · 0.9:22/86%/0.98
- 57: 0.4:4/100%/0.46 · 0.5:3/33%/0.57 · 0.6:3/0%/0.66 · 0.7:1/0%/0.70 · 0.8:11/45%/0.85 · 0.9:35/86%/0.97
- 60c: 0.3:2/50%/0.38 · 0.5:2/100%/0.52 · 0.6:4/75%/0.66 · 0.7:1/0%/0.71 · 0.8:4/25%/0.86 · 0.9:22/73%/0.97

## (ii) concordância das 4 rotações TTA como confiança (ficheiros do MP6, sem correr modelo)

**REFUTADA** (regra pré-registada, 40 e 57). Tabela completa em `14-tta-agreement.md`. Resumo:

| corpus | 4/4 (n · acc) | 3/4 | 2/4 | ECE(p_agree) | ECE(p_max TTA) | ECE(v0) | monotonia |
|---|---|---|---|---|---|---|---|
| 40 | 26 · 0.577 | 7 · 0.571 | 6 · 0.500 | **0.306** | 0.187 | 0.110 | ✅ |
| 57 | 42 · 0.690 | 7 · 0.286 | 8 · 0.625 | **0.303** | 0.196 | 0.124 | ❌ |
| 60c | 24 · 0.708 | 5 · 0.600 | 6 · 0.833 | **0.277** | 0.221 | 0.146 | ❌ |

- **Leitura:** 65–74 % dos itens são unânimes (4/4) e mesmo assim só 0.58 / 0.69 / 0.71 certos — as 4 rotações concordam na MESMA resposta errada. A concordância é **suporte interno** (as 4 rotações são o mesmo modelo, correlacionadas; escolher o alvo pela média introduz dependência), não probabilidade de acerto: p_agree = 1,0 em itens a 58–71 % dá ECE 0,30. Compatível com um erro de juízo do modelo e não com ruído posicional — mas isto é uma leitura, não uma prova causal (round 7 A15). A monotonia falha no 57 (3/4 a 0,29 com n=7) e no 60c.

## O que isto fecha

- Modelo maior: o único que responde com letra (27b nativo) é **mais exacto no 57 e igual no 40/60c, mas 4× acima do tecto de latência e 2–3× pior na ECE** — não é candidato a shadow com este harness; um harness de 1 pergunta (só tier, ~280 ms) ficaria na fronteira e pede pré-registo próprio.
- Confiança: nem p_max, nem calibração aprendida (MP5/MP6), nem TTA, nem concordância. A rota decide por argmax (mp4-3); o recibo diz «confiança: n/d» — e este MP diz porquê.

⚠️ Nada aqui é decisão: o adversário (codex, round 7) ataca as emendas mp4-2/mp4-3 e este MP.
