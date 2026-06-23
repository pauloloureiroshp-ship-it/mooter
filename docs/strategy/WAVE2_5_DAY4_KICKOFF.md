# Wave 2.5 Day 4 — Kickoff master prompt (Confidence trail + e2e + closure)

> **Como usar**: cola tudo abaixo de `=== START ===` no Claude Code dentro de `~/mooter/`. Self-contained.

**Pré-requisitos verificados**:
- ✅ PR Day 3 Wave 2.5 merged em `dev` (badge · tier mix · quiet)
- ✅ Days 1-3 Wave 2.5 fechados (statusline · wizard · attribution)
- ✅ packages/cli + tools/router maduros

---

=== START ===

## 0. Quem és e o que vais fazer

És Claude Code no `~/mooter/`, branch `wave2.5-day4-closure` (a criar a partir de `dev`). `--permission-mode auto`.

**Missão Day 4**: shippar 3 sub-features + closure num único PR:

1. **Provenance trail** — cada número da statusline traceable (formula + source events)
2. **E2E smoke test** — fresh install → init → 10 prompts → statusline correcto → per-session isolation
3. **Wave 2.5 closure** — tag `v0.2.1-polish` se all green, Notion closure page, SYNC.md final, memória actualizada

**Esta é a Day GATE para Wave 3.** Se não verde → repair sprint antes de Wave 3 arrancar.

## 1. Invariantes (não-negociáveis)

- ❌ **Nunca tocar `classify.js`** (P11)
- ❌ **Nunca `git add -A`** · commits selectivos
- ❌ **Nunca merge directo para `main`** · sempre PR para `dev`
- ❌ **Nunca `--no-verify`**
- ❌ **NÃO tocar** Days 1-3 já merged (statusline-multi.js, inject_context.js, init.ts, quiet.ts) — apenas extender com novos campos se necessário
- ❌ **NÃO commitar** `docs/strategy/PASTOR.md`
- ❌ **NÃO commitar** docs/strategy untracked
- ✅ **Final-reviewer T3-gate** antes do PR
- ✅ **Sanity cost $1 BLOCKER**
- ✅ **Notion closure page** + SYNC.md final
- ✅ Tag `v0.2.1-polish` SE all 4 days verdes

## 2. Branch + recon

```bash
cd ~/mooter
git checkout dev
git pull origin dev
git log --oneline -5  # confirma squashes Days 1+2+3 no topo
git checkout -b wave2.5-day4-closure
```

Recon completo (lê os 4 ficheiros antes de tocar):
- `tools/router/statusline-multi.js` (Day 1+3) — onde adicionar `--trail` flag
- `tools/router/inject_context.js` (Day 1+3) — já tem session_id tracking
- `packages/cli/src/commands/init.ts` (Day 6 W2 + Day 2 W2.5) — fresh install path
- `packages/router/src/event_writer.ts` (Wave 2 D4) — event format reference

## 3. Sub-feature 1 — Provenance trail

### 3.1 Behaviour

Comando: `mooter trail` (NEW) → imprime cada número da statusline + formula + source event IDs.

Output:
```
🐮 mooter — provenance trail (session 01939...)

saved $0.27         = sum(baseline_cost - actual_cost) over 12 events
                      events: 01939abc, 01939def, ... (12 IDs)
                      formula: SUM(event.cost_baseline_micros - event.cost_actual_micros) / 1e6

89% saved           = saved / baseline_cost
                      baseline_total: $0.30
                      formula: saved / baseline_cost * 100

T2 sonnet 0.84      = last event (01939xyz)
                      tier: classify.js output
                      model: anthropic.claude-sonnet-4-6
                      confidence: regex(0.4) + embed(0.6) + bonus(0.1) = 0.84

ctx 23%             = session.context.percent_used (stdin Claude Code JSON)

100% 5h             = quota_state.remaining_5h / quota_state.limit_5h
                      source: quota-state.json
                      last refresh: 2026-06-03T15:42:01Z

turn $0.04          = last event cost_actual_micros / 1e6
                      event: 01939xyz (most recent in session)

alltime $4.21       = sum all session events cost_actual_micros / 1e6

last10 distribution = T0:6 T1:2 T2:2 T3:0 (last 10 events this session)
```

### 3.2 Implementação

`packages/cli/src/commands/trail.ts` (NEW):
```typescript
export async function runTrail(args: { sessionId?: string; json?: boolean }): Promise<void> {
  const sessionId = args.sessionId ?? process.env.CLAUDE_SESSION_ID;
  const events = await loadEventsForSession(sessionId);
  const quota = await loadQuotaState();
  
  const trail = {
    session_id: sessionId,
    saved: {
      value_usd: sumSaved(events) / 1e6,
      formula: 'SUM(cost_baseline_micros - cost_actual_micros) / 1e6',
      event_ids: events.map(e => e.event_id),
      count: events.length
    },
    saved_pct: {
      value: pctSaved(events),
      formula: 'saved / baseline_cost * 100'
    },
    last_decision: lastEventDigest(events),
    ctx: { value_pct: '<from stdin>', source: 'session.context.percent_used' },
    quota_5h: { value_pct: quota.remaining_5h / quota.limit_5h * 100, source: 'quota-state.json', last_refresh: quota.refreshed_at },
    turn: { value_usd: lastEvent(events).cost_actual_micros / 1e6, event_id: lastEvent(events).event_id },
    alltime: { value_usd: sumAllActual(events) / 1e6 },
    tier_mix: tierMixLast10(events)
  };
  
  if (args.json) {
    console.log(JSON.stringify(trail, null, 2));
  } else {
    printTrailHuman(trail);
  }
}
```

CLI wire em `cli.ts`:
```typescript
.command('trail')
.description('Show provenance of every statusline number')
.option('--session-id <id>', 'Specific session id')
.option('--json', 'Machine-readable output')
.action((opts) => runTrail(opts));
```

### 3.3 Test

`packages/cli/tests/trail.test.ts` (NEW):
```typescript
test('trail computes saved correctly from mock events', async () => {
  // 3 events with baseline 100/200/100 micros and actual 30/50/40
  // assert saved.value_usd === (100+200+100 - 30-50-40) / 1e6 === 0.00028
});

test('trail --json outputs valid JSON with all fields', async () => {
  const out = captureStdout(() => runTrail({ json: true }));
  const parsed = JSON.parse(out);
  expect(parsed).toHaveProperty('saved');
  expect(parsed).toHaveProperty('tier_mix');
});

test('trail uses session_id from env when not passed', async () => {
  process.env.CLAUDE_SESSION_ID = 'test-session';
  // assert events filtered by session-id
});
```

## 4. Sub-feature 2 — E2E smoke test

### 4.1 Sequência

`packages/router/tests/e2e-fresh-install.test.ts` (NEW):

```typescript
test('fresh install → init → 10 prompts → statusline correct', async () => {
  // Setup: temp dir as HOME
  const tempHome = await mkdtemp(join(tmpdir(), 'mooter-e2e-'));
  process.env.HOME = tempHome;
  
  // Step 1: confirm fresh state
  expect(existsSync(join(tempHome, '.mooter'))).toBe(false);
  
  // Step 2: run mooter init with mock IO
  const mockIO = scriptedIO([
    'y',           // confirm Anthropic
    'max',         // tier
    '',            // accept default Ollama URL
    'y', 'n',      // pack selections (mock 2)
    'y'            // confirm install
  ]);
  await runInit({ io: mockIO, probeHardware: mockProbe, validateAnthropic: mockValidate });
  
  // Step 3: verify schemas written
  expect(existsSync(join(tempHome, '.mooter/profile.json'))).toBe(true);
  expect(existsSync(join(tempHome, '.mooter/credentials.json'))).toBe(true);
  expect(existsSync(join(tempHome, '.mooter/consent.json'))).toBe(true);
  
  // Step 4: inject 10 synthetic prompts
  for (let i = 0; i < 10; i++) {
    await runInjectContext({
      prompt: `test prompt ${i}`,
      session_id: 'e2e-session-1',
      classify: mockClassify(i % 4)  // mix of T0-T3
    });
  }
  
  // Step 5: verify decisions.log has 10 events
  const events = await loadEvents();
  expect(events.filter(e => e.session_id === 'e2e-session-1')).toHaveLength(10);
  
  // Step 6: render statusline, verify content
  const line = await renderStatusline({ session_id: 'e2e-session-1' });
  expect(line).toMatch(/🐮/);
  expect(line).toMatch(/saved \$/);
  expect(line).toMatch(/T[0-3]/);
  
  // Step 7: per-session isolation — new session = $0 saved
  const lineNewSession = await renderStatusline({ session_id: 'e2e-session-2' });
  expect(lineNewSession).toMatch(/saved \$0\.00/);
});
```

### 4.2 Mocks

- `mockProbe`: returns hardware profile with Ollama available
- `mockValidate`: returns `{ valid: true, tier_detected: 'max', budget_5h_limit: 1000 }`
- `mockClassify(i)`: returns `{ tier: 'T'+i, model: ..., confidence: 0.85 }`

Zero real API calls. Zero real Ollama calls.

### 4.3 Run

```bash
cd ~/mooter
npm test -- e2e-fresh-install
```

Espera-se: 1 test passing, <30s execution.

## 5. Sub-feature 3 — Wave 2.5 closure

### 5.1 Gate verification

Antes de tag, executar:

```bash
# All tests across packages
cd ~/mooter
npm test  # deve passar tudo

# Lint + typecheck
npm run lint
npm run typecheck

# Verificar Days 1-3 features funcionais via manual smoke
mooter init --help  # Day 2
mooter quiet        # Day 3
mooter trail        # Day 4
```

Se algum falhar → STOP, reportar, não tag.

### 5.2 Tag

```bash
git checkout dev
git pull origin dev
git tag -a v0.2.1-polish -m "Wave 2.5 closure: statusline polish + wizard hardening + attribution + provenance"
git push origin v0.2.1-polish
```

### 5.3 Notion closure page

Title: `🐮 Wave 2.5 CLOSURE — v0.2.1-polish (YYYY-MM-DD)`

Conteúdo:
- Resumo 4 days (Day 1 statusline · Day 2 wizard · Day 3 attribution · Day 4 trail+e2e)
- PR list (4 PRs, hashes)
- Tests aggregate final
- Decisões arquitecturais relevantes
- Gate verdict para Wave 3: GO / NO-GO
- Backlog para Wave 3 (se algo escapou)

### 5.4 SYNC.md final update

- `## Estado actual` → Wave 2.5 ✅ shipped, tag `v0.2.1-polish`
- `📥 COWORK → CLAUDE CODE` → next: aguardar Cowork compor Wave 3 D1 master prompt
- `## Notion HQ` → add link closure page

### 5.5 Memória persistente

Update `~/AppData/.../memory/project_mooter_pastor_wave1_shipped.md` ou criar `project_mooter_pastor_wave2_5_shipped.md`:
- Data: 2026-06-03 (ou final real)
- Tag: v0.2.1-polish
- Days shipped: 4
- Repo público: continua pauloloureiroshp-ship-it/mooter
- Próximo: Wave 3 (activation + hub) aguarda kickoff

## 6. Tests aggregate Wave 2.5 final

| Source | Tests |
|---|---|
| Existing pre-W2.5 | ~58 |
| W2.5 Day 1 | +16 |
| W2.5 Day 2 | +12 |
| W2.5 Day 3 | +10 |
| W2.5 Day 4 | +4 (trail) + 1 (e2e) |
| **Total** | **~101** |

## 7. Final-reviewer pre-PR

```
Task tool, subagent_type: "general-purpose"

Prompt: "Review branch wave2.5-day4-closure vs dev.

Verifica:
- classify.js byte-identical (P11)
- Days 1-3 files INTACTOS (statusline-multi.js, inject_context.js, init.ts, quiet.ts não alterados, só extended se preciso)
- trail.ts: formula correct, session-id env fallback, --json output
- E2E smoke test: zero real API calls, fresh install path verde
- All ~101 tests verdes
- Gate manual: mooter init / quiet / trail funcionais
- Sem git add -A, sem --no-verify
- PASTOR.md NÃO no diff
- docs/strategy untracked NÃO no diff
- Cost sanity: $0 (mocks)

Reporta: APPROVE | APPROVE_WITH_NOTES | REQUEST_CHANGES com NITs."
```

## 8. PR

```bash
git push -u origin wave2.5-day4-closure
gh pr create --base dev --title "Wave 2.5 Day 4: Provenance trail + e2e smoke + closure" --body-file - <<'EOF'
## Summary
3 sub-features Wave 2.5 Day 4 + closure:

1. **Provenance trail** — `mooter trail` mostra formula + source para cada número
2. **E2E smoke test** — fresh install → 10 prompts → statusline + per-session isolation
3. **Wave 2.5 closure** — gate verification + tag preparation (tag aplicado após merge)

## Changes
- `packages/cli/src/commands/trail.ts`: NEW command
- `packages/cli/src/cli.ts`: wire `trail` command
- `packages/router/tests/e2e-fresh-install.test.ts`: NEW e2e
- `packages/cli/tests/trail.test.ts`: NEW unit tests

## Tests aggregate Wave 2.5
- D1: +16 · D2: +12 · D3: +10 · D4: +5
- Total: ~101 tests passing
- Sanity cost Wave 2.5 total: $0 (all mocked)

## Closure protocol (post-merge)
1. Tag `v0.2.1-polish` on dev
2. Notion closure page
3. SYNC.md final
4. Memory update (mooter_pastor_wave2_5_shipped.md)

## Gate verdict
- All Days 1-4 ✅
- Tests: <X/X> pass
- Cross-feature integration verified via e2e
- **Wave 3 unblocked** ✅

## Reviewer
final-reviewer: <APPROVE | APPROVE_WITH_NOTES>
EOF
```

## 9. POST-merge actions (executar quando Paulo confirmar merge)

```bash
git checkout dev
git pull origin dev
git tag -a v0.2.1-polish -m "Wave 2.5: statusline polish + wizard hardening + attribution + provenance trail"
git push origin v0.2.1-polish

# Update SYNC.md + Notion closure (com Notion MCP)
# Update memória persistente
```

## 10. Resumo final na chat

```
✅ Wave 2.5 Day 4 + CLOSURE
- Branch: wave2.5-day4-closure (pushed)
- PR: #<N> (link) → dev
- 3 sub-features: trail · e2e smoke · closure prep
- Tests Wave 2.5 total: ~101 pass
- Reviewer: <verdict>
- Cost sanity Wave 2.5: $0

POST-MERGE pendente:
- Tag v0.2.1-polish
- Notion closure page
- SYNC.md final
- Memória mooter_pastor_wave2_5_shipped

🎉 Wave 2.5 CONCLUÍDA — Wave 3 (activation + hub) unblocked.
Aguarda Cowork compor WAVE3_D1_KICKOFF.md.
```

=== END ===
