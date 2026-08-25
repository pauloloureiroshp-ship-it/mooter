# BRIEF — ETA v1: instrumentação (passos + índice de percentis)

**Contexto.** O Mooter não diz quanto falta. O utilizador gasta interações com o
assistente só para perguntar "acabou?". Vamos construir uma ETA honesta. Esta
onda é **só a fundação de dados** — não mexe em UI nenhuma.

**Decisões já tomadas (não reabrir):**
- a unidade da ETA é **um job / um agente**, nunca a wave agregada;
- passar o p90 **avisa e continua**, nunca cancela nada;
- **nenhum número inventado.** Sem observações suficientes → `n/d` com o porquê.

---

## S1 — Todos os agentes reportam passo actual e total

**Problema medido:** no ledger desta máquina, só o `cc` escreve `steps_done`
(valores 8, 4, 4). O `codex` e o `moo` escrevem `0` em todos os jobs. Sem
denominador não existe barra honesta.

Em `packages/mooter-bridge/seamless.js`:

1. Quando `mooter_work` recebe `steps: [...]`, gravar no ledger, no evento
   `started`, o campo `steps_total` (o comprimento da lista). Isto é um
   denominador **real**, não estimado.
2. Emitir um evento de ledger `step` sempre que o parser do stream detectar
   avanço de passo, com `{ job_id, step_index, steps_total, ts }`.
   - `cc`: já há sinal — reaproveitar o que alimenta `steps_done`.
   - `codex`: derivar da contagem de chamadas de ferramenta no `out.log`.
     Se não houver sinal fiável, **escrever `steps_total: null` com `porque`** —
     nunca inventar um total.
   - `moo`: uma geração local é um passo único; `steps_total: 1` é honesto.
3. Não alterar `tools/router/classify.js` (FROZEN).

## S2 — Índice de percentis, escrito no fim de cada job

Criar `packages/mooter-bridge/eta.js`.

- No fecho de cada job (sucesso, falha ou timeout), actualizar
  `~/.mooter/eta-index.json` com a duração observada.
- Chave: `agente | categoria | faixa_de_contexto`.
  - `categoria`: reutilizar as categorias de tarefa que já existem no repo
    (`task-categories.ts` / `aprender.js`). Não inventar taxonomia nova.
  - `faixa_de_contexto`: bucket grosso do tamanho do prompt (p.ex. <4k, 4-32k, >32k).
- Guardar por chave: `n`, `p50`, `p75`, `p90`, `max`, `medido_em`.
- **Excluir do cálculo** jobs terminados por `cancelled-by-user` e
  `orphaned-by-restart` — não são duração de trabalho, são interrupção. Jobs de
  `timeout` contam para `max` mas não para as medianas (são censurados à direita).
- `n < 5` numa chave ⇒ essa chave devolve `null` com o `porque`.

**Requisito de desempenho, não negociável:** o caminho de leitura **nunca**
varre o `ledger.jsonl`. Lê um único ficheiro pequeno. Já pagámos este erro com
o `quota.estado` síncrono a bloquear 209 ms — não o repetir.

## S3 — Testes

Em `packages/mooter-bridge/eta.test.js`, com fixtures, provar que:
1. uma chave com `n=4` devolve `null` e um `porque` legível;
2. `cancelled-by-user` e `orphaned-by-restart` não entram nas medianas;
3. um `timeout` levanta o `max` sem contaminar o `p50`;
4. ler o índice não abre o `ledger.jsonl` (espiar o `fs`);
5. `steps_total` sem sinal fiável fica `null` com `porque`, nunca um número.

## Regras da casa

- `git add` **selectivo**, ficheiro a ficheiro. Nunca `git add -A`.
- Não fazer push. Não abrir PR.
- Comentários e mensagens de commit em português; identificadores em inglês.
- Todo o valor exposto traz `porque` quando é `null`.
- Se um passo não puder ser feito com honestidade, **parar e escrever o porquê**
  em vez de entregar um número plausível.
