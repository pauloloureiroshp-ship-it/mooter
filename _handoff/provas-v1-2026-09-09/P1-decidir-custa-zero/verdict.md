# P1 · Decidir custa zero — veredicto (v2, depois do adversário)

**Corrida:** 2026-09-09 · protocolo congelado antes da primeira classificação (`protocol.json`; atestado pela ordem do transcript e pelos mtimes, **não** por um commit anterior — ver P1 em `adversary.md`) · bruto em `results/` · `results/analysis.json` (`node run.mjs --analyse`) · `results/analysis-extra.json` (`node amend.mjs`, só cálculos sobre o bruto, exigidos pelo adversário) · v1 deste ficheiro está no git (`f2739bcb`).

## Veredicto em uma linha

**A regra decide sem inferência (0 chamadas a modelo, 0 hosts) e em microssegundos; o hook em que ela vive não: injecta ~870 bytes por prompt, lança uma pré-resposta local que expirou 75/75 vezes, e demora 207 ms (p50) a 1 272 ms (p95). Na precisão contra rótulos cegos, fora do treino, a regra PERDE — para um juiz LLM local de ~393 tokens e para a baseline constante «responde sempre T2».**

## Os números

### Precisão (rótulo = Codex, cego; 2.º rotulador = qwen3.6:27b, só para kappa)

| Conjunto | A · regra (com chave) | A · sem chave (esta máquina) | B · juiz LLM local 14B | «sempre T2» (baseline constante) |
|---|---|---|---|---|
| **40 prompts reais de setembro** | **14/40 = 35,0 %** [22,1; 50,5] | 13/40 = 32,5 % [20,1; 48,0] | **21/40 = 52,5 %** [37,5; 67,1] | 18/40 = 45,0 % [30,7; 60,2] |
| 23 prompts R-24 (um template; rótulo determinado por uma linha da rubrica) | 0/23 [0; 14,3] (regra: T3 ×17, T1 ×6) | 0/23 | 23/23 [85,7; 100] | 23/23 |
| 63 fora de treino (número pré-registado do cartão) | 14/63 = 22,2 % [13,7; 33,9] | 13/63 = 20,6 % | 44/63 = 69,8 % [57,6; 79,8] | 41/63 = 65,1 % |
| 35 de treino (calibração) | 31/35 = 88,6 % [74,0; 95,5] | 32/35 = 91,4 % | 29/35 = 82,9 % [67,3; 91,9] | 5/35 |
| **40 reais, só onde os 2 rotuladores concordam (n=26)** | 12/26 = 46,2 % [28,8; 64,5] | — | 20/26 = 76,9 % [57,9; 89,0] | — |
| 40 reais, contra o 2.º rotulador | 19/40 = 47,5 % [32,9; 62,5] | — | 26/40 = 65,0 % [49,5; 77,9] | — |

McNemar exacto, direccional, pré-registado sobre os 63 (H1: A > B): b=4, c=34 → p(A>B)=1,00; p(B>A)=3,0×10⁻⁷. **Inferência inválida como generalização:** 23 dos 34 discordantes são um único template (pseudo-replicação; ataque S1). Sobre os 40 reais: b=4, c=11 → p(B>A)=0,059, bilateral 0,118 — **não significativo a 0,05**, direcção contra a regra. Rotuladores nos 40: kappa **0,50** (acordo 26/40); nos 14 desacordos a regra coincide com o 2.º rotulador em 7 e com o Codex em 2.

Composição por tier — treino: T0 11 · T1 5 · T2 5 · T3 14; 40 reais: T0 11 · T1 3 · T2 18 · T3 8. O «fosso» 88,6 % → 35,0 % mistura sobreajuste com composição diferente; não se isola aqui.

### Custo de decidir

| Métrica | A · regra | Hook completo (`inject_context.js`, HOME isolado, sem credenciais) | B · juiz LLM | D · tzachbon |
|---|---|---|---|---|
| Chamadas a modelo para decidir | **0** (stub Ollama: 0 pedidos; wrappers http/https/fetch: 0 chamadas; 1 176 classificações) | classify: 0 · **Option A: 75 chamadas locais lançadas** (pré-resposta para T0), **75 expiradas** a 1 000 ms, 0 respostas | 1 por prompt | 0 (heurística); fallback = 1 `claude -p` |
| Tokens por prompt | 0 | 0 para classificar · Option A: n/d (processo morto a 1 s; tokens do servidor não lidos) | **393** média (in p50 362, out 3; n=63) | fallback: **9 in + 356 out + 52 203 de cache** (1 chamada instrumentada, Haiku, 5,97 s) |
| Bytes injectados na conversa por prompt (o modelo seguinte lê-os) | — | **p50 870, p95 1 473** | — | — |
| Latência | em processo p50 **0,002 ms**, p95 1,9 ms, máx 5,0 (n=588, inclui repetições e aquecimento) · processo filho p50 **96,6 ms**, p95 100,8 (n=378) | **p50 207 ms · p95 1 272 ms · média 565 ms** (n=189); por caminho interno: spawn p50 91,9 (n=57), cache p50 1,53 (n=132); a cauda de ~1,2 s é o timeout do Option A | p50 77 ms quente; máx 3 047 ms (carga fria) | n/d |
| Determinismo | 6/6 corridas byte-idênticas | — | 98/98 iguais em 3 corridas | — |
| Hosts externos contactados | 0 | 0 (árbitro: 0 chamadas; sem credenciais não há fetch de orçamento — em produção há 1 por expiração de cache de 5 min, sem bytes de prompt: medido no P5) | 0 (loopback) | 0 (o fallback contacta api.anthropic.com) |

Tier **emitido pelo hook** (com `safety_boost`, vetos): 14/40 nos reais (igual à regra), 3/23 nos R-24, 17/63; difere do `classify()` em 19 de 63 prompts.

## Leitura honesta

1. **O que sobrevive como facto:** a regra classifica sem inferência e sem rede — 0 medido, com controlo positivo (`lib/net-tap.test.mjs` prova que o instrumento vê https, fetch e loopback). Nos 40 prompts reais faz 14/40 contra 21/40 do juiz LLM; nos 23 do R-24, 0/23 contra 23/23.
2. **«Decidir custa zero» está morto como frase.** Zero inferência ≠ custo zero: o hook custa 207 ms (p50) a 1,27 s (p95), injecta ~870 bytes que o modelo seguinte paga, e lança uma chamada local por prompt T0 que nesta corrida falhou 75/75 (em produção: 374 misses vs 36 hits no `decisions.log` vivo). A frase permitida é: **«0 inference tokens and 0 external hosts to classify; the hook costs 0.2–1.3 s and ~870 bytes of context per prompt.»**
3. **Não há vitória em egress nesta prova.** A=0, B=0, D=0. Zero contra zero é empate. A comparação com proxies é o P5.
4. **A regra perde em precisão fora do treino, e fica abaixo da baseline constante.** «Sempre T2» faz 45 % nos 40; a regra 35 %; o juiz 52,5 %. A regra sub-classifica: diz T0 em 30 dos 40 prompts reais; 12 desses têm os dois rotuladores em T2/T3 (n12, n16, n17, n22, n39: T3 pelos dois; regra: T0). O juiz LLM está só 3 acertos acima da baseline constante — também não é a resposta.
5. **O empate de 2026-09-01 (29/35 vs 29/35) era treino e não generaliza.** Hoje no treino a regra faz 31/35 e o juiz 29/35; fora dele, 14/40 vs 21/40.
6. **Os 23 do R-24 não são 23 observações.** São um template e o rótulo deles decorre de uma linha da rubrica que eu escrevi. O p de 3×10⁻⁷ é aritmética correcta sobre uma tabela que não suporta inferência. Fica impresso porque foi pré-registado; não se cita.
7. **tzachbon** abstém-se em 63/63 (`has_task_intent` só reconhece imperativos em inglês; 4 sondas em inglês classificam). Com `cli_fallback` ligado, a segunda passagem confirma: 0 disparos, porque a abstenção precede o fallback. Uma chamada real do fallback custa 52 k tokens de cache e 6 s. `n/d` neste corpus, com motivo; um utilizador em português não é servido.
8. **C e E** não classificam complexidade: `n/d` por construção; egress no P5.

## O que isto NÃO prova

- Valor comercial. Obediência (P3). Nada acima de 500 caracteres. Que o rótulo cego é a verdade (kappa 0,50 nos 40). Que um juiz LLM é a resposta (+3 sobre a baseline constante, 393 tokens, cai 30 pontos fora do treino). Nada sobre a configuração com chave real e árbitro ligado (não há chave nesta máquina; F1).

## Correcções e emendas nesta corrida

- Instrumento: nenhuma alteração ao protocolo. `amend.mjs` acrescenta cálculos (baselines, kappa-40, caudas, tier emitido) sobre o mesmo bruto.
- Segunda passagem do braço D (`cli_fallback` ligado) e uma chamada instrumentada: exigidas pelo protocolo, faltavam na v1 — **corrigido** (`results/D-tzachbon-cli.json`, `results/D-tzachbon-one-cli-call.json`).
- v1 dizia «T1 (10) e T3 (13)» para a regra nos R-24: **errado**, derivado à mão; o artefacto diz T3 17 · T1 6. Corrigido; a partir daqui os números das tabelas vêm de `analysis*.json`.
- Descoberta na corrida (não pedida): o hook lança o Option A para prompts T0 e o timeout de 1 000 ms mata-o antes de o 14B responder — 75/75 aqui, 91 % em produção. Registado em `09-DEFEITOS-APANHADOS.md` como D3.

## Reproduzir

```
node _handoff/provas-v1-2026-09-09/P1-decidir-custa-zero/run.mjs --all
node _handoff/provas-v1-2026-09-09/P1-decidir-custa-zero/run.mjs --analyse
node _handoff/provas-v1-2026-09-09/P1-decidir-custa-zero/amend.mjs
python _handoff/provas-v1-2026-09-09/P1-decidir-custa-zero/tz-classify.py <tzachbon>/plugins/claude-model-router-hook/hooks corpus-63.json results/D-tzachbon.json [--cli]
```
