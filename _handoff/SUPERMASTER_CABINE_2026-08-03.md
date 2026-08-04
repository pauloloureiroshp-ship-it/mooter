# SUPERMASTER — CABINE (Mooter cockpit por sessão)

> **Destino:** sessão nova do Claude Code em `~/frugal`.
> **Origem:** sessão Cowork "painel nativo do CC", 2026-08-03.
> **Gerado por:** Cowork (Opus 5) + Fable 5 (desenho) + conector Mooter (dados medidos).
> **Estado:** especificação pronta. **Zero linhas da Cabine existem hoje.**

```
<!-- mooter:origem cowork=local_3c304556-ecf8-4e88-87af-6d5da367c6ca titulo="painel nativo do CC" em=2026-08-03T22:40Z -->
```

---

## 0 · INVARIANTES (violação = parar e reportar)

- ⛔ **NUNCA** tocar em `tools/router/classify.js` — sha256 CI-enforced `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`. Confirmar antes e depois.
- ⛔ **NUNCA** `git add -A`. Staging selectivo, ficheiro a ficheiro.
- ⛔ Sem ficheiros `.md` novos na raiz.
- ⛔ `packages/*` das waves 28-34.5 estão **frozen**. `packages/mcp-server` só com allowlist explícita.
- ⛔ **NÃO fazer push.** O push é gate do Paulo.
- ⚠️ Working tree partilhado: correr `git status --porcelain` antes de comitar e comitar **só** o que tu tocaste.
- 🌐 **PT-BR na conversa, inglês no código E na UI.** A Cabine é produto global — toda a string visível ao utilizador é em inglês. Citações do código mantêm o original com tradução ao lado.
- 📏 **Nunca fabricar um número.** Campo ausente ⇒ `n/d` com o motivo. Estimativa ⇒ rotulada "estimate".

---

## 1 · O QUE EXISTE HOJE (verificado, não assumido)

| Artefacto | Estado |
|---|---|
| `tools/router/statusline-oficial.js` | ✅ escrito e testado (4 payloads, exit 0 nos 4). **Prova**, não renderer definitivo |
| `plugin/mooter/agents/mooter-dispatch.md` | ✅ subagente-casca, `background:true`, `disallowedTools: Write, Edit, NotebookEdit, Bash, Task` |
| `plugin/mooter/settings.json` | ✅ regista `subagentStatusLine` |
| `plugin/mooter/scripts/subagent-statusline.js` | ✅ testado com stdin simulado |
| `plugin/mooter/monitors/monitors.json` + `scripts/watch-fleet.js` | ✅ escritos, monitor arranca e degrada honestamente |
| **A Cabine** | ❌ **não existe.** 12 mocks HTML em `_handoff/MOCK_CABINE_V*.html` |

**Nada disto está commitado.** Verificar com `git status --porcelain` antes de começar.

---

## 2 · O QUE É A CABINE

Um painel **por sessão** que responde a uma pergunta: *"onde é que eu ia?"* — para alguém com muitas sessões abertas em paralelo (Cowork + Claude Code), a trabalhar com múltiplos LLMs (GPU local + subscrições).

**Especificação visual canónica: `_handoff/MOCK_CABINE_V13_2026-08-03.html`.** Abre-o. É auto-contido, tem 34 botões vivos, 171 tooltips, 18 atributos `aria-` e três estados de dado. As versões V4→V12 documentam a evolução; **implementa a V13**.

O **prompt log** da V13 é a forma final: cada linha tem exactamente **hora local · resumo ≤60 chars · marcas dos motores** (animadas só enquanto vivas) e um botão lateral que abre um **drawer** (180 ms, da direita, `Esc`/✕/scrim fecham, foco gerido, header fixo com hora+resumo+logos) com todo o detalhe. Nada de custo, tokens, tiers ou 👍👎 na superfície. ⚠️ Objecção registada do designer: o **custo pago** merecia ficar na linha — é o único número que muda o comportamento no momento do scan. Decisão do dono foi shippar sem ele; reavaliar com utilizadores reais.

### Hierarquia (não negociável)
1. **Assinatura viva** — logo oficial do Mooter (vaca, `landing/public/mooter-logo.svg`) a ruminar (~1 s por ciclo) + rotor de verbos "moo" + toggle de tema + contadores `◌`/`⚑`.
2. **Prompt log** — uma linha por prompt do utilizador, com zebra, auto-título, hora local, motores, custo, 👍/👎.
3. **Devil's advocate** — perguntas determinísticas sobre números medidos.
4. **Attention** — só excepções.
5. **Project** — uma faixa de chips.

Tudo o resto em `<details>` **fechado por defeito**. Vista inicial ≤5 elementos, sem scroll.

### Os três estados de dado (a invenção que mais importa)
| Estado | Significado |
|---|---|
| **measured** | há um ficheiro/campo que produz isto hoje — fonte no tooltip |
| **`◌ not measured`** | o mecanismo existe mas ainda não escreveu — motivo em hover |
| **`⚑ not instrumented`** | ninguém regista isto — **com o custo de instrumentar ao lado** |

---

## 3 · FONTES DE DADOS REAIS (usa estas, não inventes)

| Dado | Fonte |
|---|---|
| jobs, waves, custo, tokens, handoffs | `mcp__Mooter__mooter_fleet` — views `tudo`, `board`, `jobs`, `pastas`, `recibo` |
| scorecard com donos e excepções | `mooter_fleet view:board` → `scorecard.metricas` |
| advogado do diabo + next steps + vault | `mooter_fleet view:recibo` → `contexto.advogado_do_diabo`, `.proximos_passos`, `.registado_no_vault` |
| memória rolante por sessão | `tools/router/handoff-journal.js` → `<sid>.jsonl`, `<sid>.summary.txt`, `<sid>.rollup-ts` |
| resumo local a $0 | `tools/router/handoff-rollup.js` — throttle `MIN_MS 90s` OU `MIN_TURNS 5`, `DELTA_MAX 12` |
| sessões do Cowork | `mcp__session_info__list_sessions` — 1760 sessões com título |
| sessão do CC, worktree, quota real, PR | stdin da statusline principal (ver §5) |
| aprendizagem | `tools/router/pastor-lora-status.js` — TF-IDF, **não LoRA** |

---

## 4 · ORDEM DE IMPLEMENTAÇÃO

### FASE 0 — PROVAR O INSTRUMENTO (não é código, faz-se primeiro)
O Live Context Accumulator já esteve mudo (**63 sessões / 0 journals**) por hook Stop stale.

```
node ~/.claude/tools/router/sync-hooks.js --check     # tem de imprimir: OK self-check
```
Depois: localizar `_dir()` em `handoff-journal.js`, contar `.jsonl` e `.summary.txt`, ler o mais recente, e comparar md5 de `~/.claude/hooks/gsd-turn-end.js` vs `~/.claude/tools/router/gsd-turn-end.js` vs `~/frugal/tools/router/gsd-turn-end.js`.

**Se estiver mudo, PARA e reporta.** Sem acumulador, a Cabine nasce sem memória e metade da spec é `◌`.

### FASE 1 — REGISTO DE SESSÃO (destrava três coisas de uma vez)
`mooter_setup({sessao:"registar", id:"<projecto>"})` **já existe e ninguém o chama**. Prova: `mooter_fleet view:recibo` → `contexto.onde.sessao_id: null`, motivo verbatim *"sem estado de sessão registado"*.

Implementar o **carimbo de origem** no masterprompt:
```
<!-- mooter:origem cowork=<local_uuid> titulo="<título>" em=<ISO> -->
```
O hook `UserPromptSubmit` (`plugin/mooter/hooks/route-or-bootstrap.js`) lê o carimbo e grava o par `cowork_id ↔ cc_session_id`. ⚠️ Se o carimbo faltar: gravar `origem: n/d`, **nunca adivinhar por proximidade temporal**.

### FASE 2 — A CABINE COMO ARTEFACTO
Renderer que lê as fontes do §3 e produz o HTML do V12. Onde vive: decidir entre `tools/router/cabine.js` (CLI + saída HTML) ou artifact do Cowork. **Não criar um segundo renderer da statusline** — o `gsd-statusline.js` (2242 linhas) é o vivo; ver §5.

### FASE 3 — INSTRUMENTAR os `⚑` (por ordem de valor)
| # | O quê | Onde | Tamanho |
|---|---|---|---|
| 1 | campo **"understood"** por turno | `handoff-rollup.js` | ~20 linhas |
| 2 | **registo do gauntlet** (quantas vezes mudou o resultado) | `gsd-turn-end.js` | ~15 linhas |
| 3 | **auto-título determinístico** por prompt (verbo do router + ficheiro tocado — **não** chamada a modelo) | `gsd-turn-end.js` | ~25 linhas |
| 4 | **etapas até ao push** | `agent-sync-ledger.js` | ~60 linhas |
| 5 | **feedback 👍/👎** → D1 `mooter-hub` | worker + tabela + botão | endpoint novo |
| 6 | **`resultado` = nó EXECUTOR** (hoje devolve o plano do preparador) | `packages/mcp-server` ⚠️ frozen | precisa allowlist |

### FASE 4 — SLASH COMMAND
`plugin/mooter/commands/cabine.md` (ou `mooter-cockpit-launch.md`). ⚠️ **Um slash command não abre painel lateral no CC** — os comandos emitem texto/prompt. O que ele faz: renderiza a Cabine inline e regista a sessão.

---

## 5 · A CORRECÇÃO DE HONESTIDADE (fazer mesmo que a Cabine escorregue)

`gsd-statusline.js` tem 2242 linhas e lê **0×** `rate_limits`, `five_hour`, `seven_day`, `session_name`, `transcript_path`, `git_worktree`, `worktree.`, `total_cost_usd`, `total_api_duration_ms`, `pr.`. Único campo oficial consumido: `context_window.remaining_percentage` (:1635).

Enquanto isso, `combustivel.pressao` declara nível contra uma referência `4000/400` que o próprio código admite ser *"default — não é um limite publicado"*.

**O cliente entrega `rate_limits.five_hour.used_percentage` no mesmo JSON que já parseamos.**

Caminho: **envolver, não migrar.** O `statusline-oficial.js` faz `spawnSync` do `gsd-statusline.js` com o mesmo stdin, imprime o que ele devolver, e **acrescenta** as rows dos campos oficiais. Uma entrada em `~/.claude/settings.json`, zero mudanças no renderer de 2242 linhas, sem drift de N renderers.

---

## 6 · AUDITORIA — PASSA-TE POR UTILIZADOR

Depois de implementar, **não valides o teu próprio trabalho lendo-o**. Faz o percurso na pele de alguém que nunca viu isto:

1. **Instalar** — segue as instruções do botão de update como um não-dev: `mooter_setup({atualizar:"ver"})` → `{atualizar:"aplicar"}` → reiniciar o desktop → verificar. Onde tropeçaste?
2. **Abrir** — `/cabine`. Aparece? Em quanto tempo? O que vês nos primeiros 3 segundos?
3. **Cada botão** — clica nos 27. Algum está morto? Algum faz algo diferente do que o tooltip promete?
4. **Cada tooltip** — um vibe coder que nunca ouviu falar de "tier" ou "worktree" percebe?
5. **Temas** — dark e light dentro do Claude desktop. Contraste real? A âmbar sobrevive ao fundo claro?
6. **Front↔back** — cada número no ecrã tem uma fonte real? Corre o renderer com o conector **desligado**: degrada para `◌` ou rebenta?
7. **Sessões** — abre 2 sessões, gera um masterprompt numa, cola na outra. O par foi gravado? E se apagares o carimbo?
8. **Performance** — quanto custa um render? A Cabine entra no caminho quente de algum prompt? (Não deve: `route-or-bootstrap.js` tem timeout 5 s e o `classify.js` mede **1.35 ms**.)
9. **O caso feio** — com um job `agent-awaiting-approval` parado há horas, a Cabine diz "a trabalhar" ou diz "encravado"? **Este é o teste que separa o produto do teatro.**

Entrega: tabela com file:line por achado, e um veredicto de uma linha. Se não conseguires provar algo, escreve `n/d` e diz o que faltou.

---

## 7 · GATES

- Suites afectadas verdes antes de qualquer commit (`cd packages/<nome> && npm test`).
- sha256 do `classify.js` igual antes e depois.
- `git status --porcelain` antes de comitar; staging selectivo.
- **Sem push.**
- Correr o **MEO Gauntlet** (`docs/foundation/MEO_GAUNTLET.md`) — classe **alto risco**: as 18, com **G4 num motor diferente**. Declarar no fecho: `gauntlet: Gn mudou X`.
- Registar no vault: `mooter_journal({kind:"decision", ...})`.

---

## 8 · ESTADO MEDIDO NO MOMENTO DA ESCRITA (2026-08-04T01:07Z)

| | |
|---|---|
| jobs hoje | **32** em **15 waves**, motores `cc` `codex` `gemini` `moo` |
| custo hoje | **$1.697544** — parcial: 7 de 31 jobs sem custo medido |
| tokens locais | 64 697 in / 11 425 out (parcial) |
| pastas | **47 de 47 livres**, 0 ocupadas |
| ⚠️ jobs "a correr" | **2, ambos `agent-awaiting-approval`** — `job-msdsy95l-5b8a` (cc, sem crescer há 3h02m) e `job-msd2hwgy-aea8` (moo, 15h23m, p90 = 14.7 min) |
| scorecard | `pode_ir_dormir: false` · 🔴 `interrupcoes_por_dia` 9 vs [0,1] dono MEO · 🔴 `trabalho_zero_pct` 31.58% vs [50,100] dono MOO |
| cargos | **31 de 32 jobs com `cargo: null`** — o sistema de papéis existe e quase nada o declara |
| handoffs | 9 hoje, todos com `poupanca_liquida: null` — *"medir poupança exigiria o mesmo trabalho sem preparação como base de comparação"* |
| vault | 8 notas hoje em `paulo-vault` (`20-decisions`, `30-learnings`) |
| versões | conector **1.45.3** · **1.45.4** por instalar · `plugin/mooter/plugin.json` **1.38.0** (7 minor atrás — corrigir) |
| coerência | *"router pediu opus e correu claude-haiku-4-5-20251001"* (repetido) |
| auditorias delegadas hoje | **4, zero veredictos úteis** — 3 codex (13,4M tokens, *"sem veredicto: não verificou"*) e 1 haiku (*"0 afirmações verificadas; 8 divergências; 10 n/d"*) |

---

## 9 · O QUE NÃO EXISTE (não prometas)

- **LoRA.** `pastor-lora-status.js`: *"The mechanism is TF-IDF, NOT a neural LoRA."* Mostrar `🎓 Pastor v2 · N decisions · TF-IDF (Occam-aligned)`, threshold 50, arXiv 2505.12601.
- **Feedback 👍/👎** — grep por `thumbs|feedback_score` em `tools/router/` devolve vazio.
- **Painel lateral no CC** — não há webview nem API de painel. Superfícies reais: statusline (multi-linha), task panel (1 linha por task), monitors (experimental, CLI-only).
- **Live Preview embutido** — OSC 8 abre no browser, não incorpora.
- **Realtime push no Cowork** — o artifact é *pull*. Escrever "updated Ns ago · source: pull", **nunca "live"**.
