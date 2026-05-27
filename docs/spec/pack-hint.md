# Spec — `<pack-hint>` format

**Status**: 🟢 Emitted (Wave 1, Day 4) · `packages/router/src/hooks/inject_context.ts`
**Source**: `docs/strategy/PASTOR.md` §6.1, §7 · ADR 015 (two-axis routing)
**Related**: `packs/pack.schema.yaml`, `tools/router/inject_context.js` (frugal axis-1 reference), `packages/router/src/pack_resolve.ts`

---

## Propósito

`<pack-hint>` é o output do **eixo 2** (domínio → Moo Pack). É **aditivo** ao `<router-hint>` (eixo 1, complexidade → tier) — nunca o substitui. O hook (`inject_context.js`, a partir do Day 4) emite ambos, lado a lado, no início do turn.

```xml
<router-hint>
tier=T2 model=sonnet confidence=0.82 reason="..."
</router-hint>

<pack-hint>
pack=animation-web confidence=0.91 reason="signals: animation, motion, scroll-trigger"
model_floor=T2 (respected)
skills_invoke=[anthropic-skills:web-artifacts-builder]
mcps_recommended=[vercel]
mcps_missing=[]
subagent_primary=model-reasoner
scaffold_url=packs/animation-web/scaffold.md
suggest_install=[]
</pack-hint>
```

## Campos

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `pack` | string | sim | `pack_id` resolvido, ou sentinela `AMBIGUOUS` / `GENERAL` (ver abaixo) |
| `confidence` | float `0–1` | sim | Confiança de `classify_domain()` na atribuição do pack |
| `reason` | string | sim | Sinais que dispararam o match (`"signals: ..."`) |
| `model_floor` | `T0..T3` `(respected\|raised)` | sim | Tier mínimo do pack; `(respected)` se o eixo-1 já o cumpre, `(raised)` se foi elevado |
| `skills_invoke` | `[string]` | sim | Skills a invocar **no início** da resposta (lista pode ser vazia `[]`) |
| `mcps_recommended` | `[string]` | sim | MCPs recomendados disponíveis |
| `mcps_missing` | `[string]` | sim | MCPs requeridos pelo pack mas **não** ligados |
| `subagent_primary` | string | sim | Subagent executor sugerido para o domínio |
| `scaffold_url` | path | sim | Caminho do scaffold do pack a ler antes de planear |
| `suggest_install` | `[string]` | sim | Comandos de instalação sugeridos quando há `missing` (lista pode ser vazia) |

## Valores especiais de `pack`

Quando `classify_domain()` não consegue um match confiante (PASTOR §7, cenários D/E):

- **`AMBIGUOUS`** — múltiplos packs candidatos com confiança próxima e baixa (ex.: `confidence=0.42`). O hook lista os candidatos no `reason`; Claude deve **perguntar** ao user qual o domínio antes de assumir.
- **`GENERAL`** — nenhum pack se aplica (ex.: `confidence=0.31`). Procede só com o `<router-hint>` (eixo-1); nenhum scaffold/skill de pack é injectado.

Em ambos os casos, `skills_invoke`, `mcps_*` e `suggest_install` são `[]` e `scaffold_url` é omitido ou vazio.

## Contrato de comportamento (doutrina)

> Se `<pack-hint>` está presente e `pack` não é `GENERAL`/`AMBIGUOUS`:
> **lê o `scaffold_url` antes de planear** e **invoca as skills de `skills_invoke` no início da resposta, não no fim.**

- Se `mcps_missing` não estiver vazio → pedir confirmação ao user para instalar (`suggest_install`) ou prosseguir sem.
- `model_floor` do pack é um piso: nunca descer abaixo dele, mesmo que o eixo-1 sugira um tier inferior. O `model_ceiling` do pack continua a actuar como cost guard.
- **Backward-compat**: a ausência de `<pack-hint>` (ou `pack=GENERAL`) deixa o comportamento idêntico ao pré-Pastor.

## Budget de performance (PASTOR §6.4)

| Etapa | Budget p99 |
|---|---|
| `classify_domain` (regex layer) | ≤ 5ms |
| Embedding layer (opcional, se confiança < 0.7) | ≤ 50ms |
| Haiku fallback semântico (se confiança final < 0.6) | ≤ 800ms |
| `pack_resolve` | ≤ 20ms |
| **Total hint emit (sem Haiku)** | **≤ 60ms** |

## Exemplos por cenário (PASTOR §7)

```xml
<!-- A — match forte -->
<pack-hint>
pack=animation-web confidence=0.93 reason="signals: animation, motion, scroll-trigger"
...
</pack-hint>

<!-- D — ambíguo: perguntar antes de assumir -->
<pack-hint>
pack=AMBIGUOUS confidence=0.42 reason="candidates: data-spreadsheet (0.42), diagram-systems (0.39)"
skills_invoke=[]
</pack-hint>

<!-- E — genérico: só eixo-1 -->
<pack-hint>
pack=GENERAL confidence=0.31 reason="no domain signals above threshold"
skills_invoke=[]
</pack-hint>
```

## Exemplos reais emitidos (Day 4)

Output verbatim de `packages/router/src/hooks/inject_context.ts`. O hook corre
`classifyComplexity` (eixo 1, wrapper sobre `tools/router/classify.js`) e
`classifyDomain` (eixo 2) em paralelo (`Promise.all`) e emite ambos os blocos.
Combined p99 ≈ 3.6 ms (budget §6.4: ≤ 60 ms).

**Match forte + env completo** — `"Add a scroll-trigger animation to the hero section"`
(env: skill `web-artifacts-builder` + MCP `vercel` presentes):

```xml
<router-hint>
task_category: trivial_local
risk_level: minimal
tier: T0
recommended_backend: ollama
recommended_model: qwen2.5:3b
suggested_subagent: local-summarizer
confidence: 0.8
</router-hint>

<pack-hint>
pack=animation-web confidence=1.00 reason="signals: 1 keyword (score 1, conf 1.00)"
model_floor=T2 (raised)
skills_invoke=[anthropic-skills:web-artifacts-builder]
mcps_recommended=[vercel]
mcps_missing=[]
subagent_primary=model-reasoner
scaffold_url=packs/animation-web/scaffold.md
suggest_install=[]
</pack-hint>
```

> `model_floor=T2 (raised)`: o eixo-1 classificou T0, abaixo do piso T2 do pack —
> a doutrina sobe para T2. O `<router-hint>` **não** é mutado (backward-compat
> P18); o piso é honrado a partir da anotação no `<pack-hint>`.

**Missing MCP** — `"audita este repositório antes de fazer push"` → `code-audit`
(env sem os MCPs `github`/`sentry`):

```xml
<pack-hint>
pack=code-audit confidence=1.00 reason="signals: 2 intent (score 3, conf 1.00)"
model_floor=T3 (respected)
skills_invoke=[design:accessibility-review, design:design-critique]
mcps_recommended=[]
mcps_missing=[github, sentry]
subagent_primary=final-reviewer
scaffold_url=packs/code-audit/scaffold.md
suggest_install=[mooter pack install code-audit, npx -y @modelcontextprotocol/server-github, npx -y @sentry/mcp-server]
</pack-hint>
```

### Resolução de drift §10.4 ↔ §6.1

PASTOR.md §10.4 escrevia `scaffold_path`; §6.1 e este spec usam `scaffold_url`.
**§6.1 prevalece** (era a fonte canónica e já estava committed aqui). O hook emite
`scaffold_url`. `suggest_install` é **array** (não string). Patch a PASTOR.md §10.4
fica como nit de Day 5.

### Degradação graciosa (env desconhecido)

Quando nenhuma fonte de config MCP existe (`settings.json`/`.claude.json`/`.mcp.json`
sem `mcpServers`) ou não há inventário de skills, essa dimensão é marcada
`*_known=false` e a respectiva `missing` fica `[]` — **nunca** se emite um nag de
install falso. `skills_invoke` cai para os `skills.required` (advisory).
