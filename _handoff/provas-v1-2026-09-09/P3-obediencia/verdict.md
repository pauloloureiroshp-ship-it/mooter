# P3 · Obediência > 0 — veredicto (v2, depois do adversário)

**Corrida:** 2026-09-09, 13:49–14:48Z (início: `ts` do `last-subagent.json` lido no fim da n01, `decision_at_spawn.ts` = 1788961773555 = 13:49:33Z em `results/A-sonnet.json` — ficheiro partilhado, D10: atribuir a escrita à n01 é inferência; fim: `at` de `results/A-opus.json`) · protocolo `5efd58ed` commitado 13:47:54Z, antes da primeira sessão · corpus `corpus-20.json` (sha256 `b4a8ac5b…`, blob `e517f362` nesse commit; n01–n21 sem n14: os 20 primeiros prompts reais que a regra **com chave** marcou T0/T1 no P1, sem push/deploy/delete/rm) · cada sessão numa cópia descartável do repo, `claude.exe -p --model sonnet --max-turns 12 --output-format stream-json`, **hooks do dono ligados**, sessões **sem chave**, `OLLAMA_HOST` num proxy de contagem em loopback · bruto em `results/A-sonnet.json`, `results/B-sonnet.json`, `results/A-opus.json`, `results/analysis.json` · `AMENDMENT-1.md` (atribuição, decisão no spawn, errata do sha, correcção da cláusula temporal do analisador) · adversário: `adversary-codex-round1.md` → `adversary.md`.

## Veredicto em uma linha

**Obediência executada: 0/20 nos dois braços — imprime-se como derrota.** O modelo spawnou o subagente local em 3/20 sessões nativas e 4/20 com o hook de reescrita; o hook registou 8 tentativas de rewrite em 8 spawns; mas **nenhuma** chamada ao Ollama atribuível a um subagente foi registada — o analisador classifica todas as 35 chamadas locais (18 em A, 17 em B) com a assinatura do pré-cálculo do próprio hook, por nome de modelo ou pelo tecto de 256. A «delegação executada com contagens no recibo» que o roadmap pede **não aconteceu** nesta corrida.

## Os números (20 sessões por braço, mesmos prompts, mesma ordem; contagens reportadas pelo analisador)

| | **A · sessão nativa** (o `UserPromptSubmit` vivo injecta o `<router-hint>`; sem hook PreToolUse adicional) | **B · A + `pretooluse-route.js`** (PreToolUse em `Agent|Task`: tenta reescrever `subagent_type`/`model` conforme `last-subagent.json`) |
|---|---|---|
| Sessões com ≥ 1 spawn de subagente (Wilson 95 %) | 4/20 · 20 % [8,1; 41,6] | 8/20 · 40 % [21,9; 61,3] |
| Sessões com spawn de `local-summarizer` | 3/20 (n03, n09, n15) | 4/20 (n03, n09, n11, n15) |
| **Delegação executada** — spawn local **e** chamada ao Ollama **atribuível ao subagente** (sem a assinatura do Option A do hook; em B, posterior ao rewrite) — a métrica do protocolo | **0/20 · 0 % [0; 16,1]** | **0/20 · 0 % [0; 16,1]** |
| Coocorrência (spawn local + qualquer chamada Ollama na sessão) — a métrica v1, **não** atribui | 3/20 | 4/20 |
| Spawns de `cheap-triage`/Haiku | 0/20 | 0/20 |
| Hook PreToolUse: tentativas de rewrite registadas | — | 8 (em 8 spawns: 3× `Explore`, 1× `model-reasoner`, 4× `local-summarizer`, todas → `local-summarizer`); **aplicação pelo harness não verificada** |
| Chamadas ao Ollama, por assinatura | 18 = 15 `qwen3:30b` com `eval_count = 256` + 1 `qwen2.5:3b` com `eval_count = 8` (n07) + 2 `gemma4:e4b` em erro HTTP 400 sem contagens (n09); o analisador classifica **as 18 com a assinatura do hook**, por nome de modelo ou pelo tecto de 256; 0 «outra» | 17 = 15 `qwen3:30b` com `eval_count = 256` + 2 `qwen2.5:3b` (`eval_count` 8 em n07, 1 em n20); **as 17 com a assinatura do hook**; 0 «outra»; nas 6 sessões com rewrite **e** chamada (n03, n04, n09, n11, n15, n16), a chamada precede o rewrite |
| Decisão do router no spawn | **n/d** (ficheiro partilhado, lido no fim; D10) | n/d (idem; o hook leu T0 nas 8, possivelmente contaminado) |
| Uso do modelo principal por sessão (média): entrada / saída / cache lida | 9,3 / 4 093 / 460 840 | 7,7 / 3 342 / 357 652 |
| Duração média por sessão | 77,1 s | 75,7 s |
| Exits | 19/20 = 0 (n07: tecto de 12 turnos, sem delegação — conta, ITT) | 20/20 = 0 |

**Sonda com Opus** (braço A, n01–n05): spawn local 1/5 (n05); executada (estrita) **0/5**; exit 4/5. Descritivo.

## Leitura honesta

1. **O resultado é uma derrota clara e útil:** o subagente `local-summarizer` foi spawnado 7 vezes em 40 sessões e **nunca** chamou o `ollama_call.sh` (nenhuma chamada com o tecto de 512 tokens desse script; todas as 30 chamadas `qwen3:30b` têm exactamente o tecto de 256 do Option A do hook e, em B, precedem o rewrite). Porquê — respondeu com o próprio Haiku, ferramenta negada em `-p`, caminho do script — **n/d**: o `run.mjs` não persistiu os streams. É o próximo instrumento a construir.
2. **O hook de reescrita chega, mas não se prova que actue:** 8 tentativas registadas em 8 spawns; o log é escrito antes do `updatedInput` e os `agent_calls` mostram o input original. E mesmo que tenha actuado, o subagente resultante não executou localmente.
3. **A comparação entre braços não identifica efeito:** 4 vs 8 spawns e 3 vs 4 spawns locais são diferenças de sessões únicas sem controlo de estado; n = 20, sem teste pré-registado. Não se afirma melhoria nem ausência de efeito.
4. **A selecção do corpus e a execução não coincidem:** prompts escolhidos como T0/T1 **com chave**, corridos **sem chave** (T1 degrada para T0 na runtime) — 0 spawns Haiku não testa T1.
5. **A decisão «vigente» não é observável:** `last-subagent.json` é um ficheiro por máquina, escrito por todas as sessões (a minha incluída). A obediência «à recomendação» exige uma decisão por sessão que o produto hoje não tem (D10).
6. **Custo:** ~360–460 k tokens de cache lidos por sessão; ~5 k tokens Ollama por braço, **todos do hook**. Subscrição; API = 0 — **declarado** a partir do ambiente da sessão (sem `ANTHROPIC_API_KEY` definida), não medido nos resultados.

## O que isto NÃO prova

- Obediência > 0 (não aconteceu). Qualidade do trabalho delegado (P7). Que o hook PreToolUse *força* ou sequer altera o spawn (aplicação não verificada). Efeito causal do hook. Comportamento com chave (T1). Reprodutibilidade run-a-run. A causa da não-execução pelo subagente.

## Reproduzir

```
node _handoff/provas-v1-2026-09-09/P3-obediencia/run.mjs --corpus
node _handoff/provas-v1-2026-09-09/P3-obediencia/run.mjs --arm A --model sonnet
node _handoff/provas-v1-2026-09-09/P3-obediencia/run.mjs --arm B --model sonnet
node _handoff/provas-v1-2026-09-09/P3-obediencia/run.mjs --arm A --model opus --only n01,n02,n03,n04,n05
node _handoff/provas-v1-2026-09-09/P3-obediencia/run.mjs --analyse
```
