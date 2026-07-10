# Wave 2.6 Day 2 — Kickoff master prompt (Statusline 2-line + `mooter dashboard` TUI)

> **Como usar**: cola tudo abaixo de `=== START ===` no Claude Code dentro de `~/mooter/`. Self-contained.

**Pré-requisitos verificados**:
- ✅ Day 1 W2.6 merged em `dev` (rebrand Pastor → Mooter+Moos + GLOSSARY.md)
- ✅ Statusline 1-line existente em `tools/router/statusline-multi.js` (Wave 2.5 D1+D3)
- ✅ `decisions.log`, `quota-state.json`, `/metrics` endpoint funcionais
- ✅ Vocabulário canónico em `docs/strategy/GLOSSARY.md`

---

=== START ===

## 0. Quem és e o que vais fazer

És Claude Code no `~/mooter/`, branch `wave2.6-day2-statusline-rich-dashboard` (a criar a partir de `dev`). `--permission-mode auto`.

**Missão Day 2**: shippar 3 sub-features num único PR para `dev`:

1. **Statusline 2-line** rica (12+ sinais) com truncate-safe fallback 1-line
2. **`mooter dashboard`** comando TUI live (ANSI raw, zero deps)
3. **Snapshot tests** para 2-line + fallback layout

Lê `docs/strategy/WAVE2_6_PLAN.md §2.1-2.4` para spec completo. Lê `docs/strategy/GLOSSARY.md` para vocabulário.

## 1. Invariantes (não-negociáveis)

- ❌ **Nunca tocar `classify.js`** (P11)
- ❌ **Nunca `git add -A`** · commits selectivos
- ❌ **Nunca merge directo para `main`** · sempre PR para `dev`
- ❌ **Nunca `--no-verify`**
- ❌ **NÃO tocar** ficheiros Day 1 W2.6 (rebrand já merged)
- ❌ **NÃO tocar** schema `mooter_event.ts` (W2 D4)
- ❌ **NÃO adicionar deps pesadas** — blessed/ink/chalk/etc OUT. ANSI raw only.
- ❌ **NÃO renomear `statusline-multi.js`** — extender em vez de substituir
- ✅ **Final-reviewer T3-gate** obrigatório
- ✅ **Sanity cost $1 BLOCKER**
- ✅ **Notion sub-page** + SYNC.md
- ✅ **Vocabulário GLOSSARY**: Mooter (entity), Moos (collective), "to pastor" (verb)

## 2. Branch + recon

```bash
cd ~/mooter
git checkout dev
git pull origin dev
git log --oneline -5  # confirma squash Day 1 W2.6 no topo
git checkout -b wave2.6-day2-statusline-rich-dashboard
```

Recon (lê antes de tocar):
- `tools/router/statusline-multi.js` (~400 linhas estimadas) — actual 1-line
- `tools/router/savings-tracker.js` — events aggregation
- `packages/cli/src/cli.ts` — wiring de comandos
- `docs/strategy/WAVE2_6_PLAN.md §2` — spec layout

## 3. Sub-feature 1 — Statusline 2-line

### 3.1 Layout target

**Quando `COLUMNS >= 120`** (default desktop terminal):
```
🐮 Mooter · saved $0.27 (89%) · turn $0.012 · alltime $4.21 · last10: T0×6 T1×2 T2×2
🐂 sonnet ☁ 0.84 · 🏠 qwen3:7b ×6 · ctx 23% · 100% 5h · in 1.2k out 384 · pack: diagram-systems
```

**Quando `COLUMNS < 120`** (mobile/narrow):
```
🐮 saved $0.27 (89%) · 🐂 sonnet 0.84 · ctx 23% · 100% 5h
```

### 3.2 Implementação

**Ficheiro**: `tools/router/statusline-multi.js`

Adicionar:
```javascript
const COLUMNS = parseInt(process.env.COLUMNS || '80', 10);
const TWO_LINE_THRESHOLD = 120;

function renderTwoLine(state) {
  const line1 = [
    `${state.glyph} Mooter`,
    `saved $${fmt(state.saved)} (${state.savedPct}%)`,
    `turn $${fmt(state.turn)}`,
    `alltime $${fmt(state.alltime)}`,
    `last10: ${state.tierMix}`
  ].join(' · ');
  
  const line2 = [
    `${state.modelGlyph} ${state.model} ${state.providerGlyph} ${state.confidence}`,
    `🏠 ${state.localModel} ×${state.localCount}`,
    `ctx ${state.ctxPct}%`,
    `${state.quotaPct}% 5h`,
    `in ${fmt(state.tokensIn)} out ${fmt(state.tokensOut)}`,
    state.pack ? `pack: ${state.pack}` : null
  ].filter(Boolean).join(' · ');
  
  // Newline between lines (Claude Code statusLine supports multi-line in 2026)
  return `${line1}\n${line2}`;
}

function renderOneLineFallback(state) {
  return [
    `${state.glyph} saved $${fmt(state.saved)} (${state.savedPct}%)`,
    `${state.modelGlyph} ${state.model} ${state.confidence}`,
    `ctx ${state.ctxPct}%`,
    `${state.quotaPct}% 5h`
  ].join(' · ');
}

// Entry point
function render(state) {
  return COLUMNS >= TWO_LINE_THRESHOLD ? renderTwoLine(state) : renderOneLineFallback(state);
}
```

### 3.3 ANSI safety

- Cada chip wrap em reset: `\x1b[0m`
- Cores apenas para glyph backgrounds (verde healthy, amarelo warning, vermelho critical)
- Truncate por chip se largura individual > 30 chars (preserva structure mesmo em terminais estreitos)

**Web check**: `cli-truncate` corta linha 1 se exceder width — proteger com `truncateChip(s, max)` helper antes de join.

### 3.4 Compatibilidade Day 1 W2.5 (per-session)

Manter `pickState()` existente + per-session filtering. Não breaking — só change layout de output.

### 3.5 Tests

`tools/router/tests/statusline-two-line.test.js` (NEW):
```javascript
test('renders 2-line when COLUMNS >= 120', () => {
  process.env.COLUMNS = '140';
  const output = render(mockState);
  expect(output.split('\n')).toHaveLength(2);
  expect(output).toMatch(/🐮 Mooter/);
  expect(output).toMatch(/in \d+/);  // line 2 has token meter
});

test('falls back to 1-line when COLUMNS < 120', () => {
  process.env.COLUMNS = '100';
  const output = render(mockState);
  expect(output.split('\n')).toHaveLength(1);
  expect(output).toMatch(/🐮/);
});

test('truncates oversized chip preserving structure', () => {
  const state = { ...mockState, pack: 'very-long-pack-name-that-exceeds-thirty-chars' };
  const output = renderTwoLine(state);
  expect(output).not.toMatch(/very-long-pack-name-that-exceeds/);
});

test('ANSI codes properly reset between chips', () => {
  const output = renderTwoLine(mockStateWithColors);
  // Count \x1b[0m occurrences === chip count
  const resets = (output.match(/\x1b\[0m/g) || []).length;
  expect(resets).toBeGreaterThan(5);
});
```

## 4. Sub-feature 2 — `mooter dashboard` TUI

### 4.1 Comando

**Ficheiro**: `packages/cli/src/commands/dashboard.ts` (NEW)

```typescript
import { readFileSync, watchFile, unwatchFile } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export interface DashboardOptions {
  refreshMs?: number;
  sessionId?: string;
}

export async function runDashboard(opts: DashboardOptions = {}): Promise<void> {
  const refreshMs = opts.refreshMs ?? 1000;
  const sessionId = opts.sessionId ?? process.env.CLAUDE_SESSION_ID;

  // Enter alternate screen + hide cursor (ANSI)
  process.stdout.write('\x1b[?1049h\x1b[?25l');

  let running = true;

  // Cleanup on exit
  const cleanup = () => {
    process.stdout.write('\x1b[?1049l\x1b[?25h');  // restore screen + cursor
    running = false;
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Keypress 'q' to quit, 'r' to refresh
  process.stdin.setRawMode?.(true);
  process.stdin.on('data', (data: Buffer) => {
    const key = data.toString();
    if (key === 'q' || key === '\x03') cleanup();
    if (key === 'r') render();  // force refresh
  });

  const render = () => {
    if (!running) return;
    process.stdout.write('\x1b[H');  // home cursor (top-left, no clear → less flicker)
    process.stdout.write(buildDashboard(sessionId));
  };

  render();
  const interval = setInterval(render, refreshMs);
}

function buildDashboard(sessionId: string | undefined): string {
  const events = loadEventsForSession(sessionId);
  const moos = aggregateMoos(events);
  const savings = computeSavings(events);
  const quota = loadQuotaState();
  const ctxPct = readCtxFromStdin();  // best-effort

  const lines: string[] = [];
  lines.push(boxTop(`🐮 Mooter Dashboard · session ${sessionId?.slice(0, 8) ?? '—'}`));
  lines.push('');
  lines.push('  MOOS ACTIVE');
  for (const moo of moos) {
    lines.push(`    ${moo.glyph} ${moo.name.padEnd(15)} · ${moo.calls} calls · ${moo.tokens} tokens · ${moo.avgLatency}s avg`);
  }
  lines.push('');
  lines.push('  SAVINGS');
  lines.push(`    Session: $${savings.session.toFixed(2)} saved (${savings.sessionPct}% vs T3-default)`);
  lines.push(`    Today:   $${savings.today.toFixed(2)} saved`);
  lines.push(`    7-day:   $${savings.week.toFixed(2)} saved · evolution: ${savings.evolutionPct > 0 ? '+' : ''}${savings.evolutionPct}% vs prev 7-day`);
  lines.push('');
  lines.push('  CONTEXT');
  lines.push(`    ${progressBar(ctxPct, 20)} ${ctxPct}% used`);
  lines.push('');
  lines.push('  QUOTA');
  lines.push(`    Anthropic 5h: ${progressBar(quota.h5Pct, 20)} ${quota.h5Pct}%`);
  lines.push(`    Anthropic 7d: ${progressBar(quota.d7Pct, 20)} ${quota.d7Pct}%`);
  lines.push('');
  lines.push(`  PACK · ${getCurrentPack() ?? 'none'}`);
  lines.push(`  ADAPTER · ${getCurrentAdapter() ?? '◌ none (baseline · LoRA in Wave 5)'}`);
  lines.push('');
  lines.push('  Press q to exit · r to refresh');
  lines.push(boxBottom());

  return lines.join('\n');
}

function progressBar(pct: number, width: number): string {
  const filled = Math.round((pct / 100) * width);
  return `[${'█'.repeat(filled)}${'░'.repeat(width - filled)}]`;
}

function boxTop(title: string): string {
  const padding = Math.max(0, 60 - title.length - 4);
  return `┌─ ${title} ${'─'.repeat(padding)}┐`;
}

function boxBottom(): string {
  return `└${'─'.repeat(64)}┘`;
}

// Helpers (implement based on existing decisions.log / quota-state.json schemas)
function loadEventsForSession(sessionId?: string) { /* ... */ }
function aggregateMoos(events: any[]) { /* ... */ }
function computeSavings(events: any[]) { /* ... */ }
function loadQuotaState() { /* ... */ }
function readCtxFromStdin() { /* ... */ }
function getCurrentPack(): string | null { /* ... */ }
function getCurrentAdapter(): string | null { /* ... */ }
```

### 4.2 CLI wiring

`packages/cli/src/cli.ts`:
```typescript
.command('dashboard')
.description('Open Mooter dashboard (TUI live)')
.option('--refresh-ms <ms>', 'Refresh rate in milliseconds', '1000')
.option('--session-id <id>', 'Specific session id')
.action((opts) => runDashboard({ refreshMs: parseInt(opts.refreshMs), sessionId: opts.sessionId }));
```

### 4.3 Cleanup robusto

Casos a cobrir:
- Ctrl+C → restore screen + cursor + exit clean
- SIGTERM → same
- `q` keypress → same
- Process exit (any reason) → ensure ANSI restore via `process.on('exit', ...)`

### 4.4 Tests

`packages/cli/tests/dashboard.test.ts` (NEW):
```typescript
test('buildDashboard produces 20+ lines with all sections', () => {
  const out = buildDashboard('test-session');
  const lines = out.split('\n');
  expect(lines.length).toBeGreaterThan(20);
  expect(out).toMatch(/MOOS ACTIVE/);
  expect(out).toMatch(/SAVINGS/);
  expect(out).toMatch(/CONTEXT/);
  expect(out).toMatch(/QUOTA/);
});

test('progressBar fills correctly at boundaries', () => {
  expect(progressBar(0, 10)).toBe('[░░░░░░░░░░]');
  expect(progressBar(100, 10)).toBe('[██████████]');
  expect(progressBar(50, 10)).toBe('[█████░░░░░]');
});

test('runDashboard handles SIGINT cleanly', async () => {
  // Mock stdout, send SIGINT, assert restore sequences emitted
});
```

## 5. Sub-feature 3 — Snapshot tests + integration

`tools/router/tests/statusline-snapshots.test.js` (NEW):
```javascript
test('snapshot: 2-line healthy state at COLUMNS=140', () => {
  process.env.COLUMNS = '140';
  const output = render(healthyState);
  expect(output).toMatchSnapshot();
});

test('snapshot: 2-line warning state at COLUMNS=140', () => {
  process.env.COLUMNS = '140';
  const output = render(warningState);
  expect(output).toMatchSnapshot();
});

test('snapshot: 1-line fallback at COLUMNS=100', () => {
  process.env.COLUMNS = '100';
  const output = render(healthyState);
  expect(output).toMatchSnapshot();
});
```

## 6. Tests aggregate

Após Day 2:
- Pre-W2.6: ~101 tests (W2.5 closure)
- D2 W2.6: +12-15 tests (2-line render, fallback, snapshots, dashboard)
- Total: ~115

## 7. Final-reviewer pre-PR

```
Task tool, subagent_type: "general-purpose"

Prompt: "Review branch wave2.6-day2-statusline-rich-dashboard vs dev.

Verifica:
- classify.js byte-identical com dev (P11)
- statusline-multi.js: 2-line render correct para COLUMNS>=120, fallback 1-line para <120
- ANSI codes: cada chip reset (\\x1b[0m), no bleed
- Truncate-safe: chips > 30 chars cortados (não breaking layout)
- dashboard.ts: alternate screen enter/exit, cursor hide/restore, SIGINT clean
- Sem deps novas pesadas (blessed/ink/chalk OUT)
- Vocabulário GLOSSARY: 'Mooter' (entity), 'Moos' (collective), nenhum 'Pastor' indevido
- Day 1 W2.6 rebrand INTACTO (não tocar)
- mooter_event.ts schema INTACTO
- Per-session isolation preservada (Day 1 W2.5)
- Snapshot tests para 2-line + 1-line fallback verdes
- 115+ tests totais verdes
- Sem git add -A, sem --no-verify
- Cost sanity: $0

Reporta: APPROVE | APPROVE_WITH_NOTES | REQUEST_CHANGES com NITs."
```

## 8. PR

```bash
git push -u origin wave2.6-day2-statusline-rich-dashboard
gh pr create --base dev --title "Wave 2.6 Day 2: Statusline 2-line rich + mooter dashboard TUI" --body-file - <<'EOF'
## Summary
3 sub-features Wave 2.6 Day 2:

1. **Statusline 2-line** — 12+ sinais (saved · turn · alltime · last10 · current model + provider · local Moos · ctx · 5h quota · token meter · pack)
2. **Truncate-safe fallback** — 1-line quando COLUMNS<120
3. **`mooter dashboard`** — TUI live (ANSI raw, zero deps) com MOOS · SAVINGS · CONTEXT · QUOTA · PACK · ADAPTER

## Changes
- `tools/router/statusline-multi.js`: extend with renderTwoLine + renderOneLineFallback
- `packages/cli/src/commands/dashboard.ts`: NEW command (alternate screen, refresh loop, cleanup robust)
- `packages/cli/src/cli.ts`: wire dashboard command
- Tests: ~12 (snapshots 2-line + fallback, dashboard build, progressBar)

## Tests
- Pre-W2.6: 101 · D2: +12 · Total: ~115 verdes
- Sanity cost: $0

## Invariants
- ✅ classify.js byte-identical
- ✅ Day 1 W2.6 rebrand intacto
- ✅ Vocabulário GLOSSARY (Mooter/Moos)
- ✅ Zero deps pesadas (ANSI raw)
- ✅ Per-session isolation preservada

## Out of scope (Day 3 W2.6)
- Moo card per-turn (Stop hook)
- Glyph map por modelo (centralizado)
- Telemetria evolution (--evolution flag)

## Reviewer
final-reviewer: <APPROVE | APPROVE_WITH_NOTES>
EOF
```

## 9. Notion + SYNC

### 9.1 Notion sub-page
Title: `🐮 Sessão YYYY-MM-DD — Wave 2.6 Day 2 (statusline 2-line + dashboard TUI)`

Body: 3 sub-features · screenshots ASCII layouts · reviewer verdict · Day 3 backlog.

### 9.2 SYNC.md
- `## Estado Actual` → Wave 2.6 D2 ✅ shipped
- `📥 COWORK → CLAUDE CODE` → next: Day 3 (Moo card + glyphs + evolution)

## 10. Resumo final na chat

```
✅ Wave 2.6 Day 2 — Statusline rich + dashboard COMPLETO
- Branch: wave2.6-day2-statusline-rich-dashboard (pushed)
- PR: #<N> (link) → dev
- 3 sub-features: 2-line render · 1-line fallback · mooter dashboard TUI
- Tests: ~115 total verdes
- Reviewer: <APPROVE / APPROVE_WITH_NOTES>
- Cost sanity: $0

⏸ Aguardando merge para arrancar Day 3 (Moo card per-turn + glyphs + evolution).
```

=== END ===
