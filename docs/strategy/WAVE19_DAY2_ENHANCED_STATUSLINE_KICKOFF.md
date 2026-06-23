# Wave 19 — Day 2: Enhanced Statusline (Paulo's 6 Considerations)

> **Goal**: addressar 6 limitações que Paulo apanhou olhando statusline Day 1:
> tokens-per-tier sem cores · VRAM static · Claude Max sem barra contexto ·
> LoRA sem evolution indicator · Moo packs/herds ausentes · concurrent Moos count.
> Statusline final será o **showcase definitivo** de Mooter transparency.
>
> **Trigger**: Paulo flagged 2026-06-05 (cita ao vivo durante CC Day 1 PR #102 merged):
> 1. Tokens por tier com cores diferentes (T0 verde/T1 azul/T2 amarelo/T3 vermelho)
> 2. VRAM live realtime (não cache static — read GPU stats every render)
> 3. Claude Max context window barra de evolução
> 4. LoRA evolution indicator real-time
> 5. Moo packs / herds visible sempre (não só durante peak)
> 6. Concurrent Moos count visible (Wave 13 herd 🐄×N expansion)
>
> **Strategic value**: friends look at statusline e GIRO — Mooter mostra **tudo**
> em real-time. Nenhum competitor (Cursor, claude-code-router, OpenRouter, Aider)
> tem statusline com este nível de transparência integrada.
>
> **Scope**: 6 sub-features. ~1.5 dias CC autonomous. Tag dev `v1.9.8-statusline-enhanced-dev`.
>
> **Non-negotiables**:
> - `classify.js` byte-identical (P11 sha256 `7b01eb86...87762`)
> - Zero PII em chip data
> - Backwards-compat Day 1 token tracker (mantém 🪙 chip)
> - Hooks NÃO lançam (try/catch wrap em GPU/VRAM reads)
> - Tests router + 6 new

---

## 0. Considerações Paulo — análise detalhada

### Estado actual statusline (pós-Day 1 PR #102)

```
🐮 routing healthy — $0.00 spent · ▁▁▁▁▁_▁_▁_▁ last 10
🏠 2/13 local · 20% local · 🎮 RTX 4090 24% VRAM · ☁ Claude Max 100% · 5h reset · 🪙 T3:2.0M · adapter — baseline · mooter forge install
```

### Gaps identificados

| # | Gap | Solução proposta |
|---|---|---|
| 1 | Tokens-per-tier sem cores | ANSI color codes per tier — T0 🟢 verde / T1 🔵 azul / T2 🟡 amarelo / T3 🔴 vermelho |
| 2 | VRAM `24%` static (provavelmente cached at session start) | Read `nvidia-smi --query-gpu=utilization.memory --format=csv` per render (cached 5s) |
| 3 | `Claude Max 100% · 5h reset` é local estimate, sem evolution | Barra visual `▰▰▰▰▰▰▱▱▱▱` mostrando context window usage da sessão Claude |
| 4 | LoRA sem evolution real-time | Indicator `🧬 react-pro v3 +N decisions trained` (count + delta) |
| 5 | Herds só aparecem em PEAK (Wave 13 🐄×N) | Always-on chip `🐄 0 active · 17 total session · 9 peak` |
| 6 | Concurrent Moos count not surfaced | Same chip expanded com peak + active + total breakdown |

---

## 1. Sub-features (6)

### 19.B-1 — Tokens-per-tier com cores (ANSI)

**Current**: `🪙 T0:13.3k · T1:0 · T2:24.2k · T3:0`

**Target**: cores ANSI inline (terminais shell suportam):
- T0 = 🟢 verde (`\x1b[32m`) — "free local"
- T1 = 🔵 azul (`\x1b[34m`) — "haiku cheap"
- T2 = 🟡 amarelo (`\x1b[33m`) — "sonnet balanced"
- T3 = 🔴 vermelho (`\x1b[31m`) — "opus expensive"

**Source**: `tools/router/statusline-multi.js` — wrap each tier value in ANSI escape.

**Anti-pattern**: NÃO usar emoji adicional (T0/T1/T2/T3 already labelled); only ANSI color.

### 19.B-2 — VRAM real-time live read

**Current**: `🎮 RTX 4090 24% VRAM` — provavelmente cached at session start em `hardware.json`.

**Target**: read `nvidia-smi` every statusline render (cached 5s para performance):
```bash
nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader,nounits
```

Parse: `used_mb,total_mb` → `used/total * 100 = current_vram_pct`.

**Fallback**: if `nvidia-smi` not available (Mac/no NVIDIA), fall back to cached value with `?` marker: `RTX 4090 ?% VRAM (no live)`.

**Format**: `🎮 RTX 4090 51% VRAM (18.3/24 GB)` — show both percentage AND used/total.

**Source**: `tools/router/hardware_live.js` (new module, mimic subagent_tracker pattern).

### 19.B-3 — Claude Max context window evolution bar

**Current**: `☁ Claude Max 100% · 5h reset` — local estimate of session quota.

**Target**: real CONTEXT WINDOW usage para sessão actual Claude Code (200k context para Opus 4.x):
```
☁ Claude Max ▰▰▰▱▱▱▱▱▱▱ 32% ctx (64.5k/200k) · 5h reset
```

Bar shows context tokens used vs window. Friends see how full session ctx is.

**Source**: Claude Code transcript count tokens (Day 1 already reads transcript). New helper `getContextWindowUsage(transcript) → {used, total, pct}`.

**Anti-pattern**: NÃO inventar 5h reset — that's session-budget, separate from context window. Both shown.

### 19.B-4 — LoRA evolution indicator real-time

**Current**: `adapter — baseline` ou `🧬 LoRA active · <name>` (when adapter loaded).

**Target post-Wave-16-18-Day-2** (Pastor learning ACTIVE):
```
🧬 react-pro v3 · trained on 173 decisions · +2.1pp last 7d
```

**Source**: `tuning-state.json` (created by Pastor loop Wave 16-18 Tier C):
- Read `version`, `decisions_count`, `delta_last_7d` from tuning-state.json
- If no adapter loaded → `🧬 baseline · 0 decisions tuned (run mooter forge install)`

**Anti-pattern**: NÃO inventar `+N pp` benchmark — only show if Pastor backtest data confirmed.

### 19.B-5 — Moos/Herds always-on chip

**Current**: `🐄×N` only during PEAK execution; goes to 0 between subagent spawns.

**Target**: always-visible chip with multiple aspects:
```
🐄 0 active · 4 spawn-history · peak 3
```

Reads:
- `active`: current subagent count (from subagent_tracker.js Wave 13)
- `spawn-history`: total subagents spawned this session (cumulative)
- `peak`: high-water mark concurrent (Wave 13 tracker já tem)

**When 0 active**: shown grey/dim em ANSI.
**When N active**: shown bright (already Wave 13 behavior) + emoji-pulse if peak.

**Source**: `subagent_tracker.js` snapshot() — Wave 13 already returns `{active_count, total_spawned, peak_concurrent}`. Statusline renders all three.

### 19.B-6 — Concurrent Moos workflow visibility

**Target**: when ≥2 Moos active concurrent, show "workflow mode" indicator:
```
🐄 3 active · 17 spawn-history · peak 9 · ⚡ workflow mode
```

`⚡ workflow mode` lights when ≥3 concurrent — visual cue for "Mooter Dynamic Workflow happening NOW".

Plus Stop digest expansion (Wave 19 19.D scope) will show full "Moos that worked the session" breakdown — but for Day 2 only statusline visibility.

---

## 2. Combined statusline target (post-Day 2)

Line 1:
```
🐮 routing healthy — $X all-time · ▁▅██ last 10
```

Line 2 (with all enhancements):
```
🪙 T0:13.3k T1:0 T2:24.2k T3:2.0M (colored) · 🏠 2/13 local 20% · 🎮 RTX 4090 51% VRAM (18.3/24 GB) · ☁ Claude Max ▰▰▰▱▱ 32% ctx · 5h reset · 🐄 0/17/peak9 · 🧬 baseline 0 trained · mooter forge install
```

Estimated width: ~280 chars, comfortable in modern terminals.

---

## 3. Recon comandos

```bash
# Locate Day 1 token tracker (PR #102 just merged)
grep -rn "token_tracker\|trackCall" tools/router/

# Locate Wave 13 subagent_tracker
cat tools/router/subagent_tracker.js | head -40

# Locate hardware detection
grep -rn "RTX 4090\|nvidia-smi\|VRAM" tools/router/ packages/cli/

# Locate Claude Max context tracker
grep -rn "claudeMaxQuota\|5h reset\|context_window" tools/router/

# Verify classify.js byte-identical
sha256sum tools/router/classify.js

# Check Pastor tuning-state.json schema (Wave 16-18 Tier C)
ls tools/router/tuning-state*
cat tools/router/tuning-state.defaults.json | head -30
```

---

## 4. Sequência (1 PR squash→dev, ~1.5 dias CC autonomous)

### Manhã (~5h)
1. **Recon** (30 min) — token tracker, subagent tracker, hardware detection, Pastor tuning state
2. **19.B-1 cores ANSI** (45 min) — wrap tier values in escape codes, fallback for non-tty
3. **19.B-2 VRAM live** (2h) — new module `hardware_live.js`, nvidia-smi spawn cached 5s, fallback macOS
4. **19.B-3 context window bar** (1h) — getContextWindowUsage helper + bar renderer + format

### Tarde (~5h)
5. **19.B-4 LoRA evolution** (1.5h) — read tuning-state.json + delta_last_7d + render chip
6. **19.B-5 herds always-on** (1.5h) — expand subagent_tracker snapshot in statusline, always render
7. **19.B-6 workflow mode** (45 min) — conditional ⚡ when peak ≥3 concurrent
8. **Visual + perf review** (45 min) — render width check, terminal compat
9. **Tests** (45 min) — 6 new (1 per sub-feature)
10. **classify.js sha256 check** (5 min)
11. **PR squash→dev** branch `wave19-day2-enhanced-statusline`
12. **final-reviewer T2 Sonnet** com foco em ANSI compatibility + perf

---

## 5. Definition of Done (Day 2)

1. ✅ Tokens-per-tier cores ANSI: T0🟢 T1🔵 T2🟡 T3🔴 (with non-tty fallback)
2. ✅ VRAM live read via nvidia-smi (cached 5s) + GB used/total format
3. ✅ Claude Max context window bar `▰▰▰▱▱` + ctx percentage
4. ✅ LoRA evolution chip: `🧬 <name> v<X> · trained on N decisions · +N pp last 7d`
5. ✅ Herds always-on chip: `🐄 0/17/peak9` (active/total/peak)
6. ✅ Workflow mode indicator ⚡ when concurrent ≥3
7. ✅ Tests router + 6 new
8. ✅ classify.js byte-identical
9. ✅ PR squash→dev + tag dev `v1.9.8-statusline-enhanced-dev`

---

## 6. Anti-patterns

- ❌ NÃO partir Day 1 token tracker (PR #102 mantido intacto)
- ❌ NÃO inventar VRAM percentage if nvidia-smi unavailable — fallback `?% (no live)`
- ❌ NÃO inventar LoRA `+N pp` boost — só se tuning-state.json tem delta data
- ❌ NÃO assume ANSI support — fallback plain text if `TERM` is dumb
- ❌ NÃO call nvidia-smi every render — cache 5s minimum
- ❌ NÃO partir Wave 13 subagent_tracker.js API
- ❌ NÃO call Claude API extra para context measurement — usar transcript size
- ❌ NÃO touch hub/CLI/schema
- ❌ NÃO `git add -A`

---

## 7. Master prompt para CC (paste when ready)

```
Inicia Wave 19 Day 2 Enhanced Statusline conforme docs/strategy/WAVE19_DAY2_ENHANCED_STATUSLINE_KICKOFF.md.

Pré-flight: Day 1 (PR #102 token tracker) merged → dev. Cowork merged. v1.9.7-token-tracker-dev applied.

Scope: 6 sub-features Paulo flagged 2026-06-05:
  1. Tokens-per-tier cores ANSI (T0 verde/T1 azul/T2 amarelo/T3 vermelho)
  2. VRAM live real-time via nvidia-smi (cached 5s)
  3. Claude Max context window evolution bar
  4. LoRA evolution real-time indicator (read tuning-state.json from Wave 16-18 Tier C)
  5. Moos/Herds always-on chip (expand Wave 13 subagent_tracker snapshot)
  6. Concurrent Moos workflow mode indicator ⚡ when ≥3 active

Lê PRIMEIRO:
  - docs/strategy/WAVE19_DAY2_ENHANCED_STATUSLINE_KICKOFF.md inteiro
  - docs/strategy/WAVE19_TOKEN_TRANSPARENCY_REPORTER_KICKOFF.md (Day 1 context)
  - tools/router/statusline-multi.js (current state pós-Day 1)
  - tools/router/token_tracker.js (PR #102 just merged)
  - tools/router/subagent_tracker.js (Wave 13 herd state machine — extend)
  - tools/router/tuning-state.defaults.json (Wave 16-18 Tier C Pastor schema)
  - tools/router/classify.js (P11 sha256 7b01eb86...87762 — GUARD)

Non-negotiables:
  - classify.js byte-identical (GUARD em cada commit)
  - Day 1 token tracker mantido intacto (chip 🪙 still works)
  - Wave 13 subagent_tracker API unchanged
  - Hooks NÃO lançam (try/catch wrap em nvidia-smi spawn + file reads)
  - ANSI codes wrapped in TTY check (fallback plain)
  - NÃO inventar VRAM/LoRA metrics — only render if data confirmed
  - Cache nvidia-smi 5s minimum (perf)
  - Zero hub touch / zero CLI changes
  - Tests router + 6 new

Sequência (~1.5 dias autonomous):
  Manhã (5h):
    1. Recon (30 min)
    2. 19.B-1 ANSI cores per tier (45 min)
    3. 19.B-2 VRAM live module hardware_live.js + nvidia-smi (2h)
    4. 19.B-3 context window bar getContextWindowUsage helper (1h)
  Tarde (5h):
    5. 19.B-4 LoRA evolution tuning-state.json reader (1.5h)
    6. 19.B-5 herds always-on chip expand subagent_tracker snapshot (1.5h)
    7. 19.B-6 workflow mode ⚡ conditional (45 min)
    8. Visual + perf + width review (45 min)
    9. Tests 6 new (45 min)
    10. classify.js sha256 check
    11. PR squash→dev branch wave19-day2-enhanced-statusline
    12. final-reviewer T2 Sonnet (ANSI compat + perf focus)

Tag dev v1.9.8-statusline-enhanced-dev. NÃO promote prod (Wave 19 closure Day 4).

Reporta WAVE19_DAY2_FINDINGS.md se houver decisões (e.g. terminal compat edge cases, nvidia-smi macOS missing).

Cost target: ~1.5 dias CC autonomous. Stop após PR open.

Paulo vai ver friends-launch ready showcase com transparência total.
```

---

**Composed by Cowork, 2026-06-05 night. 6 Paulo considerations addressed. ~1.5
dias CC autonomous. Tag dev v1.9.8-statusline-enhanced-dev. Promote final no Wave
19 closure Day 4 (consolidated v1.10.0-token-transparency).**
