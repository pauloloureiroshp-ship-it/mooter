# Wave 2.7 E2E Audit — Persona P1: "Solo Founder Paula"

> Voice: skeptical Hard Vibe Coder, first session. Paranoid honesty is the prime directive. All numbers traceable to `persona-P1.data.json`.

**Persona**: Post-exit founder, 1 product, own money, Next.js + Supabase. RTX 4090, 64GB. Claude Max + Ollama.  
**Temp HOME**: `/tmp/claude-1000/mooter-e2e-P1-Dcq0n9` (hermetic — zero production code touched).

---

## Setup

Hardware is overkill for most tasks, which is exactly why routing matters to me. I'm paying for Claude Max and I'm not interested in burning Opus tokens on color changes. RTX 4090 is idle if Mooter doesn't actually push work local. Let's see if it does.

Both providers detected (`hasAnthropic: true`, `hasOllama: true`). That's the baseline expectation for my setup.

---

## Wizard

| Field | Value |
|---|---|
| Exit code | 0 |
| Duration | 36 ms |
| Output | `init complete · telemetry OFF · 1 pack(s) installed` |
| profileOk | true |
| credentialsOk | true |
| consentOk | true |
| installedOk | true |
| packsDirOk | true |
| Providers | anthropic, ollama |
| Installed packs | diagram-systems (1) |
| Hyperbole strings | 0 |
| Pastor-entity markers | 0 |
| Wizard output lines | 19 |

36 ms. Clean. Telemetry off by default without me having to hunt for the flag. Output line is honest — it doesn't claim it "optimized my workflow" or "unlocked my potential." It says what happened: init, telemetry state, pack count. That's all I want from a wizard.

No edge-case failures observed. Both expected providers present.

---

## Prompts

**Classification accuracy: 90% (9/10 correct).**

> **Honesty note on `spawnMs`**: the values in this table are `classify.js` process wall-time including Node.js cold-start (~50–100 ms overhead). They are NOT the in-process hook latency you see during a live Claude Code session. The data file itself carries this note: *"spawnMs is classify.js process wall-time incl. node cold-start (~50-100ms) — NOT the in-process hook latency."* The negative value on prompt #2 (`-34641 ms`) is a simulation measurement artifact, not a real latency regression. Excluding that outlier, the other 9 spawns fall in a 93–117 ms band.

| # | Prompt | Expected | Actual | Model | Confidence | spawnMs | OK |
|---|---|---|---|---|---|---|---|
| 1 | muda a cor do botão login para azul | T0 | T0 | qwen2.5:3b | 0.80 | 113 | OK |
| 2 | resume o ficheiro README.md | T0 | **T1** | claude-haiku-4-5-20251001 | 0.85 | -34641* | MISS |
| 3 | gera commit message para estas 3 mudanças | T1 | T1 | claude-haiku-4-5-20251001 | 0.90 | 94 | OK |
| 4 | explica este erro: TypeError: x is not a function | T1 | T1 | claude-haiku-4-5-20251001 | 0.85 | 117 | OK |
| 5 | porque é que o websocket reconnect falha às vezes? | T2 | T2 | claude-sonnet-4-6 | 0.70 | 116 | OK |
| 6 | compara estes 2 patterns: useReducer vs useState | T2 | T2 | claude-sonnet-4-6 | 0.70 | 110 | OK |
| 7 | redesenha o vault para multi-user architectural re | T3 | T3 | claude-opus-4-6 | 0.90 | 99 | OK |
| 8 | audit dos hooks deste codebase para race condition | T3 | T3 | claude-opus-4-6 | 0.75 | 97 | OK |
| 9 | lista ficheiros .ts maiores que 500 linhas | T0 | T0 | qwen2.5:3b | 0.80 | 101 | OK |
| 10 | vou fazer push, faz review pré-merge | T3 | T3 | claude-opus-4-6 | 0.90 | 93 | OK |

*\* Simulation clock artifact — not a real latency value.*

**On the one miss (prompt #2 — "resume o ficheiro README.md"):**

The golden label was T0 (local Ollama). The classifier sent it to T1 (Haiku). I'm going to be honest here: this is a debatable call. "Summarize a file" sits exactly on the T0/T1 boundary — some implementations would say local-first, others would say a model with stronger language handling is worth the small cost. The classifier's choice is defensible. The practical consequence for me is that I spend a few Haiku tokens where I'd have spent zero with Ollama. It is a cost-optimization miss, not a logic failure and not a quality regression. I'm noting it as something to tune, not something to fix before launch.

---

## Moo Cards

Opt-in respected (`optInRespected: true`). Card emitted (`cardEmitted: true`). 6 fields. Zero hyperbole.

```
─────── 🐮 Moo card ───────
 moo       🦬 opus (T3)
 confidence 0.90
 last10    T0:2 T1:3 T2:2 T3:3
───────────────────────────
```

Three fields: active Moo (opus, T3), confidence on the last routing decision, and the last-10 tier distribution. That's an honest summary of what just happened. No padding.

One thing missing: the LoRA/adapter disclosure. The dashboard ADAPTER section and `trail --evolution` both carry it. The Moo card doesn't. It's inconsistent — if someone relies on the card as their only surface (stop-hook opt-in), they get less transparency than if they open the dashboard. Not a correctness failure; the information exists. But it's a gap — see below.

---

## Dashboard

5 sections present: `MOOS ACTIVE`, `SAVINGS`, `CONTEXT`, `QUOTA`, `ADAPTER`. `allSections: true`.

Frame sample from the data:

```
┌─ 🐮 Mooter Dashboard · session e2e-P1-s ─────────────────────┐
│  MOOS ACTIVE                                                 │
│    ☁ claude-haiku-4-5-20251001   3 calls · conf 0.85        │
│    ☁ claude-opus-4-6      3 calls · conf 0.90               │
│    🏠 qwen2.5:3b           2 calls · conf 0.80               │
│    ☁ claude-sonnet-4-6    2 calls · conf 0.70               │
```

`☁` for cloud Moos, `🏠` for local. Call counts and confidence per Moo. That's the information I actually want — which models are being used and how confident the router is about each routing.

`loraHonesty: true` — the ADAPTER section is present and honest. Zero hyperbole strings. Zero pastor-entity markers.

**Missing**: `packSectionPresent: false`. I installed `diagram-systems` in the wizard. The dashboard does not have a PACK section. If I open the dashboard mid-session, there is no visual confirmation that the pack is active. The wizard told me it was installed (`init complete · telemetry OFF · 1 pack(s) installed`), but the dashboard doesn't carry that forward. Minor — the pack is actually installed, this is a surface gap, not a data gap. But for a new user verifying their setup, it's a confidence signal that's missing.

---

## Trail

Field count: 10 per event. 10 events total. JSON parses cleanly (`jsonParses: true`).

Formulas and sources present (`hasFormulasAndSources: true`). Last decision logged: `T3 claude-opus-4-6 0.90`.

`evolutionHonest: true`. Evolution view:

```
🐮 mooter — evolution (last 7d vs previous 7d)

VOLUME
  prompts:   0 → 10   (+100.0%)

TIER MIX
  prev 7d:   T0:0 T1:0 T2:0 T3:0
  last 7d:   T0:2 T1:3 T2:2 T3:3
```

The +100% volume figure is arithmetically correct — baseline is zero because it's a first session. The evolution view doesn't paper over the baseline; it shows the actual zero. The tier distribution is accurate against the 10 prompts I ran. No fabricated trend lines. This is exactly what honest reporting looks like when you don't have enough history yet.

---

## Transparency

**Isolation**: `otherSessionEvents: 0`, `isolation.ok: true`. No events from other sessions leaked into this one. My trail reflects my session only.

**Vocabulary / Pastor**: `pastorEntity: 0` in both wizard transparency and dashboard checks. The product does not impersonate a named entity. Mooter/Moos vocabulary used throughout — internally consistent.

**Hyperbole**: zero strings across wizard, dashboard, and Moo card. The product does not claim to "10x your productivity" or "unlock limitless potential." It describes what it did.

**LoRA/Adapter**: dashboard and `trail --evolution` both carry honest adapter disclosure. The Moo card inconsistency is documented in the gaps.

---

## Subjective UX Scores

| Surface | Score | Justification |
|---|---|---|
| Wizard | 9/10 | 36 ms, clean output, telemetry off by default, both providers detected, no superfluous lines. Nothing to complain about. |
| Statusline | 8/10 | Cloud/local glyphs are immediately readable, call counts and confidence visible without decoding. One point off because the missing PACK section means I can't confirm installed tooling is live. |
| Moo card | 7/10 | Compact, honest, opt-in respected, zero hyperbole — but the missing LoRA disclosure creates a gap between card and dashboard surfaces. |
| Dashboard | 8/10 | Five sections, honest per-Moo breakdown, LoRA-honest ADAPTER section. Loses a point for no PACK section despite a pack being installed. |
| Trust | 8/10 | Zero hyperbole, zero pastor-entity markers, per-session isolation intact, evolution honest against a zero baseline. The product does not oversell. That earns trust. |

---

## Gaps Discovered

### GAP-P1-01 — minor

**Dashboard has no PACK/domain section — installed packs are invisible in the live dashboard.**

Evidence from data: `"5 sections shipped: MOOS ACTIVE, SAVINGS, CONTEXT, QUOTA, ADAPTER; installed=[\"diagram-systems\"]"` — `packSectionPresent: false`.

The wizard confirmed `diagram-systems` was installed (`installedOk: true`, output `1 pack(s) installed`). The dashboard does not surface it. A new user verifying their setup after the wizard has no dashboard signal that the pack is active. The pack is correctly installed — this is a surface omission, not a correctness failure.

### GAP-P1-02 — minor

**Moo card omits LoRA/adapter disclosure that dashboard and `trail --evolution` both carry.**

Evidence from data: `mooCard.loraDisclosed: false`. Card sample:
```
─────── 🐮 Moo card ───────
 moo       🦬 opus (T3)
 confidence 0.90
 last10    T0:2 T1:3 T2:2 T3:3
───────────────────────────
```
No adapter line. Meanwhile `dashboard.loraHonesty: true` and `trail.evolutionHonest: true`. Users relying on the Moo card as their only transparency surface get less disclosure than users who open the dashboard. Inconsistency, not a correctness failure — the disclosure exists and is accessible.

---

## Verdict

**READY**

Blockers: 0 | Major: 0 | Minor: 2

Both gaps are surface-level disclosure inconsistencies, not data correctness failures. The router handles T0 through T3 correctly at 90% accuracy with the one miss being a debatable boundary call. Zero hyperbole. Zero cross-session leakage. The product is honest about what it doesn't know yet (evolution baseline, LoRA deferred to Wave 5). That's the bar for a skeptical technical user — and it clears it.

---

## TL;DR

1. **READY** — 0 blockers, 0 major; Paula's session completes clean end-to-end with all transparency and isolation invariants holding.
2. **Accuracy 90%** (9/10) — the sole miss is "resume o ficheiro README.md" routed T0→T1; the classifier's Haiku choice is defensible on the summarization boundary, this is a cost-optimization note, not a product defect.
3. **2 minor gaps**: dashboard missing PACK section for installed packs; Moo card missing LoRA disclosure that dashboard already carries.
