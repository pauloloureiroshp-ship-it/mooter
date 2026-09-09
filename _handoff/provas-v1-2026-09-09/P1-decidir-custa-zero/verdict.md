# P1 · Decidir custa zero — veredicto (v4, depois de duas rondas do adversário e de uma auditoria numérica independente)

**Corrida:** 2026-09-09 · protocolo congelado antes da primeira classificação (`protocol.json`; anterioridade atestada apenas pela ordem do transcript e pelo mtime do ficheiro, **não** por um commit anterior nem pelo `congelado_em`, que era escrito à mão — ver errata do carimbo abaixo; a partir do P3 os protocolos são commitados antes) · bruto em `results/` · `analysis.json` (`run.mjs --analyse`) · `analysis-extra.json` (`amend.mjs`, cálculos sobre o mesmo bruto exigidos pelo adversário) · `nettap-*.jsonl` (tap ao nível do socket v1, 1 corrida extra por braço: só eventos `tap-loaded`, nenhum registo de ligação — ver «Custo de decidir») · v1 e v2 deste ficheiro no git (`f2739bcb`, `22388a20`). Adversário: `adversary.md` (2 rondas, Codex).

**Carimbo do protocolo (errata):** o `congelado_em` do `protocol.json` dizia `2026-09-09T13:05:00Z` — escrito à mão e **posterior** a todos os braços da 1.ª corrida (`results/A-key.json` 12:57:48Z … `results/rater2-local.json` 13:04:25Z). O mtime do ficheiro é 12:55:43Z (anterior, mas não é prova) e o primeiro commit, `f2739bcb` (13:14:20Z), traz protocolo e resultados juntos. O valor foi substituído por `n/d — escrito à mão (13:05Z) e posterior aos braços; mtime do ficheiro 12:55:43Z; primeiro commit f2739bcb (13:14:20Z) tem protocolo e resultados juntos — ERRATA-timestamps.md` (o ficheiro está na raiz do pacote); todos os outros campos do protocolo ficaram byte-idênticos. A anterioridade do P1 fica **não atestada pelo git**.

## Veredicto em uma linha

**A regra classifica sem inferência e sem rede (0 medido pelos wrappers http/https/fetch + stub Ollama em 1 176 classificações; o tap ao nível do socket dessa corrida não registou ligação nenhuma — nem as que sabemos ter existido — e não atesta ausência) e em microssegundos; o hook em que vive não é grátis (207 ms p50, 1 272 ms p95; ~870 bytes de contexto por prompt; uma pré-resposta local que expirou 75/75 vezes). Na precisão contra rótulos cegos, nestes 40 prompts reais amostrados, a regra fica abaixo de um juiz LLM local e abaixo da baseline constante «sempre T2».**

## Os números

### Precisão (rótulo = Codex, cego e sem acesso ao repo; 2.º motor = qwen3.6:27b, só para kappa)

| Conjunto | A · regra, chave simulada | A · sem chave (esta máquina) | B · juiz LLM local 14B | «sempre T2» (constante) |
|---|---|---|---|---|
| **40 prompts reais, 2026-08-01 → 2026-09-04** (34 de agosto, 6 de setembro, pelos `ts` do `corpus-40.json`; amostra por seed de 298 elegíveis; 0 alterados pela anonimização; 40 distintos após a normalização do classificador) | **14/40 = 35,0 %** [22,1; 50,5] | 13/40 = 32,5 % [20,1; 48,0] | **21/40 = 52,5 %** [37,5; 67,1] | 18/40 = 45,0 % [30,7; 60,2] |
| 23 prompts R-24 (um template; rótulo decorre de uma linha da rubrica) | 0/23 [0; 14,3] (regra: T3 ×17, T1 ×6) | 0/23 | 23/23 [85,7; 100] | 23/23 |
| 63 fora de treino (número pré-registado do cartão; pseudo-replicado pelos 23) | 14/63 = 22,2 % [13,7; 33,9] | 13/63 = 20,6 % | 44/63 = 69,8 % [57,6; 79,8] | 41/63 = 65,1 % |
| 35 de treino (calibração; composição diferente: T3 14/35 vs 8/40) | 31/35 = 88,6 % [74,0; 95,5] | 32/35 = 91,4 % | 29/35 = 82,9 % [67,3; 91,9] | 5/35 |
| 40 reais, só onde os 2 motores rotuladores concordam (n=26) | 12/26 = 46,2 % [28,8; 64,5] | — | 20/26 = 76,9 % [57,9; 89,0] | — |
| 40 reais, contra o 2.º motor | 19/40 = 47,5 % [32,9; 62,5] | — | 26/40 = 65,0 % [49,5; 77,9] | — |

McNemar exacto direccional, pré-registado sobre os 63 (H1: A > B): b=4, c=34 → p(A>B)=1,00; p(B>A)=3,0×10⁻⁷ — **inválido como generalização** (23 dos 34 discordantes são um template). Sobre os 40: b=4, c=11 → p(B>A)=**0,059**, bilateral 0,118 — não significativo a 0,05; direcção contra a regra. Regra vs «sempre T2» nos 40: 4 acertos de diferença, **sem teste emparelhado** (não pré-registado); é uma observação. Kappa entre os dois motores rotuladores nos 40: **0,50** (acordo 26/40); nos 14 desacordos, a regra coincide com o 2.º motor em 7 e com o Codex em 2.

### Custo de decidir

| Métrica | A · regra | Hook completo (`inject_context.js`, HOME isolado, `ANTHROPIC_API_KEY=provas-presenca-falsa`) | B · juiz LLM | D · tzachbon |
|---|---|---|---|---|
| Chamadas a modelo para decidir | **0** — stub Ollama: 0 pedidos; wrappers http/https/fetch: 0 chamadas (1 176 classificações); tap ao nível do socket (v1, 1 corrida extra): 1+64 processos Node com `tap-loaded` e **nenhum registo de ligação** — mas o mesmo tap também não viu as ligações do hook (célula ao lado), logo é ponto cego do instrumento, não segundo instrumento | classify: 0 · **Option A: 75 chamadas locais lançadas** para prompts T0, **75 expiradas a 1 000 ms** (log isolado). Na corrida extra com tap (1 corrida): 25 filhos `ollama_call_node.js` lançados para 127.0.0.1:11434 (`A-hook-nettap.json` → `option_a_miss` 25) e 63 filhos `node -e` dirigidos ao tracker em 127.0.0.1:7821 (POST `/decision` / pedido `/metrics` do hook), e o `nettap-A-hook.jsonl` tem 205 `tap-loaded` e **0 registos de ligação** — o tap v1 (commit `f2739bcb`) só registava no `close` e estes processos saem antes; as fases open/exit entraram em `5efd58ed` (tap v2, instrumento do P5) | 1 por prompt | 0 heurística; fallback nunca disparou (abstenção prévia) |
| Tokens por prompt | 0 | 0 para classificar; Option A: n/d (processo morto a 1 s) | **393** média nos 63 (in p50 362, out 3; n=63) · **347** média nos 40 reais (n=40) | uma chamada de fallback invocada à parte: 9 in + 356 out + 52 203 de cache, 5,97 s; nenhuma disparou neste corpus |
| Bytes de contexto injectados por prompt | — | **p50 870 · média 998 · p95 1 473** | — | — |
| Latência | em processo **p50 0,002 ms**, p95 1,9 ms, máx 5,0 (n=588: 98 prompts × 6 corridas, com aquecimento) · processo filho **p50 96,6 ms**, p95 100,8 (n=378) | **p50 207 ms · p95 1 272 ms · média 565 ms** (n=189); classify interno: spawn p50 91,9 (n=57), cache p50 1,53 (n=132); a cauda é o timeout do Option A | p50 77 ms quente, máx 3 047 ms (carga fria) | n/d |
| Determinismo | 6/6 corridas byte-idênticas | — | 98/98 iguais em 3 corridas | — |
| Hosts externos | 0 (wrappers + stub; o tap não acrescenta) | 0 pelo log isolado (árbitro 0). A chave **não** estava ausente: `run.mjs` põe `ANTHROPIC_API_KEY=provas-presenca-falsa`; o refresh de orçamento foi accionado (`.budget-refresh.lock` existe no HOME isolado) mas não lançou filho nem foi buscar nada, porque `refresh-budget.js` não existe nesse HOME — o hook real mede-se no P5 | 0 (loopback) | 0 (o fallback contactaria api.anthropic.com) |

Tier **emitido pelo hook** (com `safety_boost`, vetos): 14/40, 3/23, 17/63; difere do `classify()` em 19 de 63.

## Leitura honesta

1. **O que sobrevive como facto:** a regra classifica sem inferência e sem rede — 0 medido pelos wrappers + stub (1 176 classificações); o tap ao nível do socket da corrida extra **não** é segundo instrumento — 270 `tap-loaded` nos três `nettap-*.jsonl`, nenhum registo de ligação, e 25 + 63 filhos que ligaram ao loopback e não aparecem nele. Nestes 40 prompts reais faz 14/40 contra 21/40 do juiz e 18/40 da constante «sempre T2».
2. **«Decidir custa zero» está morto como frase.** Zero inferência ≠ custo zero: 207 ms (p50) a 1,27 s (p95) de hook, ~870 bytes que o modelo seguinte paga, e uma chamada local por prompt T0 que aqui expirou 75/75 (o `decisions.log` vivo, lido a ~13:15Z de 2026-09-09 e fora de `results/`: 377 misses = 67 `timeout_1000ms` + 292 `Invalid` + 18 sem `motivo`; 36 hits = 33 `qwen2.5:3b` + 3 sem campo de modelo; a extrapolação causal fica por fazer).
3. **Não há vitória em egress nesta prova.** 0 vs 0 vs 0. A comparação com proxies é o P5.
4. **Nestes 40, a regra perde.** Sub-classifica: T0 em 31 dos 40; 13 desses têm os dois motores rotuladores em T2/T3. O juiz LLM está 3 acertos acima da constante — não é uma solução, é 393 tokens por prompt para +3.
5. **O empate de 2026-09-01 era treino.** Hoje no treino: 31/35 vs 29/35; fora: 14/40 vs 21/40. A composição dos conjuntos é diferente (T3 40 % vs 20 %); não se isola sobreajuste.
6. **Os 23 do R-24 não são 23 observações.** Um template, rótulo determinado por uma linha da rubrica que eu escrevi. O p de 3×10⁻⁷ fica impresso por ter sido pré-registado e não se cita.
7. **tzachbon** abstém-se em 63/63 (defeito **D4** em `09-DEFEITOS-APANHADOS.md`: `has_task_intent` só reconhece imperativos em inglês; 4 sondas em inglês classificam). Com `cli_fallback` ligado (2.ª passagem): 0 disparos. `n/d` neste corpus, com motivo.
8. **C e E** não classificam complexidade: `n/d` por construção; egress no P5.

## O que isto NÃO prova

- Valor comercial. Obediência (P3). Nada acima de 500 caracteres (o protocolo dizia «> 4 k tokens», mais folgado; o corpus vai até 463 caracteres nos 40 e 604 nos 63 — fica o limite mais estrito). Que o rótulo cego é a verdade (kappa 0,50). Representatividade além dos 40 amostrados (exposição indirecta à fraseologia dos autores da regra não excluída). A configuração com chave real e árbitro ligado. Que um juiz LLM é a resposta. Que nenhum socket saiu da máquina durante a corrida do hook: o tap v1 não registou ligação nenhuma — nem as 25 + 63 ao loopback que sabemos ter existido — logo não testemunha num sentido nem no outro.

## Correcções e emendas nesta corrida

- Protocolo: nenhuma alteração a números, braços ou métricas; na v4 só o carimbo `congelado_em` foi substituído por `n/d` (ver §Corrida). `amend.mjs` acrescenta cálculos sobre o mesmo bruto; o tap v2 acrescenta uma corrida extra de instrumentação por braço (`--tag nettap`).
- 2.ª passagem do braço D e uma chamada instrumentada: exigidas pelo protocolo, faltavam na v1 — corrigido.
- v1 dizia «T1 (10) e T3 (13)» para a regra nos R-24: errado; o artefacto diz T3 17 · T1 6. Corrigido; tabelas só de `analysis*.json`.
- v2 dizia «Ganhou em egress» e «decidir custa zero»: retirado (adversário M1/M2).
- Descoberta não pedida: Option A expira 75/75 (D3 em `09-DEFEITOS-APANHADOS.md`).
- **Erratas da v4** (auditoria numérica independente, 2026-09-09):
  - v3 dizia «T0 em 30 dos 40; 12 desses…»: errado. `results/A-key.json` (corrida 1, n01–n40) dá T0 em **31** (`analysis.json` acc40: T2→T0 13 + T0→T0 11 + T3→T0 5 + T1→T0 2) e a intersecção `labels-63.json` ∩ `results/rater2-local.json` em T2/T3 dá **13** (n04, n05, n11, n12, n16, n17, n20, n21, n22, n25, n32, n34, n39). Corrigido no slide e aqui; `adversary.md` e `analysis-extra.json` não continham os números errados.
  - v3 dizia «40 prompts reais de setembro»: os `ts` do `corpus-40.json` vão de 2026-08-01 a 2026-09-04 (34 de agosto, 6 de setembro). Corrigido no slide e aqui.
  - v3 apresentava o tap ao nível do socket como segundo instrumento a atestar 0 ligações em 270 processos: os três `nettap-*.jsonl` só têm 270 `tap-loaded` e nenhum registo de ligação, e a mesma corrida lançou 25 filhos `ollama_call_node.js` e 63 filhos `node -e` dirigidos ao tracker em 127.0.0.1:7821 que não aparecem (tap v1 só registava no `close`; open/exit em `5efd58ed`). Reescrito como ponto cego do instrumento e acrescentado ao «NÃO prova».
  - v3 dizia «sem credenciais» para o A-hook: `run.mjs` põe `ANTHROPIC_API_KEY=provas-presenca-falsa`; o refresh de orçamento foi accionado (`.budget-refresh.lock` no HOME isolado) e não foi buscar nada porque `refresh-budget.js` não está nesse HOME. Corrigido.
  - v3 dizia «393 tokens/prompt» sem n: é a média nos 63 (`results/B.json`, corrida 1); nos 40 reais é 347. Os dois números com n, no slide e na tabela.
  - v3 dava o log vivo como «377 misses vs 36 hits, 67 timeouts, o resto `Invalid`»: 377 = 67 `timeout_1000ms` + 292 `Invalid` + 18 sem `motivo`; 36 = 33 `qwen2.5:3b` + 3 sem campo de modelo. Lido a ~13:15Z de 2026-09-09; não está em `results/`.
  - Errata a `results/analysis-extra.json` → `M4_hook_latency_full.note`: dizia «corrida 1 tem 63 prompts mas só 57 spawns: 6 prompts dos 40 partilham a chave…» — errado. 57 é o total das 3 corridas (53 na corrida 1 + os 2 prompts `user_override`, não cacheados, × 2 corridas seguintes); a corrida 1 teve **10** hits de cache, todos R-24 (os 63 colapsam em 52 sob `normalise_prompt.js`; duplicados só dentro de r01–r23); os 40 continuam 40 distintos. Só essa string foi editada (no JSON e na fonte `amend.mjs`, para o reproduzir não a regenerar errada); nenhum número do ficheiro mudou.
  - `protocol.json` → `congelado_em`: substituído por `n/d …` (ver §Corrida e `../ERRATA-timestamps.md`); todos os outros campos byte-idênticos.
  - O «Reproduzir» omitia que `run.mjs --all` não corre o braço D nem o `amend.mjs`. Completado.

## Reproduzir

`run.mjs --all` corre **só** os braços A (key/nokey), A-spawn (key/nokey), A-hook, B e B-rater2 — **não** corre o braço D (tzachbon) nem o `amend.mjs`; esses são comandos à parte, abaixo. `<tzachbon>` é um placeholder: o caminho do clone local de `tzachbon/claude-model-router-hook` em `f687111e`.

```
cd _handoff/provas-v1-2026-09-09/P1-decidir-custa-zero
node run.mjs --all
node hook-timings.mjs                 # anexa classify_ms por caminho a results/A-hook.json (lê o decisions.log do HOME isolado)
node hook-events.mjs A-hook.json      # anexa isolated_log_events (option_a_miss etc.)
# braço D — duas passagens (heurística pura; com cli_fallback) + 1 chamada instrumentada à parte
python tz-classify.py <tzachbon>/plugins/claude-model-router-hook/hooks corpus-63.json results/D-tzachbon.json
python tz-classify.py <tzachbon>/plugins/claude-model-router-hook/hooks corpus-63.json results/D-tzachbon-cli.json --cli
#   (results/D-tzachbon-one-cli-call.json = 1 chamada `claude -p --output-format json` com results/D-tzachbon-one-cli-prompt.txt, feita à mão)
node run.mjs --analyse                # results/analysis.json (lê D-tzachbon.json se existir)
node amend.mjs                        # results/analysis-extra.json
# corrida extra com o tap ao nível do socket (v1 em f2739bcb; v2 em 5efd58ed): preload lib/net-tap.cjs
#   NODE_OPTIONS=--require ../lib/net-tap.cjs  NET_TAP_OUT=results/nettap-<braço>.jsonl  node run.mjs --arm A|A-spawn|A-hook --runs 1 --tag nettap
node hook-events.mjs A-hook-nettap.json
```
