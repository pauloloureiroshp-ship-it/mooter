# Wave 2.6 Day 3 — Kickoff master prompt (Moo card + glyphs + evolution + closure)

> **Como usar**: cola tudo abaixo de `=== START ===` no Claude Code dentro de `~/mooter/`. Self-contained.

**Pré-requisitos verificados**:
- ✅ Day 2 W2.6 merged em `dev` (statusline 2-line + `mooter dashboard` TUI)
- ✅ Day 1 W2.6 GLOSSARY.md publicado (Mooter/Moos canonical)
- ✅ Stop hook docs lidos: [Claude Code hooks](https://code.claude.com/docs/en/hooks)

---

=== START ===

## 0. Quem és e o que vais fazer

És Claude Code no `~/mooter/`, branch `wave2.6-day3-moo-card-evolution` (a criar a partir de `dev`). `--permission-mode auto`.

**Missão Day 3 (último W2.6)**: shippar 4 sub-features + closure num único PR:

1. **Moo card per-turn** via Stop hook — resumo visual ao fim de cada turn
2. **Glyph map centralizado** em `tools/router/glyphs.js` — aplicado em 4 sítios
3. **Telemetria evolution** — `mooter trail --evolution` + statusline view C rotativa
4. **`mooter quiet --moo-card`** toggle persistido

**Closure Wave 2.6**: tag `v0.2.2-reveal` + Notion + SYNC + memória.

Lê `docs/strategy/WAVE2_6_PLAN.md §3` para spec completo. Lê `docs/strategy/GLOSSARY.md` para vocabulário.

## 1. Invariantes (não-negociáveis)

- ❌ **Nunca tocar `classify.js`** (P11)
- ❌ **Nunca `git add -A`** · commits selectivos
- ❌ **Nunca merge directo para `main`** · sempre PR para `dev`
- ❌ **Nunca `--no-verify`**
- ❌ **NÃO tocar** Day 1+2 W2.6 (rebrand + statusline) — só extender
- ❌ **NÃO tocar** schema `mooter_event.ts` (W2 D4)
- ❌ **NÃO inventar** LoRA — declarar "baseline · LoRA in Wave 5"
- ✅ **Final-reviewer T3-gate** obrigatório
- ✅ **Sanity cost $1 BLOCKER**
- ✅ **Tag `v0.2.2-reveal`** SE all 3 days verdes
- ✅ **Vocabulário GLOSSARY**: Mooter, Moos, "to pastor"

## 2. Branch + recon

```bash
cd ~/mooter
git checkout dev
git pull origin dev
git log --oneline -5  # confirma squash Day 2 W2.6 no topo
git checkout -b wave2.6-day3-moo-card-evolution
```

Recon:
- `tools/router/inject_context.js` (Day 3 W2.5) — onde usa o badge actual
- `tools/router/statusline-multi.js` (Day 2 W2.6) — view rotation A/B existente
- `~/.claude/settings.json` — onde wirar Stop hook
- `packages/cli/src/commands/trail.ts` (Day 4 W2.5) — extender com `--evolution`
- `packages/cli/src/commands/quiet.ts` (Day 3 W2.5) — adicionar `--moo-card`
- `~/.mooter/preferences.json` — schema actual

## 3. Sub-feature 1 — Moo card per-turn (Stop hook)

### 3.1 Wiring

`~/.claude/settings.json` adicionar:
```json
{
  "hooks": {
    "Stop": [
      { "matcher": "*", "command": "node $HOME/.claude/tools/router/stop_hook.js" }
    ]
  }
}
```

(Mantém UserPromptSubmit hook existente do `inject_context.js`.)

### 3.2 Stop hook implementação

**Ficheiro**: `tools/router/stop_hook.js` (NEW)

```javascript
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');

(async () => {
  try {
    // Read stdin JSON from Claude Code (session_id, transcript_path, model, etc.)
    const stdinJson = await readStdin();
    const session = JSON.parse(stdinJson || '{}');
    const sessionId = session.session_id || process.env.CLAUDE_SESSION_ID;

    // Check user preference
    const prefs = readPrefs();
    if (prefs.moo_card_disabled) {
      process.exit(0);  // silent skip
    }

    // Aggregate this turn's stats from decisions.log
    const turnStats = aggregateLastTurn(sessionId);
    if (!turnStats) {
      process.exit(0);  // nothing to report
    }

    // Build Moo card
    const card = buildMooCard(turnStats);
    process.stdout.write(card);
    process.exit(0);
  } catch (err) {
    // Hooks must never throw — degrade silently
    process.exit(0);
  }
})();

function buildMooCard(s) {
  const glyph = require('./glyphs.js').glyphFor(s);
  const lines = [
    '',
    '─────── 🐮 Moo card ───────',
    ` model     ${glyph} ${s.model} (${s.tier})`,
    ` tokens    in ${fmt(s.tokensIn)} · out ${fmt(s.tokensOut)}`,
    ` latency   ${s.latencyS}s`,
    ` cost      $${fmt4(s.costTurn)} turn · saved $${fmt4(s.savedTurn)} vs T3-default`,
    ` bash      ${s.bashCount} calls (${s.bashBreakdown})`,
    ` ctx       ${s.ctxPct}% used`,
    '───────────────────────────',
    ''
  ];
  return lines.join('\n');
}

function readPrefs() {
  try {
    return JSON.parse(fs.readFileSync(path.join(os.homedir(), '.mooter/preferences.json'), 'utf8'));
  } catch {
    return {};
  }
}

function aggregateLastTurn(sessionId) {
  // Read decisions.log, filter by session_id, find events since last Stop event
  // Return null if zero events this turn
  // ... implementation based on existing event schema
}

function readStdin() {
  return new Promise((res) => {
    let buf = '';
    process.stdin.on('data', (c) => { buf += c.toString(); });
    process.stdin.on('end', () => res(buf));
    setTimeout(() => res(buf), 200);  // non-blocking timeout for non-TTY
  });
}

function fmt(n) { return n >= 1000 ? `${(n/1000).toFixed(1)}k` : String(n); }
function fmt4(n) { return n.toFixed(4); }
```

### 3.3 Tests

`tools/router/tests/stop-hook.test.js` (NEW):
```javascript
test('buildMooCard renders all fields', () => {
  const stats = { glyph: '🐂', model: 'sonnet', tier: 'T2', tokensIn: 1200, tokensOut: 384, latencyS: 1.8, costTurn: 0.012, savedTurn: 0.034, bashCount: 3, bashBreakdown: '🐄×2 · 🐂×1', ctxPct: 24 };
  const card = buildMooCard(stats);
  expect(card).toMatch(/Moo card/);
  expect(card).toMatch(/🐂 sonnet \(T2\)/);
  expect(card).toMatch(/1\.2k.*384/);
  expect(card).toMatch(/\$0\.0120 turn/);
});

test('Stop hook silent when moo_card_disabled', async () => {
  // mock prefs.json with moo_card_disabled: true
  // run hook, assert no stdout
});

test('Stop hook degrades silently on error', async () => {
  // corrupt decisions.log, run hook, assert exit 0 + no stderr leak
});
```

## 4. Sub-feature 2 — Glyph map centralizado

### 4.1 Ficheiro

**`tools/router/glyphs.js` (NEW)**:
```javascript
'use strict';

const TIER_GLYPHS = {
  T0: '🐄',
  T0_heavy: '🐃',
  T1: '🐎',
  T2: '🐂',
  T3: '🦬',
};

const PROVIDER_GLYPHS = {
  local: '🏠',
  cloud: '☁',
  max: '⚡',
};

const MOOD_GLYPHS = {
  healthy: '🐮',
  warning: '🐂',
  critical: '🚨',
  setup: '🛠',
  degraded: '⚪',
};

function glyphFor({ tier, modelSize, provider }) {
  let tierKey = tier;
  if (tier === 'T0' && modelSize === 'large') tierKey = 'T0_heavy';
  const tierG = TIER_GLYPHS[tierKey] || '🐮';
  const provG = PROVIDER_GLYPHS[provider] || '';
  return provG ? `${tierG} ${provG}` : tierG;
}

function moodGlyph(mood) {
  return MOOD_GLYPHS[mood] || MOOD_GLYPHS.healthy;
}

module.exports = { TIER_GLYPHS, PROVIDER_GLYPHS, MOOD_GLYPHS, glyphFor, moodGlyph };
```

### 4.2 Aplicar em 4 sítios

1. **Badge** em `tools/router/inject_context.js`:
   - Antes: `[T2·sonnet·0.84]`
   - Depois: `[${glyphFor({tier, modelSize, provider})} ${model} ${confidence}]` → `[🐂 ☁ sonnet 0.84]`

2. **Statusline line 2** em `tools/router/statusline-multi.js`:
   - Onde usa `state.modelGlyph` (placeholder Day 2) → substituir por `glyphFor(...)` real

3. **Moo card** em `tools/router/stop_hook.js`:
   - Já usa `require('./glyphs.js').glyphFor` (ver §3.2)

4. **Dashboard MOOS ACTIVE** em `packages/cli/src/commands/dashboard.ts`:
   - Cada moo → `${glyphFor(moo)} ${moo.name}`

### 4.3 Tests

`tools/router/tests/glyphs.test.js` (NEW):
```javascript
const { glyphFor, moodGlyph, TIER_GLYPHS } = require('../glyphs.js');

test('glyphFor returns correct glyph for each tier', () => {
  expect(glyphFor({ tier: 'T0', provider: 'local' })).toBe('🐄 🏠');
  expect(glyphFor({ tier: 'T0', modelSize: 'large', provider: 'local' })).toBe('🐃 🏠');
  expect(glyphFor({ tier: 'T2', provider: 'cloud' })).toBe('🐂 ☁');
  expect(glyphFor({ tier: 'T3', provider: 'max' })).toBe('🦬 ⚡');
});

test('glyphFor fallback to 🐮 for unknown tier', () => {
  expect(glyphFor({ tier: 'T99', provider: 'local' })).toBe('🐮 🏠');
});

test('moodGlyph maps moods', () => {
  expect(moodGlyph('healthy')).toBe('🐮');
  expect(moodGlyph('critical')).toBe('🚨');
  expect(moodGlyph(null)).toBe('🐮');
});
```

## 5. Sub-feature 3 — Telemetria evolution

### 5.1 `mooter trail --evolution`

**Ficheiro**: `packages/cli/src/commands/trail.ts` — extender com flag

```typescript
export async function runTrail(args: { sessionId?: string; json?: boolean; evolution?: boolean }) {
  if (args.evolution) {
    return printEvolution();
  }
  // ... existing implementation
}

function printEvolution() {
  const events = loadAllEvents();
  const now = Date.now();
  const week = 7 * 24 * 3600 * 1000;
  
  const last7 = events.filter(e => e.ts >= now - week);
  const prev7 = events.filter(e => e.ts >= now - 2*week && e.ts < now - week);
  
  const sav = (evs: any[]) => evs.reduce((s, e) => s + (e.saved_micros || 0), 0) / 1e6;
  const cost = (evs: any[]) => evs.reduce((s, e) => s + (e.cost_actual_micros || 0), 0) / 1e6;
  
  const sav7 = sav(last7);
  const savPrev7 = sav(prev7);
  const evolPct = savPrev7 > 0 ? ((sav7 - savPrev7) / savPrev7) * 100 : 0;
  
  const out = [
    '',
    'EVOLUTION (vs previous 7-day window)',
    `  savings:        $${savPrev7.toFixed(2)} → $${sav7.toFixed(2)}   (${evolPct >= 0 ? '+' : ''}${evolPct.toFixed(1)}%)`,
    `  prompts:        ${prev7.length}   → ${last7.length}   (${((last7.length - prev7.length) / Math.max(prev7.length, 1) * 100).toFixed(1)}%)`,
    `  avg cost/prompt: $${(cost(prev7) / Math.max(prev7.length, 1)).toFixed(4)} → $${(cost(last7) / Math.max(last7.length, 1)).toFixed(4)}`,
    '',
    'OPTIMIZATIONS APPLIED',
    '  quantization: Q4_K_M (baseline since 2026-04-15)',
    '  LoRA: ◌ none yet (Adapter Forge ships Wave 5)',
    '',
    'PROJECTED (next 7-day at current rate)',
    `  estimated savings: $${sav7.toFixed(2)}-${(sav7 * 1.05).toFixed(2)}`,
    ''
  ];
  console.log(out.join('\n'));
}
```

### 5.2 Statusline view rotativa C

**Ficheiro**: `tools/router/statusline-multi.js` (Day 2 W2.6 já tem rotation A/B)

Adicionar view C:
```javascript
function viewC(state, evolution) {
  return [
    `${state.glyph} Mooter`,
    `evolution: ${evolution.pct >= 0 ? '+' : ''}${evolution.pct}% vs last week`,
    `this week: $${evolution.thisWeek.toFixed(2)} saved`,
    `${evolution.prompts} prompts`
  ].join(' · ');
}

function pickView(tickCount) {
  // Cycle A → B → C → A
  return ['A', 'B', 'C'][Math.floor(tickCount / 5) % 3];
}
```

### 5.3 CLI wiring

`packages/cli/src/cli.ts`:
```typescript
.command('trail')
.option('--evolution', 'Show 7d vs prev 7d comparison')
.action((opts) => runTrail({ ...opts, evolution: opts.evolution }));
```

### 5.4 Tests

Adicionar a `packages/cli/tests/trail.test.ts`:
```typescript
test('trail --evolution computes 7d vs prev 7d correctly', () => {
  // mock events spread across 14 days
  // assert evolution.pct correct
});

test('trail --evolution declares LoRA honestly (no fake)', () => {
  const out = captureStdout(() => runTrail({ evolution: true }));
  expect(out).toMatch(/LoRA: ◌ none yet/);
  expect(out).toMatch(/Adapter Forge ships Wave 5/);
});
```

`tools/router/tests/statusline-view-c.test.js` (NEW):
```javascript
test('pickView cycles A → B → C every 5 ticks', () => {
  expect(pickView(0)).toBe('A');
  expect(pickView(5)).toBe('B');
  expect(pickView(10)).toBe('C');
  expect(pickView(15)).toBe('A');
});
```

## 6. Sub-feature 4 — `mooter quiet --moo-card`

**Ficheiro**: `packages/cli/src/commands/quiet.ts` (Day 3 W2.5) — extender

```typescript
export async function runQuiet(args: { off?: boolean; mooCard?: boolean; mooCardOff?: boolean }) {
  const prefsPath = join(homedir(), '.mooter/preferences.json');
  let prefs: any = {};
  try { prefs = JSON.parse(await readFile(prefsPath, 'utf8')); } catch {}

  if (args.mooCard !== undefined || args.mooCardOff !== undefined) {
    prefs.moo_card_disabled = args.mooCard === false || args.mooCardOff === true;
    await writeFile(prefsPath, JSON.stringify(prefs, null, 2));
    console.log(prefs.moo_card_disabled
      ? '✓ Moo card disabled. Run `mooter quiet --moo-card` to re-enable.'
      : '✓ Moo card enabled.');
    return;
  }

  // ... existing badge toggle logic
}
```

CLI wiring:
```typescript
.command('quiet')
.option('--off', 'Re-enable badges')
.option('--moo-card', 'Re-enable Moo card')
.option('--moo-card-off', 'Disable Moo card')
.action((opts) => runQuiet(opts));
```

## 7. Closure Wave 2.6

### 7.1 Gate verification (POST-merge)

```bash
cd ~/mooter
git checkout dev
git pull origin dev
npm test
npm run lint
npm run typecheck

# Manual smoke
mooter init --help
mooter quiet --help
mooter trail --evolution
mooter dashboard  # quit with q
```

Se tudo verde → tag.

### 7.2 Tag

```bash
git tag -a v0.2.2-reveal -m "Wave 2.6: rebrand Mooter+Moos · statusline 2-line + dashboard · Moo card + glyphs + evolution"
git push origin v0.2.2-reveal
```

### 7.3 Notion closure page

Title: `🐮 Wave 2.6 CLOSURE — v0.2.2-reveal (YYYY-MM-DD)`

Conteúdo:
- 3 Days shipped (D1 rebrand · D2 statusline+dashboard · D3 Moo card+glyphs+evolution)
- PR list (#X, #Y, #Z)
- Tests aggregate
- Decisões arquitecturais
- Gate verdict para Wave 3: GO

### 7.4 SYNC.md final

- `## Estado Actual` → Wave 2.6 ✅ shipped, tag `v0.2.2-reveal`
- `📥 COWORK → CLAUDE CODE` → next: Cowork compor WAVE3_D1_KICKOFF.md

### 7.5 Memória persistente

`project_mooter_wave2_6_shipped.md`:
- Data: 2026-06-02 (ou final real)
- Tag: v0.2.2-reveal
- Days shipped: 3
- Wave 3 (activation+hub) unblocked

## 8. Tests aggregate Wave 2.6 final

| Source | Tests |
|---|---|
| Pre-W2.6 (W2.5 closure) | ~101 |
| W2.6 D1 (rebrand) | +0 (textual) |
| W2.6 D2 (statusline + dashboard) | +12 |
| W2.6 D3 (Moo card + glyphs + evolution + quiet) | +14 |
| **Total** | **~127** |

## 9. Final-reviewer pre-PR

```
Task tool, subagent_type: "general-purpose"

Prompt: "Review branch wave2.6-day3-moo-card-evolution vs dev.

Verifica:
- classify.js byte-identical (P11)
- Day 1+2 W2.6 INTACTOS (rebrand · statusline · dashboard)
- Stop hook (`stop_hook.js`): silent fail on error, respects prefs.moo_card_disabled, never throws
- Glyph map (`glyphs.js`): centralizado, aplicado em 4 sítios (badge · statusline · Moo card · dashboard)
- LoRA honestidade: declarado 'none yet · Adapter Forge ships Wave 5', NÃO inventado
- Vocabulário GLOSSARY: Mooter, Moos, 'to pastor' — coerente
- `mooter quiet --moo-card[-off]` preserva outras prefs
- `mooter trail --evolution`: 7d vs prev 7d formula correcta
- Statusline view C: rotação A→B→C cada 5 ticks
- ~127 tests verdes
- Sem git add -A, sem --no-verify
- Cost sanity: $0

Reporta: APPROVE | APPROVE_WITH_NOTES | REQUEST_CHANGES com NITs."
```

## 10. PR

```bash
git push -u origin wave2.6-day3-moo-card-evolution
gh pr create --base dev --title "Wave 2.6 Day 3: Moo card + glyphs + evolution + closure prep" --body-file - <<'EOF'
## Summary
4 sub-features Wave 2.6 Day 3 + closure prep:

1. **Moo card per-turn** — Stop hook imprime resumo visual ao fim de cada turn
2. **Glyph map centralizado** — `tools/router/glyphs.js` aplicado em badge · statusline · Moo card · dashboard
3. **Telemetria evolution** — `mooter trail --evolution` (7d vs prev 7d) + statusline view C rotativa
4. **`mooter quiet --moo-card[-off]`** toggle persistido

## Changes
- `tools/router/stop_hook.js`: NEW (Stop hook with silent fail)
- `~/.claude/settings.json`: wire Stop hook
- `tools/router/glyphs.js`: NEW (centralized glyph map)
- `tools/router/inject_context.js`: use glyphs.glyphFor
- `tools/router/statusline-multi.js`: use glyphs + view C rotation
- `packages/cli/src/commands/dashboard.ts`: use glyphs
- `packages/cli/src/commands/trail.ts`: --evolution flag
- `packages/cli/src/commands/quiet.ts`: --moo-card[-off] flags
- Tests: +14 (stop-hook, glyphs, trail-evolution, statusline-view-c)

## Tests
- Pre-W2.6: 101 · D2: +12 · D3: +14 · **Total: ~127** verdes
- Sanity cost: $0

## Honesty
- LoRA explicitly declared "◌ none yet (Adapter Forge ships Wave 5)" — NO fake telemetry
- Quantization "Q4_K_M (baseline since 2026-04-15)" — verifiable claim

## Closure protocol (post-merge)
1. Tag v0.2.2-reveal on dev
2. Notion closure page
3. SYNC.md final
4. Memory update (project_mooter_wave2_6_shipped.md)

## Reviewer
final-reviewer: <APPROVE | APPROVE_WITH_NOTES>
EOF
```

## 11. POST-merge actions (executar quando Paulo confirmar merge)

```bash
git checkout dev
git pull origin dev
git tag -a v0.2.2-reveal -m "Wave 2.6: rebrand Mooter+Moos · statusline 2-line + dashboard · Moo card + glyphs + evolution"
git push origin v0.2.2-reveal

# Notion closure + SYNC.md + memória (com Notion MCP)
```

## 12. Resumo final na chat

```
✅ Wave 2.6 Day 3 + CLOSURE
- Branch: wave2.6-day3-moo-card-evolution (pushed)
- PR: #<N> (link) → dev
- 4 sub-features: Stop hook Moo card · glyph map central · evolution telemetria · quiet --moo-card
- Tests Wave 2.6 total: ~127 pass
- Reviewer: <verdict>
- Cost sanity Wave 2.6: $0

POST-MERGE pendente:
- Tag v0.2.2-reveal
- Notion closure page
- SYNC.md final
- Memória project_mooter_wave2_6_shipped

🎉 Wave 2.6 CONCLUÍDA — Wave 3 (activation + hub) unblocked.
Aguarda Cowork compor WAVE3_D1_KICKOFF.md.
```

=== END ===
