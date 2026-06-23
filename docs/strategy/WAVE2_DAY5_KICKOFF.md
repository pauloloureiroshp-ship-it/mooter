# Wave 2 Day 5 — Kickoff master prompt (4 packs adicionais + recalibração)

> **Como usar**: cola tudo abaixo de `=== START ===` no Claude Code dentro de `~/mooter/`, depois do PR #11 estar merged em `dev`. Self-contained.

**Pré-requisitos verificados antes de colar**:
- ✅ PR #11 merged em `dev` (squash commit `17fe59f`)
- ✅ `git checkout dev && git pull origin dev`
- ✅ Ollama host responde em `host.docker.internal:11434`
- ✅ `nomic-embed-text` disponível (Day 3 carregou)
- ✅ Day 4 closed: 78/78 tests verdes, schema `mooter_event` v1 canónico operacional

---

=== START ===

## 0. Quem és e o que vais fazer

És Claude Code no `~/mooter/`, branch `wave2-day5-packs-and-calibration` (a criar). `--permission-mode auto`. Acesso:
- `~/mooter/` (target, symlink resolve para `/home/paulo/frugal`)
- Ollama RTX 4090 via `host.docker.internal:11434`
- Anthropic Max sub
- Notion HQ ID `33d6f6e4-2bc4-816b-977a-fe84bbe912c9`

**Missão Day 5**: shippar 2 sub-features num único PR para `dev`:
1. **4 packs adicionais** — `voice-tts`, `knowledge-third-brain`, `prd-strategy`, `data-spreadsheet` com pack.yaml + scaffold.md + embedding_seeds
2. **Recalibração thresholds** — `EMBED_PROMOTE_SIM` e `AGREEMENT_BONUS` adjustados ao pack set crescente (3 → 7 packs); re-run validation set; documenta no ADR 018

NITs Day 4 reviewer (procedural staging, defensive redundancy, UUIDv7 year-10889, cross-stream docs) são non-blocking esoterics — **NÃO incluídos** nesta Day. Ficam noise out.

## 1. Invariantes (não-negociáveis)

- ❌ **Nunca tocar `classify.js`** — eixo 1 byte-identical (invariant P11)
- ❌ **Nunca `git add -A`** — commits selectivos sempre
- ❌ **Nunca merge directo para `main`** — sempre PR para `dev`, Paulo aprova squash
- ❌ **Nunca `--no-verify`**
- ❌ **NÃO commitar** `docs/strategy/PASTOR.md` (cross-stream Cowork)
- ❌ **NÃO commitar** docs untracked em `docs/strategy/*` (WAVE*_PLAN.md, *_KICKOFF.md, DESIGN_*.md, MOOTER_STRATEGY_PRESENTATION.html, generate_strategy_pptx.js)
- ❌ **Não criar `mooter init` wizard** — fica Day 6
- ❌ **Não criar slash commands** — ficam Day 6 + Wave 3 D1
- ❌ **Não tocar `event_writer.ts`, `mooter_event.ts`** — Day 4 fechado, intacto
- ✅ **Final-reviewer T3-gate obrigatório** antes do PR (Task tool, Opus pinned)
- ✅ **Sanity check $1 BLOCKER** — embedding init de 7 packs × 8 seeds = 56 embeddings (Ollama local, $0)
- ✅ **Notion sub-page** ao fim do Day + SYNC.md update
- ✅ **Combined recall ≥ 0.90** no validation set após recalibração — se < 0.90, NÃO fechar Day

## 2. Branch + recon

```bash
cd ~/mooter
git checkout dev
git pull origin dev
git log --oneline -3  # confirma commit 17fe59f no topo (squash Day 4)
git checkout -b wave2-day5-packs-and-calibration
```

Recon paralelo (lê antes de tocar em nada):
- `packs/animation-web/pack.yaml`, `packs/code-audit/pack.yaml`, `packs/diagram-systems/pack.yaml` — usa como templates para os 4 novos
- `packs/animation-web/scaffold.md`, etc — formato scaffold
- `packages/router/src/classify_domain.ts` — bloco calibração (Day 4 documentou)
- `packages/router/tests/recall-validation.test.ts` (existe pelo Day 3)
- `docs/benchmarks/wave1-pastor/prompts.jsonl` — validation set de 20+ prompts

## 3. Criar 4 packs adicionais

### 3.1 Templates a seguir

Cada pack tem 2 ficheiros:
- `packs/<id>/pack.yaml` — manifest (mesmo schema dos 3 existentes: keywords, intent_phrases, file_extensions, negative_keywords, embedding_seeds, model_floor, model_ceiling, skills, mcps, repos_canonical, prompt_scaffold_path)
- `packs/<id>/scaffold.md` — prompt scaffold (instruções injectadas para o modelo quando este pack é matched)

### 3.2 Pack `voice-tts`

**Ficheiro**: `packs/voice-tts/pack.yaml`

```yaml
id: voice-tts
version: 1.0.0
description: Text-to-speech, voice synthesis, audio pipeline scripting
metadata:
  author: pauloloureiroshp-ship-it
  created: 2026-05-28

domain_signals:
  keywords:
    - tts
    - text-to-speech
    - voice
    - audio
    - cartesia
    - elevenlabs
    - whisper
    - speech
  intent_phrases:
    - "generate voice"
    - "synthesize speech"
    - "audio pipeline"
    - "voice agent"
    - "transcribe audio"
  file_extensions:
    - .wav
    - .mp3
    - .ogg
    - .flac
  negative_keywords:
    - silent
    - mute
  embedding_seeds:
    - "generate voice from text using Cartesia"
    - "set up a voice agent with ElevenLabs"
    - "transcribe this audio file with Whisper"
    - "stream TTS audio in real-time"
    - "synthesize speech with custom voice cloning"
    - "build an audio pipeline for podcast generation"
    - "convert text to natural-sounding speech"
    - "implement voice activity detection"

model_floor: T1
model_ceiling: T2

skills:
  - voice-agent-design
  - audio-streaming
  - prompt-scaffold

mcps:
  - cartesia-tts
  - groq-whisper

repos_canonical:
  - cartesia-ai/cartesia-python
  - openai/whisper

prompt_scaffold_path: ./scaffold.md
```

**Ficheiro**: `packs/voice-tts/scaffold.md`

```markdown
# Voice/TTS pack scaffold

You are working on voice synthesis or audio pipeline tasks.

## Defaults
- Cartesia for TTS (sonic-3 model) when latency < 200ms required
- Groq Whisper API for transcription (faster than OpenAI Whisper)
- 16kHz mono PCM for streaming audio
- Buffer chunks of 50ms for real-time

## Compression hint
Prefer streaming TTS over batch generation when interactivity > 1 turn.
Cache audio for repeated phrases (e.g. fillers, acknowledgements).
Avoid generating full sentences if only word changes — patch the diff.

## Privacy
Never store raw audio without consent. Hash voice fingerprints, not raw clips.
```

### 3.3 Pack `knowledge-third-brain`

**Ficheiro**: `packs/knowledge-third-brain/pack.yaml`

```yaml
id: knowledge-third-brain
version: 1.0.0
description: Knowledge management, Notion KB, second brain, knowledge graph
metadata:
  author: pauloloureiroshp-ship-it
  created: 2026-05-28

domain_signals:
  keywords:
    - knowledge base
    - second brain
    - third brain
    - notion
    - obsidian
    - logseq
    - zettelkasten
    - knowledge graph
    - kb
  intent_phrases:
    - "organize my notes"
    - "build a knowledge base"
    - "query the knowledge graph"
    - "create Notion pages"
    - "sync to Obsidian"
  file_extensions:
    - .md
    - .org
  negative_keywords:
    - delete kb
  embedding_seeds:
    - "organize my Notion pages by topic"
    - "create a knowledge graph from these notes"
    - "build a second brain system in Obsidian"
    - "query my Zettelkasten for related ideas"
    - "summarize all docs about pricing strategy"
    - "link these orphan notes to the main vault"
    - "extract entities and relationships from this doc"
    - "auto-tag notes by domain inference"

model_floor: T2
model_ceiling: T3

skills:
  - notion-api
  - markdown-parser
  - entity-extraction

mcps:
  - notion-mcp
  - obsidian-mcp

repos_canonical:
  - notion-mcp/server
  - obsidian-md/obsidian-releases

prompt_scaffold_path: ./scaffold.md
```

**Ficheiro**: `packs/knowledge-third-brain/scaffold.md`

```markdown
# Knowledge / Third Brain pack scaffold

You are working on knowledge management, KB organisation, or second-brain workflows.

## Defaults
- Notion API for structured queries (use Notion MCP server)
- Obsidian for plain-text vault (markdown + frontmatter)
- Wiki-links `[[Page Title]]` preferred over absolute paths
- Zettelkasten IDs format: `YYYYMMDDhhmm` (no spaces)

## Compression hint
For queries spanning > 50 pages, use the KB's native search API (Notion query, Obsidian search) before loading content.
Summarize per-page in 1-2 sentences before cross-page synthesis.
Never load full vault content — work tree at a time.

## Privacy
Treat all KB content as user-private. No KB content uploaded to telemetry.
```

### 3.4 Pack `prd-strategy`

**Ficheiro**: `packs/prd-strategy/pack.yaml`

```yaml
id: prd-strategy
version: 1.0.0
description: Product requirements docs, strategy decks, roadmap drafting
metadata:
  author: pauloloureiroshp-ship-it
  created: 2026-05-28

domain_signals:
  keywords:
    - prd
    - product requirements
    - strategy
    - roadmap
    - okrs
    - product spec
    - jtbd
    - user story
  intent_phrases:
    - "write a PRD"
    - "draft a roadmap"
    - "product strategy"
    - "user stories for"
    - "OKRs for quarter"
  file_extensions:
    - .md
  negative_keywords:
    - delete prd
  embedding_seeds:
    - "write a PRD for the new auth flow"
    - "draft a Q3 roadmap with OKRs"
    - "create user stories for the onboarding feature"
    - "outline a product strategy memo for launch"
    - "convert this feature idea into a spec"
    - "draft a Jobs-to-be-Done framework analysis"
    - "write acceptance criteria for this epic"
    - "outline the success metrics for this launch"

model_floor: T2
model_ceiling: T3

skills:
  - prd-template
  - roadmap-framework
  - user-story-decomposition

mcps:
  - linear-mcp
  - notion-mcp

repos_canonical:
  - lennysnewsletter/prd-templates

prompt_scaffold_path: ./scaffold.md
```

**Ficheiro**: `packs/prd-strategy/scaffold.md`

```markdown
# PRD / Strategy pack scaffold

You are working on product requirements, strategy documents, or roadmap planning.

## Defaults
- PRD format: Problem · Audience · Solution · Success Metrics · Out-of-scope · Risks
- User stories format: "As a [persona], I want [capability] so that [outcome]"
- Roadmap units: Now / Next / Later (NOT calendar dates beyond 1 quarter)
- OKRs format: 1 Objective + 3 Key Results (each measurable, time-bound)

## Compression hint
For PRDs > 1000 words, structure with H2 sections + 1-paragraph TL;DR at top.
Avoid restating context the reader already has — link to source docs.
Prefer concrete examples over abstract descriptions.

## Style
Founder-pragmatic tone. No hyperbole. State trade-offs explicitly.
```

### 3.5 Pack `data-spreadsheet`

**Ficheiro**: `packs/data-spreadsheet/pack.yaml`

```yaml
id: data-spreadsheet
version: 1.0.0
description: Spreadsheet manipulation, data transforms, CSV/Excel/Sheets workflows
metadata:
  author: pauloloureiroshp-ship-it
  created: 2026-05-28

domain_signals:
  keywords:
    - spreadsheet
    - csv
    - excel
    - xlsx
    - google sheets
    - pivot
    - vlookup
    - dataframe
    - pandas
    - polars
  intent_phrases:
    - "manipulate this spreadsheet"
    - "transform the CSV"
    - "build a pivot table"
    - "join these sheets"
    - "calculate aggregates"
  file_extensions:
    - .csv
    - .xlsx
    - .xls
    - .tsv
    - .parquet
  negative_keywords:
    - delete spreadsheet
  embedding_seeds:
    - "clean up this messy CSV with mixed delimiters"
    - "build a pivot table from this Excel sheet"
    - "join two dataframes on a fuzzy match"
    - "calculate weekly aggregates with pandas"
    - "convert this Google Sheet to Parquet"
    - "remove duplicates and reconcile entries"
    - "transform wide format to long format"
    - "validate CSV against a JSON schema"

model_floor: T1
model_ceiling: T2

skills:
  - pandas-transforms
  - excel-formulas
  - csv-cleanup

mcps:
  - google-sheets-mcp
  - excel-mcp

repos_canonical:
  - pandas-dev/pandas
  - pola-rs/polars

prompt_scaffold_path: ./scaffold.md
```

**Ficheiro**: `packs/data-spreadsheet/scaffold.md`

```markdown
# Data / Spreadsheet pack scaffold

You are working on spreadsheet manipulation, data transforms, or tabular workflows.

## Defaults
- Polars > pandas when dataset > 1M rows (lazy evaluation, faster)
- CSV: assume UTF-8 + `,` delimiter unless schema says otherwise
- Excel: openpyxl for read/write, xlsxwriter for formatting
- Google Sheets: gspread + service account auth

## Compression hint
For datasets > 10K rows, prefer SQL-style operations (group_by, agg, pivot) over row-by-row loops.
Show schema (dtype per column) before transforming.
Validate output shape (row count, null count) after every transform.

## Privacy
If data has PII columns (email, phone, SSN), mask before sharing.
Never inline PII in error messages or logs.
```

### 3.6 DoD packs

- 4 packs novos criados em `packs/<id>/`
- Cada pack tem `pack.yaml` válido + `scaffold.md` semântico
- Embedding seeds são **distintos entre packs** (no overlap óbvio entre voice-tts e knowledge, etc)
- Schema validates contra `packs/pack.schema.yaml` existente
- Total 7 packs no registry, 7 × 8 = 56 embedding seeds

## 4. Recalibração thresholds

### 4.1 Spec

Day 3 baseline: 3 packs · 100% recall · pesos `REGEX_WEIGHT=0.4, EMBED_WEIGHT=0.6, AGREEMENT_BONUS=0.1, EMBED_PROMOTE_SIM=0.7`.

Após 4 packs novos: expected drop em recall (mais opções = mais misroute risk). Recalibrar até voltar ≥ 0.90 (target Wave 2).

### 4.2 Grid search

**Ficheiro novo**: `packages/router/scripts/recalibrate.ts`

```typescript
import { classifyDomain } from "../src/classify_domain";
import { embeddingStore } from "../src/embedding_store";
import validationPrompts from "../../../docs/benchmarks/wave1-pastor/prompts.jsonl";

interface CalibrationResult {
  REGEX_WEIGHT: number;
  EMBED_WEIGHT: number;
  AGREEMENT_BONUS: number;
  EMBED_PROMOTE_SIM: number;
  recall: number;
  p99_classify_ms: number;
}

const GRID = {
  REGEX_WEIGHT: [0.3, 0.4, 0.5],
  EMBED_WEIGHT: [0.5, 0.6, 0.7],
  AGREEMENT_BONUS: [0.05, 0.1, 0.15],
  EMBED_PROMOTE_SIM: [0.65, 0.7, 0.75, 0.8],
};

async function runGridSearch(): Promise<CalibrationResult[]> {
  await embeddingStore.init();
  const results: CalibrationResult[] = [];

  for (const rw of GRID.REGEX_WEIGHT) {
    for (const ew of GRID.EMBED_WEIGHT) {
      // Constraint: weights should sum close to 1.0
      if (Math.abs(rw + ew - 1.0) > 0.2) continue;
      for (const bonus of GRID.AGREEMENT_BONUS) {
        for (const promote of GRID.EMBED_PROMOTE_SIM) {
          // Inject these weights as env overrides (temporary)
          process.env.MOOTER_REGEX_WEIGHT = rw.toString();
          process.env.MOOTER_EMBED_WEIGHT = ew.toString();
          process.env.MOOTER_AGREEMENT_BONUS = bonus.toString();
          process.env.MOOTER_EMBED_PROMOTE_SIM = promote.toString();

          const latencies: number[] = [];
          let correct = 0;
          for (const prompt of validationPrompts) {
            const start = performance.now();
            const result = await classifyDomain(prompt.text);
            latencies.push(performance.now() - start);
            if (result.pack_id === prompt.expected_pack_id) correct++;
          }

          const recall = correct / validationPrompts.length;
          latencies.sort((a, b) => a - b);
          const p99 = latencies[Math.floor(latencies.length * 0.99)];

          results.push({ REGEX_WEIGHT: rw, EMBED_WEIGHT: ew, AGREEMENT_BONUS: bonus, EMBED_PROMOTE_SIM: promote, recall, p99_classify_ms: p99 });
        }
      }
    }
  }

  return results;
}

// Output: top 5 configs by recall (under p99 ≤ 80ms constraint)
runGridSearch().then(results => {
  const valid = results.filter(r => r.p99_classify_ms <= 80);
  valid.sort((a, b) => b.recall - a.recall);
  console.log("Top 5 calibrations:");
  console.log(JSON.stringify(valid.slice(0, 5), null, 2));
});
```

Execute:
```bash
cd packages/router
npx ts-node scripts/recalibrate.ts > /tmp/calibration-results.json
```

Pega os top 1-3 configs, escolhe o que tem **melhor balance recall × latency** (não só max recall — também latency budget).

### 4.3 Update consts

**Ficheiro**: `packages/router/src/classify_domain.ts`

Update `REGEX_WEIGHT`, `EMBED_WEIGHT`, `AGREEMENT_BONUS`, `EMBED_PROMOTE_SIM` para os valores ganhos do grid search. Update o calibration block (comment-only Day 4) com novos valores + data 2026-05-28.

### 4.4 Re-run recall validation

```bash
cd packages/router
npm test -- recall-validation.test.ts
```

DoD: recall ≥ 0.90 nos prompts validation. Se < 0.90 → mais grid search com pesos mais agressivos, ou ajustar embedding seeds dos packs que estão a misroute.

### 4.5 ADR 018 — Calibration update

**Ficheiro novo**: `docs/adr/018-calibration-day5.md`

```markdown
# ADR 018 — Calibration update Day 5 (pack set 3 → 7)

## Context
Day 3 baseline: 3 packs, 100% recall, weights (0.4, 0.6, 0.1, 0.7).
Day 5 added 4 packs (voice-tts, knowledge-third-brain, prd-strategy, data-spreadsheet).
Expected recall drop without recalibration.

## Decision
Re-ran grid search over weights × thresholds against 20-prompt validation set with 7 packs.
Winner: (REGEX_WEIGHT=X, EMBED_WEIGHT=Y, AGREEMENT_BONUS=Z, EMBED_PROMOTE_SIM=W).
Recall after recalibration: NN%.
P99 classify: NN ms (budget 80 ms).

## Consequences
- Recall vs Day 3 baseline: +/- N pp.
- Latency vs Day 3 baseline: +/- N ms.
- Routing distribution shift: more frequent T2 fallbacks for ambiguous queries.

## Re-evaluate when
- Pack count > 10 (Wave 4 community packs may push beyond)
- New embedding model swap (e.g. nomic-embed-text v2)
- Recall drops below 85% sustained in prod telemetry
```

## 5. Tests

**Ficheiro novo**: `packages/router/tests/packs-extended.test.ts`:
- Cada um dos 4 packs novos: pack.yaml valida contra schema
- Cada pack tem ≥ 6 embedding_seeds distintos
- Total 7 packs no embeddingStore após init
- Init com 7 × 8 = 56 embeddings completes ≤ 5s (batch-embed Day 4)

**Ficheiro**: `packages/router/tests/recall-validation.test.ts` (existing)
- Run com 7 packs → recall ≥ 0.90 (target Day 5)
- p99 classify ≤ 80ms

## 6. Final-reviewer pre-PR

Spawn final-reviewer (Opus pinned via Task tool):

```
Task tool, subagent_type: "general-purpose"

Prompt: "Review branch wave2-day5-packs-and-calibration vs dev.

Verifica:
- classify.js byte-identical com dev (P11)
- 4 packs novos: pack.yaml + scaffold.md em packs/voice-tts, knowledge-third-brain, prd-strategy, data-spreadsheet
- Cada pack.yaml valida contra packs/pack.schema.yaml
- Embedding seeds distintos entre packs (no overlap óbvio)
- ADR 018 documentado com decisão + valores + consequences
- classify_domain.ts: const values updated + calibration block timestamp updated
- recall-validation test passa com ≥ 0.90 (7 packs)
- p99 classify ≤ 80ms
- Embedding init ≤ 5s com 56 embeddings (batch-embed Day 4 preserved)
- event_writer.ts NÃO tocado (Day 4 intacto)
- mooter_event.ts NÃO tocado
- Sem `git add -A`, sem `--no-verify`
- Sem secrets em diff
- PASTOR.md NÃO no diff (cross-stream)
- docs/strategy/* untracked NÃO no diff

Reporta: APPROVE | APPROVE_WITH_NOTES | REQUEST_CHANGES com lista numerada de NITs."
```

## 7. PR

```bash
git push -u origin wave2-day5-packs-and-calibration
gh pr create --base dev --title "Wave 2 Day 5: 4 packs adicionais + recalibração thresholds" --body-file - <<'EOF'
## Summary
Two bundled sub-features per Wave 2 plan:

1. **4 packs adicionais** (registry growth 3 → 7):
   - `voice-tts`: TTS + audio pipelines (Cartesia, Whisper, ElevenLabs)
   - `knowledge-third-brain`: Notion + Obsidian + Zettelkasten KB management
   - `prd-strategy`: PRDs, roadmaps, OKRs, user stories
   - `data-spreadsheet`: CSV/Excel/Sheets transforms (pandas/polars)

2. **Recalibração thresholds** (ADR 018):
   - Grid search over weights × thresholds with 7 packs
   - New consts: REGEX_WEIGHT=X, EMBED_WEIGHT=Y, AGREEMENT_BONUS=Z, EMBED_PROMOTE_SIM=W
   - Recall: NN% (target ≥ 90%) · p99 NN ms (budget 80 ms)

## Changes
- `packs/voice-tts/{pack.yaml,scaffold.md}`: NEW
- `packs/knowledge-third-brain/{pack.yaml,scaffold.md}`: NEW
- `packs/prd-strategy/{pack.yaml,scaffold.md}`: NEW
- `packs/data-spreadsheet/{pack.yaml,scaffold.md}`: NEW
- `packages/router/src/classify_domain.ts`: updated weights + calibration block timestamp
- `packages/router/scripts/recalibrate.ts`: NEW (grid search tool)
- `packages/router/tests/packs-extended.test.ts`: NEW
- `packages/router/tests/recall-validation.test.ts`: updated for 7 packs
- `docs/adr/018-calibration-day5.md`: NEW

## Tests
- Router suite: <X/X> pass (+N new)
- Recall validation 7 packs: NN% (target ≥ 90%)
- p99 classify: NN ms (budget 80 ms)
- Embedding init 56 embeddings: N.Ns (budget 5s)
- classify.js byte-identical (P11) ✓

## Invariants
- ✅ classify.js byte-identical
- ✅ event_writer.ts + mooter_event.ts intacto (Day 4)
- ✅ No git add -A
- ✅ No --no-verify
- ✅ Embedding layer aditivo
- ✅ Cross-stream protegido (PASTOR.md + docs/strategy/* fora)

## Reviewer
final-reviewer: <APPROVE | APPROVE_WITH_NOTES>

## Out of scope
- Slash commands, mooter init wizard, execution fields wire — Day 6
- Re-benchmark cumulative (gate Wave 2) — Day 7
- Hub upload + consent — Wave 3 D4

## Backlog para Day 6
- <NITs do reviewer, se houver>
EOF
```

## 8. Notion + SYNC

### 8.1 Notion sub-page

Title: `🛠 Sessão YYYY-MM-DD — Wave 2 Day 5 (4 packs + recalibração)`

Body:
- Tabela commits + 4 packs delivered
- ADR 018 link + values comparados Day 3 vs Day 5
- Recall + p99 antes/depois
- Reviewer verdict + link PR
- Day 6 backlog

### 8.2 SYNC.md

Update secções:
- `## Notion HQ — Páginas de Referência` → add link Day 5 page
- `📥 COWORK → CLAUDE CODE` → next: aguardar Paulo merge PR + arranca Day 6 (`mooter init` wizard + execution fields wire + statusline NITs)

## 9. Resumo final na chat

Quando tudo verde:
```
✅ Wave 2 Day 5 — 4 packs + recalibração COMPLETO
- Branch: wave2-day5-packs-and-calibration (pushed)
- PR: #<N> (link) → dev (NÃO merged — Paulo decide)
- Notion: <link>
- 7 packs no registry (3 original + 4 novos)
- Recalibração: REGEX_WEIGHT=X, EMBED_WEIGHT=Y, BONUS=Z, PROMOTE_SIM=W
- Recall 7 packs: NN% (target ≥ 90%)
- p99 classify: NN ms (budget 80 ms)
- Embedding init 56: N.Ns (budget 5s)
- Tests: X/X verdes
- Reviewer: <APPROVE / APPROVE_WITH_NOTES>
- ADR 018 documentado
- event_writer.ts + mooter_event.ts intactos (Day 4)
Próximo: Paulo merge + arranca Day 6 (mooter init wizard 5-step + execution fields wire + statusline NITs).
```

=== END ===
