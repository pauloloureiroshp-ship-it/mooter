# Wave 2 Day 6 — Kickoff master prompt (`mooter init` + execution fields + statusline NITs)

> **Como usar**: cola tudo abaixo de `=== START ===` no Claude Code dentro de `~/mooter/`, depois do PR #12 estar merged em `dev`. Self-contained.

**Pré-requisitos verificados antes de colar**:
- ✅ PR #12 merged em `dev` (squash commit `c3001f9`)
- ✅ `git checkout dev && git pull origin dev`
- ✅ Day 5 fechado: 7 packs · recall 100% · EMBED_PROMOTE_SIM 0.70 · 89 router tests verdes
- ✅ Ollama host responde (não usado neste Day, mas precisa estar up para hook tests)

---

=== START ===

## 0. Quem és e o que vais fazer

És Claude Code no `~/mooter/`, branch `wave2-day6-init-and-slash-commands` (a criar). `--permission-mode auto`. Acesso:
- `~/mooter/` (target)
- Anthropic Max sub
- Notion HQ ID `33d6f6e4-2bc4-816b-977a-fe84bbe912c9`

**Missão Day 6**: shippar 3 sub-features num único PR para `dev`:

1. **`mooter init` wizard v1 (5 steps)** — hardware probe + providers (Anthropic + Ollama) + credentials + pack recs + consent
2. **Execution fields wire** — completar `mooter_event` (tokens_in/out, cost_micros, latency_ms_*) via post-LLM-call hook
3. **Statusline NITs 3+4 (Day 2 deferred)** + **settings.json fix** (SessionStart array of matchers) + **bilingual seeds NIT Day 5**

Slash commands `/mooter why`, `/mooter status`, `/mooter rate`, `/mooter override` ficam **Wave 3 D1** (precisam do feedback loop maduro). `/mooter init` é shipped aqui porque é o gate de activation.

## 1. Invariantes (não-negociáveis)

- ❌ **Nunca tocar `classify.js`** — eixo 1 byte-identical (invariant P11)
- ❌ **Nunca `git add -A`** — commits selectivos sempre
- ❌ **Nunca merge directo para `main`** — sempre PR para `dev`, Paulo aprova squash
- ❌ **Nunca `--no-verify`**
- ❌ **NÃO commitar** `docs/strategy/PASTOR.md` (cross-stream Cowork)
- ❌ **NÃO commitar** docs untracked em `docs/strategy/*`
- ❌ **NÃO tocar** `event_writer.ts`, `mooter_event.ts` (Day 4 schema) — só consumir, não alterar
- ❌ **NÃO tocar** `embedding_store.ts`, `classify_domain.ts` (Day 3+5 calibrated) — só consumir
- ❌ **Telemetry upload OFF** — apenas writes locais. Upload é Wave 3 D4.
- ❌ **Sem OpenAI/Google/Grok credentials** — só Anthropic + Ollama no v1 do init. Outros providers ficam Wave 3 D3.
- ✅ **Final-reviewer T3-gate obrigatório** antes do PR (Task tool, Opus pinned)
- ✅ **Sanity check $1 BLOCKER** — wizard pode fazer 1 test call à Anthropic API ($0.001), tudo o resto local. Total esperado < $0.05.
- ✅ **Notion sub-page** ao fim do Day + SYNC.md update
- ✅ **Idempotency**: re-correr `mooter init` deve ser safe (sobrescreve consentimento + actualiza profile, mas não cria duplicates)

## 2. Branch + recon

```bash
cd ~/mooter
git checkout dev
git pull origin dev
git log --oneline -3  # confirma commit c3001f9 no topo (squash Day 5)
git checkout -b wave2-day6-init-and-slash-commands
```

Recon paralelo (lê antes de tocar em nada):
- `packages/router/src/mooter_event.ts` — schema canónico Day 4
- `packages/router/src/event_writer.ts` — writers Day 4
- `packages/router/src/hooks/inject_context.ts` — onde wire execution fields
- `tools/router/statusline-multi.js` — Day 2 wire
- `~/.claude/settings.json` — formato antigo (SessionStart string) precisa array of matchers
- `docs/installation/STATUSLINE_WIRE.md` — NIT 4 Day 2 backlog
- `packs/*/pack.yaml` — seeds bilingual NIT Day 5

## 3. Sub-feature 1: `mooter init` wizard v1 (5 steps)

### 3.1 Spec

Comando: `mooter init` corre no terminal, faz 5-step wizard interactive, escreve 3 schemas locais.

**Ficheiro novo**: `packages/cli/src/commands/init.ts` (CLI já existe da Wave 1 — extende com novo subcommand)

### 3.2 Step 1 — Hardware probe (automatic, ~2s)

```typescript
async function probeHardware(): Promise<HardwareProfile> {
  const os = process.platform;  // 'linux' | 'darwin' | 'win32'
  const osVersion = await execCommand('uname -r').catch(() => 'unknown');
  const nodeVersion = process.version;
  const cpuCores = require('os').cpus().length;
  const ramGb = Math.round(require('os').totalmem() / 1024 / 1024 / 1024);

  // GPU detection (cross-platform attempt)
  let gpu: { model: string; vram_gb: number } | null = null;
  try {
    if (os === 'linux') {
      const out = await execCommand('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader');
      const [model, vramMib] = out.trim().split(',').map(s => s.trim());
      gpu = { model, vram_gb: Math.round(parseInt(vramMib) / 1024) };
    } else if (os === 'darwin') {
      const out = await execCommand('system_profiler SPDisplaysDataType | grep -i "chipset"');
      // Apple Silicon unified memory — heuristic
      gpu = { model: 'Apple Silicon (unified)', vram_gb: Math.round(ramGb * 0.6) };
    }
    // Windows: skip in v1 (WSL2 user is rare, complex detection)
  } catch { /* GPU detection failed, fallback to none */ }

  // Ollama probe
  const ollamaUrl = process.env.OLLAMA_HOST ?? 'http://host.docker.internal:11434';
  let ollama: { url: string; models: string[]; available: boolean } = { url: ollamaUrl, models: [], available: false };
  try {
    const res = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const data = await res.json();
      ollama = { url: ollamaUrl, models: data.models.map((m: any) => m.name), available: true };
    }
  } catch { /* Ollama offline */ }

  return { os, osVersion, nodeVersion, cpuCores, ramGb, gpu, ollama };
}
```

Render output:
```
Step 1/5 · Scanning your machine
✓ Ubuntu 22.04 (WSL2)
✓ Node 20.11
✓ Ollama at host.docker.internal:11434
✓ 8 models found (qwen2.5-coder:7b, qwen3:30b, ...)
✓ GPU: RTX 4090 · 24GB VRAM
```

Se Ollama offline:
```
✗ Ollama not detected · T0 local tier disabled
  (You can install Ollama from https://ollama.com to enable local routing.)
```

### 3.3 Step 2 — Providers multi-select

Render checkbox list:
```
Step 2/5 · AI providers (which do you have?)

  [x] Anthropic Claude
  [ ] OpenAI ChatGPT       (configure in Wave 3)
  [ ] Google Gemini        (configure in Wave 3)
  [ ] Grok                 (configure in Wave 3)
  [x] Ollama (already detected)

  Press space to toggle, enter to confirm.
```

Captura apenas Anthropic + Ollama. Outros são "ack only" no v1.

### 3.4 Step 3 — Anthropic credentials

```
Step 3/5 · Anthropic access

  How do you access Claude?
  (1) Claude Pro (browser sub)
  (2) Claude Max (browser sub)
  (3) Claude Team
  (4) API key only

  Choice [1-4]: _
```

Se 1-3 (browser sub): detect existing `ANTHROPIC_API_KEY` env var como fallback OR offer OAuth flow via Supabase (mesma URL que landing actual usa). v1 simplificado: pede confirmação que tem sub activa, regista `type: 'oauth_max'` (etc) sem actual OAuth flow.

Se 4 (API key): paste com input masking:
```
Paste your API key (input hidden): sk-ant-***...***

Validating with test call (1 token)... ✓ Valid (tier: Max, budget: 80/5h, 1000/7d)
```

Test call: `POST https://api.anthropic.com/v1/messages` com `max_tokens: 1, messages: [{role: 'user', content: 'a'}]`. Cost ~$0.001.

### 3.5 Step 4 — Pack recommendations (top 3 of 7)

Algoritmo simples v1:
- Para cada pack, calcula `fit_score = 0.4 * hardware_fit + 0.3 * provider_tier_fit + 0.3 * static_trust`
- `hardware_fit`: 1.0 se T0 model fits VRAM detected, 0.5 se cabe parcial, 0.0 se nada local
- `provider_tier_fit`: 1.0 se ceiling do pack ≤ tier detectado da sub, 0.5 se 1 step acima, 0.0 se 2+ steps
- `static_trust`: hardcoded (animation-web 87, code-audit 95, diagram-systems 98, voice-tts 76, knowledge-third-brain 73, prd-strategy 79, data-spreadsheet 82)

Mostra top 3:
```
Step 4/5 · Recommended packs (based on your stack)

  ★ diagram-systems   (trust 98 · fits qwen2.5-coder:7b)   [install]
  ★ code-audit        (trust 95 · fits Sonnet ceiling)      [install]
    animation-web     (trust 87 · cap T2 ok)                [skip]

  Default: skip all. Press enter on each to install, or skip.
  (You can install more later with /mooter pack install <id>.)
```

Default = skip (privacy-first, never auto-install).

Install: copia `packs/<id>/pack.yaml` + `scaffold.md` para `~/.mooter/packs/<id>/`. Update `~/.mooter/installed.json`.

### 3.6 Step 5 — Telemetry consent

```
Step 5/5 · Telemetry · privacy-first

Mooter learns from anonymous data to improve routing for everyone.

  We collect (aggregated, k-anon ≥50):
    ✓ Prompt SHA-256 hash · NOT prompt text
    ✓ Tier chosen + cost · NOT model response
    ✓ Pack used + confidence · NOT pack contents
    ✓ Latency in ms · NOT request payload

  We never collect:
    ✗ Your code · prompts · responses · personal identifiers

  Enable telemetry to help mooter improve? [y/N]: _
```

Default = N (OFF). Write `~/.mooter/consent.json` com `{ telemetry_enabled: bool, consent_timestamp_utc, consent_version: '1.0.0' }`.

### 3.7 Schemas escritos

**`~/.mooter/credentials.json`** (chmod 600):
```json
{
  "schema_version": "1.0.0",
  "providers": {
    "anthropic": {
      "type": "oauth_max" | "api_key",
      "credential_ref": "<keyring-id OR encrypted blob>",
      "tier_detected": "max",
      "budget_5h_limit": 80,
      "budget_7d_limit": 1000,
      "last_validated_utc": "2026-05-29T..."
    },
    "ollama": {
      "type": "local",
      "url": "http://host.docker.internal:11434",
      "models": ["qwen2.5-coder:7b", "..."],
      "gpu": { "model": "RTX 4090", "vram_gb": 24 }
    }
  }
}
```

**`~/.mooter/profile.json`** (chmod 600):
```json
{
  "schema_version": "1.0.0",
  "os": "linux-ubuntu-22.04-wsl2",
  "node_version": "20.11.0",
  "gpu": { "model": "RTX 4090", "vram_gb": 24 },
  "ram_gb": 32,
  "cpu_cores": 16,
  "captured_utc": "2026-05-29T...",
  "next_refresh_utc": "2026-06-28T..."
}
```

**`~/.mooter/consent.json`** (chmod 600):
```json
{
  "schema_version": "1.0.0",
  "telemetry_enabled": false,
  "consent_timestamp_utc": "2026-05-29T...",
  "consent_version": "1.0.0",
  "can_revoke": true
}
```

### 3.8 DoD `mooter init`

- Wizard completo em fresh WSL2 ≤ 3 min
- Cross-platform: Linux full, macOS skeleton (com warnings se nvidia-smi falhar), Windows-WSL full
- Credentials masked durante input
- Anthropic API validation funciona (test call 1 token, 401 reporta erro claro)
- 3 schemas escritos com permissions 600
- Telemetry default OFF
- Idempotent: re-correr não duplica installed packs
- Test integration em `packages/cli/tests/init.test.ts`

## 4. Sub-feature 2: Execution fields wire

### 4.1 Spec

Day 4 schema tem campos `model_actual, tokens_in, tokens_out, cost_micros, latency_ms_total, latency_ms_ttft, error_type, retries`. Day 4 deixou todos `null/0` (TODO Day 6). Agora wire ao post-LLM-call hook.

### 4.2 Implementação

**Ficheiro**: `packages/router/src/hooks/inject_context.ts`

Day 4 wire chama `eventWriter.write(event)` no fim do hook **antes** do LLM call. Agora precisa de:

1. **Generate event_id no hook (pre-call)** e guarda em memory map keyed por session_id+turn_id
2. **Após LLM call**, captura tokens/cost/latency da response
3. **Update event** com execution fields (não escrever 2 vezes — usar JSONL update via append "diff" event? OR delay write até fim do turn)

**Decisão arquitectural**: usa **delayed write at turn end** (mais simples, sem race conditions):

```typescript
// hook start
const eventDraft = makeEnvelope({ ... });
eventDraft.prompt_hash = sha256(promptText).slice(0, 16);
eventDraft.axis1_tier_recommended = tier;
// ... outros routing decision fields

// store draft em memory
sessionState.currentEventDraft = eventDraft;
sessionState.turnStartMs = Date.now();

// LLM call happens (orchestrated by claude code, not hook)

// hook end (post-LLM-call hook OR session cleanup)
const draft = sessionState.currentEventDraft;
const response = await fetchLastResponse();  // claude code provides this
draft.model_actual = response.model;
draft.tokens_in = response.usage.input_tokens;
draft.tokens_out = response.usage.output_tokens;
draft.tokens_cache_hit = response.usage.cache_read_input_tokens ?? 0;
draft.cost_micros = computeCostMicros(response.model, draft.tokens_in, draft.tokens_out);
draft.latency_ms_total = Date.now() - sessionState.turnStartMs;
draft.error_type = response.error?.type ?? null;
draft.retries = response.retries ?? 0;

await eventWriter.write(draft);
```

**`computeCostMicros`** — função pura, dada model + tokens, devolve integer microUSD via `pricing.js`:

```typescript
import { PRICING_TABLE } from "./pricing";  // existing file

function computeCostMicros(model: string, tokensIn: number, tokensOut: number): number {
  const rates = PRICING_TABLE[model];
  if (!rates) return 0;  // unknown model
  // rates.input_per_mtok and rates.output_per_mtok are in dollars per million tokens
  const dollarsIn = (tokensIn / 1_000_000) * rates.input_per_mtok;
  const dollarsOut = (tokensOut / 1_000_000) * rates.output_per_mtok;
  return Math.round((dollarsIn + dollarsOut) * 1_000_000);  // integer microUSD
}
```

### 4.3 Tests

`packages/router/tests/execution-fields.test.ts`:
- Mock LLM response com tokens + model → event tem campos correctos
- `cost_micros` é integer (não float) — verifica via type check + modulo
- Latency é positiva e ≤ wall clock máximo
- Error response → `error_type` populated, tokens/cost = 0
- Unknown model → `cost_micros = 0`, no throw

## 5. Sub-feature 3: NITs e cleanup

### 5.1 NIT 3 Day 2 — statusline edge test

**Ficheiro**: `tools/router/statusline-multi.test.js`

Add test case: `dataMissing=false + proof='—'` (tracker just spun up, no decisions yet):
- Render statusline em state intermédio
- Assert que NÃO mostra `🛠 setup incomplete` (tracker está online)
- Assert que mostra placeholder proof `—` em vez de número

### 5.2 NIT 4 Day 2 — STATUSLINE_WIRE.md callout

**Ficheiro**: `docs/installation/STATUSLINE_WIRE.md`

Adiciona callout no topo:
```markdown
> ⚠️ The jq additive merge OVERRIDES any custom `statusLine.type` or `statusLine.command`
> you may have pinned in `~/.claude/settings.json`. Sibling keys (theme, hooks, permissions, etc)
> are preserved. If you have a custom statusLine, back it up before running the merge.
```

### 5.3 Settings.json SessionStart format fix

**Ficheiro novo**: `tools/router/hooks/migrate-settings.sh`

Detecta formato antigo (`SessionStart: "<command>"`) e migra para array of matchers:

```bash
#!/usr/bin/env bash
# Migrate ~/.claude/settings.json SessionStart from string to array of matchers
set -uo pipefail

SETTINGS="$HOME/.claude/settings.json"
BACKUP="${SETTINGS}.pre-migrate-day6.bak"

if [ ! -f "$SETTINGS" ]; then exit 0; fi

# Check if already migrated
if jq -e '.hooks.SessionStart | type == "array"' "$SETTINGS" >/dev/null 2>&1; then
  echo "✓ Already in array format"
  exit 0
fi

# Check if string format
if jq -e '.hooks.SessionStart | type == "string"' "$SETTINGS" >/dev/null 2>&1; then
  cp "$SETTINGS" "$BACKUP"
  CMD=$(jq -r '.hooks.SessionStart' "$SETTINGS")
  jq --arg cmd "$CMD" '.hooks.SessionStart = [{matcher: "*", hooks: [{type: "command", command: $cmd}]}]' "$SETTINGS" > "$SETTINGS.tmp"
  mv "$SETTINGS.tmp" "$SETTINGS"
  echo "✓ Migrated. Backup at $BACKUP"
fi
```

Document em STATUSLINE_WIRE.md.

### 5.4 Bilingual seeds NIT Day 5

**Ficheiro**: cada `packs/<id>/pack.yaml` — review embedding_seeds e standardize.

Decisão: **manter cada pack como está agora** (não swap) mas documentar no `packs/README.md` (novo) que seeds podem ser PT-PT ou EN, e que validation set deve cobrir ambas as línguas.

**Ficheiro novo**: `packs/README.md`

```markdown
# Pastor packs

## Embedding seeds language convention

- **Original 3 packs** (animation-web, code-audit, diagram-systems): seeds em PT-PT (legacy from Wave 1)
- **Wave 2 Day 5 packs** (voice-tts, knowledge-third-brain, prd-strategy, data-spreadsheet): seeds em English

**Decision** (Day 6 ADR 019): mantemos mixed por agora. Cross-language queries têm misroute risk
documented (ADR 018 known-residual). Wave 3+ pode standardizar para bilingual (4 PT-PT + 4 EN per pack).

Validation set deve incluir prompts em ambas as línguas para detectar regressões.
```

**Ficheiro novo**: `docs/adr/019-bilingual-seeds-known-residual.md`

```markdown
# ADR 019 — Bilingual seeds known-residual

## Context
Day 3 (3 packs) used PT-PT seeds. Day 5 (4 new packs) used English seeds.
Mixed-language embedding store causes distribution mismatch for cross-language queries.

## Decision
Defer standardization to Wave 3+. Document as known-residual.

## Why not fix now
- Recall 100% no validation set (single-language queries)
- Scope creep risk: rewriting 3 packs' seeds invalidates Day 3 calibration
- Better solution: bilingual seeds (4 PT + 4 EN per pack) needs proper grid-search

## When to revisit
- Cross-language misroute rate > 5% in prod telemetry (Wave 3+)
- Embedding model swap (e.g. nomic-embed-text v2 multilingual)
- Community pack contributions in non-English
```

## 6. Final-reviewer pre-PR

Spawn final-reviewer:

```
Task tool, subagent_type: "general-purpose"

Prompt: "Review branch wave2-day6-init-and-slash-commands vs dev.

Verifica:
- classify.js byte-identical com dev (P11)
- mooter init wizard 5 steps funciona em fresh-install (Linux full)
- 3 schemas escritos (credentials/profile/consent) com permissions 600
- Anthropic API validation faz test call $0.001 max, error 401 reporta claro
- Idempotency: re-correr mooter init não duplica installed packs
- Telemetry default OFF (consent.json telemetry_enabled=false)
- Execution fields wire: cost_micros integer, latency positive, error_type captured
- pricing.js consumed para cost calc
- NIT 3 Day 2: statusline test cobre dataMissing=false + proof='—'
- NIT 4 Day 2: STATUSLINE_WIRE.md callout sobre jq override
- Settings.json migrate script funciona: detecta formato string, backup .bak, converte para array
- ADR 019 bilingual seeds documentado
- packs/README.md explica language convention
- event_writer.ts + mooter_event.ts INTACTOS (Day 4 schema)
- embedding_store.ts + classify_domain.ts INTACTOS (Day 3+5 calibration)
- Sem `git add -A`, sem `--no-verify`
- Sem secrets em diff (input masking durante wizard)
- PASTOR.md NÃO no diff
- docs/strategy/* untracked NÃO no diff
- Cost sanity: < $1 BLOCKER (esperado < $0.05)

Reporta: APPROVE | APPROVE_WITH_NOTES | REQUEST_CHANGES com lista numerada de NITs."
```

## 7. PR

```bash
git push -u origin wave2-day6-init-and-slash-commands
gh pr create --base dev --title "Wave 2 Day 6: mooter init wizard + execution fields + statusline NITs" --body-file - <<'EOF'
## Summary
Three bundled sub-features:

1. **`mooter init` wizard v1** (activation gate):
   - 5-step terminal-native wizard
   - Hardware probe (Linux full · macOS skeleton · Windows-WSL full)
   - Anthropic + Ollama credentials (other providers Wave 3 D3)
   - Pack recommendations (top 3 of 7, default skip)
   - Telemetry consent default OFF
   - 3 schemas: credentials/profile/consent (perms 600)
   - Idempotent re-run

2. **Execution fields wire**:
   - mooter_event fields tokens_in/out, cost_micros, latency_ms_total, error_type filled
   - pricing.js consumed for cost calc (integer microUSD, no float drift)
   - Delayed write at turn end (no race)

3. **NITs + cleanup**:
   - NIT 3 Day 2: statusline edge test (dataMissing=false + proof='—')
   - NIT 4 Day 2: STATUSLINE_WIRE.md jq override callout
   - settings.json migrate-settings.sh (string → array of matchers)
   - ADR 019 + packs/README.md (bilingual seeds known-residual)

## Changes
- `packages/cli/src/commands/init.ts`: NEW — wizard 5 steps
- `packages/cli/tests/init.test.ts`: NEW — integration tests
- `packages/router/src/hooks/inject_context.ts`: execution fields wire
- `packages/router/src/cost.ts`: NEW — computeCostMicros pure function
- `packages/router/tests/execution-fields.test.ts`: NEW
- `tools/router/statusline-multi.test.js`: +edge case test
- `tools/router/hooks/migrate-settings.sh`: NEW
- `docs/installation/STATUSLINE_WIRE.md`: +jq override callout
- `docs/adr/019-bilingual-seeds-known-residual.md`: NEW
- `packs/README.md`: NEW

## Out of scope (next)
- Slash commands /mooter why/status/rate/override — Wave 3 D1
- OpenAI/Google/Grok credentials — Wave 3 D3
- Hub upload + opt-in flow — Wave 3 D4
- Statusline 3-line cross-platform full design — Wave 4 design Phase 3

## Tests
- Router: <X/X> pass (+N new)
- CLI init integration: <Y/Y> pass
- classify.js byte-identical (P11) ✓
- mooter_event schema preserved (Day 4) ✓
- embedding_store + classify_domain intacto (Day 3+5) ✓
- Cost sanity: $0.0X (BLOCKER if ≥ $1)

## Invariants
- ✅ classify.js byte-identical
- ✅ Day 4 schema intacto
- ✅ Day 3+5 calibration intacto
- ✅ No git add -A
- ✅ No --no-verify
- ✅ Telemetry default OFF
- ✅ Cross-stream protegido

## Reviewer
final-reviewer: <APPROVE | APPROVE_WITH_NOTES>

## Backlog para Day 7
- <NITs do reviewer, se houver>
EOF
```

## 8. Notion + SYNC

### 8.1 Notion sub-page

Title: `🛠 Sessão YYYY-MM-DD — Wave 2 Day 6 (mooter init + execution + NITs)`

Body:
- Tabela commits + 3 sub-features delivered
- Schema files capturados (`~/.mooter/credentials.json`, `profile.json`, `consent.json`)
- Cost sanity
- Reviewer verdict + link PR
- Day 7 backlog

### 8.2 SYNC.md

Update secções:
- `## Notion HQ — Páginas de Referência` → add link Day 6 page
- `📥 COWORK → CLAUDE CODE` → next: aguardar Paulo merge PR + arranca Day 7 (re-benchmark cumulative gate v0.2.0-rc1)

## 9. Resumo final na chat

Quando tudo verde:
```
✅ Wave 2 Day 6 — mooter init + execution fields + NITs COMPLETO
- Branch: wave2-day6-init-and-slash-commands (pushed)
- PR: #<N> (link) → dev (NÃO merged — Paulo decide)
- Notion: <link>
- mooter init wizard 5 steps: cross-platform Linux/macOS/Windows-WSL
- Schemas escritos: credentials.json, profile.json, consent.json (perms 600)
- Execution fields wired: tokens, cost_micros integer, latency, error_type
- NITs Day 2 (3+4) fechados · settings.json migrate · ADR 019 bilingual seeds
- Tests: X/X verdes (router + CLI)
- Reviewer: <APPROVE / APPROVE_WITH_NOTES>
- Cost sanity: $0.0X (BLOCKER < $1)
- Telemetry default OFF ✓
- classify.js + Day 4 schema + Day 3+5 calibration: TODOS intactos ✓
Próximo: Paulo merge + arranca Day 7 (re-benchmark cumulative, gate v0.2.0-rc1).
```

=== END ===
