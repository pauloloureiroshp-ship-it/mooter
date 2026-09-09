# P3 · AMENDMENT-1 — atribuição, decisão no spawn, errata do sha (depois do adversário, ronda 1)

**Gatilho:** `adversary-codex-round1.md` (8 ataques, 99 s, sem acesso ao repo). Dois eram defeitos do instrumento de **análise** (não da corrida): corrigem-se na análise, não se re-corre (o bruto é o mesmo e a re-corrida exigiria o `claude.exe` que o P7 está a usar sozinho). Nenhum número da corrida muda; muda o que se pode afirmar a partir dele.

## 1 · Atribuição da chamada ao Ollama (P3-01, fatal) — a métrica «executada» passou a 0/20

- **O que a análise v1 fazia:** «delegação executada» = spawn de `local-summarizer`/`local-transformer` **e** qualquer chamada ao Ollama com `eval_count` na mesma sessão. Dava 3/20 (A) e 4/20 (B).
- **O que o bruto mostra quando se olha para a assinatura:** o pré-cálculo Option A do hook (`ollama_call_node.js`) usa `num_predict: 256` e prefere `qwen3:30b`; o `ollama_call.sh` que o subagente `local-summarizer` corre usa `num_predict: 512`. **Todas** as 30 chamadas `qwen3:30b` dos dois braços têm `eval_count = 256` exacto e ~90–125 tokens de prompt; em B, **todas** precedem o `ts` do rewrite do hook (ex.: n03 Ollama 14:18:39Z, rewrite 14:19:01Z). Eram o hook, não o subagente.
- **Métrica corrigida (`sessions_with_EXECUTED_local_delegation_strict`):** spawn local **e** chamada **sem** a assinatura do hook (`eval_count ≠ 256`, modelo ≠ `gemma4:e4b`/`qwen2.5:3b`) e, em B, posterior ao rewrite → **0/20 em A, 0/20 em B**. A coocorrência antiga fica publicada com o nome certo (`sessions_with_local_spawn_AND_any_ollama_call`).
- **O que não se sabe:** porque é que os 7 subagentes `local-summarizer` spawnados (3 em A, 4 em B) não chamaram o `ollama_call.sh` (responderam com o próprio Haiku? ferramenta negada em `-p`? caminho do script?). Os streams `stream-json` não foram persistidos pelo `run.mjs` — a cadeia spawn→Bash→Ollama não é reconstruível. Fica em `10-NAO-PROVADO.md`.

## 2 · «Decisão no spawn» (P3-05) — n/d

`decision_at_spawn` era lido no **fim** de cada sessão de `~/.claude/tools/router/last-subagent.json` — um ficheiro **global à máquina** que a minha sessão interactiva também escreve a cada turno. Não é a decisão no instante do spawn; **5** prompts (n02, n03, n04, n07, n11) têm tier diferente entre braços por isso (a v1 dizia 4). `recommendations_by_tier` passa a `n/d` como medida. O tier lido pelo hook PreToolUse no rewrite (T0 nas 8) sofre da mesma contaminação: pode ser a última decisão da sessão do operador. Defeito **D10** em `09-DEFEITOS-APANHADOS.md` (o ficheiro partilhado é defeito de desenho do produto: uma decisão por máquina, não por sessão).

## 3 · Errata do sha do corpus (P3-04)

O protocolo dizia «lista fixada em `corpus-20.json` com sha» e não continha o digest. `corpus-20.json` sha256 = `b4a8ac5b6ce869400ec4a4fc00ccfe226f1c5bbbe1c75a95ef2944af80a95fed`, blob git `e517f362` no commit `5efd58ed` (13:47:54Z, antes da primeira sessão às 13:5xZ). A anterioridade é a do commit. Selecção: os 20 primeiros prompts reais que a regra **com chave** marcou T0/T1 na corrida 1 do P1 (`A-key.json`), excluídos os que mencionam push/deploy/delete/rm; n14 caiu por essa exclusão. As sessões correram **sem chave** — declarado.

## 4 · Rewrites «aplicados» (P3-02)

O hook escreve a linha de log **antes** de devolver `updatedInput`; o log prova que o ramo correu, não que o harness aplicou a alteração. Os `agent_calls` gravados mostram o input **original** do modelo (`Explore`, `model-reasoner`, `local-summarizer`). Passa a dizer-se «8 tentativas de rewrite registadas; aplicação pelo harness não verificada». Em nenhuma das 8 se seguiu uma chamada ao Ollama atribuível ao subagente.

## 5 · n07 (P3-07)

Exit 1 com `num_turns: 13` = tecto de 12 turnos, não timeout de 300 s. Conta como «sem delegação» (ITT), como o protocolo manda.

**O que não mudou:** corpus, sessões, brutos, regra de paragem, o hook `pretooluse-route.js`.
