# Wave 3 — Plano canónico (2026-06-11 → 2026-06-17)

> **SSoT operacional** da Wave 3. Foco: **activation journey completo** + **hub Cloudflare** + **digest local**. Continuação directa de Wave 2 (que cobriu fixes, statusline, embedding, events, packs, init v1, re-bench).
>
> Substitui a Wave 3 original do PASTOR.md (que misturava onboarding-budget-first com pack rating sem coerência sequencial). Esta versão alinha-se ao **Momento 2 e 3** da análise UX/UI do activation journey (`docs/strategy/ACTIVATION_JOURNEY.md` — a criar se ainda não existir, OU embebido aqui).

---

## Pré-requisitos (devem estar ✅ antes da Wave 3 arrancar)

| Item | Estado |
|---|---|
| Wave 2 Day 7 re-benchmark passou STRONG ou MEDIUM 2-3/3 | gate |
| `v0.2.0-rc1` tag pushed | gate |
| `mooter_event` schema v1 operacional (Day 4) | gate |
| `/mooter init` wizard v1 funciona em fresh-install (Day 6) | gate |
| Anthropic + Ollama credentials capturadas via init | gate |
| Statusline 3-linhas wired (Day 2) | gate |

Se algum gate falhar → resolve antes de Day 1 Wave 3.

---

## Resumo Wave 3

| Day | Foco | Objectivo |
|---|---|---|
| 1 | **Feedback loop nível 2** — `/mooter rate`, `/mooter why` enrichado, inline guidance no turn end | Capturar sinais explícitos do utilizador (Momento 2) |
| 2 | **Pack discovery** — `/mooter pack suggest` + install flow [Y/n] + trust_score local placeholder | Acelerar adopção dos 7 packs |
| 3 | **Providers expansion** — OpenAI, Google, Grok credentials no `mooter init` | Cobrir o resto do stack do utilizador |
| 4 | **Cloudflare D1 schema + aggregator** — `mooter_event_aggregate` k-anon ≥50 + DP noise + `/mooter share` opt-in | Telemetria opt-in real, privacy-preserving |
| 5 | **Hub endpoints** — publish/search/trust + frugal-hub Workers deployment | Pack registry distribuído |
| 6 | **Digest local** — `/mooter digest` weekly + daily statusline summary | Re-engagement (Momento 3) |
| 7 | **Trust score visualization + community stats + closure** | Validação Wave 3 + tag `v0.3.0-rc1` |

---

## Day 1 — Feedback loop nível 2

### 1.1 `/mooter rate <👍|👎|🤷> [comment]`

Slash command que regista feedback do último turn.

**Implementação**:
- Lê última decision de `~/.mooter/sessions/<id>.jsonl` (escrita por hook nível 1 da Wave 2 Day 4)
- Append event nível 2 ao mesmo session log com campos: `rating_thumb`, `rating_comment_anon`, `rating_timestamp_utc`
- Sem upload (Day 4 trata do consent + aggregator)
- Output: `✓ Rating recorded. Mooter learns.`

**Comment privacy**: comment é guardado local mas NUNCA enviado bruto. Se telemetry enabled (Day 4), só `comment_length` e `comment_sentiment` (positive/neutral/negative via local micro-classifier) saem.

### 1.2 `/mooter why` enrichado (extende Day 6 W2)

Versão Wave 2 mostrava: tier, pack, model, cost.
Versão Wave 3 adiciona:
- Alternative routings considered (top 3 com confidence scores)
- Why this one won (e.g. "embedding agreement bonus" / "GENERAL fallback" / "user override")
- Quality signal so far (continued? edited? aborted?)
- Estimated cost saved vs Opus baseline

### 1.3 Inline guidance no turn end (default ON, opt-out via `mooter quiet`)

Após cada turn, mostra 1-line abaixo do output do Claude Code:
```
✓ T2 Sonnet · $0.003 · pack: diagram-systems · 87% saved
  ↳ /mooter rate? · /mooter why · pack stats: 4 turns
```

**Amostragem**: rate invite aparece em ~20% dos turns (não cada um — fatiga). Após user faz 5 rates, baixa para 10%.

### 1.4 DoD Day 1

- `/mooter rate` regista event nível 2 com schema válido
- `/mooter why` mostra alternative routings + agreement source
- Inline guidance renderiza após cada turn sem partir layout
- `mooter quiet` desactiva inline guidance (silenciosa)
- Test fatigue: rate invite NÃO aparece se utilizador já fez ≥5 rates nas últimas 24h

---

## Day 2 — Pack discovery & installation

### 2.1 `/mooter pack suggest`

Algoritmo:
- Últimos N=10 turns do session log
- Para cada turn, extrai `axis2_pack_id` + `axis2_confidence`
- Conta packs usados com confidence < 0.7 (signal de domain mismatch)
- Cross-reference com `~/.mooter/packs/installed.json` (filtra já instalados)
- Retorna top 3 suggestions com razão clara

**Output**:
```
Based on last 10 turns, you'd benefit from:

  ★ voice-tts          (3 turns matched, confidence 0.62 — installing would boost to ~0.95)
  ★ knowledge-third-brain (2 turns, confidence 0.55)
    prd-strategy       (1 turn, confidence 0.58)

  /mooter pack install voice-tts knowledge-third-brain
```

### 2.2 `/mooter pack install <id> [<id>...]`

- Confirma com [Y/n] (D6 default — nunca auto-install)
- Validation: pack.yaml schema, signatures (se hub publicado), dependencies (skills/MCPs existem?)
- Install: copia pack.yaml + scaffold.md para `~/.mooter/packs/<id>/`
- Update `installed.json`
- Reload embedding store (Day 3 Wave 2) com novos embedding_seeds
- Statusline acknowledges: `✓ pack voice-tts installed · ready`

### 2.3 `/mooter pack list/show/diff/validate` (já existem Wave 1)

Mantêm-se. `list` agora também mostra "in use" (X turns this week) baseado em events nível 1.

### 2.4 Trust_score local placeholder

Até hub estar live (Day 5), trust_score = hardcoded (98 para Pastor seed packs, 0 para third-party).

### 2.5 DoD Day 2

- `/mooter pack suggest` retorna 0-3 packs baseado em últimos 10 turns
- `/mooter pack install` valida schema antes de copiar
- `installed.json` é atomic-write (no partial state)
- Embedding store reload ≤ 2s após install
- Tests: 5 cenários (no matches, 1 match, 3 matches, all installed, invalid pack)

---

## Day 3 — Providers expansion (OpenAI, Google, Grok)

### 3.1 Extensão do `mooter init` (não wizard novo, refresh)

Comando: `/mooter init --providers` — re-corre só os steps 2-3 do wizard, preservando hardware (step 1) e consent (step 5).

### 3.2 OpenAI

- Choice: API key only · Plus · Codex · API only
- Validation: `/v1/models` test call
- Detecta tier: Plus = 80 messages/3h, Codex = 80/h, etc.

### 3.3 Google

- Choice: API key only · Advanced · Ultra
- Validation: `gemini-1.5-flash` test call (cheapest model)
- Detecta tier limits

### 3.4 Grok

- Choice: API key only
- Validation: `grok-beta` test call (xAI doesn't have web sub yet — só API)

### 3.5 Schema update

`credentials.json` ganha entries openai/google/grok. Mesmo formato de Day 6 W2.

### 3.6 DoD Day 3

- Cada provider tem validation funcional (test call ≤ $0.01)
- Falha de credentials reporta erro claro (401, 403, network, etc.)
- `mooter init --providers` é idempotente (re-corre sem stress)
- Tests com mocks para cada provider

---

## Day 4 — Cloudflare D1 schema + opt-in aggregator

### 4.1 D1 tables (read PR's Wave 1 D1 setup como base)

```sql
CREATE TABLE mooter_event_aggregate (
  bucket_id TEXT PRIMARY KEY,           -- hourly bucket UUIDv7
  bucket_start_utc TEXT NOT NULL,
  pastor_version TEXT NOT NULL,
  pricing_version TEXT NOT NULL,
  pack_id TEXT,
  tier_chosen TEXT,
  user_count INTEGER NOT NULL,          -- must be ≥50 for k-anon
  event_count INTEGER NOT NULL,
  cost_micros_avg INTEGER,
  cost_micros_p99 INTEGER,
  latency_ms_avg INTEGER,
  latency_ms_p99 INTEGER,
  quality_score_avg REAL,               -- with DP noise ε=1.0
  thumbs_up_rate REAL,
  thumbs_down_rate REAL,
  CONSTRAINT k_anon CHECK (user_count >= 50)
);

CREATE TABLE mooter_pack_trust (
  pack_id TEXT PRIMARY KEY,
  trust_score INTEGER NOT NULL CHECK (trust_score BETWEEN 0 AND 100),
  install_count INTEGER NOT NULL DEFAULT 0,
  avg_quality REAL,
  last_updated_utc TEXT NOT NULL
);

CREATE TABLE mooter_pack_publish_queue (
  pack_id TEXT PRIMARY KEY,
  manifest_sha256 TEXT NOT NULL,
  submitter_anon_id TEXT NOT NULL,
  status TEXT CHECK (status IN ('pending','approved','rejected')),
  submitted_utc TEXT NOT NULL
);
```

### 4.2 `/mooter share` opt-in command

```
> /mooter share

Telemetry helps mooter route smarter for everyone.

  Currently: ❌ OFF (local-only)

  Switch to: ✅ ON (anonymous, k-anon ≥50, DP noise)

  We collect (aggregated, never raw):
    ✓ Pack quality scores · tier distributions · cost/latency averages
  We never see:
    ✗ Your prompts · code · responses · personal identifiers

  Switch to ON? [y/N]
```

Update `consent.json` accordingly.

### 4.3 Local aggregator

- Cron job (1h interval): lê events dos últimos 7d, agrega por (pack_id, tier_chosen)
- Aplica DP noise (Laplace ε=1.0) a quality_score
- Verifica k-anon: descarta buckets com user_count < 50 (no v0.3.0, user_count = 1 sempre — vai começar a fazer sentido em Wave 4 community scale)
- Upload via fetch para Cloudflare Workers endpoint `/api/event-aggregate/ingest`

### 4.4 DoD Day 4

- D1 schema migrated via Wrangler
- `/mooter share` ON/OFF toggles consent.json
- Aggregator corre local + dry-run upload (não actualmente envia até Wave 4 launch — but endpoint ready)
- Test: 100 events sintéticos → bucket agregado correcto, k-anon enforcement

---

## Day 5 — Hub endpoints + frugal-hub Workers deploy

### 5.1 Cloudflare Workers endpoints (`mooter-hub` Worker)

| Endpoint | Método | Acção |
|---|---|---|
| `/api/event-aggregate/ingest` | POST | Recebe bucket agregado, k-anon validated, insere em D1 |
| `/api/pack/search?q=&domain=` | GET | Search packs no registry |
| `/api/pack/<id>/publish` | POST | Submete pack ao publish queue |
| `/api/pack/<id>/trust` | GET | Devolve trust_score actual |
| `/api/pack/<id>/install` | GET | Devolve manifest + scaffold para install local |
| `/api/health` | GET | Liveness check |

### 5.2 Wrangler deploy

```bash
cd hub/
npx wrangler deploy --env production
```

Domain: `hub.mooter.ai` (sub-domain Cloudflare).

### 5.3 Mooter CLI integration

Slash commands actualizados:
- `/mooter pack search <query>` → chama `/api/pack/search`
- `/mooter pack install <id>` → fetches manifest do hub se id não estiver local
- `/mooter pack publish` → POSTs ao `/api/pack/<id>/publish`
- `/mooter trust <id>` → GET `/api/pack/<id>/trust`

### 5.4 DoD Day 5

- Workers deployed em `hub.mooter.ai`
- 5 endpoints respondem 200 com test data
- CLI integration: 7 Pastor seed packs publicados ao hub via 1 script `scripts/seed-hub.sh`
- `/mooter pack search` no terminal devolve resultados reais

---

## Day 6 — Digest local + statusline summaries

### 6.1 `/mooter digest [--week|--month|--all]`

Lê `~/.mooter/events/*.jsonl` + `~/.mooter/sessions/*.jsonl` dos últimos N dias.
Agrega + formata:

```
Mooter — week of 2026-06-08 to 2026-06-15 · Got Moo?

  Savings:    $7.42  (87% vs all-Opus baseline)
  Prompts:    142    (T0 64% · T1 18% · T2 14% · T3 4%)
  Top pack:   diagram-systems · 24 turns · $0.42 saved
  Best ratio: code-audit · 100% on Sonnet · $0.18 saved

  ── Daily ─────────────────────────────────
  Mon ▂▄▆█▇▅▃▁  · 23 turns · $1.40 saved
  Tue ▃▅▇██▆▄▂  · 31 turns · $1.83 saved
  ...

  ── Regressions ──────────────────────────
  ⚠️ animation-web: quality -8pp last week vs prior · /mooter pack diff
  ✓ All other packs stable

  /mooter forge status → ready in 32 days
```

### 6.2 Daily statusline summary (10am local, opt-out)

Quando primeira sessão Claude Code do dia abre, statusline mostra durante 30s:
```
🟢 Got Moo? You saved $0.92 yesterday (91%) · /mooter digest for week view
```

### 6.3 DoD Day 6

- Digest weekly + monthly + all-time
- Daily statusline summary fires only once per day
- Regression detection: quality drop > 10pp last 7d vs prior 7d → amber flag
- Output rendered cleanly em terminal ≥ 80 cols (compacto em < 80)

---

## Day 7 — Trust score visualization + closure

### 7.1 `/mooter trust <pack-id>` enrichado

```
> /mooter trust diagram-systems

★★★★★ trust 98 / 100

  Install count:     247 users
  Avg quality:       0.91 (DP noise ±0.04)
  Misroute rate:     2.1%
  Last 7d trend:     stable
  Published by:      pauloloureiroshp-ship-it (verified)
  Compatible:        ✓ qwen2.5-coder:7b ✓ claude-sonnet ✓ claude-opus
  Last updated:      2026-06-14
```

### 7.2 `/mooter community` (NEW)

Resumo overall hub:
```
> /mooter community

mooter hub — community stats · last 7d

  Active users:      247
  Total prompts:     14.2K
  Total saved:       $184.20
  Top packs:
    1. diagram-systems · 89% avg savings · 247 users
    2. code-audit · 76% · 198 users
    3. animation-web · 71% · 124 users

  Your contribution: 142 prompts · 87% savings · rank #34

  /mooter share to join (currently: ON / OFF)
```

### 7.3 Wave 3 validation suite

Re-corre o benchmark do Wave 2 Day 7 + adiciona métricas:
- `/mooter rate` adoption rate (target ≥ 30% after 1 week)
- Pack install rate post-suggest (target ≥ 50%)
- Telemetry opt-in rate (target ≥ 40%)
- Digest open rate (target ≥ 60% of active users)

### 7.4 Closure Wave 3

- Final-reviewer T3-gate sobre o conjunto Wave 3 (não só ultimo PR)
- Tag `v0.3.0-rc1` push
- Notion HQ closure page (similar à da Wave 1)
- Decision gate: STRONG → Wave 4 launch público começa. WEAK → repair sprint.

---

## Invariantes Wave 3 (não-negociáveis)

- ❌ Nunca tocar `classify.js` (P11)
- ❌ Nunca `git add -A`
- ❌ Nunca merge directo para `main`
- ❌ Nunca `--no-verify`
- ❌ Sem upload pre-consent (default OFF, opt-in claro)
- ❌ Sem k-anon < 50 em qualquer bucket aggregated
- ✅ DP noise (ε=1.0) em quality scores
- ✅ Final-reviewer T3-gate cada Day
- ✅ Sanity check $1 BLOCKER (alguns Days envolvem API calls — esperado $0.05-0.20 total Wave 3)
- ✅ Notion sub-page + SYNC.md por Day

---

## Master prompts (a compor à medida que cada Day arranca)

| Day | Master prompt | Quando compor |
|---|---|---|
| 1 | `docs/strategy/WAVE3_DAY1_KICKOFF.md` | Quando Wave 2 Day 7 fechar STRONG |
| 2-7 | `docs/strategy/WAVE3_DAY<N>_KICKOFF.md` | Cada um quando o anterior mergear |

---

## Relacionados

- [PASTOR.md](./PASTOR.md) — SSoT estratégico (§8)
- [WAVE2_PLAN.md](./WAVE2_PLAN.md) — Wave 2 SSoT operacional
- [DESIGN_MASTER_PROMPT.md](./DESIGN_MASTER_PROMPT.md) — design brief paralelo (Phase 1-3)
- Memory: `project_mooter_pastor_wave1_shipped` · `project_mooter_value_decision`
