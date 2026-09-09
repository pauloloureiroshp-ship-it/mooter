# P1 · Decidir custa zero — veredicto (v3, depois de duas rondas do adversário)

**Corrida:** 2026-09-09 · protocolo congelado antes da primeira classificação (`protocol.json`; anterioridade atestada pela ordem do transcript e mtimes, **não** por um commit anterior — a partir do P3 os protocolos são commitados antes) · bruto em `results/` · `analysis.json` (`run.mjs --analyse`) · `analysis-extra.json` (`amend.mjs`, cálculos sobre o mesmo bruto exigidos pelo adversário) · `nettap-*.jsonl` (tap ao nível do socket, 1 corrida extra por braço) · v1 e v2 deste ficheiro no git (`f2739bcb`, `22388a20`). Adversário: `adversary.md` (2 rondas, Codex).

## Veredicto em uma linha

**A regra classifica sem inferência e sem rede (0 medido com dois instrumentos, um deles com controlo positivo) e em microssegundos; o hook em que vive não é grátis (207 ms p50, 1 272 ms p95; ~870 bytes de contexto por prompt; uma pré-resposta local que expirou 75/75 vezes). Na precisão contra rótulos cegos, nestes 40 prompts reais amostrados, a regra fica abaixo de um juiz LLM local e abaixo da baseline constante «sempre T2».**

## Os números

### Precisão (rótulo = Codex, cego e sem acesso ao repo; 2.º motor = qwen3.6:27b, só para kappa)

| Conjunto | A · regra, chave simulada | A · sem chave (esta máquina) | B · juiz LLM local 14B | «sempre T2» (constante) |
|---|---|---|---|---|
| **40 prompts reais de setembro** (amostra por seed de 298 elegíveis; 0 alterados pela anonimização; 40 distintos após a normalização do classificador) | **14/40 = 35,0 %** [22,1; 50,5] | 13/40 = 32,5 % [20,1; 48,0] | **21/40 = 52,5 %** [37,5; 67,1] | 18/40 = 45,0 % [30,7; 60,2] |
| 23 prompts R-24 (um template; rótulo decorre de uma linha da rubrica) | 0/23 [0; 14,3] (regra: T3 ×17, T1 ×6) | 0/23 | 23/23 [85,7; 100] | 23/23 |
| 63 fora de treino (número pré-registado do cartão; pseudo-replicado pelos 23) | 14/63 = 22,2 % [13,7; 33,9] | 13/63 = 20,6 % | 44/63 = 69,8 % [57,6; 79,8] | 41/63 = 65,1 % |
| 35 de treino (calibração; composição diferente: T3 14/35 vs 8/40) | 31/35 = 88,6 % [74,0; 95,5] | 32/35 = 91,4 % | 29/35 = 82,9 % [67,3; 91,9] | 5/35 |
| 40 reais, só onde os 2 motores rotuladores concordam (n=26) | 12/26 = 46,2 % [28,8; 64,5] | — | 20/26 = 76,9 % [57,9; 89,0] | — |
| 40 reais, contra o 2.º motor | 19/40 = 47,5 % [32,9; 62,5] | — | 26/40 = 65,0 % [49,5; 77,9] | — |

McNemar exacto direccional, pré-registado sobre os 63 (H1: A > B): b=4, c=34 → p(A>B)=1,00; p(B>A)=3,0×10⁻⁷ — **inválido como generalização** (23 dos 34 discordantes são um template). Sobre os 40: b=4, c=11 → p(B>A)=**0,059**, bilateral 0,118 — não significativo a 0,05; direcção contra a regra. Regra vs «sempre T2» nos 40: 4 acertos de diferença, **sem teste emparelhado** (não pré-registado); é uma observação. Kappa entre os dois motores rotuladores nos 40: **0,50** (acordo 26/40); nos 14 desacordos, a regra coincide com o 2.º motor em 7 e com o Codex em 2.

### Custo de decidir

| Métrica | A · regra | Hook completo (`inject_context.js`, HOME isolado, sem credenciais) | B · juiz LLM | D · tzachbon |
|---|---|---|---|---|
| Chamadas a modelo para decidir | **0** — stub Ollama: 0 pedidos; wrappers http/https/fetch: 0 chamadas (1 176 classificações); tap ao nível do socket: 0 ligações em 1+64 processos Node (1 corrida extra) | classify: 0 · **Option A: 75 chamadas locais lançadas** para prompts T0, **75 expiradas a 1 000 ms** (log isolado); o tap v1 não as viu porque só registava no fecho e o processo é morto antes — o tap v2 regista na abertura e é o instrumento do P5 | 1 por prompt | 0 heurística; fallback nunca disparou (abstenção prévia) |
| Tokens por prompt | 0 | 0 para classificar; Option A: n/d (processo morto a 1 s) | **393** média (in p50 362, out 3; n=63) | uma chamada de fallback invocada à parte: 9 in + 356 out + 52 203 de cache, 5,97 s; nenhuma disparou neste corpus |
| Bytes de contexto injectados por prompt | — | **p50 870 · média 998 · p95 1 473** | — | — |
| Latência | em processo **p50 0,002 ms**, p95 1,9 ms, máx 5,0 (n=588: 98 prompts × 6 corridas, com aquecimento) · processo filho **p50 96,6 ms**, p95 100,8 (n=378) | **p50 207 ms · p95 1 272 ms · média 565 ms** (n=189); classify interno: spawn p50 91,9 (n=57), cache p50 1,53 (n=132); a cauda é o timeout do Option A | p50 77 ms quente, máx 3 047 ms (carga fria) | n/d |
| Determinismo | 6/6 corridas byte-idênticas | — | 98/98 iguais em 3 corridas | — |
| Hosts externos | 0 (dois instrumentos) | 0 no HOME isolado (árbitro 0; sem credenciais não há fetch de orçamento — o hook real mede-se no P5) | 0 (loopback) | 0 (o fallback contactaria api.anthropic.com) |

Tier **emitido pelo hook** (com `safety_boost`, vetos): 14/40, 3/23, 17/63; difere do `classify()` em 19 de 63.

## Leitura honesta

1. **O que sobrevive como facto:** a regra classifica sem inferência e sem rede — 0 medido pelos wrappers + stub (1 176 classificações) e por um tap ao nível do socket com controlo positivo (corrida extra). Nestes 40 prompts reais faz 14/40 contra 21/40 do juiz e 18/40 da constante «sempre T2».
2. **«Decidir custa zero» está morto como frase.** Zero inferência ≠ custo zero: 207 ms (p50) a 1,27 s (p95) de hook, ~870 bytes que o modelo seguinte paga, e uma chamada local por prompt T0 que aqui expirou 75/75 (o log vivo tem 377 misses vs 36 hits, dos quais 67 são timeouts e 292 `Invalid`; a extrapolação causal fica por fazer).
3. **Não há vitória em egress nesta prova.** 0 vs 0 vs 0. A comparação com proxies é o P5.
4. **Nestes 40, a regra perde.** Sub-classifica: T0 em 30 dos 40; 12 desses têm os dois motores rotuladores em T2/T3. O juiz LLM está 3 acertos acima da constante — não é uma solução, é 393 tokens por prompt para +3.
5. **O empate de 2026-09-01 era treino.** Hoje no treino: 31/35 vs 29/35; fora: 14/40 vs 21/40. A composição dos conjuntos é diferente (T3 40 % vs 20 %); não se isola sobreajuste.
6. **Os 23 do R-24 não são 23 observações.** Um template, rótulo determinado por uma linha da rubrica que eu escrevi. O p de 3×10⁻⁷ fica impresso por ter sido pré-registado e não se cita.
7. **tzachbon** abstém-se em 63/63 (`has_task_intent` só reconhece imperativos em inglês; 4 sondas em inglês classificam). Com `cli_fallback` ligado (2.ª passagem): 0 disparos. `n/d` neste corpus, com motivo.
8. **C e E** não classificam complexidade: `n/d` por construção; egress no P5.

## O que isto NÃO prova

- Valor comercial. Obediência (P3). Nada acima de 500 caracteres. Que o rótulo cego é a verdade (kappa 0,50). Representatividade além dos 40 amostrados (exposição indirecta à fraseologia dos autores da regra não excluída). A configuração com chave real e árbitro ligado. Que um juiz LLM é a resposta.

## Correcções e emendas nesta corrida

- Protocolo: nenhuma alteração. `amend.mjs` acrescenta cálculos sobre o mesmo bruto; o tap v2 acrescenta uma corrida extra de instrumentação por braço (`--tag nettap`).
- 2.ª passagem do braço D e uma chamada instrumentada: exigidas pelo protocolo, faltavam na v1 — corrigido.
- v1 dizia «T1 (10) e T3 (13)» para a regra nos R-24: errado; o artefacto diz T3 17 · T1 6. Corrigido; tabelas só de `analysis*.json`.
- v2 dizia «Ganhou em egress» e «decidir custa zero»: retirado (adversário M1/M2).
- Descoberta não pedida: Option A expira 75/75 (D3 em `09-DEFEITOS-APANHADOS.md`).

## Reproduzir

```
node _handoff/provas-v1-2026-09-09/P1-decidir-custa-zero/run.mjs --all
node _handoff/provas-v1-2026-09-09/P1-decidir-custa-zero/run.mjs --analyse
node _handoff/provas-v1-2026-09-09/P1-decidir-custa-zero/amend.mjs
python _handoff/provas-v1-2026-09-09/P1-decidir-custa-zero/tz-classify.py <tzachbon>/plugins/claude-model-router-hook/hooks corpus-63.json results/D-tzachbon.json [--cli]
```
