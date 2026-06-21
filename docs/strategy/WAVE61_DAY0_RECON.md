# Wave 61 — Day-0 Recon (Graphify × Mooter)

> **Phase:** 61.0 (recon ANTES de codar) · **Data:** 2026-06-21 · **Autor:** Claude Code (Opus, beast)
> **Input:** `docs/strategy/WAVE61_GRAPHIFY_ARCHITECTURE.md` §F · **Output:** este doc + schema fixado (provisional) + go/no-go.
> **Regra honestidade:** zero fabricação. Onde não pude verificar ao vivo, está marcado **BLOCKER** ou **PROVISIONAL**, não inventado.

---

## TL;DR (veredicto)

| # | Tarefa §F | Veredicto | Bloqueia? |
|---|---|---|---|
| 1 | Ler `graph.json` real → fixar schema | ⚠️ **BLOCKED** neste ambiente (ver §1) | Só 61.C (não 61.A/61.B) |
| 2 | Custo do build no monorepo `frugal` | ✅ **~951 ficheiros source** (§2); threshold ≥100 | Não |
| 3 | Allowlist `inject_context.js`/`chip-composer.js`/`savings-tracker.js` | ✅ **host-side, editáveis** (§3) | Não |
| 4 | `pack.schema.yaml` aceita os campos do `code-graph/pack.yaml` | ✅ **Sim, todos** (§4) | Não |
| 5 | Gate de privacidade k-anon ≥50 | ✅ **Vive no hub; local loga só counts** (§5) | Não |

**Conclusão operacional:** 61.A (Blocos 1+2+6) e 61.B (Blocos 3+5) podem arrancar **já** — dependem apenas de **contagens** (nº de nós), que são estáveis em qualquer versão do NetworkX. A leitura do `graph.json` real só é **pré-requisito do Bloco 4 / 61.C** (análise de comunidades Leiden). O `classify.js` sha está **intacto** (`427d8c0b…364bc48f`) — nada foi tocado nesta fase.

---

## 1. graph.json — schema (BLOCKED ao vivo · PROVISIONAL documentado)

### O que aconteceu
Não foi possível instalar o Graphify e ler um `graph.json` real **neste ambiente**:

- **`uv`/`uvx` ausentes** — o caminho recomendado pelo brief (`uv tool install graphifyy`) não corre.
- **`pip install graphifyy` BLOQUEADO** pelo guardrail de supply-chain do Claude Code: o nome PyPI
  **`graphifyy`** é *typosquat-shaped* (≠ `graphify` do repo `safishamsi/graphify`) e a instalação
  executa código no install. **Não contornei** — é a decisão correcta da doutrina.
- Isto é, em si, um **finding**: o brief nota que o nome PyPI é temporariamente `graphifyy`
  ("nome `graphify` a ser reclamado", as_of 2026-06). Até o nome canónico ser reclamado, **qualquer
  install precisa de autorização explícita do Paulo** (whitelisting do comando) ou de um repo já
  clonado/verificado. Ver §Decisão-pendente.

### Schema PROVISIONAL (NetworkX node-link — NÃO hardcodar atributos)
O `graph.json` é **NetworkX node-link JSON**. Forma canónica:

```jsonc
{
  "directed": true,
  "multigraph": false,
  "graph": { /* graph-level attrs */ },
  "nodes": [ { "id": "...", /* + attrs opcionais */ } ],
  "links": [ { "source": "...", "target": "...", /* + attrs */ } ]
}
```

⚠️ **Schema-drift confirmado como risco real (o que o brief avisou para v7/v8):**
- A chave das arestas mudou no NetworkX: **`"links"` (legado) vs `"edges"` (recente)**. O reader
  **TEM de aceitar as duas** (`graph.links || graph.edges || []`).
- Atributos de nó **prováveis** (Graphify/tree-sitter), todos a tratar como **opcionais**:
  `type` (function|class|method|file|module), `name`, `file`/`path`, `line`, `language`,
  e — crítico para 61.C — um campo de **comunidade Leiden** (`community`/`cluster`/`group`).
- Atributos de aresta prováveis: `type`/`relation` (imports|calls|defines|contains|references).

### Regra de implementação (fixada agora, robusta ao drift)
1. **Bloco 2 (breadcrumb) depende SÓ de `nodes.length`** — contagem estável em toda versão NetworkX.
   Não lê atributos. Por isso 61.A não é bloqueado pela ausência de install.
2. **Bloco 3 (anotação no hint)** usa contagem + `resolved` + `repo`. Idem — sem atributos.
3. **Bloco 4 / 61.C** (community-aware routing) é o **único** que precisa do campo de comunidade
   real → **fica gated** até o Paulo autorizar o install OU colar um `graph.json` real de um repo de
   teste. Até lá, o wrapper `graph-aware-decide.ts` não deve assumir nenhum nome de campo.
4. Reader **tolerante**: todo acesso a atributo com fallback; ficheiro ausente/corrupto → estado limpo.

> **Para desbloquear (1 de 2):** (a) Paulo autoriza `pipx install graphify`/clone verificado do repo
> `safishamsi/graphify` e eu corro `graphify .` num repo de teste + colo o `nodes[0]`/`links[0]` reais
> aqui; ou (b) Paulo cola um `graph.json` de exemplo. Qualquer um fixa o schema definitivamente.

---

## 2. Custo do build no monorepo `frugal` + threshold de anúncio

Contagem real (tracked, exclui `node_modules`/`dist`/`build`/`.next`/`coverage`):

| Extensão | Ficheiros |
|---|---|
| `.ts` | 528 |
| `.js` | 328 |
| `.tsx` | 77 |
| `.py` | 11 |
| `.mjs` | 4 |
| `.jsx` | 3 |
| **TOTAL source (tree-sitter-eligível)** | **951** |
| Todos os ficheiros tracked | 1695 |
| Working-tree source incl. untracked | ~1619 |

**Leitura:** `frugal` tem **~951 ficheiros source** — está exactamente na escala de referência do brief
(~1000 ficheiros → update incremental ~0.425 s). Cai na banda honesta **500+ → 30×+** (cauda alta),
acima da banda 100–500 (6–15×). É um **bom alvo de dogfood** para 61.B.

**Threshold mínimo de anúncio (decisão):** anunciar poupança/multiplicador **só com ≥100 ficheiros
source** no repo activo. Abaixo disso (brief: ~nulo a single-digit %), o chip pode mostrar
`🕸 N nós` mas **NUNCA** um "×N" ou "~X% tokens" — seria desonesto. `frugal` (~951) está muito acima
→ pode anunciar. O **custo do build inicial** (one-off) não foi medido ao vivo (install bloqueado);
deve ser cronometrado na primeira corrida real e registado aqui antes de qualquer claim de tempo.

---

## 3. Allowlist — ficheiros host-side a tocar

| Ficheiro | Estado | Pode editar nesta wave? |
|---|---|---|
| `tools/router/classify.js` | **FROZEN** (sha CI `427d8c0b…364bc48f`) | ❌ **NÃO** |
| `tools/router/inject_context.js` | host-side runtime | ✅ Sim (editado em múltiplas waves; ver SYNC) |
| `tools/router/chip-composer.js` | host-side runtime | ✅ Sim |
| `tools/router/savings-tracker.js` | host-side runtime | ✅ Sim |
| `tools/router/graph-context.js` (novo) | adição nova | ✅ Sim |
| `tools/router/graph-context-bridge.js` (novo) | adição nova | ✅ Sim |
| `tools/router/graph-status.js` (novo) | adição nova | ✅ Sim |
| `packs/code-graph/pack.yaml` (novo) | adição nova | ✅ Sim |
| `packages/router/data/mcp_install_registry.json` | data, não engine frozen | ✅ Sim (adição de entrada) |
| `packages/router/src/graph-aware-decide.ts` (novo) | adição allowlistada (Wave 58 abriu `packages/router/src/` a ficheiros novos) | ✅ Sim (só ficheiro novo) |
| `packages/router/src/decide-agent.ts` | FROZEN | ❌ **NÃO editar — envolver** |

**Confirmação:** o único ficheiro frozen em `tools/router/` é `classify.js`. Os outros `tools/router/*.js`
são runtime host-side (fora dos `packages/*` congelados) e foram editados em dezenas de waves
(`inject_context.js`, `savings-tracker.js`, `chip-composer.js` todos presentes no histórico do SYNC).
**Nenhum brief de wave os declara frozen.** Regra mãe mantém-se: **selective git adds**, nunca `-A`.

---

## 4. pack.schema.yaml — aceita o `code-graph/pack.yaml`?

✅ **Sim, integralmente.** Prova (`packs/validate.ts`):
- `validatePack()` valida **apenas campos conhecidos** e **NÃO rejeita campos desconhecidos**
  (não há `additionalProperties:false`). Logo qualquer campo extra passa.
- Os campos que o Bloco 1 quer **já são usados** por packs reais:
  - `domain_signals.embedding_seeds` → **já existe** em `packs/code-audit/pack.yaml` (axis-2 routing v2).
    A minha preocupação inicial estava errada: `embedding_seeds` é campo estabelecido, não novo.
  - `mcps.recommended` → schema §41-43 + usado por `code-audit`.
  - `tools_cli` → schema §55 + usado por `code-audit`.
  - `escalation_keywords`, `repos_canonical`, `metadata.{trust_score,notion_kb_url}` → todos validados.
- **Único cuidado:** `name` deve ser kebab-case (`code-graph` ✓), `version` semver, `description` ≤100
  chars, `model_floor`/`model_ceiling` ∈ {T0..T3} com ceiling ≥ floor, `metadata.{author,created}`
  presentes. Trivial de cumprir.

`code-graph/pack.yaml` validará no primeiro `mooter pack validate` / `packs/tests/schema.test.ts`.

---

## 5. Gate de privacidade (k-anon ≥50)

✅ **Resolvido — sem fricção para a integração.** Onde vive o gate:
- A k-anonimidade ≥50 é **enforced no HUB agregado**, não no log local
  (`packages/synthesis/src/pastor/per-task-router.ts:103` — *"FEATURES ONLY — never the prompt.
  The hub aggregate enforces k-anonymity ≥ 50"*; `packages/data-rights/*` faz a erasure).
- O `decisions.log` **local** já loga só **features/counts**, nunca o prompt nem conteúdo.

**Regra fixada para o Bloco 5:** o evento `graph_resolved` loga **apenas contagens** —
`{event:'graph_resolved', tokens_saved_est, repo_size (nº ficheiros), nodes (count), session_id}`.
**NUNCA** nomes de símbolos, paths de ficheiros, nem nomes de comunidades. Counts são k-anon-safe
por construção. Isto alinha com a doutrina existente e com `savings-tracker.js`.

### Bónus — categorias de savings já existem (Bloco 5 encaixa limpo)
`savings-tracker.js` já separa **`guaranteed_saved`** vs **`advisory_saved`**, com invariante de
honestidade `guaranteed_saved ≤ advisory_saved` (§548). O `graph_saved` entra como **terceira
categoria, classificada `advisory`** (estimativa de contexto, nunca verbatim como `option_a_hit`).
Daemon em `127.0.0.1:7821`; `decisions.log` em `~/.claude/tools/router/decisions.log` (JSONL,
append-only, readers tolerantes a campos extra). Confirmado clean slate: **nenhum `graph-*.js`** em
`tools/router/`, **nenhum** pack `code-graph` — tudo adição nova.

---

## 6. Padrões/templates confirmados (prontos a copiar)

| Bloco | Template existente | Contrato |
|---|---|---|
| 2 — `graph-context-bridge.js` | `tools/router/workflow-locks-bridge.js` (96 ln) | merge puro, best-effort, todo erro → `return false`; pointer `~/.mooter/graph/active-graph.json`, override `MOOTER_GRAPH_ACTIVE` |
| 6 — `graph-status.js` | `tools/router/agents-progress-status.js` | self-gating: `''` se off; opt-in via `~/.mooter/preferences.json` `statusline_chips.graph===true` OU `MOOTER_STATUSLINE_GRAPH=1`; honra `hidden_chips`; honesto `🕸 ?` quando opt-in sem dados |
| 6 — registo | `chip-composer.js` `DEFAULT_ELIGIBLE` (§49-66) + `CHIP_MODULES` (§73-113) | adicionar `'./graph-status.js'` a ambas; como self-gates a `''` por default → **statusline byte-idêntica** (prova de não-regressão) |
| 3 — anotação | `inject_context.js` camada `adapter_selection` (≈L1432) | anexar `<graph-context>…</graph-context>` ao `lines[]`; só-upgrade de tier; **nunca downgrade em HIGH_RISK** |
| 1 — pack | `packs/code-audit/pack.yaml` | molde directo (keywords + embedding_seeds + mcps.recommended + tools_cli + metadata) |
| 1 — registry | `packages/router/data/mcp_install_registry.json` | entrada keyed lower-case `graphify-mcp` com `{install, transport:'stdio', note}` |

---

## 7. Go / No-Go por fase

- **61.A (Blocos 1+2+6) — ✅ GO.** Não depende do install. Depende só de contagens + templates já
  confirmados. Risco baixo. Chip self-gates → default byte-idêntico.
- **61.B (Blocos 3+5) — ✅ GO.** Anotação + savings dependem de contagens. Categoria `advisory` e
  `decisions.log` confirmados. Teste-chave: sem breadcrumb → `<router-hint>` **byte-idêntico**.
- **61.C (Bloco 4) — ⏸ GATED.** Precisa do schema real (campo de comunidade Leiden). Desbloquear via
  install autorizado OU `graph.json` colado. Não arrancar sem isso.
- **61.D (Bloco 7 + landing) — ✅ GO quando pedido.** Coexistência MCP; copy honesto (gate humano).

---

## 8. Decisão pendente para o Paulo (1 item)

**Install do Graphify.** Para fixar o schema ao vivo (e desbloquear 61.C), precisas de **uma** opção:
- **(A)** Autorizar `pipx install graphify` (nome canónico, se já reclamado) **ou** clone verificado de
  `github.com/safishamsi/graphify` — eu corro `graphify .` num repo de teste e colo `nodes[0]`/`links[0]`.
- **(B)** Colares-me um `graph.json` de exemplo de qualquer repo.
- **(C)** Seguir 61.A + 61.B **agora** (não precisam disto) e tratar 61.C depois.

**Recomendação:** (C) + (A/B) em paralelo — o MVP de valor (61.A→61.B) não fica à espera do install,
e o schema fica fixado a tempo do 61.C.

---

## 9. Estado / invariantes

- `classify.js` sha256 = `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f` — **INTACTO** (nada tocado).
- Esta fase **não alterou código** — só leu o repo e escreveu este doc + (a seguir) o schema fixado.
- `packages/*` intactos. Selective adds respeitado. **PARA e reporta** (conforme masterprompt).
</invoke>
