# Mooter Wave 2.7 E2E Audit — Persona P2: Senior IC Marco

> **TL;DR:** Marco's session completed clean — 0 blockers, wizard 38ms, isolation tight. The router handled 7/10 prompts correctly and saved real money on the trivial stuff. The one finding that matters: "design a sharding strategy for the events table" was routed T0 (qwen2.5:3b, confidence 0.8) when it warranted T3 — the classifier misfired on an architectural intent phrased without explicit trigger keywords, and a founder or IC trusting the router would have gotten schema design advice from a 3B local model.

---

## Persona

Marco is a senior IC at a FAANG-adjacent company. Python and Postgres are his stack. The company pays, so he's on Claude Max plus local Ollama (qwen3:7b). M3 Pro 32GB — no resource constraints. He's seen enough "intelligent" tooling ship foot-guns to be skeptical by default. He'll trust the Moo router the day it earns it, not the day it launches.

Temp HOME for this run: `/tmp/claude-1000/mooter-e2e-P2-A8Xrke`. Generated: `2026-06-03T12:00:00.000Z`.

---

## 1. Setup / Wizard

Exit code: 0. Duration: 38ms. Profile, credentials, consent, install, packs dir — all green.

```
init complete · telemetry OFF · 1 pack(s) installed
```

Providers detected: `anthropic`, `ollama`. Installed pack: `diagram-systems`. No friction, no hand-holding required. Marco would notice and appreciate that it respects telemetry-off at setup, not as a buried settings toggle.

`wizardTransparency`: 19 lines, no hyperbole detected, no past-or-entity language. The wizard says what it does and stops. Pass.

---

## 2. Prompts — Classification Accuracy

**Overall: 7/10 correct (70%). Avg spawnMs: 98ms.**

> **Honesty note on spawnMs:** The 83–113ms figures are `classify.js` process wall-time including Node.js cold-start, which accounts for roughly 50–100ms of that figure by itself. The actual in-process hook latency is materially lower. These numbers are not the routing overhead a warm process would show. The data file says so explicitly (`"note": "spawnMs is classify.js process wall-time incl. node cold-start (~50-100ms) — NOT the in-process hook latency."`). The dashboard and trail should surface this caveat rather than presenting raw spawnMs as "routing cost."

### Full accuracy table

| # | Prompt | Expected | Actual | Model | Conf | spawnMs | Correct? |
|---|--------|----------|--------|-------|------|---------|---------|
| 1 | optimize this Postgres query that does a seq scan | T2 | T2 | claude-sonnet-4-6 | 0.70 | 113 | ✓ |
| 2 | write a docstring for this function | T1 | T1 | claude-haiku-4-5-20251001 | 0.85 | 99 | ✓ |
| 3 | rename variable userId to accountId in this file | T0 | T0 | qwen2.5:3b | 0.90 | 85 | ✓ |
| 4 | why does this async test flake intermittently? | T2 | T2 | claude-sonnet-4-6 | 0.70 | 98 | ✓ |
| 5 | generate a pytest fixture for the db connection | T1 | **T0** | qwen2.5:3b | 0.80 | 99 | ✗ |
| 6 | summarize the diff in this PR | T0 | **T1** | claude-haiku-4-5-20251001 | 0.85 | 100 | ✗ |
| 7 | design a sharding strategy for the events table | T3 | **T0** | qwen2.5:3b | 0.80 | 102 | **✗ MAJOR** |
| 8 | explain this stack trace: KeyError 'session' | T1 | T1 | claude-haiku-4-5-20251001 | 0.85 | 98 | ✓ |
| 9 | refactor the auth middleware across 5 files | T3 | T3 | claude-opus-4-6 | 0.75 | 100 | ✓ |
| 10 | format this JSON blob | T0 | T0 | qwen2.5:3b | 0.90 | 83 | ✓ |

### Splitting the three disagreements

**Category A — Defensible label disagreements on the T0↔T1 boundary (not defects)**

Prompts 5 and 6 are mismatches between the golden label and what the classifier produced, but both routing choices are arguable:

- **Prompt 5** ("generate a pytest fixture for the db connection"): the golden label says T1 (Haiku), the classifier said T0 (qwen2.5:3b, conf 0.80). A pytest fixture is boilerplate — 10 lines of deterministic code with a known pattern. Routing it to a local 3B model is defensible. The golden label may have been conservative. Worth flagging as a label quality issue rather than a router defect.

- **Prompt 6** ("summarize the diff in this PR"): golden label says T0, classifier said T1 (Haiku, conf 0.85). Summarizing a diff could go either way depending on diff size and context. The upward routing costs marginally more but produces a safer output. Defensible. Not a correctness gap.

**Category B — Genuine correctness gap (MAJOR)**

- **Prompt 7** ("design a sharding strategy for the events table"): expected T3, got T0 (qwen2.5:3b), confidence 0.80.

  This is the headline finding of this audit. A database sharding strategy is an architectural decision with direct production consequences: partition key selection, cross-shard query patterns, migration plan, consistency trade-offs. The correct tier is T3 (Opus). What it got was a 3B local model at T0 tier.

  The failure mode is clear from the data: the regex classifier has no signal for "design a ... strategy for ..." constructions. The explicit architectural trigger keywords (`architecture`, `redesign`, `refactor`, `multi-file`) are absent. The classifier sees "design" + a noun phrase and has insufficient signal to escalate. Confidence 0.80 means it was wrong *and* confident.

  The risk is concrete: a founder or senior IC who trusts the Moo router — and has no reason not to after seeing it correctly handle prompts 1–4 and 8–10 — types "design a sharding strategy for the events table" and gets qwen2.5:3b reasoning about Postgres schemas. That output may look plausible. It may be wrong in ways that only surface under load, at scale, after the table has 2 billion rows. This is not a theoretical risk.

  Evidence verbatim from data: `"generate a pytest fixture for the db connection" exp=T1 got=T0 | "summarize the diff in this PR" exp=T0 got=T1 | "design a sharding strategy for the events table" exp=T3 got=T0`

---

## 3. Moo Cards

Opt-in respected: yes. Card emitted: yes. Field count: 6. No hyperbole detected.

```
─────── 🐮 Moo card ───────
 moo       🐄 ollama (T0)
 confidence 0.90
 last10    T0:4 T1:3 T2:2 T3:1
───────────────────────────
```

**Gap (minor):** `loraDisclosed: false`. The card shows `ollama (T0)` but does not disclose whether a LoRA or adapter was applied to the local model. For Marco, who runs Ollama specifically because he cares about what's actually running, this is a transparency gap. Not a blocker — the base model name is shown — but a card that claims honesty should surface adapter state if present.

---

## 4. Dashboard

Sections present: `MOOS ACTIVE`, `SAVINGS`, `CONTEXT`, `QUOTA`, `ADAPTER`. Five sections.

```
┌─ 🐮 Mooter Dashboard · session e2e-P2-s ─────────────────────┐
│  MOOS ACTIVE                                                  │
│    🏠 qwen2.5:3b           4 calls · conf 0.90               │
│    ☁ claude-haiku-4-5-20251001   3 calls · conf 0.85         │
│    ☁ claude-sonnet-4-6    2 calls · conf 0.70                │
│    ☁ claude-opus-4-6      1 calls · conf 0.75                │
```

No hyperbole in dashboard copy. `pastorEntity: 0`. Honest.

**Gap (minor):** `packSectionPresent: false`. Marco installed `diagram-systems`. It is not visible anywhere in the live dashboard. The installed packs section is either unimplemented or gated behind a different view. If he needs to verify what's active mid-session, the dashboard gives him no path. Evidence: `sectionsPresent` does not include PACK or equivalent; `installedPacks: ["diagram-systems"]`.

---

## 5. Trail

Field count: 10. Event count: 10. JSON parses cleanly. Formulas and sources present. Last decision: `T0 qwen2.5:3b 0.90`.

Evolution output is honest about the zero-baseline problem:

```
🐮 mooter — evolution (last 7d vs previous 7d)

VOLUME
  prompts:   0 → 10   (+100.0%)

TIER MIX
  prev 7d:   T0:0 T1:0 T2:0 T3:0
  last 7d:   T0:4 T1:3 T2:2 T3:1
```

`evolutionHonest: true` — it does not massage the "+100.0%" into a fake win. The previous period is flat zero and the trail shows it as such. Marco would respect this.

---

## 6. Transparency

- Wizard: no hyperbole, no inflated claims, telemetry opt-out respected at setup.
- Dashboard: no hyperbole array entries, no entity language.
- Trail: sources and formulas present, evolution is factual.
- Isolation: `otherSessionEvents: 0` — no bleed from other sessions.

One transparency concern (see Moo Card gap above): LoRA/adapter disclosure absent from cards. Low severity in practice since Marco's local Ollama config is known to him, but the disclosure surface exists and should be used.

---

## 7. Subjective UX Scores

| Dimension | Score | Rationale |
|---|---|---|
| Setup friction | 9/10 | 38ms, exit 0, telemetry off respected. Single rough edge: no feedback on what `diagram-systems` pack actually does post-install. |
| Routing transparency | 6/10 | Shows model + tier per call, which is good. The sharding misroute with confidence 0.80 means the confidence signal is not calibrated — high confidence on a wrong classification is actively misleading. |
| Dashboard utility | 7/10 | MOOS ACTIVE call distribution is the most useful thing in it. Missing packs section is a real gap for someone who installed a domain pack. |
| Moo card design | 7/10 | Clean, honest, does not oversell. LoRA omission drags it down one point. |
| Trail / audit trail | 8/10 | JSON parses, all events present, evolution is honest. spawnMs caveat about Node cold-start should be surfaced in the trail output itself, not just in the data spec. |
| Classifier correctness | 5/10 | 70% accuracy with a T3→T0 misroute at high confidence is not good enough for a tool positioned as a cost-safety router. The two boundary disagreements are defensible; the sharding case is not. |

---

## 8. Gaps Discovered

### MAJOR

**Classification misroute: architectural intent without explicit trigger keywords**

- Severity: MAJOR
- Description: "design a sharding strategy for the events table" was classified T0 (qwen2.5:3b, confidence 0.80). The correct tier is T3. The classifier regex lacks coverage for "design a ... strategy" constructions. The confidence score (0.80) makes this worse — the router is confidently wrong.
- Evidence (verbatim from data): `"design a sharding strategy for the events table" exp=T3 got=T0`
- Risk: any database design, migration strategy, or architectural sizing question phrased naturally without the words "architecture", "refactor", or "redesign" will be silently downrouted to local-trivial tier.
- Fix direction: extend classifier to catch `design + (strategy|plan|approach|schema)` as an architectural signal, minimum T2 floor, with T3 escalation when the object noun is infra-related (table, index, shard, cluster, queue, schema).

### MINOR

**Dashboard missing PACK section**

- Severity: MINOR
- Description: Marco installed `diagram-systems` but the live dashboard shows no PACK or domain section. Installed packs are invisible during a session.
- Evidence: `sectionsPresent: ["MOOS ACTIVE", "SAVINGS", "CONTEXT", "QUOTA", "ADAPTER"]`; `installedPacks: ["diagram-systems"]`.

**Moo card omits LoRA/adapter disclosure**

- Severity: MINOR
- Description: Card shows `ollama (T0)` but `loraDisclosed: false`. If any adapter was applied to the local model, the user has no way to know from the card.
- Evidence (verbatim from data):
  ```
  ─────── 🐮 Moo card ───────
   moo       🐄 ollama (T0)
   confidence 0.90
   last10    T0:4 T1:3 T2:2 T3:1
  ─────────────────
  ```

---

## 9. Verdict

**READY** (matches coordinator summary: 0 blockers, 1 major, 2 minor).

The session runs clean end-to-end. "READY" here means safe to ship, not correct to trust unconditionally. The classifier's 70% accuracy is tolerable at the T0↔T1 boundary where both sides are cheap models and the cost of a wrong call is a few cents. It is not tolerable at the T3→T0 boundary where a wrong call routes an architectural database decision to a 3B model, returns a confident answer, and leaves the user with no signal that anything unusual happened. That is the one fix that should land before the router gets near a codebase with a real production schema.
