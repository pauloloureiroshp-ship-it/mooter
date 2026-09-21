# decisor-shadow — análise MP3 (Frente A) · 2026-09-21T10:46:43.274Z

Pré-registo: `protocol.json#mp3` (commit `32e65ac6`), AMENDMENT mp3-1 (`3ce8d61b`, n=37 antes de rotular). Candidato que conta: **v0 argmax** (fixo antes de qualquer dado). Rótulo = maioria de 3 (Codex · Sonnet · Kimi k3), κ Fleiss 0.743, unânimes 27/37. Distribuição dos rótulos: T0 10 · T1 6 · T2 9 · T3 12.

### Corpus 60c completo — n=37, 37 sessões (1/sessão estrito: pares independentes por construção)

| Braço | acc (n=37) [IC95] | ECE | p50 ms | McNemar vs «T2 sempre» | vs «T3 sempre» | vs regra |
|---|---|---|---|---|---|---|
| regra classify.js (nokey) | 0.324 (12/37) [0.20–0.49] | n/d | 0.46 in-proc | 12/9, p=0.3318 | 10/10, p=0.5881 | — |
| «T2 sempre» (referência pré-registada) | 0.243 (9/37) [0.13–0.40] | n/d | — | — | 9/12, p=0.8083 | 9/12, p=0.8083 |
| «T3 sempre» (constante mais forte nos 37) | 0.324 (12/37) [0.20–0.49] | n/d | — | 12/9, p=0.3318 | — | 10/10, p=0.5881 |
| **D v0 argmax — primário, conta para o gate** | 0.622 (23/37) [0.46–0.76] | 0.146 | 162 | 18/4, p=0.0022 | 17/6, p=0.0173 | 11/0, p=0.0005 |
| D v0+T (T=1,55 herdado) | 0.622 (23/37) [0.46–0.76] | 0.187 | 162 | 18/4, p=0.0022 | 17/6, p=0.0173 | 11/0, p=0.0005 |
| D v0-guard (limiar 0,5) | 0.622 (23/37) [0.46–0.76] | 0.146 | 162 | 18/4, p=0.0022 | 17/6, p=0.0173 | 11/0, p=0.0005 |

### Sensibilidade — só itens UNÂNIMES entre os 3 rotuladores (n=27; o tecto do rótulo)

| Braço | acc (n=27) [IC95] | ECE | p50 ms | McNemar vs «T2 sempre» | vs «T3 sempre» | vs regra |
|---|---|---|---|---|---|---|
| regra classify.js (nokey) | 0.407 (11/27) [0.25–0.59] | n/d | 0.46 in-proc | 11/5, p=0.1051 | 9/8, p=0.5000 | — |
| «T2 sempre» (referência pré-registada) | 0.185 (5/27) [0.08–0.37] | n/d | — | — | 5/10, p=0.9408 | 5/11, p=0.9616 |
| «T3 sempre» (constante mais forte nos 37) | 0.370 (10/27) [0.22–0.56] | n/d | — | 10/5, p=0.1509 | — | 8/9, p=0.6855 |
| **D v0 argmax — primário, conta para o gate** | 0.815 (22/27) [0.63–0.92] | 0.194 | 163 | 17/0, p=0.0000 | 16/4, p=0.0059 | 11/0, p=0.0005 |
| D v0+T (T=1,55 herdado) | 0.815 (22/27) [0.63–0.92] | 0.267 | 163 | 17/0, p=0.0000 | 16/4, p=0.0059 | 11/0, p=0.0005 |
| D v0-guard (limiar 0,5) | 0.815 (22/27) [0.63–0.92] | 0.194 | 163 | 17/0, p=0.0000 | 16/4, p=0.0059 | 11/0, p=0.0005 |

### Sensibilidade — sem os 7 prompts despachados por runner (n=30)

| Braço | acc (n=30) [IC95] | ECE | p50 ms | McNemar vs «T2 sempre» | vs «T3 sempre» | vs regra |
|---|---|---|---|---|---|---|
| regra classify.js (nokey) | 0.400 (12/30) [0.25–0.58] | n/d | 0.46 in-proc | 12/6, p=0.1189 | 10/8, p=0.4073 | — |
| «T2 sempre» (referência pré-registada) | 0.200 (6/30) [0.10–0.37] | n/d | — | — | 6/10, p=0.8949 | 6/12, p=0.9519 |
| «T3 sempre» (constante mais forte nos 37) | 0.333 (10/30) [0.19–0.51] | n/d | — | 10/6, p=0.2272 | — | 8/10, p=0.7597 |
| **D v0 argmax — primário, conta para o gate** | 0.567 (17/30) [0.39–0.73] | 0.177 | 159 | 15/4, p=0.0096 | 12/5, p=0.0717 | 5/0, p=0.0313 |
| D v0+T (T=1,55 herdado) | 0.567 (17/30) [0.39–0.73] | 0.162 | 159 | 15/4, p=0.0096 | 12/5, p=0.0717 | 5/0, p=0.0313 |
| D v0-guard (limiar 0,5) | 0.567 (17/30) [0.39–0.73] | 0.177 | 159 | 15/4, p=0.0096 | 12/5, p=0.0717 | 5/0, p=0.0313 |

## Gates do pré-registo, no v0, só 60c

| Gate | Alvo | Valor | |
|---|---|---|---|
| acc > «T2 sempre», McNemar unilateral | p < 0,05 | acc 0.622 vs 0.243; b/c 18/4; p=0.0022 | ✅ |
| ECE 10 bins (n=37) | ≤ 0,10 | **0.146** | ❌ |
| p50 quente, 4 perguntas | ≤ 250 ms | **162 ms** | ✅ |
| egress (net-tap no cliente D) | 0 hosts externos | 2 ligações, hosts {"127.0.0.1:11434":2}, externos 0, bytes out 374413 / in 170047 | ✅ |

v0 nos 37: previsões {"T0":17,"T3":6,"T1":6,"T2":8} · confusão {"T0->T0":10,"T1->T0":4,"T2->T0":2,"T3->T3":6,"T3->T1":2,"T2->T2":5,"T3->T0":1,"T2->T1":2,"T3->T2":3,"T1->T1":2} · bins [["0.3",3,0.33,0.36],["0.4",10,0.5,0.44],["0.5",6,0.67,0.53],["0.6",3,0.33,0.64],["0.8",3,1,0.84],["0.9",12,0.75,0.96]]
v0-guard disparou **0×** em 37 (idêntico ao v0 quando 0). v0+T: ECE 0.187 — a temperatura herdada do MP2 **piora** a calibração neste corpus.

⚠️ Nada aqui é decisão: o adversário (codex, round 3) ataca esta tabela + o diff da Frente B.

VEREDICTO (08-analyse): ENTRE → shadow acumula; re-testar com 60d
