# Wave 2 Day 3 — Kickoff master prompt (Embedding layer + NITs 1+2)

> **Como usar**: cola tudo abaixo de `=== START ===` no Claude Code dentro de `~/mooter/` (WSL2 Ubuntu), depois do PR #9 estar merged em `dev`. Self-contained.

**Pré-requisitos verificados antes de colar**:
- ✅ PR #9 merged em `dev` (squash commit `30658c9`)
- ✅ `git checkout dev && git pull origin dev` na working copy
- ✅ Ollama host responde em `host.docker.internal:11434`
- ✅ Modelo `nomic-embed-text` disponível (`curl ... /api/tags` mostra-o)
- ✅ `claude --version` ≥ versão usada no Day 2
- ✅ `ANTHROPIC_API_KEY` exportada

---

=== START ===

## 0. Quem és e o que vais fazer

És Claude Code no `~/mooter/`, branch `wave2-day3-embedding-and-nits` (a criar). `--permission-mode auto`. Acesso:
- `~/mooter/` (target, symlink resolve para `/home/paulo/frugal` — mesmo repo, confirma com `git remote -v`)
- Ollama RTX 4090 via `host.docker.internal:11434`:
  - `nomic-embed-text` (este Day — 137M params, 768-dim embeddings)
  - `qwen2.5-coder:7b` (T0)
  - `qwen3:30b` (fallback T0)
  - `gemma3:12b`
- Anthropic Max sub
- Notion HQ ID `33d6f6e4-2bc4-816b-977a-fe84bbe912c9`

**Missão Day 3**: shippar 2 sub-features num único PR para `dev`:
1. **NITs 1 + 2 cleanup** (do Day 2 review) — defensive guard + structural mutual exclusion
2. **Embedding layer** — `nomic-embed-text` local + faiss in-memory para `classify_domain v2`, paralelo ao regex v1 actual (fallback)

NITs 3 + 4 (test edge case + STATUSLINE_WIRE.md callout) ficam para Day 6 (re-touch statusline cross-platform).

## 1. Invariantes (não-negociáveis)

- ❌ **Nunca tocar `classify.js`** — eixo 1 byte-identical (invariant P11)
- ❌ **Nunca `git add -A`** — commits selectivos sempre
- ❌ **Nunca merge directo para `main`** — sempre PR para `dev`, Paulo aprova squash
- ❌ **Nunca `--no-verify`**
- ❌ **Não tocar Wave 4 launch surface** — `mooter init`, slash commands, event writer ficam Days 4/6
- ❌ **Embedding layer é ADITIVO** — regex v1 (`classify_domain.ts`) mantém-se como fallback. NÃO substituir.
- ✅ **Final-reviewer T3-gate obrigatório** antes do PR (Task tool, Opus pinned)
- ✅ **Sanity check $1 BLOCKER** — embedding é local-only, esperado $0
- ✅ **Notion sub-page** ao fim do Day + SYNC.md update

## 2. Branch + recon

```bash
cd ~/mooter
git checkout dev
git pull origin dev
git log --oneline -3  # confirma commit 30658c9 no topo
git checkout -b wave2-day3-embedding-and-nits
```

Recon paralelo (lê estes ficheiros antes de tocar em nada):
- `packages/router/src/hooks/inject_context.ts` (NITs 1+2 vão aqui)
- `packages/router/src/classify_domain.ts` (extender com embedding layer)
- `packages/router/src/policy.ts` (referência para ambig flow)
- `packs/*/pack.yaml` (todos os 7 packs — vais extrair `domain_signals` para embedding store)

## 3. NIT 1 + 2 cleanup (do Day 2 review)

### 3.1 NIT 1 — defensive guard `model_floor ≤ model_ceiling`

**Ficheiro**: `packages/router/src/hooks/inject_context.ts`

No manifest load (onde o `pack.yaml` é parsed), adiciona:
```typescript
function assertTierBounds(manifest: PackManifest, packId: string): void {
  const FLOOR = parseTierLevel(manifest.model_floor ?? "T0");
  const CEILING = parseTierLevel(manifest.model_ceiling ?? "T3");
  if (FLOOR > CEILING) {
    throw new Error(
      `Pack '${packId}' has model_floor=${manifest.model_floor} > model_ceiling=${manifest.model_ceiling}. ` +
      `Fix the pack manifest before loading.`
    );
  }
}
```

Chama no manifest load, antes de qualquer routing usar o pack. Adiciona test:
- `packages/router/tests/manifest-bounds.test.ts`:
  - Load pack com floor T0, ceiling T3 → passes
  - Load pack com floor T3, ceiling T0 → throws com mensagem clara
  - Load pack sem floor/ceiling → assume defaults T0/T3, passes

### 3.2 NIT 2 — collapse `fallback?.applied + ambig?.applied` num único `inline_scaffold` slot

**Ficheiro**: `packages/router/src/hooks/inject_context.ts`

Actualmente os dois flows (fallback general + AMBIGUOUS) são mutuamente exclusivos por ordem de execução. O reviewer pediu structural mutual exclusion (não circumstantial).

Refactor:
```typescript
type InlineScaffold =
  | { kind: "ambiguous"; candidates: string[]; text: string }
  | { kind: "fallback"; reason: string; text: string }
  | null;

function resolveInlineScaffold(classifyResult: ClassifyResult): InlineScaffold {
  // First check: AMBIGUOUS (already implemented Day 2)
  const ambig = applyAmbiguousScaffold(classifyResult);
  if (ambig) return { kind: "ambiguous", candidates: ambig.candidates, text: ambig.text };

  // Second check: GENERAL fallback (already implemented Day 1)
  const fallback = applyGeneralFallback(classifyResult);
  if (fallback) return { kind: "fallback", reason: fallback.reason, text: fallback.text };

  return null;
}
```

Render apenas um slot:
```typescript
const scaffold = resolveInlineScaffold(result);
if (scaffold) {
  emit(`<pack-hint scaffold-kind="${scaffold.kind}">${scaffold.text}</pack-hint>`);
}
```

Test:
- `packages/router/tests/inline-scaffold-exclusion.test.ts`:
  - Prompt ambíguo → kind="ambiguous", único slot
  - Prompt GENERAL → kind="fallback", único slot
  - Prompt pack claro → null, nenhum slot
  - Hard assertion: nunca dois slots ao mesmo tempo (mesmo se as duas funções fossem chamadas)

## 4. Embedding layer (sub-feature principal Day 3)

### 4.1 Spec

`classify_domain v1` actual usa regex (0.85 recall, ~5ms p50). `classify_domain v2` adiciona embedding layer:
1. Compute prompt embedding via `nomic-embed-text` (Ollama HTTP, 768-dim)
2. Cosine similarity contra cada pack `domain_signals.embedding_seeds` (5-10 prompts canónicos por pack, embeddings pre-computed e cached em memória)
3. Top-k=3 packs by similarity → confidence weighted
4. **Combine** v1 (regex) + v2 (embedding) num único score:
   - `final_confidence = 0.4 * regex_confidence + 0.6 * embedding_confidence`
   - Razão: embedding generaliza melhor, regex tem precisão alta quando match
5. Fallback: se embedding indisponível (Ollama down), v1 toma over silently

### 4.2 Implementação

**Ficheiro novo**: `packages/router/src/embedding_store.ts`

```typescript
import { OllamaClient } from "./ollama_client";
import { loadPacks } from "./pack_loader";

const EMBED_MODEL = "nomic-embed-text";
const EMBED_DIM = 768;
const OLLAMA_URL = process.env.OLLAMA_HOST ?? "http://host.docker.internal:11434";

interface PackEmbedding {
  pack_id: string;
  embeddings: Float32Array[];  // one per seed prompt
}

class EmbeddingStore {
  private store: PackEmbedding[] = [];
  private ollama: OllamaClient;
  private ready = false;

  constructor() {
    this.ollama = new OllamaClient(OLLAMA_URL);
  }

  async init(): Promise<void> {
    const packs = await loadPacks();
    for (const pack of packs) {
      const seeds = pack.domain_signals?.embedding_seeds ?? [];
      if (seeds.length === 0) continue;
      const embeddings = await Promise.all(
        seeds.map((seed: string) => this.ollama.embed(EMBED_MODEL, seed))
      );
      this.store.push({ pack_id: pack.id, embeddings });
    }
    this.ready = true;
  }

  async classify(prompt: string): Promise<{ pack_id: string; confidence: number; runnerUp?: { pack_id: string; confidence: number } } | null> {
    if (!this.ready) {
      // Lazy init on first classify
      await this.init().catch(() => { /* swallow — fallback to v1 */ });
      if (!this.ready) return null;
    }

    const queryEmbedding = await this.ollama.embed(EMBED_MODEL, prompt).catch(() => null);
    if (!queryEmbedding) return null;

    const scores = this.store.map(p => ({
      pack_id: p.pack_id,
      // Max similarity over seeds (best-of-N matching)
      score: Math.max(...p.embeddings.map(e => cosineSim(queryEmbedding, e)))
    }));

    scores.sort((a, b) => b.score - a.score);
    if (scores.length === 0) return null;

    return {
      pack_id: scores[0].pack_id,
      confidence: scores[0].score,
      runnerUp: scores[1] ? { pack_id: scores[1].pack_id, confidence: scores[1].score } : undefined
    };
  }
}

function cosineSim(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export const embeddingStore = new EmbeddingStore();
```

**Ficheiro novo**: `packages/router/src/ollama_client.ts`

```typescript
export class OllamaClient {
  constructor(private url: string) {}

  async embed(model: string, prompt: string): Promise<Float32Array> {
    const res = await fetch(`${this.url}/api/embed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, input: prompt }),
      signal: AbortSignal.timeout(2000)
    });
    if (!res.ok) throw new Error(`Ollama embed failed: ${res.status}`);
    const data = await res.json();
    if (!data.embeddings || !data.embeddings[0]) throw new Error("No embedding returned");
    return new Float32Array(data.embeddings[0]);
  }
}
```

**Ficheiro**: `packages/router/src/classify_domain.ts`

Extende a função actual para combinar v1 + v2:
```typescript
import { embeddingStore } from "./embedding_store";

const REGEX_WEIGHT = 0.4;
const EMBED_WEIGHT = 0.6;

export async function classifyDomain(prompt: string): Promise<ClassifyResult> {
  // v1: regex (existing)
  const v1 = classifyDomainRegex(prompt);

  // v2: embedding (new, may fail silently)
  const v2 = await embeddingStore.classify(prompt).catch(() => null);

  if (!v2) {
    // Fallback to v1-only (silent — Ollama may be down)
    return v1;
  }

  // Combine: if v1 and v2 agree on top pack, boost confidence
  if (v1.pack_id === v2.pack_id) {
    return {
      pack_id: v1.pack_id,
      confidence: Math.min(1.0, REGEX_WEIGHT * v1.confidence + EMBED_WEIGHT * v2.confidence + 0.1),  // agreement bonus
      runnerUp: v1.runnerUp ?? v2.runnerUp,
      source: "agreement"
    };
  }

  // Disagreement: trust whichever has higher weighted score
  const v1Score = REGEX_WEIGHT * v1.confidence;
  const v2Score = EMBED_WEIGHT * v2.confidence;
  if (v1Score >= v2Score) {
    return { ...v1, source: "regex_wins" };
  }
  return { ...v2, source: "embedding_wins" };
}
```

### 4.3 Pack manifest extension

Em cada `packs/*/pack.yaml`, adiciona campo `domain_signals.embedding_seeds` (5-10 prompts canónicos por pack). **Não** removas o `domain_signals.regex` existente — fica como v1.

Exemplo (`packs/diagram-systems/pack.yaml`):
```yaml
domain_signals:
  regex:
    - "diagram|flowchart|architecture diagram|system map|sequence diagram|mermaid|ADR"
  embedding_seeds:
    - "create a flowchart of the auth flow"
    - "draw the architecture of this system"
    - "explain the data pipeline with a diagram"
    - "write a Mermaid sequence diagram for the API call"
    - "make an ADR for this design decision"
    - "show me a system map of the services"
    - "diagram the database schema"
    - "visualize the request lifecycle"
```

Faz para os 7 packs actuais (animation-web, code-audit, diagram-systems, data-spreadsheet, prd-strategy, voice-tts, knowledge-third-brain). Os seeds devem ser **distintos** entre packs (no overlap óbvio — se não souberes, regenera).

### 4.4 Performance budget

- Embedding init (boot): ≤ 5s para 7 packs × 8 seeds = 56 embeddings (paralelizar)
- Per-prompt classify (incl. embedding lookup): p99 ≤ 80ms (regex 5ms + embed 50ms + cosine 5ms + overhead)
- Memory: ≤ 200KB total (56 × 768 × 4 bytes = 172KB)

Adiciona benchmark em `packages/router/tests/embedding-perf.test.ts`:
- Mede tempo de init
- Mede p99 de classify sobre 50 prompts variados
- Falha test se exceder budget

### 4.5 Recall validation

Pega no validation set de 20 prompts da Wave 1 (em `docs/benchmarks/wave1-pastor/prompts.csv` ou similar). Mede:
- v1 only recall
- v2 only recall
- v1 + v2 combined recall

**DoD**: combined recall ≥ 0.90 nos 20 prompts (vs 1.00 de v1 only no Wave 1 — embedding deve **manter ou melhorar**, não regredir).

Se combined < 0.90 → investigar e tunar pesos (REGEX_WEIGHT/EMBED_WEIGHT) ou seeds antes de fechar Day.

### 4.6 Fallback test

Test: simula Ollama down (mock fetch para deitar erro):
- `classifyDomain` deve cair silenciosamente para v1
- Nenhum throw, nenhum log de erro user-visible
- Result tem `source: "regex_fallback"` quando isto acontece

## 5. Final-reviewer pre-PR

Spawn final-reviewer (Opus pinned via Task tool, mesma fórmula Day 2):

```
Task tool, subagent_type: "general-purpose" (ou final-reviewer)

Prompt: "Review branch wave2-day3-embedding-and-nits vs dev.

Verifica:
- classify.js byte-identical com dev (invariant P11)
- NIT 1: assertTierBounds throws com mensagem clara em manifest mal configurado
- NIT 2: inline_scaffold é structural exclusion (test verifica que nunca há dois slots)
- Embedding layer é ADITIVO — v1 regex preservado e fica como fallback
- classify_domain devolve resultado v1 silenciosamente quando Ollama down (test passa com mock)
- Combined recall ≥ 0.90 nos 20 prompts validation
- p99 ≤ 80ms classify
- Sem `git add -A`, sem `--no-verify`
- Sem secrets em diff
- Embedding seeds são distintos entre packs (no overlap)
- pack.yaml mantém domain_signals.regex existente

Reporta: APPROVE | APPROVE_WITH_NOTES | REQUEST_CHANGES com lista numerada de NITs."
```

Se REQUEST_CHANGES → fix → re-review. Se APPROVE_WITH_NOTES → NITs ≤ 4 vão para Day 4 backlog.

## 6. PR

```bash
git push -u origin wave2-day3-embedding-and-nits
gh pr create --base dev --title "Wave 2 Day 3: Embedding layer + NITs 1+2 cleanup" --body-file - <<'EOF'
## Summary
Two bundled sub-features per Wave 2 plan:

1. **NITs 1+2 cleanup** (Day 2 review backlog):
   - NIT 1: `assertTierBounds(manifest)` defensive guard on pack manifest load
   - NIT 2: `resolveInlineScaffold()` collapses fallback + ambiguous into structural mutual exclusion (single slot)

2. **Embedding layer** (Day 3 primary):
   - `nomic-embed-text` via Ollama HTTP, 768-dim
   - In-memory store, 56 embeddings (7 packs × 8 seeds)
   - Combined classifier: 0.4 × regex + 0.6 × embedding + agreement bonus
   - Silent fallback to v1 when Ollama down
   - p99 classify ≤ 80ms; init ≤ 5s

## Changes
- `packages/router/src/embedding_store.ts`: NEW — in-memory embedding store + cosine sim
- `packages/router/src/ollama_client.ts`: NEW — minimal Ollama embed client
- `packages/router/src/classify_domain.ts`: combined v1+v2 with fallback
- `packages/router/src/hooks/inject_context.ts`: assertTierBounds + resolveInlineScaffold
- `packs/*/pack.yaml`: +domain_signals.embedding_seeds (7 packs × 8 seeds)
- `packages/router/tests/manifest-bounds.test.ts`: NEW — NIT 1 cover
- `packages/router/tests/inline-scaffold-exclusion.test.ts`: NEW — NIT 2 cover
- `packages/router/tests/embedding-perf.test.ts`: NEW — perf budget enforcement
- `packages/router/tests/embedding-fallback.test.ts`: NEW — Ollama-down silent fallback

## Tests
- Router tests: <X/X> pass (NIT 1, NIT 2, embedding perf, fallback all new green)
- Combined recall on 20-prompt validation: <NN%> (target ≥ 90%)
- p99 classify: <NNms> (budget ≤ 80ms)
- classify.js byte-identical with dev (P11) ✓

## Invariants
- ✅ classify.js byte-identical
- ✅ No git add -A
- ✅ No --no-verify
- ✅ Embedding layer aditivo — regex v1 preserved as fallback
- ✅ All 7 packs have embedding_seeds + regex (both)

## Reviewer
final-reviewer: <APPROVE | APPROVE_WITH_NOTES>

## Backlog para Day 4
- <NITs do reviewer, se houver>
- NITs 3+4 do Day 2 review (statusline test edge + STATUSLINE_WIRE.md callout) — para Day 6
EOF
```

## 7. Notion + SYNC

### 7.1 Notion sub-page

Cria em Notion HQ (ID `33d6f6e4-2bc4-816b-977a-fe84bbe912c9`) sub-page:

Title: `🛠 Sessão YYYY-MM-DD — Wave 2 Day 3 (embedding + NITs)`

Body:
- Tabela commits + sub-features delivered
- Recall combined vs v1-only
- p99 classify benchmark
- Reviewer verdict + link PR
- Day 4 backlog

### 7.2 SYNC.md

Update secções:
- `## Notion HQ — Páginas de Referência` → add link Day 3 page
- `📥 COWORK → CLAUDE CODE` → next: aguardar Paulo merge PR + decisão de arrancar Day 4 (event schema `mooter_event`)

## 8. Resumo final na chat

Quando tudo verde:
```
✅ Wave 2 Day 3 — Embedding layer + NITs COMPLETO
- Branch: wave2-day3-embedding-and-nits (pushed)
- PR: #<N> (link) → dev (NÃO merged — Paulo decide)
- Notion: <link>
- Recall combined: <NN%> (vs <NN%> v1-only baseline)
- p99 classify: <NNms> (budget ≤ 80ms)
- Tests: <X/X> verdes (router + embedding)
- Reviewer: <APPROVE / APPROVE_WITH_NOTES>
- Embedding layer: ADITIVO, fallback v1 silencioso quando Ollama down ✓
- NITs 1+2 fechados; NITs 3+4 deferred para Day 6
Próximo: Paulo merge PR + master prompt Wave 2 Day 4 (event schema mooter_event v1 + writer).
```

=== END ===
