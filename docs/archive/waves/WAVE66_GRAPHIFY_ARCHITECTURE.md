# Wave 66 — Graph-Aware Routing (Graphify × Mooter)

> **Data:** 2026-06-14 · **Autor:** Paulo (composto no Cowork; execução → Claude Code)
> **Tipo:** Deep-research + brief de arquitectura. **Não é** ordem de implementação — é o
> mapa que o Claude Code consome para fazer Day-0 recon e shipar por blocos.
> **Tese:** Mooter corta custo por **tier**; o Graphify corta custo por **contexto**. Juntá-los
> dá ao Mooter o único eixo de poupança (tokens/contexto) que nenhum router concorrente cobre —
> e, ao contrário de "instala o Graphify e pronto", o Mooter torna essa poupança **medida,
> atribuída e visível**, e usa o sinal de grafo para **rotear melhor**.

---

## 0. TL;DR para quem tem 30 segundos

1. **O que é o Graphify:** skill/MCP open-source (MIT) que lê o repo com tree-sitter, constrói
   um grafo de conhecimento (`graph.json`, formato NetworkX node-link) e responde a queries
   estruturadas (`query_graph`, `get_neighbors`, `shortest_path`) em vez de o agente fazer grep
   a todos os ficheiros. Tudo local, zero dados a sair da máquina.
2. **Onde encaixa no Mooter:** numa camada **host-side a jusante** do `classify.js` FROZEN —
   breadcrumb + anotação no `<router-hint>` + chip + 1 ficheiro novo em `packages/router/src/`.
   Zero edição de ficheiros congelados.
3. **Porque é a aposta:** reforça o pilar de moat **codebase-aware** (STRATEGY.md §1.4, janela
   aberta), com custo de entrada baixo (Graphify já é skill/MCP de Claude Code).
4. **A honestidade obrigatória:** poupanças reais variam de **7–8%** (repo pequeno) a **6–15×**
   (100–500 ficheiros) a **30×+** (500+). O "71×" é um único outlier de monorepo grande. Claims
   sempre com fonte + `as_of` + tamanho-de-repo. (Política igual à da Wave 59B.)

---

## PARTE A — Deep research: Graphify

### A.1 O que é, e o que NÃO é
- **É** uma *skill* (e opcionalmente *MCP server*) para assistentes de código (Claude Code, Cursor,
  Codex, Gemini CLI, …). Transforma uma pasta de código/docs num **grafo consultável**.
- **Licença:** MIT. Repo `safishamsi/graphify`. Pacote PyPI temporariamente `graphifyy`
  (nome `graphify` a ser reclamado). _(as_of 2026-06)_
- **NÃO é** um proxy nem um router. Não se mete entre o user e o LLM. Compatível com a regra
  "no proxy" do Mooter.

### A.2 Como funciona (pipeline)
1. **Extracção de código:** **tree-sitter AST** sobre 20+ linguagens (Py, JS/TS, Go, Rust, Java,
   C/C++, Ruby, C#, Kotlin, Scala, PHP, Swift, Lua, Zig…). **Determinístico, local, zero LLM.**
2. **Construção do grafo:** **NetworkX** + clustering **Leiden** para detectar comunidades/módulos.
3. **Multimodal (opcional):** para markdown/PDF/imagens/transcrições, há um caminho assistido por
   LLM (subagentes em paralelo, cada um devolve fragmento JSON de nós/arestas). ⚠️ **Este caminho
   usa LLM** — relevante para o princípio "zero LLM cost" do Mooter (ver §E.3): a integração
   default deve usar **só** o caminho de código (tree-sitter, sem LLM).
4. **Saídas:** `graph.html` (visualização interactiva), **`graph.json`** (grafo consultável),
   `GRAPH_REPORT.md` (relatório legível).
5. **Incremental:** actualiza só ficheiros mudados — ~**0.425 s** num projecto de ~1000 ficheiros.
   Integrável em git hook (`code-review-graph`) para auto-update no commit.

### A.3 Schema do `graph.json`
- **Formato:** NetworkX **node-link JSON** — objecto com `nodes` e `links`/`edges`.
  Cada nó = símbolo/ficheiro/módulo (id + atributos); cada aresta = relação (import, call,
  define, contains). É lido directamente como contexto a partir do ficheiro.
- ⚠️ **Day-0:** confirmar a forma exacta dos atributos de nó/aresta contra a versão instalada
  (`graphify-out/graph.json`) — o schema evoluiu (docs `how-it-works.md` em v7/v8). Não hardcodar
  campos sem ver o ficheiro real.

### A.4 Interface MCP
- Arranque: `python -m graphify.serve graphify-out/graph.json` (ou flag `--mcp` no CLI;
  `graphify claude install` regista a skill).
- **Tools expostas:** `query_graph`, `get_node`, `get_neighbors`, `shortest_path`,
  e (com `code-review-graph`) `list_prs`, `get_pr_impact`, `triage_prs`.
- **Instalação:** `uv tool install graphifyy && graphify install`; `graphify claude install`.

### A.5 Performance — números HONESTOS (com fonte + as_of)
| Cenário | Poupança de tokens | Fonte / nota |
|---|---|---|
| Repo pequeno (<100 ficheiros) | ~nulo a single-digit % | Mediana real |
| Teste real `browser-use` | **~7–8%** (120k → 113k tokens) | Benchmark independente |
| 100–500 ficheiros | **6–15×** | Curva por tamanho |
| 500+ ficheiros (monorepo) | **30×+** | Cauda |
| Outlier monorepo grande | **71×** (single benchmark) | **NÃO usar como típico** |
| Média reportada num set | ~8.2× (naive vs graph) | Agregado |

_(as_of 2026-06. Fontes em §Sources.)_ **Regra de claim:** sempre par (número, tamanho-de-repo) +
fonte. Nunca "até 71×" sozinho — é o erro de marketing que a doutrina do Mooter proíbe.

### A.6 Privacidade & failure modes
- **Privacidade:** processamento de código 100% local (tree-sitter), nada sai da máquina.
  Alinha com o local-first do Mooter. (O caminho multimodal-LLM é a excepção — desligar por default.)
- **Failure modes a tratar na integração:** `graph.json` ausente/stale; repo abaixo do limiar onde
  o grafo ajuda (não anunciar poupança que não existe); schema-drift entre versões; custo do build
  inicial num monorepo (one-off, mas não-trivial).

### A.7 Encaixe estratégico (porquê isto e não outra coisa)
- STRATEGY.md §1.4 lista **"Codebase-aware / language-aware"** como **janela ainda aberta** de moat.
  Hoje o Mooter é codebase-aware na **língua** (AMALIA/Sabiá). O Graphify estende para a
  **estrutura** do código. É a evolução natural do mesmo pilar.
- Diferenciação vs "só instalar o Graphify": o Mooter (a) **mede e atribui** a poupança de tokens
  no savings-tracker, (b) usa o sinal de grafo para **enviesar o routing** (tier/modelo), (c) trata
  a descoberta/instalação como **pack declarativo**. O Graphify torna-se um *sensor*; o Mooter é o
  *cérebro* que decide com base nele.

---

## PARTE B — Arquitectura do Mooter: pontos de extensão (auditoria do repo)

> Tudo confirmado lendo ficheiros reais. O sinal de grafo entra **a jusante** do `classify.js`.

| # | Ponto | Ficheiro | Gancho para graph-awareness |
|---|---|---|---|
| 1 | Hook UserPromptSubmit | `tools/router/inject_context.js` (1545 ln) | Pipeline de mutação de `decision`; anexar bloco `<graph-context>` ao `lines[]` antes de `stdout.write` (≈L1432), no estilo da camada `adapter_selection` (L1056-1067) |
| 2 | Classifier **FROZEN** | `tools/router/classify.js` | 100% texto do prompt + env vars (`FRUGAL_HW_*`) + tuning patterns. **Não editar.** Aceita sinais só via env que o hook injecta |
| 3 | decideAgent **FROZEN (só adições)** | `packages/router/src/decide-agent.ts` | `decideAgent(args)→{chosen_model, tes, alternatives[]}`. Envolver com `graph-aware-decide.ts` **novo**, controlando `args` (`prefer_local`, `max_cost_usd`) |
| 4 | **Bridge pattern (template)** | `tools/router/workflow-locks-bridge.js` (96 ln) | Breadcrumb: lê ponteiro JSON, merge puro, re-escreve, best-effort. Copiar p/ `graph-context-bridge.js` |
| 5 | Pack system | `packs/*/pack.yaml` + `classify_domain.ts` + `pack_resolve.ts` + `data/mcp_install_registry.json` | Pack novo declarativo recomenda/instala o Graphify MCP; `detectEnv()`/`packResolve()` já emitem no `<pack-hint>` |
| 6 | Savings/telemetry | `tools/router/savings-tracker.js` + daemon `127.0.0.1:7821` | `decisions.log` append-only, readers tolerantes a campos extra → evento `graph_resolved` + agregador novo |
| 7 | MCP server | `packages/mcp-server` (~22 tools, `buildRegistry()`) | Coexistência preferível (Graphify MCP é outro server em `mcpServers`) > proxy directo |
| 8 | Statusline chips | `tools/router/chip-composer.js` | Chip self-gating `graph-status.js` (🕸), opt-in via `~/.mooter/preferences.json` |
| 9 | hw-capability.json | `gpu-probe.js`→escreve · `model-manager.js`/`inject_context.js`→lêem | Molde de "cache JSON escrito por probe, lido por consumidores tolerantes" — o `graph.json` por-repo segue o mesmo molde (Wave irmã 60) |

---

## PARTE C — Design de integração (blocos)

> Ordem = dependências. Cada bloco é shipável e testável isolado. Todos host-side / adições.

### Bloco 1 — Pack `code-graph` (descoberta + instalação declarativa) · **risco: baixo**
- Criar `packs/code-graph/pack.yaml` (adição de ficheiro nova — permitida pelo schema):
  - `domain_signals.keywords`: codebase, refactor, "where is", call graph, dependency, impact…
  - `domain_signals.embedding_seeds`: frases NL sobre navegar/entender estrutura de código.
  - `mcps.recommended: [graphify-mcp]`.
  - `tools_cli`: comandos `graphify claude install` / `/graphify .`.
  - `metadata.trust_score`, `notion_kb_url`.
- Adicionar entrada `graphify-mcp` ao `packages/router/data/mcp_install_registry.json` (comando de
  install + flag `--mcp`).
- **Resultado:** quando uma query é de domínio "código/estrutura", o hook sugere instalar/usar o
  Graphify no `<pack-hint>`. Zero código novo de runtime.
- **Teste:** `packResolve()` devolve o MCP como `recommended` + `missing` num env sem Graphify.

### Bloco 2 — `graph-context-bridge.js` (breadcrumb host-side) · **risco: baixo**
- Copiar o contrato de `workflow-locks-bridge.js`. Expõe `setGraphContext({repo, nodes, resolved})`
  / `clearGraphContext()`. Escreve campo opcional em ponteiro `~/.mooter/graph/active-graph.json`
  (override `MOOTER_GRAPH_ACTIVE`). Funções puras de merge, todo erro engolido (`return false`).
- Quem chama: um git-hook/CLI fino (`mooter graph sync`) corre o `graphify` incremental e escreve o
  breadcrumb (nº de nós, timestamp, se o contexto está resolvido para o cwd).
- **Teste:** breadcrumb partido nunca parte o hook; ausência de ficheiro → estado limpo.

### Bloco 3 — Camada `graph-context` no hook (anotação + disciplina de tier) · **risco: médio**
- Novo módulo `tools/router/graph-context.js` invocado no pipeline do `inject_context.js` (mesmo
  sítio que `adapter_selection`). Lê o breadcrumb do Bloco 2 e:
  - **(a)** anexa um bloco `<graph-context>nós=N · resolved=… · repo=…</graph-context>` ao `lines[]`
    (informa o Claude Code que pode consultar o grafo em vez de grep — esta é a poupança real).
  - **(b)** opcionalmente **só-upgrade** de `decision.tier` com `escalation_rule += '+graph_resolved'`.
    **NUNCA downgrade em HIGH_RISK.** A poupança vem de *menos tokens de contexto*, não de baixar
    tier indiscriminadamente — manter a doutrina intacta.
- **Teste:** com breadcrumb ausente, o `<router-hint>` é **byte-idêntico** ao actual (prova de
  não-regressão). Com breadcrumb presente, aparece o bloco e nada mais muda em prompts HIGH_RISK.

### Bloco 4 — `graph-aware-decide.ts` (enviesar modelo dentro do tier) · **risco: médio**
- Ficheiro **novo** em `packages/router/src/` (Wave 58 allowlistou adições). Wrapper que chama
  `decideAgent(args)` e, quando o contexto é graph-resolved e a tarefa é localizada (1-2
  comunidades Leiden afectadas), passa `prefer_local:true` / `max_cost_usd` mais apertado, e
  reordena/filtra `alternatives`. **Nunca edita `decide-agent.ts`.**
- **Teste:** unit sobre o wrapper; `decide-agent.ts` continua byte-idêntico (sha/diff check).

### Bloco 5 — Atribuição de poupança (savings) · **risco: médio**
- O `graph-context.js` regista `logDecision({event:'graph_resolved', tokens_saved_est, repo_size,
  session_id})` na `decisions.log` (append-only; readers tolerantes a campos extra).
- Agregador **novo** no daemon soma `graph_saved` separado de `guaranteed_saved`/`advisory_saved`.
  ⚠️ **Classificar como `advisory`** (estimativa), nunca `guaranteed` — a poupança de contexto é
  estimada, não verbatim como o `option_a_hit`.
- **Teste:** o agregado distingue as 3 categorias; sem eventos graph → zero, sem inflar nada.

### Bloco 6 — Chip statusline `🕸 graph` (opt-in) · **risco: baixo**
- `tools/router/graph-status.js` self-gating (copia `agents-progress-status.js`): lê
  `~/.mooter/preferences.json` (`statusline_chips.graph===true`) ou `MOOTER_STATUSLINE_GRAPH=1`;
  honra `hidden_chips`; lê o breadcrumb; `''` quando off/sem dados; `🕸 ?` honesto quando opt-in
  mas sem grafo. Registar em `chip-composer.js` (`DEFAULT_ELIGIBLE` + `CHIP_MODULES`).
- **Teste:** default OFF → statusline byte-idêntica; ON sem dados → `🕸 ?`; ON com dados → `🕸 N nós · ~X% tokens`.

### Bloco 7 (opcional) — MCP coexistência vs proxy · **risco: baixo**
- **Default recomendado:** coexistência. O Graphify MCP é só outro server em `mcpServers` do
  Claude Code; `detectEnv()` já o vê. Menor acoplamento, zero toque no `@mooter/mcp-server`.
- **Alternativa (só se houver pedido):** adicionar um `mooter_graph_query` tool ao `buildRegistry()`
  que faz proxy ao Graphify — útil para expor via o MCP do Mooter, mas acopla as duas peças.

---

## PARTE D — Invariantes & prova de segurança

| Invariante | Como fica | Prova |
|---|---|---|
| `classify.js` sha FROZEN | Byte-intacto | sha256 == `427d8c0b…364bc48f` pré/pós cada fase (CI) |
| Engine packages `packages/*` | Intactos exceto **adições novas** | `git diff` confinado a ficheiros novos (`graph-aware-decide.ts`) + `tools/router/` + `packs/` |
| No proxy | Mantido | Graphify é sensor local; Mooter nunca se senta entre user e LLM |
| Zero LLM cost na classificação | Mantido | Usar só o caminho tree-sitter (sem LLM) do Graphify; decisão de tier continua regex |
| Doctrine > optimizador | Mantido | Bloco 3 só-upgrade; nunca downgrade em HIGH_RISK; deploy/secrets ficam T3 |
| Explainability | Reforçado | `<graph-context>` + `escalation_rule:'+graph_resolved'` tornam o "porquê" explícito |
| Statusline default byte-idêntica | Mantido | Chip opt-in self-gating; Bloco 6 teste de não-regressão |

---

## PARTE E — Política de honestidade (claims)

1. **Nunca "até 71×" isolado.** Sempre (número, tamanho-de-repo, fonte, `as_of`). Default citável:
   "6–15× em repos de 100–500 ficheiros; ~7–8% em repos pequenos — _Graphify benchmarks, as_of 2026-06_".
2. **Poupança graph = `advisory`** no tracker, nunca `guaranteed`.
3. **Gate humano antes de publicar** qualquer número de poupança no site/DMs (igual à Wave 59B).
4. **Caminho multimodal-LLM OFF por default** — preserva "zero LLM cost" e local-first.

---

## PARTE F — Day-0 recon (verificar ANTES de codar; honest > brief)

1. Confirmar o **allowlist da wave** para `tools/router/chip-composer.js`, `inject_context.js`,
   `savings-tracker.js` (são runtime host-side, fora dos `packages/*` congelados, mas confirmar que
   a wave não os declara frozen).
2. Instalar o Graphify num repo de teste e **ler o `graph.json` real** — fixar o schema de
   nós/arestas contra a versão instalada (não assumir v7/v8).
3. Medir o **custo do build inicial** no monorepo `frugal` (nº ficheiros, tempo, tokens do caminho
   multimodal se ligado) — decidir limiar mínimo de repo onde anunciamos poupança.
4. Confirmar que o `pack.schema.yaml` aceita os campos que o `code-graph/pack.yaml` vai usar.
5. Verificar interacção com o **gate de privacidade** (k-anon ≥50) se algum dado de grafo for
   logado — por default, **não** logar nomes de símbolos, só contagens.

---

## PARTE G — Faseamento, esforço, risco

| Fase | Blocos | Esforço | Risco | Entrega |
|---|---|---|---|---|
| 66.0 Day-0 | recon §F | 0.5 sessão | — | `WAVE66_DAY0_RECON.md` + schema fixado |
| 66.A | 1 + 2 + 6 | 0.5 sessão | Baixo | Pack + breadcrumb + chip (sinal visível, sem mexer no routing) |
| 66.B | 3 + 5 | 1 sessão | Médio | Anotação no hint + savings atribuído (a poupança real) |
| 66.C | 4 | 0.5 sessão | Médio | Enviesamento modelo-dentro-do-tier (refinamento) |
| 66.D | 7 (opc.) + docs/landing | 0.5 sessão | Baixo | Coexistência MCP + copy honesto |

**Sequência mínima viável (MVP de valor):** 66.0 → 66.A → 66.B. Os blocos C/D são refinamento.
A poupança real e a sua visibilidade chegam no fim do 66.B.

---

## PARTE H — Porque isto torna o Mooter "o melhor do mundo"

- **Cobre o eixo que falta.** Routers concorrentes optimizam *qual modelo*; nenhum optimiza
  *quanto contexto*. Com o Graphify integrado, o Mooter passa a cobrir D **e** T.
- **Transforma uma skill de terceiros num sensor do router.** O valor não é "temos Graphify" —
  é "o Mooter mede a poupança de contexto, atribui-a, mostra-a, e roteia com base nela". Isso é
  defensável e único.
- **Fica do lado certo da doutrina.** Local, determinístico (tree-sitter), no-proxy, explicável,
  doctrine-first. Não há tensão com nenhum dos 5 princípios não-negociáveis.
- **Custo de entrada baixo, reforço de moat alto.** MIT + já skill/MCP → integramos em ~3 sessões;
  o retorno é o pilar codebase-aware, que a STRATEGY.md marca como janela aberta de longo prazo.

---

## Sources

- Graphify — [site oficial](https://graphify.net/) · [repo safishamsi/graphify](https://github.com/safishamsi/graphify) · [how-it-works v8](https://github.com/safishamsi/graphify/blob/v8/docs/how-it-works.md) · [CLI reference](https://graphify.net/graphify-cli-commands.html)
- Integração CC — [DEV: graphify + code-review-graph](https://dev.to/mir_mursalin_ankur/graphify-code-review-graph-build-a-self-updating-knowledge-graph-for-claude-code-and-other-ai-j1m) · [CLSkills setup (MIT/install)](https://clskillshub.com/blog/graphify-claude-code-integration)
- Poupança honesta — [roborhythms review 71×](https://www.roborhythms.com/graphify-review/) · [mejba.me honest review](https://www.mejba.me/blog/graphify-knowledge-graph-codebase-claude-code) · [MindStudio benchmark 70%](https://www.mindstudio.ai/blog/5-claude-code-skills-cut-token-costs-70-percent-benchmarked)
- Mooter — auditoria do repo `~/frugal` (2026-06-14): `inject_context.js`, `classify.js`, `decide-agent.ts`, `workflow-locks-bridge.js`, `pack_resolve.ts`/`classify_domain.ts`, `savings-tracker.js`, `chip-composer.js`, `gpu-probe.js`. Estado: `SYNC.md` (v1.39.0/Wave 59A), `STRATEGY.md`.
