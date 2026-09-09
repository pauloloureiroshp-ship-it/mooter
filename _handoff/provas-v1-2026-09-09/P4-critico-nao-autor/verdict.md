# P4 · Crítico ≠ autor — veredicto

**Corrida:** 2026-09-09 · protocolo `030374b1` commitado 13:54:58Z, **antes** de gerar mutantes (13:56:30Z) e de qualquer revisão · 28 mutantes mortos por teste (mooter 10, fastify 8, hono 10 — o protocolo pedia «os primeiros 10 por repo»; o fastify só produziu 8 no tecto: **n = 28, não 30**) + 28 controlos idênticos sem a mutação = **56 janelas** · `mutants.json`, `windows.json`, `results/A.json`, `results/B.json`, `results/analysis.json`.

## Veredicto em uma linha

**Perdeu a hipótese, ganhou a proveniência.** O crítico em motor diferente (Codex) **não** apanha mais defeitos plantados do que o mesmo motor a rever-se (Opus): 26/28 contra 27/28, e tem **mais** alarmes falsos (4/28 contra 2/28). Nenhuma das duas diferenças é significativa. O que ambos entregam a 100 % é o que o pilar de revisão do Mooter exige: **59 citações `PROVA: ficheiro:linha` em 59 achados, todas a resolver para uma linha real** (`checkCitation`, corrigido em D2).

## Os números (mesmas 56 janelas, mesmo `DIFF_SYSTEM_PROMPT` verbatim, revisor sem acesso ao repo)

| | **A · auto-revisão** — Opus via `claude -p`, hooks e tools desligados, 1 turno | **B · crítico ≠ autor** — Codex CLI gpt-6-astra, read-only, cwd vazio |
|---|---|---|
| Recall nos 28 mutantes (TP, Wilson 95 %) | **27/28 · 96,4 % [82,3; 99,4]** | 26/28 · 92,9 % [77,4; 98,0] |
| WRONG-REASON (achado noutra linha) | 0 | 0 |
| Alarmes falsos nos 28 controlos (FP, Wilson 95 %) | **2/28 · 7,1 % [2,0; 22,6]** | 4/28 · 14,3 % [5,7; 31,5] |
| Citações válidas / achados | 29/29 | 30/30 |
| Por repo (TP/mutantes · FP/controlos) | mooter 10/10 · 1/10 — fastify 7/8 · 1/8 — hono 10/10 · 0/10 | mooter 9/10 · 1/10 — fastify 7/8 · 2/8 — hono 10/10 · 1/10 |
| Tempo médio por janela | 19,3 s | 17,3 s |
| Recursos | 50 469 tokens de saída; 1,03 M cache lida; 2,68 M cache escrita; estimativa de lista do CLI US$ 28,61 (subscrição, não factura) | tokens **n/d** (o `codex exec` não os imprimiu no formato que o instrumento esperava) |
| Exits | 56/56 = 0 | 56/56 = 0 |

**Teste pré-registado (McNemar exacto direccional, α 0,05):**

| H1 | Discordantes | p |
|---|---|---|
| B apanha mais mutantes (B TP e A não) | B 0 · A 1 (só `mooter-02-M`) | **p = 1,0** — não suportada |
| B tem menos alarmes falsos | B-só 2 (`fastify-07-C`, `hono-09-C`) · A-só 0 | **p = 1,0** — não suportada |

**Concordância:** 53/56 janelas com o mesmo desfecho. Os dois FP de A são **os mesmos** dois de B (`mooter-05-C` `agents-progress-status.js:62`, `fastify-05-C` `noop-set.js:8`) e os dois falharam o mesmo mutante (`fastify-05-M`). Dois motores diferentes a marcar a mesma linha *original* como defeito é um candidato a defeito real pré-existente, **não verificado aqui** (fica em `10-NAO-PROVADO.md`).

## Leitura honesta

1. **A tese «crítico ≠ autor apanha mais» não sobreviveu a esta corrida.** Com mutações sintácticas de uma linha, ambos os motores estão perto do tecto (26–27 de 28) e a diferença de 1 é ruído. A expectativa honesta do protocolo já o dizia: «se A ≥ B, imprime-se: o valor do crítico é proveniência, não recall».
2. **O que o Mooter acrescenta, medido, é a verificação da citação**, não o motor: 59/59 `PROVA:` resolvem para linhas reais nos três repos — e isso só é verificável porque o `evidence-verifier` deixou de aceitar a linha N+1 (D2, apanhado a preparar esta prova).
3. **Independência:** B não viu o repo (cwd vazio, read-only) e acertou 26/28 só com a janela de ±25 linhas. O «autor» aqui é o motor Opus a rever janelas que **não** escreveu — a auto-revisão real (mesmo modelo, mesma sessão, mesmo contexto) não foi medida; é o desenho mais próximo que se conseguiu sem um pipeline que escreva código.
4. **Determinismo:** 1 corrida por janela por braço; a temperatura não é controlável no `claude -p`. Declarado no protocolo.
5. **Custo:** o braço A gastou o equivalente a US$ 28,61 de lista (subscrição) em 56 janelas — 0,51 por janela. O B custa `n/d` (Codex não reportou). Nenhum dos dois é o crítico **local** ($0) que o roadmap quer; mediu-se em 2026-08-21 que esse tem zero discriminação e **não** foi repetido aqui.

## O que isto NÃO prova

- Defeitos reais de produção (são 12 operadores de mutação sintáctica). Tempo humano. Que o crítico local (Ollama) faz isto (mediu-se que não). Qualidade de revisão de PRs multi-ficheiro. Que os dois FP partilhados são defeitos reais (candidatos, não verificados). Reprodutibilidade run-a-run (1 corrida).

## Reproduzir

```
node _handoff/provas-v1-2026-09-09/P4-critico-nao-autor/mutate.mjs        # 28 mutantes + 56 janelas (repos em Temp/provas-p4)
node _handoff/provas-v1-2026-09-09/P4-critico-nao-autor/review.mjs --arm A
node _handoff/provas-v1-2026-09-09/P4-critico-nao-autor/review.mjs --arm B
node _handoff/provas-v1-2026-09-09/P4-critico-nao-autor/review.mjs --analyse
```
