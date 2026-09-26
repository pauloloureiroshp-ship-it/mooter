# Adversário · ronda 1 (P0 — porte do instrumento para `tools/p0`)

`codex exec` (codex-cli 0.153.4, `gpt-6-astra`, `-s read-only`, `--ephemeral`, `--skip-git-repo-check`), cwd isolado e
vazio no scratchpad, **`HOME` e `USERPROFILE` num directório temporário** (`CODEX_HOME` no `~/.codex` real, só para a
autenticação). Na 1.ª linha de cada prompt: «NÃO CORRAS COMANDOS»; o código ia embutido no prompt, com números de linha.
Nenhuma das quatro corridas executou um comando (`exec` = 0 no stderr de cada uma).

`decisions.log`: `518a0eecc45d` (5 193 linhas) antes → `3ef5dc5c3b96` (5 201) no fim. As 8 linhas novas **não** são
do adversário: os ids das quatro sessões codex (`01a0df69…`, `01a0df77…`, `01a0df81…`, `01a0df86…`) aparecem **0** vezes
no log. 3 linhas são do hook vivo desta sessão do Claude Code; as outras 5 são de duas sessões `01a0…` que já tinham
125 linhas no log. `classify.js` = `427d8c0b…` · `tools/router/` sem nenhum ficheiro modificado.

| sub-ronda | UTC (26/09) | tokens | veredicto | ataques |
|---|---|---|---|---|
| r1 | 20:30:38 → 20:31:49 | 62 609 | NO-SHIP | A1–A21 (19 sérios, 2 menores) |
| r1b | 20:45:20 → 20:46:39 | 74 885 | NO-SHIP | A22–A36 (15 sérios) |
| r1c | 20:56:58 → 20:58:32 | 83 860 | NO-SHIP | A37–A43 (5 sérios, 2 menores) |
| r1d | 21:01:45 → 21:02:22 | 84 052 | NO-SHIP | A44–A47 (4 sérios) |

**47 ataques · 46 aplicados, cada um com teste · 1 recusado (A27).** Os A44–A47 foram aplicados **depois** da última
corrida: não houve r1e a confirmá-los. A prova é a mordida, não o veredicto do codex.

## Mordida

- **r1:** os 19 testes de `adversario-r1.test.mjs`, corridos contra o código original (`~/.mooter/p0` antes do porte,
  com `invocaRouterExecute`/`sanear` substituídos por equivalentes do comportamento antigo), falham **19/19**.
- **r1c/r1d:** cada correcção revertida numa cópia, uma de cada vez → o teste do ataque fica vermelho: A37/A44,
  A38, A39, A40, A41 (e o A46 com ele), A45 e A46 **mordem todos**.
- Suite final: `node --test tools/p0/test/*.test.mjs`, **65/65** (os 23 originais + 19 + 12 + 7 + 4).

## O que mudou por causa do adversário

### (a) Ligação hint→prompt e aderência
- **A1–A5, A22–A26, A37, A39, A44, A45 — atribuição pela cadeia, em duas passagens.** Todas as linhas se ligam ao
  prompt pela cadeia `parentUuid`, e não pela sequência. Uma cadeia partida ou cíclica, ou que atravesse uma linha
  sidechain, não conta (`fonte.hints_sem_dono`). Um turno aberto por `<task-notification>`, por compactação (a flag ou o
  texto «This session is being continued…») ou por origem não humana é barreira (`fonte.hints_de_turno_nao_humano`).
  A sequência/pendente fica só para transcripts **sem** `parentUuid` (formato antigo) e só se aplica a um prompt que
  também não traga cadeia. Um turno copiado (resume/fork) é retomado e não reaberto; o hint que a cópia traga
  acrescenta-se; o host é o 1.º pedido **por tempo**; as delegações deduplicam-se por `tool_use.id`.
  **Medido para o A25** (em 419 transcripts reais, só contagens): 109 de 149 837 linhas com pai escrito **depois** do
  filho, 33 delas `hook_success ← user` — que é exactamente onde vive o `<router-hint>`. Daí as duas passagens: a 1.ª
  constrói a cadeia e as raízes de turno; a 2.ª atribui e **adia** o que pertence a um prompt ainda por ler.
- **A6:** o invólucro antigo `<user-prompt-submit-hook>` só conta se for o último bloco do texto.
- **A7, A28, A38 — `router-execute` tem de ser invocado.** `node` em posição de comando (admite `VAR=…` e `timeout N`),
  nome exacto do ficheiro, caminhos entre aspas com espaços, terminadores `; & | )`. **Medido nos transcripts:** das
  formas que o regex antigo aceitava, as reais eram `sed`, `grep`, `git show` e `node --test router-execute*.test.js`
  (falsos positivos); duas invocações reais com `timeout 140` que o 1.º regex novo falhava foram repostas.
- **A8 — variante real, não o cenário literal.** O esquema do `mooter_work` tem `agent ∈ {cc, codex, gemini, moo, kimi}`
  (motor) e `model`, não nomes de subagente. O tier vem do `model`, ou `moo` → T0. **A9:** `Agent.model` conta como
  tier declarado.
- **A27 — recusado, por definição.** As delegações decidem primeiro: um turno que delegou nunca é *já no tier*. A
  precedência passou a estar escrita no README.

### (b) Dedup de tokens
- **A10, A11, A29, A46:** um pedido = `message.id`, ou o `requestId` quando falta; ficam reconciliados assim que uma linha
  traga os dois, com os tokens no máximo e o tempo na ocorrência mais antiga.
- **A12, A30, A40, A41:** a execução resolve-se depois de ler tudo, preferindo a que tem tipo conhecido. A identidade é
  única por `agentId` (sidechain antigo e `agent-<id>.jsonl`); o arranque é o 1.º pedido por tempo; as cópias parciais
  são uma execução só.
- **Medido:** sobre os mesmos dados reais, o código antigo e o novo dão **exactamente** os mesmos pedidos e output
  (41 864 · 43 876 610 nessa corrida); **0** `message.id` com mais de um `requestId` em 41 863.

### (c) Privacidade
- **A13, A14, A16, A31, A32, A42, A47:** modelos só com a forma de uma família conhecida (`claude-C--Users-…` não passa),
  versões só semver, tipos de agente só **conhecidos** (Mooter + built-in do CC), chaves da sonda só camelCase/snake.
  O que falha sai como `outro`, **nunca como hash** (reversível por dicionário). **Medido:** os 10 modelos reais e todas
  as chaves de topo reais continuam a passar.
- **A33:** valores do `cost-state` só números finitos. **A36:** mapas sem protótipo (`constructor`, `toString`).
- **A15, A34, A43, A47 (OTel):** o receptor reconstrói o OTLP só com a forma conhecida; cada chave da allowlist tem o
  **seu** normalizador de valor, sem fallback genérico; `traceId`/`spanId` em hex; `body`/`scope`/`name` só
  `claude_code.*`. Saíram da lista `tool_name`, `decision`, `source`, `language`, `terminal.type` e `speed`, que não têm
  enum conhecido e que o agregador não usa.
- **A17, A35:** nenhum caminho no stdout, nenhuma stack; porta e tecto validados antes do `listen`.

### (d) Receptor OTel
- **A18, A19:** `Host` só de loopback e `Origin` recusado **por presença** (mesmo vazio), antes de tudo — `/health`
  incluído. **A20:** sem recursão, handler em try/catch: JSON aninhado a 100 000 níveis não derruba o processo.
  **A21:** o tecto é em bytes UTF-8, por sinal e por dia.

## Efeito nos números reais (código original vs final, mesmos transcripts)

| | original | final |
|---|---|---|
| prompts humanos | 1 405 | 1 405 |
| com hint | 1 001 | 962 |
| seguiu | 52 | 22 |
| delegou a outro | 73 | 60 |
| **aderência** | **6,4 %** | **2,9 %** |
| hints de turno não humano | — | 336 |
| pedidos · output | iguais | iguais |

Decomposição da queda de `seguiu` (52 → 20 antes da correcção do `timeout`, → 22 depois): 28 vêm do `router-execute`
mencionado e não invocado (ver A7/A28); o resto vem de hints de `<task-notification>` que se colavam ao prompt humano
anterior. A aderência publicada até aqui (6,4 %) estava **inflacionada** pelo instrumento.

## Residuais declarados (também em `limites` no JSON)
- Um nome em `snake_case` minúsculo em `query_source`, e uma tag local em minúsculas com forma de modelo
  (`qwen-algo:7b`), ainda passam.
- Uma invocação de `router-execute` dentro de uma string multi-linha que o shell não executa ainda passa; não se
  verifica se a execução teve êxito.
- `mooter_work` sem `model` nem `agent=moo` não declara tier e conta como *delegou a outro*.
- Um hook antigo colado **exactamente** no fim do prompt ainda passa.
- Os transcripts sem `parentUuid` (formato antigo) continuam a ser atribuídos por sequência.
