# Wave 13 — "Show the Herd": Local Moos Visibility

> **Concept**: surface the count, identity, and activity of **Moo agents** (local subagents) working in
> parallel to the user — in the statusline (live counter), in bash command output (live
> per-tool annotation), and in the Stop-hook digest (cumulative tally).
>
> **Why this earns its place**: a vibe coder on Claude Code today has no way to see that *3
> local agents just summarized 3 files for free*. The cloud calls are visible (they
> charge you); the local work is invisible. Mooter inverts that — the cheaper the work,
> the more visible it should be.
>
> **Philosophy thread (don't lose)**:
> - 🐮 **Pastor** = Mooter coordinator (singular)
> - 🐄 **Moo** = a local subagent worker (one per spawn)
> - 🌾 **Pasto** = the idle/baseline state
> - The herd grows when work happens; the herd disperses when work ends.
>
> **Non-negotiables (same as Wave 12.1)**:
> - `classify.js` byte-identical (P11)
> - No new schema fields in `mooter_event`
> - Counter is pure runtime state (tracker process or hook state), not persisted
> - No prompt text in any new output
> - Existing savings / tier calculations UNCHANGED

---

## 0. Familiarity bridge — Claude Dynamic Workflows ↔ Mooter Moos

> **Why this section exists** (added 2026-06-03 per Paulo's direction): vibe coders on Claude
> Code in 2026 are already familiar with **Dynamic Workflows** (Anthropic shipped them in
> May 2026 alongside Claude Opus 4.8 — up to 16 concurrent subagents, capped at 1000 per
> run). The mental model "spawn many subagents in parallel" is no longer exotic.
>
> **Mooter Moos should reuse that mental model**, then solve the *single open UX problem*
> that Dynamic Workflows explicitly left unsolved.

### What Dynamic Workflows did well (we inherit the mental model)

From the [Anthropic blog](https://claude.com/blog/introducing-dynamic-workflows-in-claude-code)
and [InfoQ coverage](https://www.infoq.com/news/2026/06/dynamic-workflows-claude-code/):

- **Per-prompt decomposition**: Claude writes the orchestration script at runtime, breaks the prompt into subtasks, fans the work to subagents.
- **Parallel execution**: 16 concurrent agents (cap), up to 1000 total per workflow.
- **Convergence checking**: agents try to refute each other; the run iterates until answers converge.
- **Resume safety**: progress is saved; an interrupted job resumes within the same session; completed agents return cached results.

Mooter Moos **adopt this exact mental model**. A vibe coder who has used Dynamic
Workflows on Opus 4.8 already understands what "spawning 4 Moos" means. We don't invent a
new vocabulary; we inherit it.

### What Dynamic Workflows did NOT solve (our opportunity)

The most cited friction in [Claude Code Sub-Agents Guide 2026](https://www.aibuilderclub.com/blog/claude-code-sub-agents-guide)
and the [PubNub best-practices doc](https://www.pubnub.com/blog/best-practices-for-claude-code-sub-agents/):

> "There is no interactive 'thinking' mode or transparent intermediate output, making it
> challenging to monitor progress or debug issues until after subagent execution finishes,
> creating a tradeoff that yields parallel productivity but reduces real-time visibility."

In plain words: **Dynamic Workflows are a black box during execution**. You give Claude a
prompt, you wait, you see the final answer. The 16 subagents in flight are invisible.

**This is the opening for Mooter.**

### The Mooter Moos answer (one bullet per Dynamic Workflows pain point)

| Dynamic Workflows pain | Mooter Moos resolution |
|---|---|
| "No real-time visibility into parallel agents" | Statusline shows `🐄×N` live counter; bash output shows per-agent one-liner as Moos spawn/finish |
| "No transparent intermediate output" | `standard` verbosity prints `🐄 local-summarizer × 3 files · qwen2.5:3b · avg 240ms` as it happens — not after |
| "Hard to debug when something goes wrong" | Stop digest lists every Moo class, its average latency, and (Wave 14) marks failures with a 🔴 glyph |
| "Black box for cost attribution" | Each Moo line shows the *avoided* cloud cost: `🐄 × 8 · saved est. $0.12` |
| "Local agents are invisible by design" | Mooter inverts the contract: **the cheaper the work, the louder it speaks** |

### Familiarity bridge — the comparison table for `/under-the-hood`

This belongs on the marketing page after Wave 13 ships:

| Capability | Claude Dynamic Workflows | Mooter Moos |
|---|---|---|
| Spawned per prompt | ✅ (up to 16 concurrent) | ✅ (no fixed cap; bounded by your hardware) |
| Subagent count visible during execution | ❌ hidden until final answer | ✅ `🐄×N` live in statusline |
| Per-agent activity log | ❌ no transparent intermediate output | ✅ one-line per spawn (standard verbosity) |
| Per-agent latency reported | only after completion | live `avg 240ms` chip + Stop digest |
| Runs on Anthropic's cloud | ✅ (Opus 4.8 orchestrator) | hybrid — orchestrator stays on Claude Code; **workers can be local Moos with LoRA + quantization** |
| Cost per spawn | Anthropic billing (Opus/Sonnet/Haiku rates) | $0 for Moos (your hardware), cloud rates for the rest |
| Quantization-aware | n/a (cloud-only) | ✅ Moos use `Q4_K_M` by default (−72% size, −1pp quality) |
| LoRA/DoRA specialization | n/a | ✅ once Wave 5 Adapter Forge ships, Moos can hot-swap per-repo DoRA `r=32` adapters |
| Visible "peak concurrent" stat | not surfaced | Stop digest line: `peak concurrent: 3` |

This table is *the* Anthropic showcase moment. It says: **"we built on the mental model
you just shipped, and we filled the visibility gap you couldn't fill from the cloud."**

### Why local + LoRA + quantization is the *only* substrate that lets us be transparent

A cloud Dynamic Workflow can't show you per-subagent latency in real time because:
1. Showing live STDOUT for 16 concurrent cloud streams would saturate the terminal.
2. Cost-per-token of streaming intermediate output adds up.
3. The cloud orchestrator is opaque by design — it doesn't expose subagent identity except in the final aggregation.

A local Moo workflow can be transparent because:
1. **Hardware**: the user's GPU is right there; latency is local; no streaming cost.
2. **Quantization**: `Q4_K_M` Moos run fast enough that the one-liner annotation appears *during* the work, not after.
3. **LoRA/DoRA specialization** (Wave 5 Adapter Forge): a per-repo adapter is identifiable by name — `🐄 dora-adapter-mooter-r32 · 280ms` — turning every Moo line into a small piece of brand storytelling.
4. **Hook lifecycle**: Mooter's `PreToolUse` / `PostToolUse` hooks fire in-process; we own the render moment.

This is the answer Paulo gave the brief in his own words on 2026-06-03:
> "Ali é o ouro da solução junto com tudo que você já trouxe de visibilidade visual ao
> longo das tasks e na statusline."

The herd visibility is the *manifestation* of the local + quantized + LoRA-specialized
substrate. Cloud routers can copy the chip; they can't copy the underlying transparency
that makes the chip honest.

### What changes elsewhere in Wave 13 because of this bridge

Minor, mostly cosmetic — the bridge enriches positioning, doesn't change implementation:

- `/under-the-hood` adds the comparison table above (PR adds one section, ~30 min CC)
- `/compare` v2 (from Wave 12 PR-D) gets one additional row: **"Live local subagent visibility"** → ✅ Mooter, ❌ all others (including Claude Code Dynamic Workflows)
- Stop digest header line tweak: **"Moos that worked the session"** stays, sub-header `(peak concurrent: 3 of 16 Anthropic equivalent)` is *optional* — only adds the cross-reference if Paulo wants the explicit comparison; otherwise drop the parenthetical.

### Honest caveat — what we are NOT claiming

- ❌ Mooter does **not** replace Dynamic Workflows. The orchestrator stays in Claude Code; Moos are workers.
- ❌ Mooter Moos can't run an arbitrary Anthropic subagent locally — they run the local agents Mooter defines (`local-summarizer`, `local-transformer`, etc.) plus whatever Adapter Forge produces.
- ❌ We don't claim 1000 concurrent Moos (Dynamic Workflows' cap is 1000 cloud agents; Mooter's effective cap is whatever the local GPU can hold). Don't fabricate parity where it doesn't exist.

The honesty layer is: **"we made the local side of the same idea visible."** That's it. That's enough.

---

## 1. The user-visible experience (designed for transparency)

### Context A — Statusline (always-visible, 1 line of state)

Three design directions, ordered from minimal to expressive:

**A.1 — Discrete counter (recommended baseline)**

```
🐮 saved $1.80 today (53%) ▁▁▁▁▁▁▁▁ last 10 · T0 qwen 0.80 · 🐄×3
```

The `🐄×3` chip means "3 Moos working right now". When zero, the chip becomes `🐄×0` (or fades to dim grey). One number, one glyph, predictable position.

**A.2 — State-word herd indicator**

Replace the chip with a verb that scales with the count:

```
🐮 saved $1.80 today (53%) ▁▁▁▁▁▁▁▁ last 10 · T0 qwen 0.80 · 🌾 grazing
```

| Active Moos | Word | Visual cue |
|---|---|---|
| 0 | 🌾 `grazing` | calm pasture, idle baseline |
| 1 | 🐄 `roaming` | one Moo away from the herd |
| 2-4 | 🐄🐄 `herding` | small active herd |
| 5+ | 🐄🐄🐄 `stampeding` | full coordination |

Trade-off: more memorable but cycles vocabulary; localization-fragile (English-only metaphor).

**A.3 — Animated dots + count (most expressive)**

```
🐮 saved $1.80 today (53%) ▁▁▁▁▁▁▁▁ last 10 · T0 qwen 0.80 · 🐄 ●●● 3
```

Three dots that pulse one-by-one while Moos are alive (TTY-only, falls back to static
`●●●` in non-interactive shells). Same data, more "live" feel. Higher implementation
cost (animation timing across hook ticks).

**Recommendation: ship A.1 (discrete counter) in Wave 13. A.2 / A.3 are Wave 14 polish
if Paulo wants expressiveness later.**

### Context B — Bash command output (during a `claude` prompt)

When the user types `claude "refactor the auth module"`, Mooter currently silently routes
to the right tier. The proposal: **annotate each spawned subagent with a one-line live
log**, gated behind a verbosity setting (`MOOTER_HERD_VISIBILITY=quiet|standard|verbose`,
default `standard`).

Standard mode (recommended default):

```
> claude "refactor the auth module"
🐮 Mooter classified → T2 sonnet · 3 Moos pre-fetching context
   🐄 local-summarizer × 3 files · qwen2.5:3b · avg 240ms
   ☁ Sonnet 4.6 · analyzing
✓ Done in 4.2s · 3 Moos local + 1 Sonnet · saved $0.18 (89% local) ▁
```

The key principles:
- **One line per agent class** (not per file) — aggregate `× 3 files` instead of 3 lines
- **Local Moos shown above cloud calls** — visual priority signals "this is where you saved money"
- **Closing tally line is essential** — sparkline glyph `▁` matches the tier bar in the statusline
- **No prompt text echoed** — the prompt itself is enough context

Quiet mode strips the middle block (only `🐮 Mooter classified → T2 sonnet ✓ saved $0.18`).

Verbose mode logs each file individually with confidence and latency, suitable for debugging.

### Context C — Stop-hook digest (end-of-session)

Existing digest already shows tier mix + savings. Wave 13 adds a **"Moos deployed" section**
right under the savings line:

```
✓ Session digest — 42 prompts · 1h 23m · saved $0.63 (76%)

  ┌─ 🏠 T0 local  qwen2.5:3b      ████████████████████  28  ·  66%  ·  $0.000
  ├─ ☁ T1 haiku                   ██████                 9  ·  21%  ·  $0.007
  ├─ ☁ T2 sonnet                  ███                    4  ·  10%  ·  $0.041
  └─ ☁ T3 opus                    █                      1  ·   3%  ·  $0.150

  Moos that worked the session  (─ peak concurrent: 3 ─)
    🐄 local-summarizer    × 8   avg 240ms · saved est. $0.12
    🐄 local-transformer   × 5   avg 180ms · saved est. $0.07
    🐄 cheap-triage       × 12   Haiku (cloud, not a Moo)
    ☁ model-reasoner       × 3   Sonnet
    ☁ model-architect      × 1   Opus

  Heaviest lifters today (Moos that earned their pasture):
    🐄 local-summarizer averaged 240ms across 8 file reads
    🐄 local-transformer collapsed 5 tier conversions
```

The phrase **"Moos that worked the session"** is intentionally pastoral — reinforces the
metaphor without being silly. Cloud agents are listed but without the 🐄 glyph (they're
not Moos; they don't live on the pasture).

**Peak concurrent** is the diagnostic that proves the system parallelized work — single
most concrete demonstration that Mooter does what it claims.

---

## 2. Implementation architecture (no schema changes)

### New file: `tools/router/subagent_tracker.js`

A lightweight in-process tracker. Pure JS state machine, no DB writes.

```
Module state:
  active = Map<spawn_id, {agent_name, tier, started_at, model}>
  cumulative = Map<agent_name, {count, total_ms, last_seen}>
  peak_concurrent = Number

API:
  trackSpawn({agent_name, tier, model})       → returns spawn_id, increments active + peak
  trackComplete(spawn_id, {duration_ms})       → moves from active to cumulative
  trackError(spawn_id, {error_class})          → moves from active to cumulative, marks error
  snapshot()                                   → returns {active_count, by_agent, peak, cumulative}
  reset()                                      → clears state (Stop-hook calls this AFTER rendering digest)
```

### Hook integration points

| Hook | Action | Why |
|---|---|---|
| `PreToolUse` on `Agent`/`Task` tool | `trackSpawn(...)` + re-render statusline | spawn detected |
| `PostToolUse` on `Agent`/`Task` tool | `trackComplete(spawn_id, ...)` + re-render statusline | spawn finished, decrement counter |
| `Stop` hook | `snapshot()` → render digest with Moos section → `reset()` | end-of-session tally |
| `UserPromptSubmit` (existing) | leave untouched — `subagent_tracker` is read-only at prompt time | |

The PreToolUse / PostToolUse hooks already exist (statusline + post_tool_badge). This wave
extends them with `subagent_tracker` calls; **no new hooks**.

### Files touched

| File | Why | Calc-safe? |
|---|---|---|
| `tools/router/subagent_tracker.js` | **NEW** state machine | n/a (no calc) |
| `tools/router/statusline-multi.js` | Render `🐄×N` chip on Line 1 | ✅ |
| `tools/router/post_tool_badge.js` | Add the 1-line `🐄 <agent> <n>×files` annotation when verbosity ≥ standard | ✅ |
| `tools/router/digest.ts` (Stop hook) | Add "Moos that worked the session" section | ✅ |
| `tools/router/inject_context.js` | Read `MOOTER_HERD_VISIBILITY` env var, expose to renderers | ✅ |
| `tools/router/__tests__/subagent_tracker.test.js` | NEW unit tests | n/a |
| `tools/router/__tests__/statusline.test.js` | Update snapshots for `🐄×N` chip | n/a |
| `classify.js` | UNCHANGED — P11 byte-identical | ✅ enforced |
| `sparkline.js` | UNCHANGED | ✅ |
| Hub / `mooter_event` schema | UNCHANGED — counter is in-process only | ✅ enforced |

### Verbosity setting (new env var)

```
MOOTER_HERD_VISIBILITY=quiet    # only closing tally line
MOOTER_HERD_VISIBILITY=standard # per-agent-class one-liner (default)
MOOTER_HERD_VISIBILITY=verbose  # per-file with confidence + latency
MOOTER_HERD_VISIBILITY=silent   # absolutely nothing extra (compatibility)
```

Surface in `mooter quiet --verbose | --quiet | --herd-off` to match existing CLI pattern.
Document in `/privacy` since the verbose log echoes file paths (still no prompt text).

---

## 3. Trade-offs Paulo decides

| # | Trade-off | Option A | Option B | Recomendação |
|---|---|---|---|---|
| T-1 | Statusline indicator | `🐄×3` chip (A.1) | State word (A.2) | **A.1** — predictable position, ship-able fast |
| T-2 | Default verbosity | `standard` | `quiet` | **`standard`** — show the herd by default; we want it visible |
| T-3 | Cloud agents in digest | List with `☁` glyph (different from `🐄`) | Drop from digest entirely | **A** — list them; honest visibility of *all* work |
| T-4 | "Peak concurrent" stat | Show always | Show only when >1 | **Show always** — proves parallelism even at 1 |
| T-5 | Animated dots (A.3) | Wave 13 | Wave 14+ | **Wave 14** — animation timing is its own design problem |
| T-6 | Mention 🐄 metaphor in Anthropic showcase rubric C5 | Yes | No | **Yes** — this is *the* unique differentiation moment |

---

## 4. Why this aligns with the brand + philosophy

**Pastoral metaphor consistency**: every existing Mooter mark already uses pastoral
imagery (🐮 hero, "shepherd", "Moo Packs", "got Moo?"). This wave makes the metaphor
**operational** — the herd is no longer a logo, it's a live count of work happening.

**Honesty layer**: the counter is real (not a vanity number). When zero Moos work, the chip
shows `🐄×0`. When they work, the count reflects actual spawns. No inflation.

**Anthropic showcase angle**: no competitor surfaces local agent counts. Cline shows "1
session"; Aider shows the current model; OpenRouter shows cloud calls. Mooter saying
"3 Moos pastoring" is **a sentence no one else can say**.

**Validation impact**: a vibe coder running Mooter for the first time sees the herd
counter tick up to 3, sees a Stop digest listing "Moos that worked", and immediately
understands the value — without having to read `/under-the-hood`. The metaphor *does the
explaining*.

---

## 5. Edge cases & honest caveats

- **CLI fallback when no PTY**: `🐄×3` chip becomes static. Animated A.3 falls back to A.1.
- **Hook ordering races**: if `PostToolUse` fires before `PreToolUse` for the same agent
  (rare but possible across slow tools), the tracker must be **idempotent** — `trackSpawn`
  is keyed by spawn_id from CC, duplicates are no-ops.
- **Counter drift across sessions**: tracker resets on Stop. If user kills the shell mid-session,
  state is lost — but Stop digest is the canonical tally, not the live counter.
- **No prompt text logged in any verbosity**: verbose mode logs **file paths** read by
  `local-summarizer`, not their contents. Document in `/privacy`.
- **"Moo agent" naming consistency**: in code, the existing subagents are named
  `local-summarizer`, `local-transformer`, `model-architect`, etc. Display those names
  verbatim; don't rename them to e.g. "Summarizer Moo" — the code stays canonical.

---

## 6. Estimated effort

| Phase | Work | Time |
|---|---|---|
| Phase 1 | `subagent_tracker.js` state machine + unit tests | ~1.5h CC |
| Phase 2 | Statusline `🐄×N` chip + snapshot tests | ~45min CC |
| Phase 3 | `post_tool_badge.js` per-agent annotation | ~1h CC |
| Phase 4 | Stop digest "Moos that worked" section | ~1h CC |
| Phase 5 | `MOOTER_HERD_VISIBILITY` env var wiring + CLI flag | ~30min CC |
| Phase 6 | Integration tests + Docker E2E (spawn 3 Moos, verify counter) | ~1h CC |
| Phase 7 | Update `/under-the-hood` + `/privacy` to mention herd visibility | ~30min CC |
| Phase 8 | Final-reviewer T3 + PR squash→dev → Cowork merge | ~30min |
| **Total** | ~6h CC + 1 Paulo gate | |

Single PR. Tag `v1.8.0-show-the-herd`.

---

## 7. What this is NOT

- ❌ Not a redesign of subagents (they exist and work; this only surfaces them)
- ❌ Not a metric / scoring change (counter is observational, doesn't gate routing)
- ❌ Not a new tier in T0-T3 (Moos work *across* tiers)
- ❌ Not a hub change (no telemetry on Moo counts; in-process only)
- ❌ Not animation-heavy (Wave 13 is static chip; animation is Wave 14)

---

## 8. Master prompt for CC (paste when Wave 12.1 PR-I ships and v1.7.x is in prod)

```
Inicia Wave 13 "Show the Herd" — local Moos visibility conforme docs/strategy/WAVE13_MOOS_VISIBILITY_MICROBRIEF.md.

Scope: surface contagem + identidade + actividade dos Moo agents (subagents locais) em três contextos:
  (a) statusline live (🐄×N chip, option A.1 recomendada)
  (b) bash command output (one-line per-agent annotation, default verbosity "standard")
  (c) Stop digest cumulative tally ("Moos that worked the session" section)

Pré-flight: Wave 12.1 PR-I (statusline polish) shipped + v1.7.x EM PROD. Tu (CC) tens as 6 microcopy changes da PR-I em produção — Wave 13 não rewrites isso, só adiciona o 🐄×N chip e os anexos.

Non-negotiables (RIGOROSAS):
- classify.js byte-identical (P11) — confirma sha256 antes/depois no PR body
- Counter é runtime-state (pure JS), zero schema changes em mooter_event
- Zero novas telemetria no hub
- Zero prompt text loggado em qualquer verbosidade (verbose pode mostrar file paths, não conteúdo)
- savings $, tier classification, sparkline, local % todos UNCHANGED

Arquitectura proposta:
- NOVO ficheiro: tools/router/subagent_tracker.js (state machine, API: trackSpawn/trackComplete/snapshot/reset)
- Hook integration: PreToolUse Agent tool → trackSpawn + statusline re-render; PostToolUse → trackComplete + re-render; Stop → snapshot + digest + reset
- statusline-multi.js: adiciona "🐄×N" chip na Line 1 entre tier-info e fim (zero indicador quando N=0)
- post_tool_badge.js: adiciona linha "🐄 <agent_name> × <n>" para os spawns no batch corrente
- digest.ts (Stop hook): nova secção "Moos that worked the session" com peak concurrent + per-agent stats

Nova env var: MOOTER_HERD_VISIBILITY=quiet|standard|verbose|silent (default "standard")
- Surface também em CLI: mooter quiet --verbose|--quiet|--herd-off (consistente com pattern existente)

Decisões Paulo gate (5):
1. Statusline indicator: A.1 chip (recomendado) vs A.2 state word vs A.3 animado
2. Default verbosity: standard (recomendado, show by default) vs quiet
3. Cloud agents in digest: listar com ☁ (recomendado) vs drop
4. Peak concurrent stat: show always (recomendado) vs only when >1
5. Animation (A.3): Wave 13 vs Wave 14 (recomendado Wave 14)

Sequência (8 phases ~6h CC):
Phase 1 — subagent_tracker.js + unit tests
Phase 2 — statusline 🐄×N chip + snapshot tests
Phase 3 — post_tool_badge per-agent annotation (standard verbosity)
Phase 4 — Stop digest "Moos that worked" section
Phase 5 — MOOTER_HERD_VISIBILITY env var + CLI flag wiring
Phase 6 — integration tests (spawn 3 Moos via mock Task tool, verify counter live + digest cumulative)
Phase 7 — Update /under-the-hood + /privacy to document herd visibility + new env var
Phase 8 — Final-reviewer T3 (confirma classify.js sha256 unchanged) + PR squash→dev → Cowork merge → tag v1.8.0-show-the-herd

Anthropic showcase angle: surface "Moos that worked" prominently in /under-the-hood Wave 13 update — this is the differentiation no competitor can replicate (Cline, Aider, Roo Code, Continue, OpenRouter, LiteLLM all hide their local work).

Reporta WAVE13_DAY1_FINDINGS.md no fim do Phase 1+2 com Paulo Gate (decide os 5 trade-offs antes de Phase 3+ avançar).
```

---

## 9. Sources & inspiration

### Claude Dynamic Workflows reference (familiarity bridge — §0)
- [Introducing dynamic workflows in Claude Code (Anthropic blog)](https://claude.com/blog/introducing-dynamic-workflows-in-claude-code)
- [Claude Code Adds Dynamic Workflows for Parallel Agent Coordination (InfoQ)](https://www.infoq.com/news/2026/06/dynamic-workflows-claude-code/)
- [Anthropic Ships Claude Opus 4.8 + Dynamic Workflows + Fast Mode (MarkTechPost)](https://www.marktechpost.com/2026/05/28/anthropic-ships-claude-opus-4-8-alongside-dynamic-workflows-and-cheaper-fast-mode-with-workflows-capped-at-1000-subagents/)
- [Dynamic Workflows: Complete Guide 2026 (ClaudeFast)](https://claudefa.st/blog/guide/development/dynamic-workflows)
- [Claude Code Sub-Agents Guide 2026 (AI Builder Club)](https://www.aibuilderclub.com/blog/claude-code-sub-agents-guide)
- [Best practices for Claude Code subagents (PubNub)](https://www.pubnub.com/blog/best-practices-for-claude-code-sub-agents/)
- [Claude Code Advanced Patterns: Subagents, MCP & Scaling (Anthropic resources PDF)](https://resources.anthropic.com/hubfs/Claude%20Code%20Advanced%20Patterns_%20Subagents,%20MCP,%20and%20Scaling%20to%20Real%20Codebases.pdf)
- [Agent SDK overview (Claude Code Docs)](https://code.claude.com/docs/en/agent-sdk/overview)
- [Create custom subagents (Claude Code Docs)](https://code.claude.com/docs/en/sub-agents)
- [Claude Opus 4.8 + Dynamic Workflows: Who Decides Decomposition (ChatForest)](https://chatforest.com/builders-log/claude-opus-4-8-dynamic-workflows-parallel-subagents-builder-architecture/)

### Mooter philosophy primary docs
- [STRATEGY.md (Mooter master strategy)](computer://C:\Users\Paulo Loureiro\frugal\docs\strategy\STRATEGY.md)
- [PASTOR.md (pastoral metaphor source)](computer://C:\Users\Paulo Loureiro\frugal\PASTOR.md) — if it exists in this version
- [WAVE12_STATUSLINE_POLISH_MICROBRIEF.md (predecessor)](computer://C:\Users\Paulo Loureiro\frugal\docs\strategy\WAVE12_STATUSLINE_POLISH_MICROBRIEF.md)
- [WAVE10_STATUSLINE_MOCKUPS.md (Variant C origin)](computer://C:\Users\Paulo Loureiro\frugal\docs\strategy\WAVE10_STATUSLINE_MOCKUPS.md)

### Industry references (terminal UI 2026)
- [Starship: minimal cross-shell prompt](https://starship.rs/)
- [Oh My Posh: JSON-themed prompt](https://ohmyposh.dev/)
- [Lualine.nvim: section-based status](https://github.com/nvim-lualine/lualine.nvim)
- [Powerline: pioneering segment style](https://github.com/powerline/powerline)
- [UX patterns for CLI tools (Lucas Costa)](https://lucasfcosta.com/2022/06/01/ux-patterns-cli-tools.html)
- [CLI UX best practices (Evil Martians)](https://evilmartians.com/chronicles/cli-ux-best-practices-3-patterns-for-improving-progress-displays)

### Multi-agent visibility prior art (none surface local agents this way — confirms differentiation)
- Cline (VSCode ext): shows current model selection, no agent count
- Aider: shows current LLM, no parallelism indicator
- Roo Code: shows current mode (Code/Architect/Ask/Debug), no agent breakdown
- Continue.dev: shows current model, no aggregate work view
- OpenRouter / LiteLLM: show cloud-only metrics

---

**Composed by Cowork, 2026-06-03. Wave 13 ships the herd visibility — the moment Mooter
goes from "explaining the metaphor" to "embodying it operationally". One PR, ~6h CC, ~30 min Paulo
gate. Tag v1.8.0-show-the-herd.**
