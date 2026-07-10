# Wave 2.5 Day 1 — Kickoff master prompt (Statusline visual upgrade + per-terminal isolation)

> **Como usar**: cola tudo abaixo de `=== START ===` no Claude Code dentro de `~/mooter/`. Self-contained.

**Pré-requisitos verificados antes de colar**:
- ✅ Wave 2 fechada (commit `f77936a` em dev)
- ✅ Wave 4 Phase A merged (commit `e7d2c2e` em dev)
- ✅ Hooks UserPromptSubmit + SessionStart wired em `~/.claude/settings.json` (manual fix 2026-05-30)
- ✅ Symlink `~/.claude/tools/router → /home/paulo/mooter/tools/router/`
- ✅ Statusline actual responde mas mostra `🟢` em vez de `🐮`, sem ctx %, sem turn/alltime cost

---

=== START ===

## 0. Quem és e o que vais fazer

És Claude Code no `~/mooter/`, branch `wave2.5-day1-statusline-polish` (a criar a partir de `dev`). `--permission-mode auto`.

**Missão Day 1**: shippar 6 sub-features num único PR para `dev`:

1. **Glyph upgrade** — 🟢 → 🐮 healthy · 🟡 → 🐂 warning · 🔴 → 🚨 critical · setup 🛠 mantém
2. **Headline enriquecido** — mostra `Tier model confidence` inline (`T2 sonnet 0.84`)
3. **Context window chip** — `ctx N%` lido de stdin Claude Code JSON
4. **Per-turn cost + alltime** — `turn $X · alltime $X` (cumulative desta session)
5. **Per-terminal session isolation** — `session_id` em decisions + filter na statusline
6. **Compact mode** — se `COLUMNS < 100`, omit pack/adapter chips

Tudo numa única statusline 1-line (decisão arquitectural mantida — terminal statusLine é stdout single-line).

## 1. Invariantes (não-negociáveis)

- ❌ **Nunca tocar `classify.js`** — eixo 1 byte-identical (invariant P11)
- ❌ **Nunca `git add -A`** — commits selectivos
- ❌ **Nunca merge directo para `main`** — sempre PR para `dev`
- ❌ **Nunca `--no-verify`**
- ❌ **NÃO tocar** `packages/router/src/mooter_event.ts` (schema canónico Wave 2 D4)
- ❌ **NÃO tocar** `packages/router/src/event_writer.ts` (Day 4 writer)
- ❌ **NÃO tocar** `packages/router/src/classify_domain.ts` (Day 3+5 calibrated)
- ❌ **NÃO tocar** `packages/cli/src/commands/init.ts` (fica Day 2 wave 2.5)
- ❌ **NÃO commitar** `docs/strategy/PASTOR.md` (cross-stream Cowork)
- ❌ **NÃO commitar** docs untracked em `docs/strategy/*`
- ❌ **NÃO mudar para multi-line statusline** — terminal API só suporta 1-line, decisão arquitectural mantida
- ✅ **Final-reviewer T3-gate obrigatório** antes do PR
- ✅ **Sanity cost $1 BLOCKER** — esta Day é puramente local (zero API calls)
- ✅ **Notion sub-page** ao fim do Day + SYNC.md update
- ✅ **Backward compat**: events sem `session_id` continuam a contar para "all sessions" view (não breaking)

## 2. Branch + recon

```bash
cd ~/mooter
git checkout dev
git pull origin dev
git log --oneline -3  # confirma e7d2c2e (Phase A) ou commits mais recentes
git checkout -b wave2.5-day1-statusline-polish
```

Recon (lê antes de tocar):
- `tools/router/statusline-multi.js` — alvo principal (~570 linhas)
- `tools/router/inject_context.js` — onde injectar session_id em decisions
- `tools/router/paths.js` — onde resolve ROUTER_DIR + DECISIONS_LOG
- `tools/router/savings-tracker.js` — onde adicionar last_turn_cost + alltime endpoints
- `tools/router/statusline-multi.test.js` — testes existentes (manter passing)

## 3. Sub-feature 1 — Glyph upgrade

**Ficheiro**: `tools/router/statusline-multi.js`

Mudar mapa `COLOR_GLYPH`:
```javascript
const COLOR_GLYPH = {
  green:  '🐮',  // was 🟢 — brand identity (Paulo: "emoji vaquinha não bolinha verde")
  yellow: '🐂',  // was 🟡 — aligns com mood system CrazyMoo metaphor
  red:    '🚨',  // was 🔴 — keeps urgency, distinct from emergency
  setup:  '🛠',
  empty:  '⚪',
};
```

Update demo contexts no test file para reflectir novos glyphs.

**Test**: `statusline-multi.test.js` adiciona/actualiza:
```javascript
test('green state renders cow glyph', () => {
  const out = renderFromContext(DEMO_CONTEXTS.green);
  assert.match(out, /^🐮 /);
});
```

## 4. Sub-feature 2 — Headline enriquecido

Actualmente o headline é: `mooter saved $0.08 today (89%)`.

Mudança: incluir tier + model + confidence quando há `last` event:

```javascript
// pickState() — green case
if (typeof savedUsd === 'number' && typeof savedPct === 'number') {
  const tierBadge = last
    ? `${last.tier} ${getProviderTag(last)} ${Number(last.confidence || 0).toFixed(2)}`
    : '';
  return {
    color:    'green',
    headline: tierBadge
      ? `saved $${savedUsd.toFixed(2)} (${Math.round(savedPct)}%) · ${tierBadge}`
      : `saved $${savedUsd.toFixed(2)} (${Math.round(savedPct)}%)`,
    proof,
  };
}
```

`getProviderTag(last)` é a função existente que mapeia `suggested_providers[0]` → curto (`sonnet`, `haiku`, `local`, etc).

Resultado:
```
🐮 saved $0.08 (89%) · T2 sonnet 0.84  │ ctx 23% · 100% 5h · turn $0.04 · alltime $4.21
```

## 5. Sub-feature 3 — Context window chip

Claude Code passa JSON via stdin quando chama statusline. Ler:

```javascript
// Start of main() / buildContext()
let stdinJson = null;
if (!process.stdin.isTTY) {
  try {
    const data = require('fs').readFileSync(0, 'utf8');  // fd 0 = stdin
    stdinJson = JSON.parse(data);
  } catch { /* not JSON, ignore */ }
}

const ctxPercent = stdinJson?.context?.percent_used ?? null;
```

Adicionar `ctxPercent` ao context object. Render no proof slot:

```javascript
const chips = [];
if (typeof ctxPercent === 'number') chips.push(`ctx ${ctxPercent}%`);
// ... outros chips existentes
```

## 6. Sub-feature 4 — Per-turn cost + alltime

### 6.1 Update savings-tracker

**Ficheiro**: `tools/router/savings-tracker.js`

Adicionar 2 campos ao response do `/metrics`:
- `last_turn_cost_usd` — cost do último event
- `alltime_cost_usd` — sum de todos events (já calculado mas não exposto)

### 6.2 Render

```javascript
if (typeof metrics?.last_turn_cost_usd === 'number') {
  chips.push(`turn $${metrics.last_turn_cost_usd.toFixed(2)}`);
}
if (typeof metrics?.alltime_cost_usd === 'number') {
  chips.push(`alltime $${metrics.alltime_cost_usd.toFixed(2)}`);
}
```

## 7. Sub-feature 5 — Per-terminal session isolation 🔴 CRITICAL

### 7.1 Generate session_id

**Ficheiro**: `tools/router/hooks/SessionStart.sh`

Quando Claude Code arranca, gera UUIDv7 e exporta:
```bash
export CLAUDE_SESSION_ID="${CLAUDE_SESSION_ID:-$(uuidgen 2>/dev/null || node -e 'console.log(crypto.randomUUID())')}"
echo "$CLAUDE_SESSION_ID" > /tmp/mooter-session-$$
```

OU use `process.ppid` + boot time como deterministic ID.

### 7.2 Inject session_id em decisions

**Ficheiro**: `tools/router/inject_context.js`

No event written para `decisions.log`, adicionar:
```javascript
const event = {
  // ... existing fields
  session_id: process.env.CLAUDE_SESSION_ID || 'unknown',
  // ...
};
```

### 7.3 Filter no statusline

**Ficheiro**: `tools/router/statusline-multi.js`

```javascript
function digest(lines, options = {}) {
  const { sessionFilter = process.env.CLAUDE_SESSION_ID } = options;
  // ... existing logic
  for (let i = lines.length - 1; i >= 0; i--) {
    let evt;
    try { evt = JSON.parse(lines[i]); } catch { continue; }
    if (!evt || evt.event !== 'classified') continue;
    if (evt.source === 'mooter-tester') continue;

    // NEW: per-session filter (when CLAUDE_SESSION_ID is set)
    if (sessionFilter && evt.session_id && evt.session_id !== sessionFilter) continue;

    // ... rest of existing logic
  }
}
```

### 7.4 Backward compat

Events SEM `session_id` (legacy) contam para qualquer session. Não breaking.

Tecla escape (env var `MOOTER_STATUSLINE_VIEW=all`) para ver todas sessions (debug).

## 8. Sub-feature 6 — Compact mode

```javascript
const COLS = parseInt(process.env.COLUMNS || '120', 10);
const COMPACT = COLS < 100;

// In renderFromContext:
if (!COMPACT) {
  if (ctx.lastPack && ...) chips.push(`pack: ${pid}`);
  if (ctx.adapter && ...) chips.push(`adapter: ${glyph}`);
}
// Always render: glyph + headline + ctx + 5h + turn + alltime (minimal essential)
```

## 9. Tests

**Ficheiros**: `tools/router/statusline-multi.test.js` (existing — actualizar) + `tools/router/statusline-session-isolation.test.js` (novo)

Cases novos:
- ✅ Glyph 🐮 em healthy
- ✅ Headline inclui `T2 sonnet 0.84`
- ✅ ctx % rendered quando stdin JSON tem context.percent_used
- ✅ turn $X + alltime $X rendered
- ✅ Per-session filter: 2 events, session_id diferente → só 1 counted
- ✅ Legacy events (sem session_id) counted in any session
- ✅ Compact mode (COLUMNS=80): omit pack + adapter chips
- ✅ Full mode (COLUMNS=120+): show all chips

Target: tests existentes continuam verdes (regression) + 8-12 novos.

## 10. Final-reviewer pre-PR

Spawn final-reviewer (Opus pinned via Task tool):

```
Task tool, subagent_type: "general-purpose"

Prompt: "Review branch wave2.5-day1-statusline-polish vs dev.

Verifica:
- classify.js byte-identical com dev (P11)
- packages/router/src/* INTACTO (mooter_event, event_writer, classify_domain)
- packages/cli/src/commands/init.ts INTACTO (fica Day 2)
- Glyph map actualizado: 🐮 (green) · 🐂 (yellow) · 🚨 (red) · 🛠 (setup) · ⚪ (empty)
- Headline mostra Tier + model + confidence quando há last event
- ctx N% rendered quando stdin JSON tem context.percent_used
- turn $X + alltime $X aparecem (via savings-tracker /metrics)
- Per-session isolation: events com session_id diferente filtrados
- Backward compat: legacy events sem session_id continuam contados
- Compact mode (COLUMNS < 100) omit pack + adapter chips
- Existing tests verdes (regression)
- 8-12 novos tests cobrem cada sub-feature
- Sem git add -A, sem --no-verify
- Sem secrets em diff
- PASTOR.md NÃO no diff
- docs/strategy/* untracked NÃO no diff

Reporta: APPROVE | APPROVE_WITH_NOTES | REQUEST_CHANGES com NITs numerados."
```

## 11. PR

```bash
git push -u origin wave2.5-day1-statusline-polish
gh pr create --base dev --title "Wave 2.5 Day 1: Statusline visual upgrade + per-terminal isolation" --body-file - <<'EOF'
## Summary
6 sub-features per Wave 2.5 plan (activation polish):

1. **Glyph upgrade** — 🐮 healthy · 🐂 warning · 🚨 critical (brand identity, mood-system alignment)
2. **Headline enriquecido** — `T2 sonnet 0.84` inline
3. **Context window chip** — `ctx N%` lido de stdin Claude Code JSON
4. **Per-turn cost + alltime** — via savings-tracker /metrics expansion
5. **Per-terminal session isolation** — session_id em decisions + filter na statusline (CRITICAL para confiança)
6. **Compact mode** — COLUMNS < 100 omit secondary chips

Mantém 1-line design (terminal statusLine = stdout single-line, decisão Day 2 Wave 2 preservada).

## Changes
- `tools/router/statusline-multi.js`: glyph map + headline render + ctx chip + per-session digest filter + compact mode
- `tools/router/savings-tracker.js`: +last_turn_cost_usd + alltime_cost_usd no /metrics
- `tools/router/inject_context.js`: +session_id no decisions.log event
- `tools/router/hooks/SessionStart.sh`: +CLAUDE_SESSION_ID generation
- `tools/router/statusline-multi.test.js`: +8 new tests (glyph, headline, ctx, turn/alltime, compact)
- `tools/router/statusline-session-isolation.test.js`: NEW — per-session filter tests

## Out of scope (next days W2.5)
- Wizard non-TTY fix — Day 2
- Bash command attribution — Day 3
- End-to-end smoke test — Day 4

## Tests
- Router suite: <X/X> pass (existing + new)
- classify.js byte-identical with dev (P11) ✓
- packages/router/src/* untouched ✓
- packages/cli/src/commands/init.ts untouched ✓
- statusline render perf: <50ms p99 (smoke)

## Invariants
- ✅ classify.js byte-identical
- ✅ packages/router/src/* untouched
- ✅ Wave 2 D4 schema (mooter_event) intacto
- ✅ Backward compat: legacy events sem session_id contam para "all"
- ✅ No git add -A
- ✅ No --no-verify

## Reviewer
final-reviewer: <APPROVE | APPROVE_WITH_NOTES>

## Backlog Day 2
- Wizard stdin non-TTY fix
- Edge cases (no Ollama, no Anthropic)
- Idempotency tests
EOF
```

## 12. Notion + SYNC

### 12.1 Notion sub-page

Title: `🐮 Sessão YYYY-MM-DD — Wave 2.5 Day 1 (statusline visual upgrade)`

Body:
- Sub-features delivered (6)
- Antes/depois statusline (text comparison)
- Tests added
- Reviewer verdict + link PR
- Day 2 backlog

### 12.2 SYNC.md

Update secções:
- `## Notion HQ — Páginas de Referência` → add link Wave 2.5 Day 1 page
- `📥 COWORK → CLAUDE CODE` → next: aguardar Paulo merge PR + arrancar Day 2 (wizard hardening)

## 13. Resumo final na chat

Quando tudo verde:
```
✅ Wave 2.5 Day 1 — Statusline visual upgrade + per-terminal isolation COMPLETO
- Branch: wave2.5-day1-statusline-polish (pushed)
- PR: #<N> (link) → dev
- Glyph 🐮 healthy / 🐂 warning / 🚨 critical
- Headline T2 sonnet 0.84 inline
- ctx N% via stdin JSON
- turn $X + alltime $X via savings-tracker
- Per-session isolation: session_id filter
- Compact mode COLUMNS<100
- Tests: <X/X> pass (existing + N new)
- Reviewer: <APPROVE / APPROVE_WITH_NOTES>
- Sanity cost: $0 (pure local UI)
Próximo: Paulo merge + arranca Day 2 (wizard hardening — stdin non-TTY fix + edge cases).
```

=== END ===
