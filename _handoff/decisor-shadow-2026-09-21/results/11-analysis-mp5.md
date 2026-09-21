# decisor-shadow — análise MP5 · Parte 1 (7b no lugar do 14b?) · 2026-09-21T12:25:14.977Z

Pré-registo: `protocol.json#mp5` (`_registered_at` 2026-09-21T12:22:41.685Z; conta o %cI do commit que o introduz). Regra fixada antes de ver um número: **serve** se acc_7b ≥ acc_14b − 0,05 em CADA corpus; **não serve** se falha em ≥ 2; **entre** se falha em exactamente 1. Sobre o ponto, não sobre o IC (declarado no pré-registo). Corpora **separados** — nunca somados. Referência = D v0 no 14b, ficheiros já existentes, **não re-corridos**. Candidatos: 7b (uma corrida por corpus), 3b (o 40 é o do MP1; 60b e 60c corridos agora, uma vez cada). Mesmo harness (`02-arm-D-logit.mjs`, 4 perguntas, rubrica sha `f95958dd…`, v0 argmax), só muda `--model`. Egress: net-tap no cliente, todos os hosts `127.0.0.1:11434`.

| Corpus | Modelo | acc (k/n) [IC95] | Δ vs 14b | McNemar 7b/3b vs 14b (b/c, p bilateral) | ECE | p50 ms (4 perg.) | abstém | confusão expected→pred |
|---|---|---|---|---|---|---|---|---|
| corpus-40 (P1, reuso) | **qwen2.5-coder:14b (referência, já medido)** | 0.600 (24/40) [0.45–0.74] | — | — | 0.110 | 165 | 3 | T0→T0 10, T0→T3 1, T1→T0 2, T1→T1 1, T2→T0 5, T2→T1 5, T2→T2 8, T3→T0 2, T3→T1 1, T3→T3 5 |
| corpus-40 (P1, reuso) | qwen2.5-coder:7b (candidato) | 0.450 (18/40) [0.31–0.60] | -15.0 pp | 7/1, p=0.070 | 0.236 | 101 | 4 | T0→T0 10, T0→T3 1, T1→T0 2, T1→T1 1, T2→T0 11, T2→T1 4, T2→T2 1, T2→T3 2, T3→T0 1, T3→T2 1, T3→T3 6 |
| corpus-40 (P1, reuso) | qwen2.5:3b (candidato, já medido no 40) | 0.400 (16/40) [0.26–0.55] | -20.0 pp | 13/5, p=0.096 | 0.462 | 97 | 0 | T0→T0 4, T0→T2 1, T0→T3 6, T1→T0 1, T1→T2 1, T1→T3 1, T2→T2 5, T2→T3 13, T3→T2 1, T3→T3 7 |
| corpus-60b (MP2) | **qwen2.5-coder:14b (referência, já medido)** | 0.614 (35/57) [0.48–0.73] | — | — | 0.124 | 140 | 4 | T0→T0 16, T2→T0 8, T2→T1 1, T2→T2 8, T2→T3 1, T3→T0 8, T3→T1 1, T3→T2 3, T3→T3 11 |
| corpus-60b (MP2) | qwen2.5-coder:7b (candidato) | 0.579 (33/57) [0.45–0.70] | -3.5 pp | 9/7, p=0.804 | 0.105 | 97 | 6 | T0→T0 16, T2→T0 11, T2→T1 2, T2→T2 2, T2→T3 3, T3→T0 8, T3→T3 15 |
| corpus-60b (MP2) | qwen2.5:3b (candidato, já medido no 40) | 0.544 (31/57) [0.42–0.67] | -7.0 pp | 17/13, p=0.585 | 0.413 | 83 | 1 | T0→T0 6, T0→T3 10, T2→T2 3, T2→T3 15, T3→T0 1, T3→T3 22 |
| corpus-60c (MP3, 1/sessão) | **qwen2.5-coder:14b (referência, já medido)** | 0.622 (23/37) [0.46–0.76] | — | — | 0.146 | 162 | 3 | T0→T0 10, T1→T0 4, T1→T1 2, T2→T0 2, T2→T1 2, T2→T2 5, T3→T0 1, T3→T1 2, T3→T2 3, T3→T3 6 |
| corpus-60c (MP3, 1/sessão) | qwen2.5-coder:7b (candidato) | 0.486 (18/37) [0.33–0.64] | -13.5 pp | 9/4, p=0.267 | 0.156 | 107 | 6 | T0→T0 8, T0→T3 2, T1→T0 5, T1→T3 1, T2→T0 7, T2→T3 2, T3→T0 2, T3→T3 10 |
| corpus-60c (MP3, 1/sessão) | qwen2.5:3b (candidato, já medido no 40) | 0.378 (14/37) [0.24–0.54] | -24.3 pp | 14/5, p=0.064 | 0.547 | 85 | 0 | T0→T0 3, T0→T3 7, T1→T0 1, T1→T3 5, T2→T0 1, T2→T3 8, T3→T2 1, T3→T3 11 |

## Regra pré-registada

- **qwen2.5-coder:7b: NÃO SERVE** — abaixo de 14b − 5 pp em 2 corpus/corpora (40, 60c).
- qwen2.5:3b (informativo, não era a pergunta): **NÃO SERVE** — falha em 3 (40, 60b, 60c).

## O que isto implica para o Mac (M4, 16 GB)

- Latência no Mac: **n/d** — nada foi medido num Mac nesta sessão. Os p50 acima são da RTX 4090 com o modelo quente (o 7b responde às 4 perguntas em ~100 ms; o 3b em ~85 ms; o 14b em ~140–165 ms).
- `ESTUDO_LLMS_LOCAIS_MAC_MINI`: **não existe no vault** (procurado por nome e por «mac mini / 16 GB» em `~/paulo-vault`; o que há é a decisão de 2026-08-15 a registar um job `gpt-oss:20b` no Mac mini, sem memória declarada). Se o 14b (9,1 GB em VRAM/RAM unificada, contexto 4096) cabe ao lado de outro modelo em 16 GB fica **n/d** aqui — não se inventa.
- O que se pode dizer com o que se mediu: o candidato que caberia folgado (7b, 4,7 GB) **perde 13–15 pp** para o 14b em dois dos três corpora, e o 3b perde mais e chumba a ECE por larga margem (0,41 / 0,55). Se o Mac só puder correr o 7b, o decisor que lá corre **não é o que o MP3 mediu** — os números do 60c (0,622) não se transferem.

⚠️ Nada aqui é decisão: o adversário (codex, round 5) pergunta se o 7b foi avaliado nos mesmos corpora sem ajuste.
