# P1 · Adversário (motor diferente) e resposta

**Adversário:** Codex CLI 0.153.4 (`gpt-6-astra`, reasoning medium), sandbox read-only, prompt em `adversary-prompt-sent.txt` (protocolo + rubrica + veredicto v1 + `analysis.json`). Relatório integral em `adversary-codex-round1.md`. Autor: Claude (Fable 5.1) em Claude Code. **Crítico ≠ autor.**

## Ronda 1 — 21 ataques ao veredicto v1. Resposta um a um

| # | Sev. | Ataque (resumo) | Resposta | O que mudou |
|---|---|---|---|---|
| L1 | serious | Cegueira não demonstrada | Transcript integral da rotulagem (prompts enviados + saídas + JSON) copiado para `labels-transcript/`; modelo e config declarados; cwd do Codex era um scratch sem acesso ao repo. A rubrica «the same definitions the benchmark labels use» é a escada do próprio `validation-set.json`. | Evidência anexada. Sobrevive como «rotulado por outro motor, sem acesso ao repo, antes de qualquer classificação». |
| L2 | fatal | Regra da rubrica fixa os 23 R-24 | **Aceite.** Eu escrevi a linha que decide o rótulo dos 23. Ficam impressos, não se citam. | v2: número dos 40 lado a lado; os 23 declarados «rótulo determinado pela rubrica». |
| L3 | serious | Rubrica ambígua em conflitos | Verdade; não há regras de precedência congeladas. Contorno: métrica extra «só onde os 2 rotuladores concordam» (n=26): regra 12/26, juiz 20/26. | v2 imprime essa linha. |
| L4 | fatal | Kappa apresentado como validação | **Aceite.** Kappa mede acordo, não verdade. Recalculado só nos 40: **0,50** (não 0,62). | v2 reformula: «kappa 0,50 nos 40»; nunca «não são ruído». |
| C1 | serious | «Real» ≠ representativo | Procedimento de selecção está no `00-preflight.json` (pool 360 → elegíveis 298 → 40 por seed 20260909; exclusões: colagens, <20/>500 chars, scratchpads). Sobreposição com o desenvolvimento da regra: não auditada — a regra está congelada desde 2026-04 e os prompts são de agosto–setembro (34 de agosto, 6 de setembro; `corpus-40.json`); exposição indirecta (o dono escreve de forma parecida ao que a regra viu) **não se exclui**. | v2 declara a limitação. |
| C2 | serious | Anonimização altera o alvo | Medido: **0 dos 40** foram alterados pela redacção (nenhum marcador presente). | v2 declara. |
| S1 | fatal | Pseudo-replicação nos 63 | **Aceite.** 23 dos 34 discordantes são um template. O p de 3×10⁻⁷ fica impresso (pré-registado) e declarado inválido para generalização. | v2 rebaixa o 63 e imprime o 40 com «não significativo». |
| S2 | serious | Promover os 40 é post-hoc | Parcialmente aceite: o protocolo já dizia que os 40 e os 23 se imprimem em separado «porque os 23 são o mesmo template». Chamar aos 40 «o número que vale» foi decisão pós-dados; v2 imprime ambos com a hierarquia declarada e chama à derrota nos 40 «não significativa a 0,05, direcção contra a regra». | Reformulado. |
| S3 | serious | Baseline constante omitida | **Aceite e devastador.** «Sempre T2»: 45 % nos 40 (> regra 35 %; juiz 52,5 % só +3). | v2 imprime as 4 baselines constantes. |
| S4 | serious | Fosso treino→teste confunde composição | Aceite; composição por tier impressa (T3: 14/35 no treino vs 8/40). | v2 deixa de chamar «sobreajuste» ao fosso. |
| M1 | fatal | «Zero tokens» ≠ «custo zero» | **Aceite.** Medido o que o hook injecta (p50 870 bytes) e descoberto que o hook lança o Option A (75 chamadas locais, 75 timeouts). | v2 mata a frase «decidir custa zero». |
| M2 | fatal | Não há vitória em egress | **Aceite.** 0 vs 0 vs 0 é empate; proxies só no P5. | v2 retira a vitória. |
| M3 | serious | Instrumentação não fecha saídas | Construído um tap ao nível do socket (`lib/net-tap.cjs`, preload, cobre filhos Node), com controlos positivos (`net-tap.test.mjs`: vê https, fetch, loopback; bloqueia). Aplicável ao P5. Para o P1 os wrappers + stub continuam a ser a medida; a cobertura de subprocessos foi verificada no A-hook pelo log isolado (0 árbitro, 75 Option A). | Instrumento novo com teste que morde. |
| F1 | fatal | Ablação apresentada como Mooter completo | Aceite: A-key é a regra isolada; o hook real com credenciais e árbitro mede-se no P5 (sem chave nesta máquina o árbitro não corre — declarado). | v2 declara. |
| M4 | fatal | Caudas do hook omitidas | **Aceite.** p95 1 272 ms, média 565 ms impressos; os 57 vs 63 explicados (6 hits de cache logo na corrida 1). | v2 corrigido. |
| F2 | serious | Latências sem condições equivalentes | Aceite em parte: n e composição de cada latência agora explícitos (inclui repetições, fria/quente separadas para B). Não se afirma «empate». | Reformulado. |
| F3 | serious | Prompt do juiz não fornecido | `PROMPT_JUIZ.txt` no pacote, sha `2b871641…`, verificado byte-idêntico ao de `tools/ab/mooter-vs-sem.mjs`. O juiz recebe as convenções do repo; a rubrica do rotulador também. É simétrico face à regra? Não: a regra foi construída para a mesma política em regex. Declarado. | Anexado. |
| F4 | serious | Precisão da regra atribuída ao hook | Medido o tier **emitido** pelo hook: 14/40 (igual), 3/23, difere do `classify()` em 19/63. | v2 imprime. |
| F5 | fatal | Fallback de D declarado sem prova | **Aceite.** Segunda passagem corrida com `cli_fallback` ligado: 0 disparos (a abstenção precede). Uma chamada real instrumentada: 9+356 tokens, 52 k de cache, 5,97 s. | Ficheiros novos em `results/`. |
| W1 | serious | Veredicto contradiz o JSON (10/13 vs 6/17) | **Aceite.** Erro meu, derivado à mão. Agora `amend.mjs` deriva do artefacto: T3 17 · T1 6. | v2 corrigido; regra: tabelas só de `analysis*.json`. |
| P1 | serious | Congelamento não demonstrado por commit | Verdade: o primeiro commit (`f2739bcb`) tem protocolo e resultados juntos. A anterioridade é atestada pela ordem do transcript e pelos mtimes, não por git. **A partir do P3, o protocolo é commitado antes da corrida.** | Declarado. |

**Sobrevive:** 0 inferência / 0 hosts para classificar (medido); 14/40 vs 21/40; 0/23 vs 23/23; determinismo. **Reformulado:** cegueira, generalização, derrota nos 40, latência, fosso, kappa, concorrentes. **Morto:** «decidir custa zero», vitória em egress, kappa como validade, p dos 63 como generalização, distribuição 10/13, «correu como congelado» sem a 2.ª passagem do D.

## Ronda 2

Ver `adversary-codex-round2.md` (sobre a v2) e a nota no fim deste ficheiro.
