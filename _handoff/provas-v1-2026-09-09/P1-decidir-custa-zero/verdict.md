# P1 · Decidir custa zero — veredicto

**Corrida:** 2026-09-09 · protocolo congelado antes da primeira classificação (`protocol.json`) · bruto em `results/` · estatística em `results/analysis.json` (`node run.mjs --analyse`).

## Veredicto em uma linha

**Ganhou em tokens e egress (0 medido), empatou-para-baixo em latência (a regra é 0,002 ms; o processo é ~97 ms; o hook que o utilizador sente é 119–211 ms), e PERDEU em precisão fora do treino** — contra um juiz LLM local de ~393 tokens/prompt, e contra rótulos cegos de outro motor.

## Os números (n e IC sempre ao lado)

| Métrica | A · regra (`classify.js`, com chave) | A · sem chave (esta máquina) | B · juiz LLM local (qwen2.5-coder:14b) | D · tzachbon hook |
|---|---|---|---|---|
| Precisão vs rótulo cego, **40 prompts reais** | **14/40 = 35,0 %** [22,1; 50,5] | 13/40 = 32,5 % [20,1; 48,0] | **21/40 = 52,5 %** [37,5; 67,1] | abstém 40/40 (PT) |
| Precisão, 23 prompts R-24 (um template) | 0/23 [0; 14,3] | 0/23 | 23/23 [85,7; 100] | abstém 23/23 |
| Precisão, 63 fora de treino | 14/63 = 22,2 % [13,7; 33,9] | 13/63 = 20,6 % | 44/63 = 69,8 % [57,6; 79,8] | n/d |
| Precisão, 35 de treino (calibração) | 31/35 = 88,6 % [74,0; 95,5] | 32/35 = 91,4 % | 29/35 = 82,9 % [67,3; 91,9] | n/d |
| Tokens para decidir, por prompt | **0** (medido: 0 chamadas ao stub Ollama, 0 chamadas http/https/fetch em 588 classificações) | 0 (idem) | **393** média (in p50 362, out 3; n=63) | 0 heurística; o `cli_fallback` nunca disparou (abstenção prévia) |
| Latência da decisão | regra em processo **p50 0,002 ms**, p95 1,9 ms (n=588); processo `node classify.js` **p50 96,6 ms**, p95 100,8 (n=378) | idem | **p50 77 ms** quente, máx 3 047 ms (carga fria) | n/d |
| Latência do hook completo (`inject_context.js`, HOME isolado) | cache miss **p50 210,8 ms** (classify interno 91,9 ms, n=57) · cache hit **p50 118,6 ms** (classify interno 1,53 ms, n=132) | — | — | — |
| Determinismo | 6/6 corridas byte-idênticas | 6/6 | 98/98 prompts iguais em 3 corridas | — |
| Egress para decidir | **0 hosts** contactados (wrappers em processo; 0 chamadas de árbitro no log isolado) | 0 | 0 (Ollama em loopback) | 0 |

**McNemar direccional, A-key vs B** (H1: A > B, pré-registada): 63 prompts: b=4, c=34 → p(A>B) = 1,00; **p(B>A) = 3,0 × 10⁻⁷**. 40 prompts reais: b=4, c=11 → p(A>B) = 0,98; **p(B>A) = 0,059** (bilateral 0,118) — não significativo a 0,05 com n=40, mas a direcção é contra a regra.

**Segundo rotulador** (qwen3.6:27b, mesma rubrica): kappa de Cohen **0,616** vs Codex (acordo bruto 77,8 %, n=63). Os rótulos do Codex são o que conta; o kappa diz que não são ruído.

## Leitura honesta

1. **A vitória estrutural é real e é aritmética.** Decidir com a regra não gasta um token nem contacta um host. Não é uma afirmação: o stub de Ollama recebeu 0 pedidos e os wrappers de rede viram 0 chamadas em 1 176 classificações (2 ambientes × 588).
2. **A latência tem três números, não um.** A regra custa microssegundos. O processo que o hook lança num cache miss custa ~97 ms. O hook completo que o utilizador sente custa 119 ms (hit) a 211 ms (miss). O «<50 ms» do R-22 era o classify interno em cache (1,5 ms aqui); o hook nunca fica abaixo de 100 ms nesta máquina.
3. **A precisão fora do treino é uma derrota, e fica impressa.** No treino a regra faz 88,6 % (31/35). Nos 40 prompts reais de setembro faz **35 %**: um fosso treino→teste de **53 pontos**. O juiz LLM cai de 82,9 % para 52,5 % — cai menos, e fica 17,5 pontos acima. A regra **sub-classifica sistematicamente**: diz T0 em 30 dos 40 prompts reais; em 12 deles os dois rotuladores concordam que era T2 ou T3 (ex.: n12, n16, n17, n22, n39 — T3 pelos dois; regra: T0).
4. **Os 23 do R-24 são um só template e o rótulo deles é determinado pela rubrica.** A rubrica que escrevi diz explicitamente que «corre o teste que falha e faz com que passe» é T2. O Codex e o 2.º rotulador seguiram-na. A regra diz T1 (10) e T3 (13) para o mesmo texto com nomes de ficheiro diferentes. Por isso o número dos 63 é dominado por um template e por uma linha da rubrica — **o número que vale é o dos 40**.
5. **O empate de 2026-09-01 (29/35 vs 29/35) não generaliza.** Era treino. A afirmação «tie with an LLM router at 0 tokens» só pode ir para o deck com o qualificador *on the training set*; fora dele a regra perde.
6. **tzachbon abstém-se em 63/63** porque `has_task_intent` só reconhece imperativos em inglês; em 4 sondas em inglês classifica (mechanical/implementation/architecture). Não é uma derrota dele nem uma vitória nossa: é um `n/d` com motivo, e um facto para o P8 (não serve um utilizador que escreve em português).
7. **C (claude-code-router) e E (LiteLLM)** não têm classificador de complexidade: precisão `n/d` por construção. O que se pode medir deles é egress (P5).

## O que isto NÃO prova

- Valor comercial de qualquer dos números.
- Obediência (P3). Uma decisão certa que ninguém executa vale zero.
- Nada sobre prompts > 4 k tokens (o corpus tem 20–500 caracteres).
- Que o rótulo do Codex é a verdade — é um rótulo cego, com kappa 0,616 contra um segundo rotulador.
- Que um juiz LLM é a resposta: 393 tokens e 77 ms por prompt, e cai 30 pontos fora do treino também.

## Correcções ao instrumento nesta corrida

Nenhuma. `AMENDMENT`: nenhuma. O protocolo correu como congelado.

## Reproduzir

```
node _handoff/provas-v1-2026-09-09/P1-decidir-custa-zero/run.mjs --all
node _handoff/provas-v1-2026-09-09/P1-decidir-custa-zero/run.mjs --analyse
python _handoff/provas-v1-2026-09-09/P1-decidir-custa-zero/tz-classify.py <tzachbon>/plugins/claude-model-router-hook/hooks corpus-63.json results/D-tzachbon.json
```
