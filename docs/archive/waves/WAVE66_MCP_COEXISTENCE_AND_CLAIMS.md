# Wave 66 — Bloco 7: Coexistência MCP + Kit de Claims Honestos (66.D)

> **Fase:** 66.D · **Data:** 2026-06-21 · **Autor:** Claude Code (Opus, beast)
> **Input:** `WAVE66_GRAPHIFY_ARCHITECTURE.md` §C-Bloco7 + §E · **Tipo:** decisão de arquitectura
> (coexistência, não proxy) + copy gated por humano. **Não publica nada** — ver §3 (gate).

---

## TL;DR

1. **Coexistência, não proxy.** O Graphify é registado como **outro server** em `mcpServers` do
   Claude Code. O Mooter **não** se mete entre ele e o LLM. Acoplamento zero; `@mooter/mcp-server`
   fica **byte-intacto** (provado em §1).
2. **Já está wired** desde 66.A: `servers.graphify-mcp` em `packages/router/data/mcp_install_registry.json`.
   `detectEnv()`/`packResolve()` recomendam-no quando o domínio é "código/estrutura". Nada novo a codar.
3. **Claims honestos = gate humano.** Os números abaixo (§2) são os **únicos** aprovados para uso
   interno; **nenhum** vai para o site/DMs sem o OK do Paulo (igual à política da Wave 59B). Este
   commit **não toca** em `landing/` e **não faz deploy**.

---

## 1. Decisão: coexistência MCP (Bloco 7) — e a sua prova

### A decisão
O Graphify expõe um MCP server local (`query_graph`, `get_node`, `get_neighbors`, `shortest_path`).
Há duas formas de o Mooter o "ter":

| Opção | O que é | Veredicto |
|---|---|---|
| **Coexistência** (default) | Graphify é um server independente em `mcpServers`. O Mooter **vê-o** via `detectEnv()` e **recomenda-o** via pack, mas não o medeia. | ✅ **Escolhida** |
| Proxy | Adicionar um `mooter_graph_query` a `buildRegistry()` que reencaminha para o Graphify. | ❌ Rejeitada (default) — acopla as duas peças, viola "no proxy", sem ganho real |

**Porquê coexistência:** menor acoplamento, zero toque no engine MCP do Mooter, e alinhamento directo
com o princípio não-negociável **"no proxy"** (o Mooter nunca se senta entre o user e o LLM, nem entre
o user e outra ferramenta). O Graphify é um **sensor**; o Mooter lê o sensor e decide — não o
encapsula.

### A prova (verificável)
- **Wiring (66.A):** `packages/router/data/mcp_install_registry.json` → `servers.graphify-mcp`
  (`transport: stdio`, install + nota honesta que inclui o caveat do nome PyPI `graphifyy`/typosquat).
- **Sem proxy:** `grep -rn "graphify" packages/mcp-server/src` → **0 resultados**. O
  `@mooter/mcp-server` não conhece o Graphify e não foi alterado nesta wave. (Pacote frozen — intacto.)
- **Descoberta:** o pack `code-graph` (66.A) lista `mcps.recommended: [graphify-mcp]`; quando o
  domínio resolve para "código/estrutura" e o server está ausente, o `<pack-hint>` sugere instalá-lo.

> **Alternativa proxy — só sob pedido explícito.** Se um dia se quiser expor `query_graph` *através*
> do MCP do Mooter, adiciona-se um tool novo ao `buildRegistry()` que faz proxy. Acopla as peças e
> precisa de aprovação — **não é** o default e **não** foi feito aqui.

---

## 2. Kit de claims honestos (uso interno — gated para publicação)

> **Regra-mãe (Part E do brief):** **nunca** "até 71×" isolado. **Sempre** o par
> *(número, tamanho-de-repo)* + *fonte* + *as_of*. A poupança de grafo é **`advisory`** no tracker,
> nunca `guaranteed`.

### Frase citável (default aprovado)
> "Graphify corta o contexto **6–15×** em repos de **100–500 ficheiros**; **~7–8%** em repos pequenos.
> — _Graphify benchmarks, as_of 2026-06_"

### Tabela de suporte (com fonte + as_of)
| Cenário | Poupança | Fonte / nota | Pode citar isolado? |
|---|---|---|---|
| Repo pequeno (<100 fich.) | ~nulo a single-digit % | mediana real | sim, com tamanho |
| Teste real `browser-use` | **~7–8%** (120k→113k tokens) | benchmark independente | sim, com tamanho |
| 100–500 ficheiros | **6–15×** | curva por tamanho | sim, com banda |
| 500+ ficheiros (monorepo) | **30×+** | cauda | sim, com banda |
| Outlier monorepo grande | **71×** | single benchmark | ❌ **NUNCA isolado** |
| Agregado de um set | ~8.2× (naive vs graph) | média reportada | sim, marcado "média" |

_(as_of 2026-06. Fontes: `WAVE66_GRAPHIFY_ARCHITECTURE.md` §Sources.)_

### O que o Mooter pode dizer de **si próprio** (a diferenciação)
O valor não é "temos Graphify" — é **"o Mooter mede a poupança de contexto, atribui-a (advisory),
mostra-a no chip, e roteia com base nela"**. O sinal de grafo:
- aparece no hint como `<graph-context>` (66.B),
- soma em `graph_saved_tokens_est` **separado** de `guaranteed/advisory` no tracker (66.B, **advisory**),
- e enviesa o modelo **dentro do tier** quando a tarefa é localizada (66.C), **nunca** baixando tier
  nem tocando em HIGH_RISK.

### Limiar de anúncio (honestidade)
Anunciar "×N" ou "~X% tokens" **só com ≥100 ficheiros source** no repo activo (DAY0 recon §2).
Abaixo disso o chip pode mostrar `🕸 N nós` mas **nunca** um multiplicador — seria desonesto.

---

## 3. ⚠️ GATE HUMANO — antes de publicar qualquer número

- **Nenhum número** desta página vai para `landing/`, DMs, ou redes **sem o OK explícito do Paulo**
  (política Wave 59B). Este commit **não altera `landing/`** e **não faz deploy**.
- O **custo do build inicial** (one-off) do grafo no monorepo `frugal` ainda **não foi cronometrado
  ao vivo** (install bloqueado pelo guardrail de supply-chain). Qualquer claim de *tempo* fica pendente
  dessa medição real.
- O caminho **multimodal-LLM do Graphify fica OFF por default** — preserva "zero LLM cost" e
  local-first. Só o caminho tree-sitter (determinístico, local) é usado.

**Quando o Paulo der OK:** aplicar a frase citável (§2) onde a landing fala de codebase-awareness,
sempre com o par (número, tamanho-repo) + as_of, e correr o deploy **com** revisão (gate de release).

---

## 4. Estado / invariantes (66.D)

- `@mooter/mcp-server` **intacto** (sem proxy; coexistência). `packages/*` frozen respeitado.
- `classify.js` sha = `427d8c0b…364bc48f` — intacto (nada tocado).
- Sem toque em `landing/`; sem deploy. Selective adds: só este doc.
- Coexistência já operacional via registry de 66.A — Bloco 7 fecha como **decisão documentada**.
