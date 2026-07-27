# Estudo grande · Context Engine do Live Edit — "qualquer clique, contexto total, cirúrgico, em tempo real"

> **Pergunta do Paulo (2026-07-07):** ao clicar em QUALQUER parte da app no Live Preview e mandar
> um prompt, o LLM (local ou subscrição) tem de ter o contexto TODO do projecto, fazer cross-check,
> gerar edição cirúrgica perfeita, e a mudança aparecer no preview em tempo real. Ex: box de savings
> → "actualiza com dados reais do mooter" → o agente sabe de onde vêm os savings reais, edita o
> sítio certo, e vê-se ao vivo.
> **Este doc:** advogado do diabo do problema geral + SOTA 2026 (23 fontes) + auditoria do código
> real do Mooter + o modelo perfeito. **Supersede e expande** o LP-4.6 Context Pack Study v1
> (`_archive/2026-07/`), que estava certo mas incompleto. Não gera masterprompt — é o estudo que
> os fundamenta.

## 0. Advogado do diabo — o exemplo savings é FÁCIL; o projecto geral é duro
O caso savings resolve-se com "números canónicos numa fonte". Mas "QUALQUER clique perfeito" inclui:
- **Handler noutro ficheiro** — um botão cujo `onClick={handleX}` vive num hook/util → precisa de
  **find-references** (semântico), grep de texto falha se o nome for comum.
- **Props drilling / hooks** — o valor rendido desce 3 componentes ou vem de `useX()` → seguir a
  cadeia até à origem (fetch/route/DB).
- **Server Components / API / hub** — o dado vem de `/api/...` ou do CF hub → mapear component→fetch→rota.
- **`.map()` sobre dados** — editar o `<li>` afecta o template de todos os itens; a fonte é o array.
- **Componente partilhado** — usado em 10 sítios → editar a definição afecta todos (component scope).
- **Cross-file refactor** — "renomeia isto em todo o lado" → precisa do grafo de referências.

**Hoje (LP-4.5 em main):** o agente recebe *raw prompt + nó ancorado (file:line) + allowlist 4-5
tools* e **descobre tudo por Read/Grep ao vivo** — medido: **20.7s** (pergunta) e **52.6s** (edição)
com só 2 ficheiros. Para "qualquer clique, tempo real", **não escala**: lento e não garantido.

## 1. SOTA 2026 — o que ganha para EDITAR (não Q&A)
Duas filosofias, e a evidência é genuinamente disputada:
- **Anti-index (Claude Code):** agentic grep/glob bate RAG "por muito" — precisão, **freshness**
  (um índice fica stale durante a edição — fatal para live-edit), privacidade, zero índice a manter.
  ✅ Anthropic "Effective context engineering".
- **Pró-index (Cursor/Continue/Augment):** embeddings + Merkle-sync; Cursor mediu **+12.5%** de
  precisão com índice semântico treinado. Ablation de *edição* repo-level: **embeddings 41.7% vs
  agente 36.1%**. E encher o contexto todo **degrada** (contexto ≠ raciocínio). ✅ arXiv 2406.04464.
- **Veredicto convergente (2026):** para **edição de localização conhecida** (já tens o file:line do
  DOM) grep/LSP ganham; embeddings pagam-se no **salto difuso** ("de onde vêm os dados"). O maduro é
  **híbrido, agente-no-loop**: scoping determinístico primeiro, modelo só na fatia curada. ✅ CORE-Bench, CodeRAG-Bench.
- **RULER (arXiv 2510.05381):** todos os modelos degradam com o comprimento; pequenos degradam mais,
  MESMO com retrieval perfeito. ⇒ **nunca despejar o repo no qwen local** — fatia pequena e precisa.

## 2. As técnicas/soluções concretas (local-first, $0, privadas onde marcado)
| Camada | Técnica / ferramenta | Licença/nota | Fonte |
|---|---|---|---|
| Elemento→código | **code-inspector-plugin** (`data-insp-path`, build-time) — JÁ usado no Mooter | MIT | zh-lx/code-inspector |
| Elemento→código (fallback R19) | **bippy** — anda a fiber tree, lê fiber-source + props/hooks em runtime (R19 matou `_debugSource`) | MIT | aidenybai/bippy |
| Índice vivo | **tree-sitter** incremental + **Merkle diff** + **CocoIndex** (~500ms debounce) | MIT | tree-sitter, CocoIndex, Cursor |
| Repo-map (TOC $0) | **Aider repo map** — tree-sitter + **PageRank** dos símbolos → ~1-2K tokens sempre no prompt, sem embeddings | Apache | aider.chat/repomap |
| Scoping semântico | **Serena** (LSP MCP: go-to-def/find-references, 30+ langs, local) + **ast-grep** (match-and-**rewrite** do nó exacto) | open-source | oraios/serena, ast-grep |
| Salto difuso (opcional) | **claude-context** (BM25+dense, Merkle, **embeddings via Ollama = local $0**) só p/ prompts vagos | MIT | zilliztech/claude-context |
| Tier cloud | **prompt caching** do prefixo estável de contexto: −41-80% custo, +TTFT | — | Anthropic prompt caching |

## 3. O que o Mooter JÁ tem (auditoria do código real 2026-07-07)
- ✅ `packages/vscode-extension/src/live-edit-ast.js` (@babel/parser) — localiza JSX; **reutilizável
  para um import-scan/repo-map**.
- 🟡 **Graphify** (Wave 61/66): grafo tree-sitter do repo (`graph.json`), MAS ligado ao **router**
  (`tools/router/graph-context-bridge.js` só escreve *counts*; `packages/router/src/graph-aware-decide.ts`
  enviesa o modelo do router). **Não alimenta o agente do Live Edit.** O LP-4.6 já mandava "reusar se
  existir host-side" — existe. É a peça a reaproveitar para a Camada 2/3.
- ✅ Hub `/aggregate-stats` (`landing/app/lib/hub.ts`) — **única fonte viva** de métricas
  (`prompts_routed`, `active_devs`, `saved_last_7d`); recusa fabricar avg-savings ("seria desonesto").
- ❌ Números do hero **hardcoded e duplicados** em 7 ficheiros (`page.tsx` L19-21, TwoTerminalDemo,
  PulseStrip, HandoffStory, CommunityPulse, layout, CockpitShowcase) — a dor exacta do teu exemplo.
- ✅ `packages/router/src/embedding_store.ts` + `ollama_client.ts` — stack de embeddings **local
  (Ollama)** já em produção, hoje a embeder *prompts* do router; **reutilizável** para o salto difuso.
- ❌ `.mooter/context-pack.md` / `canonical-metrics.json` / builder — **não existem** (só o estudo).
- ⚠️ **Nota operacional:** os runners do Live Edit vivem na branch **`feat/live-edit` (não-merged)**;
  o `~/frugal` está em `wave/honest-controls`. Confirmar o estado real antes de construir (deriva).

## 4. O MODELO PERFEITO para o Mooter — pipeline em 6 camadas (local-first $0, agente-no-loop)
```
[1] pin → file:line   (code-inspector data-insp-path · bippy fallback R19)                     $0 build-time
[2] índice vivo       (tree-sitter + Merkle, 500ms debounce · REUSA Graphify graph.json)        $0 local
[3] repo-map TOC      (PageRank Aider, ~1-2K tok, sempre no prompt)                              $0 local
[4] scoping exacto    (Serena/LSP find-references → blast radius · ast-grep isola o nó)          $0 local
[5] DATA-HOP (moat)   (bippy props/hooks → LSP refs → hook/fetch/rota/hub → fatia da fonte)      $0 local
[6] pack + apply      (fatia PEQUENA curada [não repo] → qwen local OU cloud c/ prompt-cache →
                       ast-grep rewrite / byte-splice → HMR mostra ao vivo)                       $0/cloud
```
- **Camadas 1-5 são determinísticas e $0** — resolvem o "contexto total + cross-check" ANTES de gastar
  um token de modelo. É isto que falta hoje (o agente faz tudo isto por exploração lenta).
- **Camada 6 respeita o RULER:** fatia curada, não repo inteiro; local para o simples, cloud (com
  cache do prefixo) para o blast radius grande.
- **O teu exemplo savings resolve-se na Camada 5:** o data-hop segue `SavingsBox` → o valor vem de
  `page.tsx` hardcoded (ou do hub) → o agente sabe *exactamente* onde e com que fonte substituir, em
  ms, não 30s de grep. Pré-requisito: unificar os números numa fonte (`canonical-metrics.json` +
  ligar o hero ao hub) — que é metade do trabalho e mata a duplicação dos 7 ficheiros.

## 5. O MOAT (Secção 5 da pesquisa): "que API alimenta este elemento"
Ninguém empacota o **data-source hop** end-to-end (v0/Lovable/Bolt fazem elemento→código, mas o
mapa até à fonte de dados é fechado/inexistente). É montável no Mooter: **bippy** (props/state/context/
hooks do nó) → **LSP/SCIP find-references** (subir a cadeia) → **ast-grep** (reescrever). Se o Mooter
o entregar local-first, é uma vantagem que nenhum builder tem — e é exactamente o que faz "qualquer
clique perfeito".

## 6. Recomendações ranked (impact/effort) — o que meter no comboio
1. **Unificar métricas: `canonical-metrics.json` + ligar o hero ao hub** — mata a duplicação dos 7
   ficheiros e habilita o teu exemplo savings. Alto/Baixo · $0. (Também corrige o bug $25.95.)
2. **Repo-map PageRank (Aider) sempre no prompt** — o maior salto de scoping por menor esforço, sem
   embeddings. Alto/Médio · $0. Reusa `live-edit-ast.js` + Graphify.
3. **Fatia determinística por selecção (Camada B do LP-4.6) a partir do import-map** — corta os 20-52s.
   Alto/Médio · $0.
4. **Serena (LSP MCP) para find-references** — o data-hop e o cross-file. Alto/Médio · $0.
5. **ast-grep rewrite do nó exacto** (vs regenerar ficheiro) — diffs minúsculos, mais preciso. Alto/Médio · $0.
6. **bippy fiber-source + props/hooks** — fallback R19 + a base do data-hop. Alto/Médio · $0.
7. **RULER-disciplina: pack pequeno, nunca repo no qwen** — grátis de implementar, evita degradação. Alto/Baixo.
8. **claude-context com embeddings Ollama** só para prompts vagos — reusa `embedding_store.ts`. Médio/Alto · $0.
9. **prompt-cache do prefixo no tier cloud (Agent SDK)** — −41-80% custo. Médio/Baixo · cloud.
10. **Data-hop tracer completo (o moat)** — maior esforço, maior diferenciação. Alto/Alto · $0.

## 7. Como isto encaixa no comboio (confronto)
- A **LP-4.9** (em curso) é UX/apresentação — **ortogonal** a isto. Continua.
- O **LP-4.6 v1** era a base certa mas incompleta. Este estudo é o **LP-4.6 v2 (Context Engine)**:
  acrescenta repo-map PageRank, LSP/Serena, ast-grep, bippy data-hop, disciplina RULER.
- O **FIX-MP-1** (identidade da árvore, da auditoria CCA) continua pré-requisito do "aparece no
  preview em tempo real".
- **Ordem recomendada:** FIX-MP-1 (P0 preview) + Rec#1 (métricas canónicas, barato e habilita o
  exemplo) primeiro; depois o Context Engine (Rec#2-7) como wave própria antes de LP-5/6. A montra
  (LP-4.9) e o cérebro (Context Engine) são as duas metades do "uau" — nenhuma sozinha chega.

## 8. Fontes
Anthropic "Effective context engineering" ✅ · Cursor secure-indexing + semsearch (+12.5%) ✅ ·
Aider repomap (tree-sitter PageRank) ✅ · Continue embeddings (local hybrid) ✅ · arXiv 2406.04464
(edit ablation 41.7 vs 36.1) ✅ · RULER arXiv 2510.05381 ✅ · code-inspector-plugin ✅ · bippy/react-scan ✅ ·
Onlook architecture ✅ · Serena (LSP MCP) ✅ · ast-grep + ast-grep-mcp ✅ · CocoIndex realtime ✅ ·
zilliztech/claude-context (Ollama embeds) ✅ · SCIP/Sourcegraph ✅ · Anthropic prompt caching ✅.
Auditoria código real Mooter 2026-07-07: live-edit-ast.js · graph-context-bridge.js · graph-aware-decide.ts ·
landing/app/lib/hub.ts · landing/app/api/community/pulse/route.ts · embedding_store.ts · page.tsx L19-21.
