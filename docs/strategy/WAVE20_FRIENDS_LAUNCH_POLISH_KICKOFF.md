# Wave 20 — Friends-Launch Polish & Accuracy

> **Goal**: 7 fixes Paulo flagged 2026-06-05 pós-Wave 19 promote.
> Critical: branding leak ("frugal recommends") + herd display broken
> + login flow validation. Important: clarity (tkns label, tokens vs
> calls proportion). Polish: dynamic workflow visibility + end-of-task
> LLM full breakdown.
>
> **Pre-friends-launch GO/NO-GO blockers**: #6 (frugal) + #1 (herd) + #7 (E2E)
>
> **Scope**: 3 critical fixes IMMEDIATE + 4 enhancements parallel. ~6-8h CC.
> Tag prod `v1.11.0-friends-launch-polish`.
>
> **Non-negotiables**:
> - `classify.js` byte-identical (P11 sha256 `7b01eb86...87762`)
> - Wave 19 token tracker mantido intacto
> - Wave 13 subagent_tracker.js API mantida
> - Zero PII em prompts/output
> - Zero hub touch (tooling-only wave again)

---

## 0. Considerações Paulo (verbatim 2026-06-05)

1. "Não vi até agora os moos em herds na statusline ou se foram utilizados"
2. "A proporção de local não parece fazer sentido quando se compara com a quantidade de tokens utilizados por tier"
3. "Não fica claro que cada tier são tokens, deveria ter algum label de 'tkns' ou algo do tipo"
4. "Solução estilo dynamic workflow tem que funcionar perfeitamente. Precisamos de agentes locais ou moos trabalhando sem parar e sempre mostrando a transparência do seu trabalho"
5. "Não mostra no final de uma task grande quais foram os LLMs (local + subscription) por task e o motivo de escolher aquele LLM"
6. "Vejo em alguns prompts 'frugal suggests' ou algo assim. Todo bash precisa só mostrar qual foi o LLM utilizado para aquela tarefa e sem muita frescura"
7. "Não validei ainda se ao clicar no mooter.ai para logar com github, a página de login e área logada estão harmonicamente se falando com a landing, e se o processo de login + setup + download está funcionando perfeitamente"

---

## 1. Sub-features (7)

### 20.A — Branding cleanup: `frugal recommends` → `mooter recommends` (CRITICAL)

**Root cause**: bash hint UserPromptSubmit emite "frugal recommends" — branding leftover pré-rebrand 2026-04-14.

**Fix**:
- grep all `frugal recommends|frugal-` em `tools/router/*` e `~/.claude/`
- Substituir por simplest variant Paulo wants: just `→ T0 · qwen3:30b` (no "recommends" preamble)
- OR `mooter routes → T0 qwen3:30b` if preamble desired

**Anti-pattern**: NÃO quebrar UserPromptSubmit hook (Wave 5).

**Estimate**: 30 min CC.

### 20.B — Herd chip display fix (CRITICAL)

**Root cause**: 🐄 0/0/peak0 mesmo após múltiplas sessões com local-summarizer. Wave 13 subagent_tracker.js está a contar mas display reader não está a snapshotar correctamente OR scope per-session vs total broken.

**Fix path**:
- Debug subagent_tracker snapshot: cat `/tmp/mooter-herd-<session>.json` to verify writes
- Check `subagent_tracker.snapshot()` is reading the right session id
- Verify statusline-multi.js `buildHerdsChip` filter logic
- Possible regression in Day 4.2 follow-ups (FU5 session-id correlation may have affected herd state too)

**Estimate**: 1h CC investigation + fix.

### 20.C — `tkns` label on token chip (IMPORTANT)

**Current**: 🪙 T0:13.3k · T1:0 · T2:24.2k · T3:2.0M
**Target**: 🪙 T0:13.3k tkns · T1:0 · T2:24.2k · T3:2.0M
OR: 🪙 tokens — T0:13.3k · T1:0 · T2:24.2k · T3:2.0M

**Decision Paulo flag**: which format clearer? Brief proposes Option A (per-tier suffix) for compact.

**Estimate**: 15 min CC + tests.

### 20.D — Tokens vs Calls proportion fix (IMPORTANT)

**Current**: `🏠 5/9 local · 60% local` — measures CALLS, not TOKENS.
**Problem**: friend sees "60% local" + statusline shows T0:491 T3:433k → 99.9% T3 by tokens, 60% local by calls. Mismatch confusing.

**Target**: 2 metrics shown:
- `🏠 5/9 local · 60% calls local · 0.1% tokens local`
- OR rename: `🏠 calls 5/9 (60%) · tokens 0.1% local`

**Anti-pattern**: NÃO inventar — only compute from real token_tracker snapshot.

**Estimate**: 30 min CC.

### 20.E — Dynamic workflow always-visible (POLISH)

**Goal**: friend sees local moos working sempre — herd never appears "asleep" when local actively executing.

**Fix path**:
- Verify Wave 13 + Day 2 herd state machine is real-time
- statusline render frequency check (per render vs cached 5s?)
- Add subtle "pulse" indicator when ≥1 active

**Estimate**: 1h CC.

### 20.F — Stop digest LLM+reason breakdown enhancement (POLISH)

**Current** (Day 4):
```
🐮 Mooter session report — Xm Ys
  TOKENS BY TIER ...
  CHOICE REASONS ...
```

**Target Paulo wants — show ALL tasks**:
```
PER-TASK BREAKDOWN
  Task 1: "summarize file X" → local-summarizer (qwen3:30b T0) · 1.2k→300 tkns · reason: classify_score=0.85 T0
  Task 2: "architecture decision Y" → claude-opus-4-6 (T3) · 5k→2k tkns · reason: arch_decision force_t3
  Task 3: "code review Z" → claude-sonnet-4-6 (T2) · 3k→1.5k tkns · reason: code_review depth>0.7
```

Reads `decisions_v2.jsonl` (Day 3) and formats per-task lines.

**Estimate**: 1.5h CC.

### 20.G — E2E friends-launch validation (CRITICAL gate)

**Goal**: Paulo (or Cowork via Chrome MCP) valida E2E:
1. Open mooter.ai incognito
2. Click "Sign in with GitHub"
3. OAuth flow → callback
4. /onboarding wizard 3 steps
5. Get install token URL
6. CLI install in WSL/Docker
7. mooter init + login
8. First prompt → statusline updates
9. mooter feedback → 201

**Output**: `WAVE20_E2E_FRIENDS_LAUNCH_VALIDATION_RESULTS.md` PASS/FAIL per step.

**Estimate**: 30 min Cowork via Chrome MCP + 10 min Paulo WSL.

---

## 2. Sequência (1 PR consolidado OR 3 PRs por severity)

### Option A — Single PR consolidated (faster, ~6h CC)
- Branch `wave20-friends-launch-polish`
- All 7 fixes
- Tag dev `v1.11.0-friends-launch-polish-dev`
- Promote prod `v1.11.0-friends-launch-polish`

### Option B — 3 PRs by severity (~7h CC, cleaner blame)
- PR-A: 20.A + 20.B + 20.G (critical) — promote prod FIRST (`v1.10.2-critical-fixes`)
- PR-B: 20.C + 20.D (important) — promote prod (`v1.10.3-clarity`)
- PR-C: 20.E + 20.F (polish) — promote prod (`v1.11.0-polish`)

**Recommendation**: Option A — 7 small fixes, similar risk profile, consolidated promote. Saves ~1h overhead.

---

## 3. Non-negotiables

| # | Item | Como verificar |
|---|---|---|
| 1 | classify.js byte-identical | sha256sum em cada PR commit |
| 2 | Wave 19 token tracker mantido | tokens 4-tier chip still renders |
| 3 | Wave 13 subagent_tracker API | snapshot() shape unchanged |
| 4 | Zero PII | grep payload schemas |
| 5 | Zero hub touch | landing CI rebuild = no-op |
| 6 | UserPromptSubmit hook intact | smoke test bash output em sessão |
| 7 | E2E PASS pre-promote | Wave 20 G validation report |

---

## 4. Definition of Done (Wave 20)

1. ✅ Zero `frugal recommends` em qualquer output
2. ✅ Herd chip 🐄 N/M/peakK funciona em real-time (verificar com spawn local-summarizer)
3. ✅ Token chip tem `tkns` label
4. ✅ Local % chip mostra BOTH calls AND tokens proportions
5. ✅ Dynamic workflow visibility — local always shown when active
6. ✅ Stop digest mostra per-task LLM+tokens+reason breakdown
7. ✅ E2E validation PASS pre-promote
8. ✅ Tag prod `v1.11.0-friends-launch-polish` em main
9. ✅ Notion sub-page + archive findings

---

## 5. Master prompt para CC (paste when ready)

```
Inicia Wave 20 Friends-Launch Polish & Accuracy conforme docs/strategy/WAVE20_FRIENDS_LAUNCH_POLISH_KICKOFF.md.

Pré-flight: Wave 19 v1.10.1-day42-followups EM PROD (main 63d5ff8). Paulo flagged 7 considerações pre-friends-launch.

Scope: 1 PR consolidado com 7 fixes — 3 critical (20.A frugal branding leak + 20.B herd chip broken + 20.G E2E validation) + 2 important (20.C tkns label + 20.D tokens vs calls proportion) + 2 polish (20.E dynamic workflow always-visible + 20.F Stop digest per-task LLM+reason).

Lê PRIMEIRO:
  - docs/strategy/WAVE20_FRIENDS_LAUNCH_POLISH_KICKOFF.md inteiro
  - tools/router/inject_context.js (UserPromptSubmit hook que emite "frugal recommends")
  - tools/router/subagent_tracker.js (Wave 13 herd state — debug 🐄 0/0/peak0 bug)
  - tools/router/statusline-multi.js (buildTokenChip + buildHerdsChip + local %)
  - tools/router/token_tracker.js (Wave 19 snapshot)
  - tools/router/stop_hook.js (Wave 13.1 + Day 4 Stop digest)
  - tools/router/decisions_v2.js (Day 3 per-call log)
  - tools/router/classify.js (P11 sha256 7b01eb86...87762 — GUARD)

Non-negotiables:
  - classify.js byte-identical (GUARD em cada commit)
  - Wave 19 token tracker intacto (4-tier chip mantém)
  - Wave 13 subagent_tracker.snapshot() API unchanged
  - Zero PII em prompts/output
  - Zero hub touch
  - UserPromptSubmit hook não parte (Wave 5)
  - Tests router + 7 new

Sequência (~6-8h autonomous):

Day 1 — Critical fixes (~3h):
  1. Recon (30 min): grep "frugal recommends" + diagnose herd 0/0/peak0 + E2E plan
  2. 20.A branding cleanup (30 min): substituir "frugal recommends" por "→ T_ · model" minimal
  3. 20.B herd chip fix (1h): debug subagent_tracker snapshot path + reader sync + scope per-session
  4. 20.G E2E validation prep (1h): test sequence script ready for Cowork Chrome MCP

Day 2 — Important + polish (~3-4h):
  5. 20.C tkns label (15 min)
  6. 20.D tokens vs calls dual metric (30 min)
  7. 20.E dynamic workflow always-visible (1h)
  8. 20.F Stop digest per-task breakdown (1.5h)
  9. Tests 7 new (1h)
  10. classify.js sha256 check
  11. PR squash→dev branch wave20-friends-launch-polish
  12. final-reviewer T2 Sonnet

Tag dev v1.11.0-friends-launch-polish-dev. NÃO promote prod até Cowork E2E validation PASS.

Reporta WAVE20_DAY_X_FINDINGS.md por dia. Documenta decisões (e.g. "frugal recommends" → exact replacement string).

Após PR open, Cowork executa E2E validation via Chrome MCP (sequência §1 20.G do brief). Se PASS, Paulo gate prod promote.

Tag prod final: v1.11.0-friends-launch-polish.
```

---

**Composed by Cowork, 2026-06-05 pós-Wave 19 v1.10.1 prod. 7 fixes from Paulo's
considerations. ~6-8h CC autonomous. Tag v1.11.0. Friends-launch GO after this wave.**
