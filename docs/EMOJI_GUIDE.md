# Mooter Emoji Semantic Guide

> **Wave 53 Phase D.** Canonical meaning for the emojis Mooter uses in CLI / statusline output.
> Built from the **real** usage in the tree (103 distinct emojis inventoried across `tools/router` + `packages/*/src`), not invented. Enforced (denylist only) by [`tools/lint/emoji_lint.js`](../tools/lint/emoji_lint.js).
> Companion: [[WAVE53_BRIEF_V3.md]] · [[REFUTATIONS_LOG.md]].

## What this guide is (and isn't)
- It is the **semantic canon** for emojis that appear in Mooter's **user-facing output** (statusline chips, CLI strings, digests, changelog headings).
- It is **not** a ban on emojis. `docs/TWO-TERMINALS.md:182` "Zero emoji em código" is a **conversational-conduct** rule (sits next to "PT-PT na conversa") — it means *don't decorate logic, comments or commit messages with emojis*. Intentional emojis in **output strings** (the statusline glyphs below) are correct and expected.
- The linter enforces only the **forbidden** (anti-hype) set — it does **not** require an exhaustive allow-list (103 distinct legitimate glyphs would make that brittle).

---

## Identity / Brand
| Emoji | Meaning |
|---|---|
| 🐮 | **Mooter's own voice** — Mooter speaking in CLI output (most common glyph, 154×). |
| 🐂 | **Brutal-honest mode** — V4 doctrine moment, a refutation, "Honest > Forced". |
| 🐄 | **The herd** — live subagents / agents-active chip (`🐄 agents N active`). |

## Status
| Emoji | Meaning |
|---|---|
| ✅ / ✓ | Done · verified · pass |
| 🟢 | Active · healthy · heartbeat fresh |
| 🟡 | In progress · stale · caution |
| 🔴 | Error · critical · quota exhausted |
| ⚠️ / ⚠ | Attention required |
| ❌ / ✗ | Refused · failed · won't do |
| ❄️ | Paused · frozen · cold |
| 🔥 | Hot · focus · burn-rate high |
| 🔜 | Next up |
| 🛠 | Maintenance · refactor |
| 🔄 | Sync |

## Provider · tier · model glyphs
Mooter shows **provider** + **per-model brand glyph**, not a flat tier-colour scale. Source of truth for the model glyphs is [`tools/router/model-profile.json`](../tools/router/model-profile.json) (field `emoji`).
| Emoji | Meaning |
|---|---|
| ☁ | Cloud tier (cloud-served model) |
| 🏠 | Local tier (Ollama, on-device) |
| ⚡ | High effort / a T1 model glyph |
| 🦙 · 🐑 · 🌺 · 💎 · 🟢 | **Local (T0) model brand glyphs** — defined per model in `model-profile.json` |
| 🐉 | A T1 model brand glyph |
| 🟡 | A T2 model brand glyph |
| 🔴 | A T3 model brand glyph |
| 🪙 | Tokens · savings |

> **💎 is a model glyph, not hype.** It is the brand emoji of a local T0 model in `model-profile.json` (and is rendered by `frugal-turn-header.js`, `gsd-statusline.js`, …). It is therefore **excluded** from the forbidden list below. See [[REFUTATIONS_LOG.md]].

## Agents / orchestration
| Emoji | Meaning |
|---|---|
| 🤖 | Subagent in focus (identity · model · duration) |
| 🐝 | Active spawns count |
| 🧠 | Architecture decision |
| 🔍 | Investigation / recon |
| 📬 | Inbox / message |
| ⇄ | **Cross-session link** (sister sessions — Wave 53 Phase A′) |
| 🔒 | Conductor lock held |
| 👤 | Signed-in identity |

## Bench / audit / data
| Emoji | Meaning |
|---|---|
| 🧪 | Benchmark / synthetic test (MooterBench) |
| 🧬 | Model / adapter lineage |
| 📊 | Metrics / dashboard |
| 📜 | Audit / CCA-F |
| 📦 | Pack |

---

## NEVER use — anti-hyperbole doctrine (V4)
These are **forbidden** and enforced by the linter (`MOOTER_EMOJI_STRICT=1` → exit 1). All are currently absent from the source tree (count 0), so the gate is green.

| Emoji | Why forbidden |
|---|---|
| 🚀 | rocket — hype |
| 🎉 | party — hype |
| 💯 | "100" — quantify, don't celebrate |
| 🤯 | mind-blown — hype |
| 🔝 | top arrow — hype |

> Quantify, don't celebrate. The doctrine forbids hyperbole, not information. (Note: 💎 was on the original brief's forbidden list but is **kept**, because it is an intentional model brand glyph — a Day-0 refutation.)
