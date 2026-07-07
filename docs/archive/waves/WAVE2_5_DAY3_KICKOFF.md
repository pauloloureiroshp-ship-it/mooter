# Wave 2.5 Day 3 — Kickoff master prompt (Bash command attribution + tier mix breakdown)

> **Como usar**: cola tudo abaixo de `=== START ===` no Claude Code dentro de `~/mooter/`. Self-contained.

**Pré-requisitos verificados**:
- ✅ PR Day 2 Wave 2.5 merged em `dev`
- ✅ Wizard hardening completo (stdin non-TTY · edge cases · idempotency · error format)
- ✅ Statusline 🐮 + per-terminal isolation funcional (Day 1)
- ✅ decisions.log a ser escrito por session_id

---

=== START ===

## 0. Quem és e o que vais fazer

És Claude Code no `~/mooter/`, branch `wave2.5-day3-bash-attribution` (a criar a partir de `dev`). `--permission-mode auto`.

**Missão Day 3**: shippar 3 sub-features num único PR para `dev`:

1. **Bash command tier badge** — cada bash command tem visible `[T2·sonnet]` badge antes/depois do output
2. **Tier mix breakdown na statusline** — `last10: T0:6 T1:2 T2:2 T3:0` no chip rotativo
3. **Preference persistence** — `mooter quiet` desactiva badges via `~/.mooter/preferences.json`

## 1. Invariantes (não-negociáveis)

- ❌ **Nunca tocar `classify.js`** (P11)
- ❌ **Nunca `git add -A`** · commits selectivos
- ❌ **Nunca merge directo para `main`** · sempre PR para `dev`
- ❌ **Nunca `--no-verify`**
- ❌ **NÃO tocar** `packages/cli/src/commands/init.ts` (Day 2 owns, just merged)
- ❌ **NÃO tocar** event schema `mooter_event.ts` (Wave 2 D4)
- ❌ **NÃO commitar** `docs/strategy/PASTOR.md`
- ❌ **NÃO commitar** docs/strategy untracked
- ✅ **Final-reviewer T3-gate** antes do PR
- ✅ **Sanity cost $1 BLOCKER**
- ✅ **Notion sub-page** + SYNC.md update

## 2. Branch + recon

```bash
cd ~/mooter
git checkout dev
git pull origin dev
git log --oneline -3  # confirma squash Day 2 no topo
git checkout -b wave2.5-day3-bash-attribution
```

Recon:
- `tools/router/inject_context.js` — onde se injecta `<router-hint>`. Adicionar badge é extensão natural.
- `tools/router/statusline-multi.js` — onde adicionar tier mix chip
- `~/.mooter/preferences.json` — esquema actual (Day 2 wizard pode tê-lo criado)
- `packages/cli/src/commands/` — adicionar `quiet.ts`

## 3. Sub-feature 1 — Bash command tier badge

### 3.1 Behaviour

Cada vez que Claude Code envia prompt → `inject_context.js` classifica → injecta `<router-hint>`. **Adicionar**: também injectar `<tier-badge>` que Claude Code renderiza visivelmente no início da response.

Formato badge:
```
[T2·sonnet·0.84]
```
- `T2` = tier
- `sonnet` = model recomendado
- `0.84` = confidence

### 3.2 Implementação

**Ficheiro**: `tools/router/inject_context.js`

Adicionar bloco após `<router-hint>`:
```javascript
if (!prefs.quiet && classification.confidence >= 0.6) {
  const badge = `[${tier}·${model}·${confidence.toFixed(2)}]`;
  output += `\n<tier-badge>${badge}</tier-badge>\n`;
}
```

Read prefs:
```javascript
function readPrefs() {
  const path = `${process.env.HOME}/.mooter/preferences.json`;
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch {
    return { quiet: false, badge_position: 'inline' };
  }
}
```

### 3.3 Render no output

Claude Code não renderiza tags arbitrárias. **Truque**: o `<tier-badge>` é apenas marker. O output real é texto puro (Claude Code substitui via CLAUDE.md ou hook downstream). Para Day 3 simples:
- Output puro: `[T2·sonnet·0.84]\n\n` antes do hint
- CLAUDE.md já instrui Claude Code para preservar este prefix em respostas (atualizar se necessário)

**Decisão pragmática**: começar com text-only badge. Se Paulo quiser cor/styling posterior, é Wave 3 D2.

### 3.4 Test

`tools/router/tests/badge-injection.test.js` (NEW):
```javascript
test('badge injected when quiet=false and confidence>=0.6', () => {
  // mock prefs quiet=false, classify returns T2 confidence 0.84
  // assert output contains "[T2·sonnet·0.84]"
});

test('badge NOT injected when quiet=true', () => {
  // mock prefs quiet=true
  // assert output does NOT contain "[T"
});

test('badge NOT injected when confidence<0.6 (low confidence)', () => {
  // mock confidence 0.4
  // assert no badge but hint still injected
});
```

## 4. Sub-feature 2 — Tier mix breakdown na statusline

### 4.1 Behaviour

Statusline adiciona chip rotativo (alterna cada 5 ticks) entre:
- View A (default): `🐮 saved $X (Y%) · T2 sonnet 0.84 · ctx 23% · turn $0.04 · alltime $4.21`
- View B (tier mix): `🐮 saved $X (Y%) · last10: T0:6 T1:2 T2:2 T3:0 · ctx 23%`

### 4.2 Implementação

**Ficheiro**: `tools/router/statusline-multi.js`

Adicionar:
```javascript
function tierMixLast10(events) {
  const last10 = events.slice(-10);
  const counts = { T0: 0, T1: 0, T2: 0, T3: 0 };
  for (const e of last10) {
    if (counts[e.tier] !== undefined) counts[e.tier]++;
  }
  return `last10: T0:${counts.T0} T1:${counts.T1} T2:${counts.T2} T3:${counts.T3}`;
}

function pickView(events, tickCount) {
  // Alternate every 5 ticks (assume statusline called ~once per second)
  return Math.floor(tickCount / 5) % 2 === 0 ? 'A' : 'B';
}
```

Tick count persisted em `/tmp/mooter-statusline-tick-<session_id>` (incrementado a cada call, reset on session change).

### 4.3 Compact mode

Se `COLUMNS < 100`: collapse `turn` e `alltime` (já existe Day 1). Tier mix substitui ambos.

### 4.4 Test

`tools/router/tests/tier-mix.test.js` (NEW):
```javascript
test('tier mix counts last 10 events correctly', () => {
  const events = [
    ...Array(6).fill({ tier: 'T0' }),
    ...Array(2).fill({ tier: 'T1' }),
    ...Array(2).fill({ tier: 'T2' })
  ];
  expect(tierMixLast10(events)).toBe('last10: T0:6 T1:2 T2:2 T3:0');
});

test('pickView alternates every 5 ticks', () => {
  expect(pickView([], 0)).toBe('A');
  expect(pickView([], 4)).toBe('A');
  expect(pickView([], 5)).toBe('B');
  expect(pickView([], 9)).toBe('B');
  expect(pickView([], 10)).toBe('A');
});
```

## 5. Sub-feature 3 — `mooter quiet` command + preferences

### 5.1 Command

**Ficheiro**: `packages/cli/src/commands/quiet.ts` (NEW)

```typescript
export async function runQuiet(args: { off?: boolean; io?: QuietIO }): Promise<void> {
  const io = args.io ?? defaultIO();
  const prefsPath = `${homedir()}/.mooter/preferences.json`;
  
  let prefs: Preferences = { quiet: false };
  try {
    prefs = JSON.parse(await readFile(prefsPath, 'utf8'));
  } catch {
    // file doesn't exist yet, use defaults
  }
  
  prefs.quiet = !args.off;
  await writeFile(prefsPath, JSON.stringify(prefs, null, 2));
  
  io.print(prefs.quiet 
    ? '✓ Badges disabled. Run `mooter quiet --off` to re-enable.'
    : '✓ Badges enabled.');
}
```

### 5.2 CLI wiring

`packages/cli/src/cli.ts` adicionar:
```typescript
.command('quiet')
.description('Toggle bash command tier badges')
.option('--off', 'Re-enable badges')
.action((opts) => runQuiet({ off: opts.off }));
```

### 5.3 Preferences schema

`~/.mooter/preferences.json`:
```json
{
  "quiet": false,
  "badge_position": "inline",
  "statusline_view": "auto"
}
```

Schema simples, extensible. Day 4 confidence trail pode adicionar campos sem breaking.

### 5.4 Test

`packages/cli/tests/quiet.test.ts` (NEW):
```typescript
test('mooter quiet writes preferences.json with quiet=true', async () => {
  // assert prefs.json has quiet:true after runQuiet({})
});

test('mooter quiet --off writes quiet=false', async () => {
  // assert prefs.json has quiet:false after runQuiet({ off: true })
});

test('mooter quiet preserves other prefs fields', async () => {
  // pre-write prefs with badge_position:"end"
  // run mooter quiet
  // assert badge_position still "end"
});
```

## 6. Tests aggregate

Target após Day 3:
- Tests existentes router: ~40 (manter)
- Tests existentes cli: ~37 (post-Day 2)
- Novos Day 3: ~10
- Total: ~85-90

## 7. Final-reviewer pre-PR

```
Task tool, subagent_type: "general-purpose"

Prompt: "Review branch wave2.5-day3-bash-attribution vs dev.

Verifica:
- classify.js byte-identical com dev (P11)
- packages/cli/src/commands/init.ts INTACTO (Day 2 just merged)
- packages/router/src/* INTACTO (Wave 2)
- mooter_event.ts schema INTACTO (Wave 2 D4)
- Badge injection: respeita prefs.quiet + confidence>=0.6 threshold
- Tier mix: counts correct, rotation every 5 ticks
- mooter quiet: writes prefs.json, preserves other fields, --off re-enables
- 85+ tests verdes (existing + new)
- Sem git add -A, sem --no-verify
- PASTOR.md NÃO no diff
- docs/strategy untracked NÃO no diff
- Cost sanity: $0 (mocked)

Reporta: APPROVE | APPROVE_WITH_NOTES | REQUEST_CHANGES com NITs."
```

## 8. PR

```bash
git push -u origin wave2.5-day3-bash-attribution
gh pr create --base dev --title "Wave 2.5 Day 3: Bash command attribution + tier mix breakdown" --body-file - <<'EOF'
## Summary
3 sub-features Wave 2.5 Day 3:

1. **Bash command tier badge** — `[T2·sonnet·0.84]` injectado por inject_context.js, respeita prefs.quiet + confidence threshold 0.6
2. **Tier mix breakdown statusline** — chip rotativo `last10: T0:6 T1:2 T2:2 T3:0` alterna cada 5 ticks
3. **`mooter quiet`** — toggle persistente via `~/.mooter/preferences.json`

## Changes
- `tools/router/inject_context.js`: badge injection + readPrefs
- `tools/router/statusline-multi.js`: tier mix view + tick rotation
- `packages/cli/src/commands/quiet.ts`: NEW command
- `packages/cli/src/cli.ts`: wire `quiet` command
- Tests: badge-injection (3) + tier-mix (2) + quiet (3) + 2 integration = 10 new

## Tests
- All suites: <X/X> pass
- Sanity cost: $0

## Invariants
- ✅ classify.js byte-identical
- ✅ init.ts (Day 2) intacto
- ✅ packages/router/src/* + mooter_event.ts intacto
- ✅ Backward compat: prefs.json optional, fallback defaults
- ✅ No git add -A, No --no-verify

## Out of scope (Day 4)
- Confidence trail / provenance
- E2E smoke test
- Wave 2.5 closure tag

## Reviewer
final-reviewer: <APPROVE | APPROVE_WITH_NOTES>
EOF
```

## 9. Notion + SYNC

### 9.1 Notion sub-page

Title: `🐮 Sessão YYYY-MM-DD — Wave 2.5 Day 3 (bash attribution + tier mix)`

Body: 3 sub-features · tests aggregate · reviewer verdict · Day 4 backlog.

### 9.2 SYNC.md

- `## Notion HQ` → add link Day 3
- `📥 COWORK → CLAUDE CODE` → next: Day 4 (confidence trail + e2e + tag v0.2.1-polish)

## 10. Resumo final na chat

```
✅ Wave 2.5 Day 3 COMPLETO
- Branch: wave2.5-day3-bash-attribution (pushed)
- PR: #<N> (link) → dev
- 3 sub-features: badge · tier mix · mooter quiet
- Tests: <X/X> pass
- Reviewer: <verdict>
- Cost sanity: $0
Próximo: Paulo merge + arranca Day 4 (closure Wave 2.5 com tag v0.2.1-polish).
```

=== END ===
