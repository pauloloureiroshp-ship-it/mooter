# Wave 21 — Day 1 Findings (what was done)

> Companion a `WAVE21_DAY1_RECON.md` (root causes). Este doc regista as correcções
> aplicadas, decisões críticas, e resultados de teste. Branch: `wave21-critical-fixes`.

## Key findings (3 linhas)
- **Worst offender (C1) não era código — era config**: o matcher PostToolUse em
  `~/.claude/settings.json` era `"Bash"`. O hook `post_tool_badge.js` nunca recebia
  payloads `Task`/`Agent` → `recordSpawn` retornava `null` → herd file nunca escrito.
- **C5 também não era regressão**: o digest está completo; só faltava o opt-in
  `session_report_enabled` (ficheiro `~/.mooter/preferences.json` nunca criado).
- **C2/C3/C4 eram código**: path-keyword bleed, budget_cap a deixar o model stale,
  e 3 fontes no 🏠 chip. Todos corrigidos com classify.js byte-identical.

---

## Correcções aplicadas

### C1 — Herd writer (settings matcher) ✅
- `~/.claude/settings.json`: matcher `"Bash"` → `"Bash|Agent|Task"` (runtime fix, live).
- `tools/cli/lib/register-hooks.js`: a migração de matcher existente cobria
  `exec-logger.js`/`PostToolUse.js` mas **não** `post_tool_badge.js` (o hook real do
  Paulo). Adicionado `post_tool_badge.js` à condição → fix reproduzível em reinstall.
- `tools/router/post_tool_badge.js`: persistent guard em `recordSpawn` — 1 stderr-log
  não-fatal se o write falhar (acaba com a falha 100% silenciosa).
- **Decisão crítica documentada**: *"PostToolUse não disparava porque o matcher de
  settings.json era 'Bash' e a migração do installer (register-hooks.js) só cobria
  exec-logger/PostToolUse.js, não post_tool_badge.js — corrigi ambos."*

### C2 — Classifier stability ✅
- `tools/router/normalise_prompt.js` (novo): canonical-form só-para-classificação
  (strip de paths→`<path>`, números→`<num>`, lower-case). Re-surface de risk tokens
  (`.env`, `secret`, `id_rsa`, …) → HIGH_RISK floor preservado.
- `tools/router/inject_context.js`: classifica + cacheia o `classifyInput` normalizado;
  o `prompt` original continua a alimentar LLM/Option-A/optimizer/logs.
- classify.js **byte-identical** (sha `7b01eb86…87762`).

### C3 — Hint coherence ✅
- `tools/router/hint_coherence.js` (novo): `coerceHintCoherent(decision)` +
  `isHintCoherent(decision)`.
- **Decisão crítica (desvio do kickoff)**: tier-authoritative, NÃO model→tier. A
  causa dominante é budget_cap a baixar o tier; coercir model→tier desfaria o cap.
  Derivamos backend/model/subagent do tier final. Pin do user já é coerente (no-op).
- Chamado em `inject_context.js` imediatamente antes da emissão do hint (cobre hint
  + tier-badge). Zero mudança a Option-A/arbiter/classify.

### C4 — 🏠 single source + 🐄 once ✅
- `tools/router/statusline-multi.js`: `buildLocalChip(tokSnap)` (fonte única =
  token_tracker snapshot, já `_pushed`+`_transcript` reconciliado). Removida a barra
  ASCII `localShareChip` (a 3ª fonte enganadora `░░░ 0% local`). Removido o
  `appendHerd` duplicado da line 1 (DoD #3: 🐄 aparece UMA vez, na line 2).
- token_tracker.snapshot() shape **inalterado**.
- **Caveat honesto**: a semântica de "calls" mistura Ollama-pushes (T0) com
  assistant-messages (T3) — fica single-source mas a normalização de unidade de
  "calls" continua Wave 22 (#3). O token% é a métrica de custo honesta e correcta.

### C5 — Stop digest (opt-in enablement) ✅
- `tools/router/hooks/SessionStart.sh`: self-heal — cria `~/.mooter/preferences.json`
  com `session_report_enabled: true` se ausente (digest passa a default-on; user pode
  desligar editando). `~/.mooter/preferences.json` criado para o runtime do Paulo.
- Nenhuma mudança ao `stop_hook.js` (o stderr write Wave 13.1 + PER-TASK BREAKDOWN
  Wave 20.F já estavam presentes e correctos).

---

## Testes

- **5 novos** (`tools/router/wave21-coherence.test.js`, 1 por fix) → **5/5 pass**.
  - C1: payload REAL do Claude Code (`tool_name:'Task'`) → herd file escrito; Bash não.
  - C2: família de paths colapsa a 1 forma; `.env` sobrevive (HIGH_RISK).
  - C3: budget-capped {T0,opus,architect} → coerente (T0,qwen,local-summarizer).
  - C4: chip single-source, sem barra ASCII, null quando vazio.
  - C5: `buildSessionReport` rende header + 5 secções.
- **Integration tests actualizados** (assertavam o comportamento antigo bugado):
  `statusline-multi.test.js` (20.D), `statusline-two-line.test.js`, `herd-chip.test.js`.
- **Full router suite**: 500 pass / 9 fail / 1 skip. **Todas as 9 falhas são
  pré-existentes/ambientais**, NENHUMA causada por esta wave:
  - 3 = nomes no `--test-skip-pattern` original (TUNED idempotent, deepseek-r1, gemma4).
  - `#39/#49` (backtest): gemini provider + qwen2.5-coder specialist não instalados
    neste box; classify.js/backtest.js byte-identical ao HEAD.
  - `#147` (classify tuned_demote): classify.js untouched.
  - `#179-181` (gsd-statusline-latency): `gsd-statusline.js` está DELETED no disco
    (staged deletion pré-existente do Paulo) → MODULE_NOT_FOUND + timing.

## Non-negotiables verificados
| Item | Resultado |
|---|---|
| classify.js sha256 | `7b01eb86…87762` ✅ |
| token_tracker.snapshot() shape | `[calls,tokens_in,tokens_out,real]` ✅ |
| subagent_tracker.snapshot() shape | `[active_count,active_local,active_cloud,active,by_agent,peak_concurrent,cumulative]` ✅ |
| `frugal recommends` grep | 0 ✅ |
| Hub touch | 0 ✅ |
| UserPromptSubmit smoke | exit 0 ✅ |
| C2 regression (6 prompts) | tier orig == norm em todos ✅ |

## Ficheiros (Wave 21)
**Novos**: `normalise_prompt.js`, `hint_coherence.js`, `wave21-coherence.test.js`,
`docs/strategy/WAVE21_DAY1_RECON.md`, `docs/strategy/WAVE21_DAY1_FINDINGS.md`.
**Modificados**: `inject_context.js`, `statusline-multi.js`, `post_tool_badge.js`,
`hooks/SessionStart.sh`, `cli/lib/register-hooks.js`, `package.json`, +3 test files.
**Runtime (fora do repo)**: `~/.claude/settings.json` (matcher), `~/.mooter/preferences.json` (digest opt-in).

## Pendente
- Tag dev `v1.11.0-coherence-critical-dev` após final-reviewer.
- NÃO promover prod até Cowork E2E re-validation PASS (5 spawns + 🐄 N>0 + 🏠 single + Stop digest).
- Evidência tracker file (C1 herd write) capturada em RECON §C1.
