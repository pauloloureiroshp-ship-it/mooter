# Wave 2 Day 4 — Kickoff master prompt (event-writer + 3 NITs Day 3 reviewer)

> **Como usar**: cola tudo abaixo de `=== START ===` no Claude Code dentro de `~/mooter/` (WSL2 Ubuntu), depois do PR #10 estar merged em `dev`. Self-contained.

**Pré-requisitos verificados antes de colar**:
- ✅ PR #10 merged em `dev` (squash commit `48c5eb0`)
- ✅ `git checkout dev && git pull origin dev`
- ✅ Ollama host responde em `host.docker.internal:11434` (mantém-se de Day 3)
- ✅ `claude --version` ≥ versão usada no Day 3
- ✅ `ANTHROPIC_API_KEY` exportada
- ✅ Day 3 fechado: 100% recall combined, p99 18.5ms, embedding layer aditivo

---

=== START ===

## 0. Quem és e o que vais fazer

És Claude Code no `~/mooter/`, branch `wave2-day4-event-writer` (a criar). `--permission-mode auto`. Acesso:
- `~/mooter/` (target, symlink resolve para `/home/paulo/frugal`)
- Ollama RTX 4090 via `host.docker.internal:11434`
- Anthropic Max sub
- Notion HQ ID `33d6f6e4-2bc4-816b-977a-fe84bbe912c9`

**Missão Day 4**: shippar 2 sub-features num único PR para `dev`:
1. **3 NITs Day 3 reviewer cleanup** — `embeddingStore.reset()`, calibração thresholds documentada, batch-embed quando seed count > 24
2. **`mooter_event` schema v1 + writer + retention** — event capture nível 1 (implícito), JSONL writers, retention 30d events / 90d sessions, schema canónico Wave 2 D4

NITs 3+4 do Day 2 (statusline edge test + STATUSLINE_WIRE.md callout) continuam deferred para Day 6.

## 1. Invariantes (não-negociáveis)

- ❌ **Nunca tocar `classify.js`** — eixo 1 byte-identical (invariant P11)
- ❌ **Nunca `git add -A`** — commits selectivos sempre
- ❌ **Nunca merge directo para `main`** — sempre PR para `dev`, Paulo aprova squash
- ❌ **Nunca `--no-verify`**
- ❌ **NÃO commitar** `docs/strategy/PASTOR.md` (modificado por Cowork em paralelo, dívida cross-stream)
- ❌ **NÃO commitar** docs untracked em `docs/strategy/*` (WAVE*_PLAN.md, *_KICKOFF.md, DESIGN_*.md, MOOTER_STRATEGY_PRESENTATION.html, generate_strategy_pptx.js — todos são docs do Cowork, vivem só no filesystem)
- ❌ **Event upload OFF** — Day 4 só escreve eventos LOCAIS em `~/.mooter/`. Upload ao hub é Wave 3 D4 (com consent flow).
- ❌ **Não criar `mooter init` wizard** — fica Day 6
- ❌ **Não criar slash commands** — ficam Day 6 (W2) + Wave 3 D1
- ✅ **Final-reviewer T3-gate obrigatório** antes do PR (Task tool, Opus pinned)
- ✅ **Sanity check $1 BLOCKER** — esta Day é puramente local I/O, esperado $0
- ✅ **Notion sub-page** ao fim do Day + SYNC.md update

## 2. Branch + recon

```bash
cd ~/mooter
git checkout dev
git pull origin dev
git log --oneline -3  # confirma commit 48c5eb0 no topo (squash Day 3)
git checkout -b wave2-day4-event-writer
```

Recon paralelo (lê estes ficheiros antes de tocar em nada):
- `packages/router/src/embedding_store.ts` (NIT 3: batch-embed + NIT 1: reset)
- `packages/router/src/classify_domain.ts` (NIT 2: calibração thresholds documentada)
- `packages/router/src/hooks/inject_context.ts` (vai chamar event writer)
- `packs/*/pack.yaml` (3 packs reais: animation-web, code-audit, diagram-systems)

## 3. NIT cleanup (do Day 3 review)

### 3.1 NIT 1 — `embeddingStore.reset()` para test isolation

**Ficheiro**: `packages/router/src/embedding_store.ts`

Adiciona método à classe `EmbeddingStore`:
```typescript
class EmbeddingStore {
  // ... existente

  reset(): void {
    this.store = [];
    this.ready = false;
  }
}
```

Test cover em ficheiro novo:
- `packages/router/tests/embedding-reset.test.ts`:
  - Init store (3 packs × 8 seeds = 24 embeddings)
  - Call `reset()`
  - Assert `store.length === 0` e `ready === false`
  - Re-init funciona idempotently

### 3.2 NIT 2 — calibração thresholds documentada

**Ficheiro**: `packages/router/src/classify_domain.ts`

Adiciona comentário-bloco no topo do ficheiro documentando os pesos actuais e quando recalibrar:

```typescript
/**
 * Calibração axis-2 v2 (combined classifier)
 * ─────────────────────────────────────────
 *
 * Pesos actuais (Day 3 baseline):
 *   REGEX_WEIGHT       = 0.4
 *   EMBED_WEIGHT       = 0.6
 *   AGREEMENT_BONUS    = 0.1   (boost when v1 + v2 agree on pack)
 *   EMBED_PROMOTE_SIM  = 0.7   (threshold cosine sim para embed override)
 *
 * Recalibração necessária quando:
 *   - Pack count > 7 (Wave 2 Day 5 adiciona +4 packs → recalibrar EMBED_PROMOTE_SIM)
 *   - Seed count por pack > 12 (precisão dilui, baixa REGEX_WEIGHT)
 *   - Recall combined cai abaixo de 90% no validation set (sinal de calibration drift)
 *   - Misroute rate em prod > 5% sustained (telemetry Wave 3 captures this)
 *
 * Como recalibrar:
 *   1. Run `npm test -- classify-recall.test.ts` para baseline atual
 *   2. Grid search: pesos em {0.3, 0.4, 0.5, 0.6, 0.7} × bonus em {0.05, 0.1, 0.15}
 *   3. Maximize recall_combined sob constraint p99 ≤ 80ms
 *   4. Update consts + re-run recall test
 *   5. Document no ADR (e.g. ADR 018 — Calibration update Day X)
 */
```

Sem mudanças funcionais. Só documentação.

### 3.3 NIT 3 — batch-embed quando seed count > 24

**Ficheiro**: `packages/router/src/embedding_store.ts`

Actualmente `init()` faz `Promise.all` em todas as seeds dum pack mas pack-a-pack sequencial. Quando packs crescerem (Day 5 = 7 packs × 8 seeds = 56) precisa de batching para evitar OOM/timeout no Ollama.

Refactor:
```typescript
const BATCH_SIZE = 8;  // Ollama can handle ~8 concurrent embed requests safely

async init(): Promise<void> {
  const packs = await loadPacks();
  const allSeeds: Array<{ pack_id: string; seed: string }> = [];

  // Flatten: pack × seeds → list
  for (const pack of packs) {
    for (const seed of pack.domain_signals?.embedding_seeds ?? []) {
      allSeeds.push({ pack_id: pack.id, seed });
    }
  }

  // Batch process
  const results: Array<{ pack_id: string; embedding: Float32Array }> = [];
  for (let i = 0; i < allSeeds.length; i += BATCH_SIZE) {
    const batch = allSeeds.slice(i, i + BATCH_SIZE);
    const embeddings = await Promise.all(
      batch.map(s => this.ollama.embed(EMBED_MODEL, s.seed))
    );
    batch.forEach((s, idx) => {
      results.push({ pack_id: s.pack_id, embedding: embeddings[idx] });
    });
  }

  // Group back into pack store
  const byPack = new Map<string, Float32Array[]>();
  for (const r of results) {
    if (!byPack.has(r.pack_id)) byPack.set(r.pack_id, []);
    byPack.get(r.pack_id)!.push(r.embedding);
  }
  this.store = Array.from(byPack.entries()).map(([pack_id, embeddings]) => ({
    pack_id,
    embeddings
  }));
  this.ready = true;
}
```

Test cover:
- `packages/router/tests/embedding-batch.test.ts`:
  - Mock pack loader com 32 seeds total (4 batches de 8)
  - Init → mede tempo + verifica que todos 32 embeddings foram captured
  - Assert no más de BATCH_SIZE concurrent Ollama calls em qualquer momento
  - Init ≤ 5s ainda (target Day 3 mantido)

## 4. Event-writer (sub-feature principal Day 4)

### 4.1 Spec

Capturar cada decisão de routing como event nível 1 (implícito) em JSONL local. Schema canónico Wave 2 D4 (31+ campos, lineage, axis confidence, cost_micros integer, feedback signals).

**Fluxo**:
1. Hook `inject_context.ts` chama `eventWriter.write(event)` no fim de cada turn
2. Writer escreve a `~/.mooter/sessions/<session_id>.jsonl` (append-only)
3. Cron diário (ou lazy on session-start) consolida → `~/.mooter/events/YYYY-MM-DD.jsonl`
4. Retention: events 30d, sessions 90d (deletar mais antigos)

### 4.2 Schema canónico

**Ficheiro novo**: `packages/router/src/mooter_event.ts`

```typescript
/**
 * Canonical Wave 2 D4 schema — DO NOT diverge from this in any consumer.
 * Frontend (Wave 4) consumes via landing/lib/mooter-event.ts (mirrored).
 */

export type MooterEvent = {
  // ── Envelope ──
  event_id: string;                    // UUIDv7
  event_type: 'prod' | 'bench';
  timestamp_utc: string;               // ISO8601
  user_id_anon: string;                // sha256(hw_fingerprint + local_salt)
  session_id: string;                  // UUIDv7
  pastor_version: string;              // semver from package.json
  pricing_version: string;             // semver from pricing.js
  env_hash: string;                    // sha256(os+node+ollama_version+models_pulled)

  // ── Routing decisions ──
  prompt_hash: string;                 // sha256 truncated 16ch — NEVER plaintext
  prompt_tokens_est: number;
  axis1_tier_recommended: 'T0'|'T1'|'T2'|'T3';
  axis1_confidence: number;            // [0,1]
  axis2_pack_id: string | null;
  axis2_confidence: number;            // [0,1]
  axis3_adapter_id: string | null;     // Wave 5
  axis3_adapter_version: string | null;
  model_floor_applied: 'T0'|'T1'|'T2'|'T3';
  model_ceiling_applied: 'T0'|'T1'|'T2'|'T3';
  escalation_triggered: boolean;
  escalation_reason: string | null;

  // ── Execution ──
  model_actual: string;
  provider: 'anthropic' | 'ollama' | 'bedrock' | 'openai' | 'google' | 'grok';
  tokens_in: number;
  tokens_out: number;
  tokens_cache_hit: number;
  cost_micros: number;                 // INTEGER microUSD — no float drift
  latency_ms_total: number;
  latency_ms_ttft: number | null;
  latency_ms_per_tok: number | null;
  error_type: string | null;
  retries: number;

  // ── Implicit quality signals (nível 1, sempre capturados) ──
  user_continued: boolean | null;
  user_edited_output: boolean | null;
  user_aborted: boolean | null;
  session_outcome: 'commit' | 'abort' | 'unknown' | null;

  // ── Explicit feedback (nível 2, Wave 3 D1) ──
  rating_thumb: '👍' | '👎' | '🤷' | null;
  rating_comment_anon: { length: number; sentiment: 'pos'|'neu'|'neg' } | null;

  // ── Bench-only ──
  judge_model?: string;
  judge_scores?: { correctness: number; completeness: number; relevance: number; actionability: number; hallucination: number };
  judge_rationale?: string;
  judge_blind?: boolean;
};

export const SCHEMA_VERSION = '1.0.0';

export function makeEnvelope(opts: {
  event_type: 'prod' | 'bench';
  user_id_anon: string;
  session_id: string;
  pastor_version: string;
  pricing_version: string;
  env_hash: string;
}): Pick<MooterEvent, 'event_id' | 'event_type' | 'timestamp_utc' | 'user_id_anon' | 'session_id' | 'pastor_version' | 'pricing_version' | 'env_hash'> {
  return {
    event_id: generateUUIDv7(),
    event_type: opts.event_type,
    timestamp_utc: new Date().toISOString(),
    user_id_anon: opts.user_id_anon,
    session_id: opts.session_id,
    pastor_version: opts.pastor_version,
    pricing_version: opts.pricing_version,
    env_hash: opts.env_hash,
  };
}

function generateUUIDv7(): string {
  // UUIDv7 = timestamp ms (48 bits) + random (74 bits) + version + variant
  const ts = Date.now();
  const tsHex = ts.toString(16).padStart(12, '0');
  const rand = crypto.getRandomValues(new Uint8Array(10));
  const randHex = Array.from(rand).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${tsHex.slice(0, 8)}-${tsHex.slice(8, 12)}-7${randHex.slice(0, 3)}-${randHex.slice(3, 7)}-${randHex.slice(7, 19)}`;
}
```

### 4.3 Event writer

**Ficheiro novo**: `packages/router/src/event_writer.ts`

```typescript
import { promises as fs } from "fs";
import { join } from "path";
import { homedir } from "os";
import { MooterEvent } from "./mooter_event";

const MOOTER_HOME = process.env.MOOTER_HOME ?? join(homedir(), ".mooter");
const SESSIONS_DIR = join(MOOTER_HOME, "sessions");
const EVENTS_DIR = join(MOOTER_HOME, "events");

class EventWriter {
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    await fs.mkdir(SESSIONS_DIR, { recursive: true, mode: 0o700 });
    await fs.mkdir(EVENTS_DIR, { recursive: true, mode: 0o700 });
    this.initialized = true;
  }

  async write(event: MooterEvent): Promise<void> {
    await this.init();
    const sessionFile = join(SESSIONS_DIR, `${event.session_id}.jsonl`);
    const line = JSON.stringify(event) + "\n";
    await fs.appendFile(sessionFile, line, { mode: 0o600 });
  }

  /** Consolidate session events into daily events file. Idempotent. */
  async rollupDaily(date: string): Promise<{ events_written: number; sessions_touched: number }> {
    await this.init();
    const eventsFile = join(EVENTS_DIR, `${date}.jsonl`);
    const sessions = await fs.readdir(SESSIONS_DIR);
    let written = 0;
    let touched = 0;
    for (const file of sessions) {
      if (!file.endsWith(".jsonl")) continue;
      const content = await fs.readFile(join(SESSIONS_DIR, file), "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      const matching = lines.filter(line => {
        try {
          const ev = JSON.parse(line) as MooterEvent;
          return ev.timestamp_utc.startsWith(date);
        } catch { return false; }
      });
      if (matching.length > 0) {
        await fs.appendFile(eventsFile, matching.join("\n") + "\n", { mode: 0o600 });
        written += matching.length;
        touched++;
      }
    }
    return { events_written: written, sessions_touched: touched };
  }

  /** Prune old files. Events > 30d, sessions > 90d. */
  async pruneRetention(): Promise<{ events_pruned: number; sessions_pruned: number }> {
    await this.init();
    const now = Date.now();
    const EVENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
    const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

    let eventsPruned = 0;
    let sessionsPruned = 0;

    const events = await fs.readdir(EVENTS_DIR);
    for (const file of events) {
      const stat = await fs.stat(join(EVENTS_DIR, file));
      if (now - stat.mtimeMs > EVENT_TTL_MS) {
        await fs.unlink(join(EVENTS_DIR, file));
        eventsPruned++;
      }
    }

    const sessions = await fs.readdir(SESSIONS_DIR);
    for (const file of sessions) {
      const stat = await fs.stat(join(SESSIONS_DIR, file));
      if (now - stat.mtimeMs > SESSION_TTL_MS) {
        await fs.unlink(join(SESSIONS_DIR, file));
        sessionsPruned++;
      }
    }

    return { events_pruned: eventsPruned, sessions_pruned: sessionsPruned };
  }
}

export const eventWriter = new EventWriter();
```

### 4.4 Wire to hook

**Ficheiro**: `packages/router/src/hooks/inject_context.ts`

No fim de cada turn (após o routing decision), chama:
```typescript
import { eventWriter } from "../event_writer";
import { makeEnvelope, MooterEvent } from "../mooter_event";

// At hook end:
const event: MooterEvent = {
  ...makeEnvelope({
    event_type: 'prod',
    user_id_anon: await getAnonId(),       // sha256(hw_fp + local_salt), cached
    session_id: getCurrentSessionId(),     // UUIDv7 generated at session start
    pastor_version: getPastorVersion(),    // from package.json
    pricing_version: getPricingVersion(),  // from pricing.js export
    env_hash: await getEnvHash(),          // cached, refreshed daily
  }),
  prompt_hash: sha256(promptText).slice(0, 16),
  prompt_tokens_est: estimateTokens(promptText),
  axis1_tier_recommended: tier,
  axis1_confidence: confidence,
  axis2_pack_id: pack?.id ?? null,
  axis2_confidence: pack?.confidence ?? 0,
  axis3_adapter_id: null,           // Wave 5 placeholder
  axis3_adapter_version: null,
  model_floor_applied: pack?.model_floor ?? 'T0',
  model_ceiling_applied: pack?.model_ceiling ?? 'T3',
  escalation_triggered: escalation !== null,
  escalation_reason: escalation?.reason ?? null,
  // Execution fields populated post-LLM call (separate event update? Or single event at end of turn)
  model_actual: '',                 // filled by post-hook
  provider: 'anthropic',
  tokens_in: 0,
  tokens_out: 0,
  tokens_cache_hit: 0,
  cost_micros: 0,
  latency_ms_total: 0,
  latency_ms_ttft: null,
  latency_ms_per_tok: null,
  error_type: null,
  retries: 0,
  // Quality signals filled by next-turn-detection logic (not in Day 4)
  user_continued: null,
  user_edited_output: null,
  user_aborted: null,
  session_outcome: null,
  rating_thumb: null,
  rating_comment_anon: null,
};

await eventWriter.write(event);
```

**Decisão importante**: Day 4 só captura **routing decision fields** (axis1, axis2, model_floor/ceiling). Execution fields (`tokens_in/out`, `cost_micros`, `latency_ms_total`) ficam para Day 6 quando wire ao post-hook. **Não bloqueia** Day 4 — event tem todos campos do schema (nulls para execution) e é válido.

### 4.5 Tests

**Ficheiro novo**: `packages/router/tests/event-writer.test.ts`:
- Init creates `~/.mooter/sessions/` + `~/.mooter/events/` com perms 0700
- Write event → file existe, JSONL válido (1 linha por event)
- 100 events sintéticos escritos em ≤ 200ms
- Schema validation: cada campo respeita type
- `cost_micros` é integer (não float)
- `prompt_hash` é 16 chars (não plaintext)
- `event_id` é UUIDv7 válido (timestamp ms decodável)
- Rollup daily idempotent (correr 2x não duplica events)
- Retention prune: cria 1 ficheiro mtime > 30d → prune remove

**Ficheiro novo**: `packages/router/tests/event-schema.test.ts`:
- Compile-time TS type check: criar event sem campo obrigatório → tsc error
- Schema version match: `SCHEMA_VERSION === '1.0.0'`
- `makeEnvelope` returns válido envelope (todos 8 campos)

### 4.6 Performance budget

- `eventWriter.write()`: < 5ms p99 (append-only JSONL, OS buffered)
- Schema fit: < 2KB per event JSON
- Storage growth: ~100 events/day × 2KB = ~200KB/day, ~6MB/month — OK

## 5. Final-reviewer pre-PR

Spawn final-reviewer (Opus pinned, mesma fórmula Days 2+3):

```
Task tool, subagent_type: "general-purpose"

Prompt: "Review branch wave2-day4-event-writer vs dev.

Verifica:
- classify.js byte-identical com dev (P11)
- NIT 1: embeddingStore.reset() implementado + test cover
- NIT 2: calibração documentada no topo de classify_domain.ts (comentário-bloco)
- NIT 3: batch-embed implementado com BATCH_SIZE=8 + test cover
- mooter_event.ts: schema 31+ campos, cost_micros integer, prompt_hash NUNCA plaintext
- event_writer.ts: init permissions 0700, write append-only, rollup idempotent, retention prune correcto
- Hook wire: inject_context.ts chama eventWriter.write no fim de cada turn
- Execution fields nullable (Day 6 wire) — não bloqueia Day 4
- Sem `git add -A`, sem `--no-verify`
- Sem secrets em diff
- PASTOR.md NÃO no diff (cross-stream dívida)
- docs/strategy/* untracked NÃO no diff (docs Cowork)
- Performance: write p99 < 5ms, init batch ≤ 5s

Reporta: APPROVE | APPROVE_WITH_NOTES | REQUEST_CHANGES com lista numerada de NITs."
```

## 6. PR

```bash
git push -u origin wave2-day4-event-writer
gh pr create --base dev --title "Wave 2 Day 4: event-writer + 3 NITs Day 3 cleanup" --body-file - <<'EOF'
## Summary
Two bundled sub-features per Wave 2 plan:

1. **NITs 1+2+3 cleanup** (Day 3 review backlog):
   - NIT 1: `embeddingStore.reset()` for test isolation
   - NIT 2: Calibration block documented at top of classify_domain.ts
   - NIT 3: `embedding_store` batch-embed with BATCH_SIZE=8 (prep for Day 5 pack growth)

2. **mooter_event schema v1 + writer + retention** (Day 4 primary):
   - Canonical schema 31+ fields (envelope + routing + execution placeholders + quality signals + bench)
   - `event_writer.ts`: append-only JSONL writers (~/.mooter/sessions/<id>.jsonl)
   - Rollup daily: consolidate sessions into ~/.mooter/events/YYYY-MM-DD.jsonl
   - Retention: events 30d, sessions 90d, prune via cron-friendly method
   - Permissions 0700/0600 (private)
   - Wire to inject_context.ts hook

## Changes
- `packages/router/src/mooter_event.ts`: NEW — canonical schema + envelope factory + UUIDv7 gen
- `packages/router/src/event_writer.ts`: NEW — writer + rollup + retention
- `packages/router/src/embedding_store.ts`: +reset(), +batch-embed BATCH_SIZE=8
- `packages/router/src/classify_domain.ts`: calibration block documented (no functional change)
- `packages/router/src/hooks/inject_context.ts`: wire eventWriter.write at hook end
- `packages/router/tests/event-writer.test.ts`: NEW
- `packages/router/tests/event-schema.test.ts`: NEW
- `packages/router/tests/embedding-reset.test.ts`: NEW
- `packages/router/tests/embedding-batch.test.ts`: NEW

## Out of scope (next Days)
- Execution fields wire (tokens_in/out, cost_micros, latency) — Day 6 post-hook
- 4 packs adicionais — Day 5
- Slash commands (init, why, status, rate, override) — Day 6
- Hub upload + consent flow — Wave 3 D4
- Statusline NITs 3+4 — Day 6 cross-platform

## Tests
- Router tests: <X/X> pass (existing + 4 new)
- classify.js byte-identical with dev (P11) ✓
- write p99: <Xms> (budget < 5ms)
- init batch (24 embeddings, 8 per batch): <X.Xs> (budget ≤ 5s)
- Schema: cost_micros integer ✓, prompt_hash 16ch ✓, no plaintext ✓

## Invariants
- ✅ classify.js byte-identical
- ✅ No git add -A
- ✅ No --no-verify
- ✅ Embedding layer ainda aditivo (Day 3 preserved)
- ✅ Event upload OFF (local-only)
- ✅ Permissions 0700/0600 em ~/.mooter/

## Reviewer
final-reviewer: <APPROVE | APPROVE_WITH_NOTES>

## Backlog para Day 5
- <NITs do reviewer, se houver>
EOF
```

## 7. Notion + SYNC

### 7.1 Notion sub-page

Cria em Notion HQ (ID `33d6f6e4-2bc4-816b-977a-fe84bbe912c9`) sub-page:

Title: `🛠 Sessão YYYY-MM-DD — Wave 2 Day 4 (event-writer + NITs)`

Body:
- Tabela commits + sub-features delivered
- Schema canónico Wave 2 D4 capturado (file: mooter_event.ts)
- Performance benchmarks (write p99, init batch)
- Reviewer verdict + link PR
- Day 5 backlog

### 7.2 SYNC.md

Update secções:
- `## Notion HQ — Páginas de Referência` → add link Day 4 page
- `📥 COWORK → CLAUDE CODE` → next: aguardar Paulo merge PR + arrancar Day 5 (4 packs adicionais + calibração thresholds)

## 8. Resumo final na chat

Quando tudo verde:
```
✅ Wave 2 Day 4 — event-writer + NITs Day 3 COMPLETO
- Branch: wave2-day4-event-writer (pushed)
- PR: #<N> (link) → dev (NÃO merged — Paulo decide)
- Notion: <link>
- Schema canónico Wave 2 D4: 31+ campos, validated
- Write p99: <Xms> (budget < 5ms)
- Init batch: <X.Xs> (budget ≤ 5s)
- Tests: <X/X> verdes
- Reviewer: <APPROVE / APPROVE_WITH_NOTES>
- NITs 1+2+3 Day 3 fechados
- Event upload OFF (local-only) ✓
Próximo: Paulo merge + arranca Day 5 (4 packs adicionais: voice-tts, knowledge-third-brain, prd-strategy, data-spreadsheet + calibração thresholds com pack count crescente).
```

=== END ===
