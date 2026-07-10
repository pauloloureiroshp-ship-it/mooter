# Wave 3 Day 3 — Hub Remote Sync Stub (CF Workers contract prep)

> **Como usar**: cola no Claude Code. Self-contained.
>
> **Pré-requisitos**: tag `v0.3.1-activation-hub` em dev (W3 D2). Working dir = `~/mooter`.
>
> **O que faz**: 5 sub-features que preparam o contrato com Wave 4 Phase D (CF Workers backend) SEM fazer network calls reais. Schema versionado · sync queue local · dry-run client · audit log signed · scheduling spec.
>
> **NÃO inclui**: chamadas HTTPS reais (Wave 4 Phase D), CF Workers deployment (Wave 4 D), área logada (Wave 4 C).

---

=== START ===

## 0. Quem és e missão

És Claude Code Opus 4.8 no `~/mooter/`, branch `wave3-day3-sync-stub` (cria de `dev`). `--permission-mode bypassPermissions`.

**Missão Wave 3 D3**: definir o contrato de sync remoto rigorosamente, sem ainda enviar nada. Tudo local, versionado, auditável. Quando Wave 4 D shippa o CF Workers backend real, o cliente já está pronto e testável.

5 sub-features:

1. **`mooter_sync_event` schema v1** — JSON shape canónico que CF Workers vai receber
2. **Sync queue local** — eventos esperam em `~/.mooter/sync-queue.jsonl` (review-able antes de upload)
3. **Dry-run client** — `mooter sync --dry-run` faz pipeline completo (gate consent → filter → sign → MOCK POST) sem network
4. **Audit log signed** — cada operação sync (mesmo dry-run) regista em `~/.mooter/sync-audit.jsonl` com HMAC
5. **Schedule spec** — define cadência (1×day default) + revogação · NÃO arranca cron ainda

## 1. Invariantes (NÃO-NEGOCIÁVEIS)

- ❌ **classify.js byte-identical** (P11) — verificar `git diff dev tools/router/classify.js`
- ❌ **mooter_event.ts schema INTACTO** (W2 D4) — sync_event é NOVO e separado
- ❌ **safety_boost.js critical phrases preserved** (W3 D1)
- ❌ **ZERO chamadas HTTP/HTTPS reais** (nem em testes) — mocks puros
- ❌ **NÃO arrancar cron / scheduler** — só define spec
- ❌ **NÃO enviar dados** — gate consent é absoluto
- ❌ **Não tocar** `docs/archive/**`, `~/.claude/agents/*`, `landing/`
- ❌ **Não `git add -A`** · **`--no-verify`** · merge para `main`
- ✅ **Final-reviewer T3-gate** obrigatório
- ✅ **Auto-merge para dev** após APPROVE
- ✅ **Tag v0.3.2-sync-stub**
- ✅ **Vocabulário GLOSSARY** (Mooter/Moos)
- ✅ **Honesty**: schema v1 documentado, signature HMAC user-verificável, dry-run claramente sinalizado

## 2. Branch + recon

```bash
cd ~/mooter
git checkout dev
git pull origin dev
git log --oneline -5  # confirma 17795b8 + tag v0.3.1-activation-hub
git tag -l | grep v0.3.
git checkout -b wave3-day3-sync-stub
```

Recon:
- `packages/cli/src/commands/consent.ts` (W3 D2) — fonte de truth para opt-in
- `packages/cli/src/commands/trail.ts` — fonte de truth para eventos a sync
- `packages/cli/src/commands/quiet.ts` — referência para revoke flags
- `~/.mooter/consent.json` — schema (W3 D2)
- `~/.mooter/.secret` (ou similar) — local HMAC secret
- `tools/router/safety_boost.js` (W3 D1) — fonte de `safety_boost_reasons`

## 3. Sub-feature 1 — `mooter_sync_event` schema v1

### 3.1 Schema canónico

`packages/cli/src/sync/sync_event_schema.ts` (NEW):

```typescript
export interface MooterSyncEventV1 {
  schema_version: 1;
  event_id: string;          // UUIDv7
  client_id_pseudonymous: string;  // hash(local_secret + install_id), NUNCA real identity
  emitted_at_utc: string;    // ISO 8601
  
  // Categorias (gated por consent.data_categories)
  tier_distribution?: {
    window_start_utc: string;
    window_end_utc: string;
    counts: { T0: number; T1: number; T2: number; T3: number };
    avg_confidence: number;
  };
  
  safety_boost_reasons?: {
    window_start_utc: string;
    window_end_utc: string;
    applied: number;
    total_prompts: number;
    reasons: Record<string, number>;  // e.g., { "critical_phrase_match": 3, "arch_keyword": 9 }
  };
  
  pack_usage?: {
    window_start_utc: string;
    window_end_utc: string;
    pack_ids: string[];        // anonymized: only canonical pack IDs
    counts: Record<string, number>;
  };
  
  hardware_info?: {
    os: 'linux' | 'darwin' | 'windows-wsl';
    gpu_class: 'none' | 'integrated' | 'discrete' | 'high-end';  // ANONIMIZADO (não modelo exacto)
    ram_class: 'low' | 'mid' | 'high';  // <16gb · 16-32gb · >32gb
    ollama_available: boolean;
  };
  
  // NUNCA: prompt_content, file_paths, project names, real IPs, real model strings
  
  signature: {
    algo: 'HMAC-SHA256';
    value: string;  // hex
    signed_payload_hash: string;  // sha256 of payload pre-signature
  };
}

export type MooterSyncEvent = MooterSyncEventV1;
```

### 3.2 Schema versioning

Nova versão (v2 etc.) requer mudança explícita do `schema_version` + handler dedicado no backend. Forward compat por design.

### 3.3 Tests

`packages/cli/tests/sync-event-schema.test.ts`:
- Schema valida com fixture canónica
- `client_id_pseudonymous` NÃO revela `install_id` original
- Schema rejeitada se `prompt_content` aparece em qualquer campo
- Hardware classes anonimizadas (não "RTX 4090" mas "high-end")

## 4. Sub-feature 2 — Sync queue local

### 4.1 Behaviour

Quando user `mooter sync` (com consent) → eventos são CONSTRUÍDOS a partir do `decisions.log` mas escritos para `~/.mooter/sync-queue.jsonl` antes de qualquer envio.

User pode:
- Ver: `mooter sync queue list`
- Inspeccionar 1: `mooter sync queue show <event_id>`
- Apagar: `mooter sync queue clear`

### 4.2 Implementação

`packages/cli/src/sync/sync_queue.ts` (NEW):

```typescript
export async function buildSyncEvents(
  events: DecisionEvent[],
  consent: TelemetryConsent,
  windowStart: Date,
  windowEnd: Date
): Promise<MooterSyncEvent[]> {
  if (!consent.telemetry_enabled) return [];
  
  const syncEvents: MooterSyncEvent[] = [];
  const clientId = await computePseudoId();
  const localSecret = await readLocalSecret();
  
  if (consent.data_categories.tier_distribution) {
    syncEvents.push(buildTierDistributionEvent(events, clientId, windowStart, windowEnd, localSecret));
  }
  
  if (consent.data_categories.safety_boost_reasons) {
    syncEvents.push(buildSafetyBoostEvent(events, clientId, windowStart, windowEnd, localSecret));
  }
  
  // ... pack_usage, hardware_info (todos gated)
  
  return syncEvents;
}

export async function appendToQueue(events: MooterSyncEvent[]): Promise<void> {
  const queuePath = path.join(homedir(), '.mooter', 'sync-queue.jsonl');
  for (const e of events) {
    await fs.appendFile(queuePath, JSON.stringify(e) + '\n');
  }
}

export async function listQueue(): Promise<MooterSyncEvent[]> {
  const queuePath = path.join(homedir(), '.mooter', 'sync-queue.jsonl');
  const content = await fs.readFile(queuePath, 'utf8').catch(() => '');
  return content.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
}

export async function clearQueue(): Promise<void> {
  const queuePath = path.join(homedir(), '.mooter', 'sync-queue.jsonl');
  await fs.unlink(queuePath).catch(() => {});
}
```

### 4.3 Tests

`packages/cli/tests/sync-queue.test.ts`:
- Build queue gated por consent (false → []) 
- Append + list roundtrip
- Clear remove queue
- Hardware info anonimizada (RTX 4090 → "high-end")

## 5. Sub-feature 3 — Dry-run client

### 5.1 Behaviour

`mooter sync --dry-run`:

```
🐮 Mooter sync — DRY RUN (no network)

Consent: ✓ opt-in since 2026-05-30 (signed ✓)
Categories enabled:
  · tier_distribution
  · safety_boost_reasons
  · pack_usage
  · hardware_info

Building sync events from window 2026-05-30T00:00Z → 2026-05-31T18:00Z...
  · tier_distribution: 47 prompts (T0:35 T1:5 T2:5 T3:2)
  · safety_boost_reasons: 4 boosts (critical_phrase:1, arch_kw:3)
  · pack_usage: 3 packs (diagram-systems:12, code-audit:8, animation:3)
  · hardware_info: linux · high-end gpu · high ram

Payload size: 1,234 bytes
Signature: HMAC-SHA256 = 7a9f3...c2e1
Endpoint (target): https://sync.mooter.ai/v1/events (NOT contacted in dry-run)
HTTP method: POST
Headers (mock):
  Content-Type: application/json
  X-Mooter-Schema-Version: 1
  X-Mooter-Client-Id: <pseudo>
  X-Mooter-Signature: <hmac>

Mock response: 202 Accepted (simulated)

✓ Dry-run complete. Audit logged to ~/.mooter/sync-audit.jsonl
ℹ Real sync ships in Wave 4 Phase D (CF Workers backend).
```

### 5.2 Implementação

`packages/cli/src/commands/sync.ts` (NEW):

```typescript
export async function runSync(args: { dryRun?: boolean; list?: boolean; clear?: boolean; show?: string }): Promise<void> {
  if (args.list) return printQueueList();
  if (args.clear) return clearQueueAndConfirm();
  if (args.show) return printQueueEvent(args.show);
  
  // Default: dry-run (real sync = Wave 4)
  if (!args.dryRun) {
    console.log('⚠ Real sync not implemented yet (Wave 4 Phase D). Use --dry-run.');
    process.exit(1);
  }
  
  const consent = await readConsent();
  if (!consent.telemetry_enabled) {
    console.log('✗ Telemetry not opted-in. Run `mooter init` to opt-in.');
    process.exit(1);
  }
  
  const events = await readDecisionEvents();
  const windowStart = startOfDay(yesterday());
  const windowEnd = now();
  
  const syncEvents = await buildSyncEvents(events, consent, windowStart, windowEnd);
  await appendToQueue(syncEvents);
  
  // Dry-run: print + audit log, NO network
  printDryRunReport(syncEvents);
  await logAuditEntry({ kind: 'dry-run', events: syncEvents.length, ok: true });
}
```

### 5.3 Tests

`packages/cli/tests/sync-dry-run.test.ts`:
- Refusa sem consent
- Gera payload de exemplo
- ZERO network calls (mock fetch global → throws if called)
- Audit log escrito

## 6. Sub-feature 4 — Audit log signed

### 6.1 Behaviour

Cada operação sync (mesmo dry-run) escreve em `~/.mooter/sync-audit.jsonl`:

```json
{"ts":"2026-05-31T18:30:00Z","kind":"dry-run","events":4,"bytes_sent":0,"endpoint":"https://sync.mooter.ai/v1/events","signature":"<HMAC>"}
{"ts":"2026-06-01T09:00:00Z","kind":"real-sync","events":4,"bytes_sent":1234,"endpoint":"...","http_status":202,"signature":"<HMAC>"}
```

User pode verificar:
```bash
mooter sync audit list             # mostra últimos 50
mooter sync audit verify           # verifica signatures
```

### 6.2 Tests

`packages/cli/tests/sync-audit.test.ts`:
- Cada operação adiciona uma entry
- Signatures user-verificáveis
- Tamper detection: alterar entry → verify falha

## 7. Sub-feature 5 — Schedule spec

### 7.1 Não arranca cron

Define apenas o spec de cadência em `consent.json` (extend):

```json
{
  "telemetry_enabled": true,
  ...
  "sync_schedule": {
    "cadence": "daily",  // daily · weekly · manual-only
    "time_of_day": "03:00",
    "timezone": "local"
  }
}
```

User altera via `mooter quiet --sync-cadence=manual-only` ou similar.

### 7.2 Spec docs

`docs/strategy/SYNC_SCHEDULE_SPEC.md` (NEW) — descreve quando cron será adicionado (Wave 4 D ou D+1) e como honra a cadence.

### 7.3 Tests

`packages/cli/tests/sync-schedule.test.ts`:
- 3 cadências aceites
- Default `daily` se omisso
- Revoke via flag

## 8. Verification P11 + invariants

```bash
git diff dev tools/router/classify.js                    # VAZIO
git diff dev tools/router/safety_boost.js                 # signatures preserved
grep -rn 'fetch\|http\|axios\|request' packages/cli/src/sync/  # zero hits
```

## 9. Tests aggregate

- Pre-W3 D3: CLI 106 (W3 D2 final)
- W3 D3: +25 (schema 4 + queue 5 + dry-run 6 + audit 6 + schedule 4)
- Total: ~131 CLI verdes

## 10. Final-reviewer T3-gate

```
Task tool, subagent_type: "general-purpose"
Prompt: "Review wave3-day3-sync-stub vs dev.

Verifica:
- classify.js BYTE-IDENTICAL com dev (P11)
- safety_boost.js: critical phrases preserved
- mooter_event.ts schema INTACTO · sync_event é NOVO file
- ZERO network calls (grep fetch/http/axios/request em packages/cli/src/sync/ → 0)
- consent gating absoluto: false → buildSyncEvents retorna []
- hardware_info anonimizada: 'RTX 4090' nunca aparece literal (só 'high-end')
- prompt_content nunca presente em qualquer payload
- HMAC signature user-verificável + tamper detection
- Schedule spec documented mas cron NÃO arrancado
- ~131 tests CLI verdes
- Vocabulário GLOSSARY (Mooter/Moos)
- Sem git add -A, sem --no-verify
- Cost sanity: $0

Reporta: APPROVE | APPROVE_WITH_NOTES | REQUEST_CHANGES com NITs."
```

## 11. PR + auto-merge + tag

```bash
git push -u origin wave3-day3-sync-stub
PR=$(gh pr create --base dev --title "Wave 3 Day 3: Hub Remote Sync Stub (CF Workers contract prep)" --body-file - <<'EOF'
## Summary
5 sub-features que definem o contrato sync sem network calls reais:
- mooter_sync_event schema v1 (versionado, anonimizado)
- Sync queue local (review-able antes de upload)
- Dry-run client (full pipeline sem network)
- Audit log signed (HMAC verificável)
- Schedule spec (define cadência, não arranca cron)

## Invariants
- classify.js byte-identical (P11) ✓
- safety_boost.js critical phrases preserved ✓
- mooter_event schema INTACTO ✓
- ZERO network calls ✓ (grep verified)

## Honesty
- "Real sync = Wave 4 Phase D" explícito em CLI
- Hardware info anonimizada (RTX 4090 → "high-end" class)
- Signature HMAC user-verificável + tamper detection
- Dry-run claramente sinalizado (não trickery)

## Tests
- CLI: 106 → ~131 (+25)
- Zero network calls (mock fetch throws)
- Sanity cost: $0

## Reviewer
final-reviewer: <APPROVE | APPROVE_WITH_NOTES>

## Próximo: Wave 3 D4 OR Wave 4 transition
- D4 (optional): onboarding refinement / quick-wins
- Wave 4 Phase B/C/D: auth + dashboard cloud + CF Workers backend
EOF
)
PR_NUM=$(echo "$PR" | grep -oP '\d+$')

sleep 30
gh pr merge $PR_NUM --squash --delete-branch
```

## 12. Closure D3

```bash
git checkout dev && git pull origin dev
npm test && npm run lint && npm run typecheck

# Smoke
mooter sync --dry-run   # se consent existir
mooter sync queue list
mooter sync audit list

# Tag
git tag -a v0.3.2-sync-stub -m "Wave 3 D3: Hub Remote Sync Stub (schema v1 + queue + dry-run + audit log + schedule spec) — zero network, CF Workers contract prep"
git push origin v0.3.2-sync-stub
```

+ Notion sub-page + SYNC.md + memória `project_mooter_wave3_d3_shipped.md`.

## 13. Resumo final

```
✅ Wave 3 Day 3 — Hub Remote Sync Stub COMPLETA
- Branch: wave3-day3-sync-stub (merged)
- 5 sub-features: schema v1 · queue · dry-run · audit log · schedule spec
- Tests: ~131 CLI verdes
- Tag: v0.3.2-sync-stub
- P11 + safety_boost + mooter_event invariants: ✅
- ZERO network calls verificadas (grep + mock fetch)
- Wave 4 Phase D contract: ready

⏸ Para. Próximo passo precisa novo kickoff: Wave 3 D4 (quick-wins) OU Wave 4 transition (CF Workers backend real).
```

=== END ===
