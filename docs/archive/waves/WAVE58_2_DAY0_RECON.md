# Wave 58.2 — Day 0 Recon (Audit Fragmentation)

> **Phase 0 output.** Honest audit of the statusline rendering stack BEFORE any build.
> Doctrine: *Honest > Forced*. No fabrication. classify.js sha sagrada.
> Date: 2026-06-13 · Branch: `wave58_2-statusline-unified`

---

## 1. Verification table

| Item | Result | Verdict |
|---|---|---|
| `classify.js` sha256 | `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f` | ✅ **INTACT** |
| Wave 58 A.5 + Matrix in `main` | `743a66e feat(wave58): A.5 statusline unification + A.13 matrix chip DEFAULT-ON (#163)` | ✅ in main |
| Branch statusline work so far | `git diff main...HEAD` for `tools/router/` → **empty** | clean start |
| `settings.json` statusline wiring | `~/.claude/settings.json:160` → `node ".../frugal/tools/router/gsd-statusline.js"` (runtime copy) | ✅ gsd is wired |
| `chip-composer.js` | EXISTS (Wave 58 A.5) — SSOT for chip roster | ✅ exists |
| `statusline-modes.js` | EXISTS (Wave 32 Phase B) — explicit modes already shipped | ✅ exists |
| `statusline-unified.js` | does **not** exist | brief's proposed deliverable |

## 2. Wiring map — who renders, who consumes

```
~/.claude/settings.json  →  frugal/tools/router/gsd-statusline.js   (WIRED, runtime copy)
                                     │
                                     └─ gsd-statusline.js:2194
                                          require('./chip-composer.js').composeChips(session, { lineGateOn })

tools/router/statusline-multi.js  (modular composer — NOT wired by settings.json)
     ├─ :1237  buildLine3() → require('./chip-composer.js').composeChips(sid, { lineGateOn:true })
     └─ :1391  require('./statusline-modes.js').readMode() + renderForMode(mode, ctx, R)
```

**Conclusion:** `chip-composer.js` is ALREADY the single source of truth for the chip roster, and
BOTH entry points (wired `gsd-statusline.js` AND modular `statusline-multi.js`) already call into it.
Wave 58 A.5 already did the unification this wave was scoped to build. `statusline-modes.js` already
provides explicit user-pinnable modes (`mini` / `compact` / `full` / `didactic`).

## 3. chip-composer.js API (actual)

```js
composeChips(selfSessionId, { lineGateOn })   // → string | null
// lineGateOn=false → DEFAULT_ELIGIBLE (self-gating + matrix default-ON)
// lineGateOn=true  → CHIP_MODULES (full historic list, behind legacy line-3 opt-in)
```

It does **NOT** accept an explicit `chips[]` list. The brief's proposed
`renderUnified()` design (`composeChips(lineSpec.chips, opts)` + a `resolveModeConfig` returning
chip arrays per line) is a DIFFERENT architecture that would sit ON TOP of / conflict with the
existing composer + modes.

## 4. Chip inventory — "MISSING" claims vs reality

| Brief says restore (MISSING) | Reality | Source |
|---|---|---|
| Pastor LoRA chip | **EXISTS** `pastor-status.js` (statusLine) | refutes P4 |
| Quant evolution chip | **EXISTS** `quant-status.js` (statusLine) | refutes P3 |
| User identifier chip | **EXISTS** `user-status.js` (statusLine) | refutes P3 |
| VRAM chip | no `*-status.js` chip, BUT detectors exist: `vram_detect.js`, `hardware_live.js` (`vramSnapshot()`) | partial |
| Ollama model chip | no dedicated `*-status.js` chip | genuinely missing |
| Embed model chip | no dedicated `*-status.js` chip | genuinely missing |
| GPU mode chip | no `*-status.js` chip, BUT `gpu-probe.js` / `hardware-matcher.js` exist | partial |

**Platform caveat (honest):** `vram_detect.js:47` returns `null` on `win32`. On Paulo's primary
Windows box a "restored" VRAM chip degrades to nothing. VRAM/GPU chips only emit on Linux/WSL/macOS.
Print 3 (Wave Mega, dense VRAM/quant/embed line) was a Linux/WSL session.

## 5. Refutations verdict (brief's Phase 0 gate)

| # | Claim | Verdict |
|---|---|---|
| P1 | `gsd-statusline.js` is the file wired in settings.json (not multi) | ✅ **TRUE** |
| P2 | `chip-composer.js` exists **+ accepts a chips list** | ❌ **FALSE** — exists, but takes `(sid,{lineGateOn})`, no chip list |
| P3 | Wave 14 VRAM/Ollama/quant/GPU/user chips files MISSING | ❌ **FALSE** — quant/user exist; vram/gpu have detectors |
| P4 | Wave 31 Pastor LoRA chip MISSING | ❌ **FALSE** — `pastor-status.js` exists |
| P5 | Matrix chip Wave 58 wired correctly in chip-composer | ✅ **TRUE** (DEFAULT_ELIGIBLE, default-ON) |

**3 / 5 refutations FALSE → the brief's own re-scope gate ("Se ≥ 3/5 false → re-scope") is TRIGGERED.**

## 6. Root cause of Paulo's "3 different statuslines"

Not renderer drift (A.5 already removed that). Two real causes:
1. **Runtime-version skew** — the wired file is the `frugal/` runtime copy, synced per box by
   `/mooter-update`. Old terminals/sessions never re-synced → they run an OLDER renderer. Fix =
   `/mooter-update` on each box, **not** new code.
2. **Default-visible chip set shrank** — the dense Wave-14/Mega hardware/identity chips (VRAM,
   ollama model+quant, embed, gpu-mode) are gated behind the legacy line-3 opt-in / no longer have
   dedicated chips. A user who wants that dense view has no single switch for it.

## 7. Honest re-scope (proposal)

**Do NOT build `statusline-unified.js`** — it would introduce a THIRD renderer + a THIRD mode
taxonomy, conflicting with the existing `chip-composer.js` (SSOT) + `statusline-modes.js`, i.e. it
would CREATE the drift this wave exists to kill.

Instead, deliver the genuinely-real residue:
- **D1.** Add the 2–4 genuinely-missing chips that emit real data on supported platforms
  (`ollama-model`, `embed-model`; `vram`/`gpu-mode` reading existing detectors, honest `—`/silent on
  win32). Wire opt-in into `chip-composer.js#CHIP_MODULES`. No fabrication.
- **D2.** Add a dense mode (e.g. `full`-dense / new `legacy`) to the EXISTING `statusline-modes.js`
  taxonomy that surfaces those chips in one switch — extend, do not replace.
- **D3.** Ensure a `mooter statusline mode <X>` CLI writes `preferences.json.statusline_mode`
  (verify whether it already exists before adding).
- **D4.** Doc: record that A.5 already unified; the remaining gap was runtime sync + a dense preset.

This ships real value, kills the actual pain, and introduces zero new drift.

## 8. Phase-by-phase: already-shipped vs real residue

| Brief phase | Status | Evidence |
|---|---|---|
| Phase 0 — Day 0 audit | ✅ done (this doc) | — |
| Phase A — `statusline-unified.js` + `statusline-modes.js` | ❌ REJECT | `statusline-modes.js` already exists (Wave 32); `unified.js` would add a 3rd renderer = new drift |
| Phase B — wire gsd + multi → unified | ✅ already true | both already consume `chip-composer.js`; multi also consumes `statusline-modes.js` |
| Phase C — `mooter statusline mode <X>` CLI | ✅ ALREADY EXISTS | `packages/cli/src/commands/statusline.ts` — incl. `--preview` and a `legacy` alias |
| Phase D — restore 7 legacy chips | ⚠️ ~30% real | pastor/quant/user already exist; vram=null on win32; only `ollama-model` + `embed-model` genuinely missing |
| Phase E — tests + reviewer + ship | conditional | only worth running if D residue is built |

**Net:** ~80% of Wave 58.2's scope was already delivered by Wave 32 (modes) + Wave 58 A.5
(chip-composer unification + CLI). The genuinely-new residue is small (2–3 missing chips + maybe a
denser preset). Building the brief as written would re-implement existing work AND create drift.
