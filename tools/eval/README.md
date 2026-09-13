# tools/eval — Live Edit CCA eval harness

Harness de avaliação **reutilizável** (ativo permanente do repo, aditivo) para o Live Edit / motor
$0. Monta um grader stack no espírito do "Demystifying evals for AI agents" (Anthropic, Jan-2026) e
mede **pass@1** + **pass^k** por tarefa, com o vetor de custo/latência. É **read-only sobre o
produto**: só faz `require()` do motor congelado `packages/vscode-extension/src/live-edit-ast.js` e
nunca o modifica. Nenhum ficheiro de engine é tocado.

## Correr

```bash
# @babel/parser tem de estar instalado em packages/vscode-extension (dep do motor $0)
cd packages/vscode-extension && npm install

# baseline completo (k=5 trials/tarefa, cada um em sandbox limpo)
node ../../tools/eval/run.js --k 5

# só a suite de regressão (o gate por-commit) — sai != 0 se algum pass^k falhar
node ../../tools/eval/run.js --suite regression

# emitir JSON
node ../../tools/eval/run.js --json out.json

# provar que os graders mordem (podem falhar quando devem)
node --test ../../tools/eval/graders.selftest.js
```

O runner resolve o motor por caminho absoluto, portanto o `cwd` só importa para o `@babel/parser`
resolver a partir de `packages/vscode-extension/node_modules`. Correr a partir dessa pasta é o
caminho garantido.

## Estrutura

| Ficheiro | Papel |
|---|---|
| `run.js` | Runner CLI. k trials/tarefa em sandboxes limpos; faz a ÚNICA escrita (só em `ok`); imprime tabela + summary; sai !=0 se regressão quebrar. |
| `lib/engine-adapter.js` | A única ponte ao produto. `require()` read-only do motor; despacha cada op para uma primitiva **allowlisted** e regista o `toolCall`. |
| `lib/sandbox.js` | Ambiente isolado por trial (cópia temp do fixture). Sintetiza CRLF em runtime (evita normalização git). |
| `lib/load-golden.js` | Lê+valida o golden set JSONL (falha alto em tarefa malformada). |
| `lib/passk.js` | pass@1 / pass^k / pass_rate. |
| `lib/metrics.js` | Vetor por-edição: n_turns, n_toolcalls, tokens, TTFT, latência, tokens/s, custo. |
| `graders/state-check.js` | **Estado FINAL do ficheiro lido do disco**, nunca a alegação "✓ escrito" do motor. |
| `graders/deterministic-tests.js` | Re-parse do ficheiro final (compila) + gate de regressão que corre a suite unit real do motor. |
| `graders/tool-calls.js` | Prova least-privilege: só primitivas allowlisted, escrita presa ao ficheiro do sandbox. |
| `graders/static-analysis.js` | Check sintático $0 sempre-ligado + hook eslint/tsc pluggable (honesto: `wired:false` em fixture isolado). |
| `graders/llm-rubric.js` | Juiz LLM por-dimensão, isolado, com escape "Unknown". Default LOCAL ($0, ollama); cloud é opt-in, NÃO ligado na Fase A. |
| `graders/index.js` | Registo do stack + decisão de pass do trial (decisivos vs advisory). |
| `golden/live-edit.jsonl` | 20 tarefas pin→edição de falhas reais. Suites: `regression` (~100%) + `capability`. |
| `golden/fixtures/*.tsx` | Fixtures congelados derivados de ficheiros reais da landing. |
| `graders.selftest.js` | Prova que cada grader FALHA quando deve (anti grader-inútil). |

## Grader stack (§2 do masterprompt)

- **state_check** — decisivo. Lê o ficheiro do disco depois da escrita e compara com a expectativa
  da tarefa (contains/absent/line/outside_unchanged/is_inside_expression/crlf_preserved). Numa
  recusa, o ficheiro TEM de estar byte-idêntico ao original e a `reason` do motor tem de bater.
- **deterministic_tests** — o ficheiro final re-parseia (fail-to-pass: o fix aterrou e compila;
  pass-to-pass: a recusa não mexeu nada). `runEngineSuite()` corre a suite unit real do motor
  (`live-edit-ast.test.js`) como gate de regressão — **reutilização**, não duplicação.
- **tool_calls** — só primitivas allowlisted correram; qualquer escrita ficou presa ao ficheiro do
  sandbox (apanha a classe P0-1 "árvore errada" e o red-team "escrever num asset whitelisted").
- **static_analysis** — parse sintático $0 sempre + hooks eslint/tsc pluggable. **Honesto**: os
  fixtures são snippets .tsx isolados (sem tsconfig/eslintrc de projeto), por isso o lint de projeto
  reporta `wired:false`; aponta-se o harness a um package real (Fase F/CI) para o ligar.
- **llm_rubric** — interface de juiz por dimensão com "Unknown". Default local ($0). Na Fase A só é
  invocado por tarefas com `judge_dimensions` (free-prompt / agente), que estão **BLOCKED**, logo
  neste baseline nenhum veredicto ao vivo é emitido. Interface documentada + stub local, como o
  brief permite.
- **métricas** — no caminho $0 determinístico: tokens=0, custo=$0, n_turns=1, latência real em ns.
  A coluna cloud fica honestamente vazia até um juiz/agente ser ligado (fora do escopo Fase A).

## pass@1 / pass^k

`pass@1` = o 1º trial passou. `pass^k` = TODOS os k trials passaram. O motor $0 é determinístico,
então `pass^k == pass@1` por construção — corremos k trials reais em k sandboxes frescos para
**provar** o determinismo, não assumir. `pass^k` só diverge quando um caminho LLM estocástico for
ligado (MP5.2b).

## Tarefas bloqueadas (nunca saltadas em silêncio)

Duas tarefas são reportadas **BLOCKED** com razão explícita: `le-freeprompt-llm` (exige o caminho
LLM + juiz cloud/agente, não ligado na Fase A) e `le-agenttask-webview` (exige webview VS Code vivo
+ dev server; o gesto select→pin não existe headless). São contadas à parte, nunca como pass/fail.

## Mapa aos domínios CCA-Foundations

D1 orquestração (o runner + gates) · D2 tool design (tool_calls allowlist/least-privilege) ·
D3 config/workflows (worktree + gate de regressão no CI) · D4 output estruturado (state_check das
recusas honestas) · D5 fiabilidade (pass^k, sandbox limpo por trial).
