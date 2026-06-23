# Wave 2.5 — Activation Polish (2026-05-30 → 2026-06-03)

> **SSoT operacional** da Wave 2.5. Surge da utilização real do Paulo pós-Wave 2 closure (verdict MEDIUM 2/3 + tag `v0.2.0-rc1`). Não é nova feature — é **endurecimento da UX da statusline + wizard + per-terminal isolation** identificado em uso real.

---

## Porquê Wave 2.5 (não Wave 3 D0)

| Razão | Detalhe |
|---|---|
| **Wave 2 fechou com gaps visíveis ao utilizador** | Statusline 1-linha minimal vs visão 3-linha. Wizard falhou na primeira invocação (stdin non-TTY). Hooks UserPromptSubmit não wired por default. |
| **Wave 3 era activation+hub** | Mas activation pressupõe statusline + wizard funcionais. Sem essas bases, Wave 3 cresce sobre fundação instável. |
| **Confiança é gate** | Paulo: "os números têm que bater para passar confiança". Per-terminal isolation + provenance trail são pré-requisitos para opt-in telemetria (Wave 3 D4). |
| **Ordem natural** | Day 0 da Wave 3 seria activation hardening de qualquer forma. Promover a Wave 2.5 dedicada dá clareza ao roadmap. |

## Pré-requisitos (todos ✅)

- ✅ Wave 2 fechada (tag `v0.2.0-rc1`, commit `f77936a` em dev)
- ✅ Wave 4 Phase A merged em dev (commit `e7d2c2e`)
- ✅ `mooter init` shipped (Day 6 Wave 2) — mas com bug stdin non-TTY conhecido
- ✅ Statusline 1-line shipped (Day 2 Wave 2) com pack + adapter chips
- ✅ UserPromptSubmit hook wired (fix manual hoje 2026-05-30 — vai ser permanente Day 1 Wave 2.5)

## Days 4 (curto, focado)

| Day | Foco | Critical path |
|---|---|---|
| **1** | Statusline visual upgrade + per-terminal isolation | 🔴 blocker para confiança |
| **2** | Wizard hardening (TTY + non-TTY + edge cases + idempotency) | 🔴 first-impression matters |
| **3** | Bash command attribution + tier mix breakdown | 🟡 transparency feature |
| **4** | Confidence trail + end-to-end validation + Wave 2.5 closure | 🔴 gate para Wave 3 |

Day 5+ NÃO existe nesta wave. Se algo escapar, vai para Wave 3 D1 backlog.

---

## Day 1 — Statusline visual upgrade + per-terminal isolation

### 1.1 Visual upgrade (mantém 1-line mas enriquece)

Decisão arquitectural: **manter 1-line** (statusline-multi.js está intencionalmente 1-line para "200ms readability"). Multi-line shell statusline é tecnicamente difícil em Claude Code (statusLine é stdout single-line). Mas enriquecer o conteúdo dessa 1-line para mostrar TUDO o que o Paulo precisa.

**Antes**:
```
🟢 mooter saved $0.08 today (89%)        │ 100% 5h · adapter: ◌
```

**Depois (visão Day 1)**:
```
🐮 saved $0.08 (89%) │ T2 sonnet 0.84 · ctx 23% · 100% 5h · turn $0.04 · alltime $4.21 · pack: diagram-systems · adapter: ◌
```

**Mudanças**:
- 🐮 vaquinha em vez de 🟢 (color via background ANSI se preciso, glyph cow sempre)
- Tier + model explicit + confidence inline
- `ctx N%` context window usage (lido do session metadata)
- `5h N%` budget remaining (já existe)
- `turn $X` last-prompt cost (novo)
- `alltime $X` cumulative cost (novo)
- Pack chip já existe
- Adapter chip já existe

**Se overflow**: collapse pack/adapter se largura < 100 cols. `statusline-multi.js` deve detectar `COLUMNS` env var ou tput.

### 1.2 Glyph upgrades

| Estado | Antes | Depois | Razão |
|---|---|---|---|
| Healthy | 🟢 | 🐮 (cow) | Brand identity (Paulo: "emoji vaquinha não bolinha verde") |
| Warning | 🟡 | 🐂 (bull — CrazyMoo metaphor) | Aligns com mood system |
| Critical | 🔴 | 🚨 (alarm) | Stays urgent |
| Setup | 🛠 | 🛠 | Mantém |
| Degraded | ⚪ | ⚪ | Mantém |

### 1.3 Per-terminal isolation

**Problema actual**: `decisions.log` e `savings-tracker` agregam events de TODAS as sessions Claude Code (todos os terminais simultâneos). Statusline mostra savings totais, não desta sessão.

**Solução**:
- Cada session Claude Code tem `CLAUDE_SESSION_ID` env var (ou gera UUIDv7 no SessionStart)
- `inject_context.js` regista `session_id` em cada decision event
- `statusline-multi.js` filtra events por session_id antes de aggregate
- Default = "this session" view. Tecla / flag para alternar view "all sessions today"

**Effort**: ~2h. Não breaking — events sem session_id contam para "all".

### 1.4 Per-turn cost tracking

Actual: `savings-tracker` calcula savings cumulative mas não isola turn-a-turn.

Adicionar:
- `last_turn_cost_usd` no `/metrics` endpoint
- `last_turn_model` para attribution
- `alltime_cost_usd` (já existe via decisions.log sum)

### 1.5 Context window %

Claude Code expõe `session.context.percent_used` via stdin JSON quando chama statusline (já vimos isto no statusline.sh legacy). `statusline-multi.js` actualmente IGNORA esse stdin. Day 1 adiciona:
- Parse stdin JSON
- Extrai `context.percent_used`
- Render `ctx NN%` no chip

### 1.6 DoD Day 1

- [ ] Statusline render com 🐮 vaquinha em healthy state
- [ ] Tier + model + confidence inline (`T2 sonnet 0.84`)
- [ ] `ctx N%` lido de stdin Claude Code JSON
- [ ] `turn $X` mostra cost do último prompt desta session
- [ ] `alltime $X` mostra cumulative desta session
- [ ] Per-session isolation: novo terminal não inherits savings de outro
- [ ] Compact mode para `COLUMNS` < 100 (omit pack/adapter chips)
- [ ] All existing tests pass + 8-12 new for session isolation, glyph map, ctx parsing

---

## Day 2 — Wizard hardening

### 2.1 Fix stdin non-TTY bug

Bug reportado pelo Claude Code: "ERR_USE_AFTER_CLOSE, raw-mode em stdin não-TTY" quando wizard é invocado por pipe ou script.

**Fix**:
- `init.ts` `askHidden` detecta `process.stdin.isTTY` antes de `setRawMode`
- Se non-TTY: fallback para `process.env.MOOTER_INIT_<FIELD>` ou prompt clear "API key (pipe-mode requires env vars)"
- Test integration: `echo "y\nmax\n\n\n\n" | mooter init` deve passar

### 2.2 Edge cases

- **No Ollama**: wizard continua, T0 disabled, warning claro
- **No Anthropic key**: skip step 3, telemetry only, statusline marca "no providers"
- **Re-run idempotency**: actualiza profile + consent, packs already-installed NÃO duplicate
- **Cross-platform**: Linux full · macOS skeleton · Windows-WSL full (já no Day 6, mas adicionar smoke tests)
- **Failure recovery**: se step X falha, wizard deixa working state válido + offers retry

### 2.3 Error messages claras

Cada error message segue padrão:
```
✗ <what failed>
  Cause: <why>
  Fix: <what to do>
```

Exemplo:
```
✗ Anthropic validation failed (401 Unauthorized)
  Cause: API key invalid or revoked
  Fix: Get a new key at https://console.anthropic.com/keys
```

### 2.4 DoD Day 2

- [ ] `echo "..." | mooter init` passa (non-TTY)
- [ ] No Ollama scenario: wizard completa, statusline mostra "T0 disabled"
- [ ] No Anthropic scenario: wizard completa, statusline mostra "no providers configured"
- [ ] Re-run wizard 3x: nenhum pack duplicado, profile actualiza, consent preserva
- [ ] Macros error message format aplicado a todos os failures
- [ ] Cross-platform smoke tests: Linux WSL ✅ pass

---

## Day 3 — Bash command attribution + tier mix breakdown

### 3.1 Each bash command attributed

Actualmente decisions.log mostra `tier: T2, model: sonnet` mas o Claude Code não diz visualmente no output qual modelo executou. Day 3 adds:

- `inject_context.js` injecta `<tier-badge>T2 · sonnet</tier-badge>` no início de cada response do Claude Code (visible ao user)
- Cor do badge match tier color tokens
- Hidden quando user opt-out via `mooter quiet`

### 3.2 Tier mix breakdown na statusline

Adicionar 2º statusline state que mostra tier distribution dos últimos N turns:

```
🐮 saved $0.08 (89%) │ T2 sonnet 0.84 · last10: T0:6 T1:2 T2:2 T3:0
```

OR rotating proof (cada 5s alterna entre conta turn vs distribution).

### 3.3 DoD Day 3

- [ ] Cada bash command tem tier badge visible no Claude Code output
- [ ] Statusline mostra last-10 tier distribution
- [ ] `mooter quiet` desactiva badges (preferência persistente em `~/.mooter/preferences.json`)

---

## Day 4 — Confidence trail + end-to-end validation + Wave 2.5 closure

### 4.1 Provenance trail

Cada número na statusline deve ser traceable:
- `saved $X` → soma de `(baseline_cost - actual_cost)` events
- `89%` → `saved / baseline_cost`
- `T2 0.84` → último event com `confidence=0.84`
- `100% 5h` → quota provider responde
- `turn $X` → último event `cost_micros / 1_000_000`

Cada um destes valores deve ter test que verifica formula contra mock events.

### 4.2 End-to-end smoke test

Sequência:
1. Fresh install (delete `~/.mooter/`, `~/.claude/tools/router/`)
2. Run `mooter init` com fixtures (no real API calls)
3. Make 10 synthetic prompts via `inject_context.js`
4. Verify decisions.log has 10 events
5. Verify statusline renders 🐮 with correct numbers
6. Verify per-session isolation: new shell → fresh session_id → savings = $0

Implementado em `packages/router/tests/e2e-fresh-install.test.ts`.

### 4.3 Closure

- Tag `v0.2.1-polish` se all 4 days verdes
- Notion HQ Wave 2.5 closure page
- SYNC.md update com final state
- Memória persistente actualizada
- Decisão de gate: passar para Wave 3 OR repair sprint

---

## Master prompt convention

Cada Day tem `WAVE2_5_DAY<N>_KICKOFF.md` em `docs/strategy/`. Day 1 ready, restantes compõem-se incrementally.

## Invariants Wave 2.5

- ❌ Nunca tocar `classify.js` (P11)
- ❌ Nunca `git add -A`
- ❌ Nunca merge directo para `main`
- ❌ Nunca `--no-verify`
- ❌ Não tocar Wave 4 Phase A (já merged, intacto)
- ❌ Não tocar event schema (`mooter_event.ts` canónico Wave 2 D4)
- ✅ Final-reviewer T3-gate obrigatório por Day
- ✅ Sanity cost $1 BLOCKER (não corre benchmark)
- ✅ Notion sub-page + SYNC.md per Day
- ✅ Per-session isolation: NUNCA cross-pollute terminals

---

## Relacionados

- [WAVE2_PLAN.md](./WAVE2_PLAN.md) — Wave 2 fechada
- [WAVE3_PLAN.md](./WAVE3_PLAN.md) — Wave 3 (activation + hub) — começa pós-Wave 2.5
- [WAVE4_OVERVIEW.md](./WAVE4_OVERVIEW.md) — Phase A merged, B+C+D pending
- [PASTOR.md §8](./PASTOR.md) — roadmap macro
