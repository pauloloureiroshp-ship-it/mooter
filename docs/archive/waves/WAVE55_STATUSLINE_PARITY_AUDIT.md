# Wave 55 — Statusline Parity Audit (Phase B)

> Did Wave 53's statusline reorganization drop the "legacy" chips? Verified against
> the live `tools/router/statusline-multi.js` render + source, 2026-06-11.
> Companion: [[WAVE55_DAY0_RECON.md]] (P2) · [[REFUTATIONS_LOG.md]].
>
> **Verdict: the premise is mostly false.** 4 of the 6 "dropped" chips are present
> today; the other 2 were never chips. The reason they don't *show* on Paulo's Mac
> is missing data (no GPU profile / no `auth.json`), not a regression.

## Chip-by-chip parity

| Chip (kickoff: "dropped") | Reality today | Where | Status |
|---|---|---|---|
| Tier breakdown granular (token counts) | `🪙 T0:N tkns · T1 · T2 · T3` renders on line 2 | `statusline-multi.js` (🪙 token chip) | ✅ **present** |
| VRAM (RTX 4090) | `🎮 …% VRAM` — rendered when a GPU profile exists | `statusline-multi.js` (gated on `readGpuFromProfile`) | ✅ **present, gated on GPU data** |
| GPU mode (`gpu-high`) | `🔧 gpu-high · sub · N packs` on line 3 | `setup-status.js:34` | ✅ **present** |
| User identifier | `👤 user <hash8>` — **opaque hash by design** | `user-status.js` | ✅ **present (hashed by Wave 33.8 privacy decision)** |
| Ollama model name + quant (`qwen2.5-coder:7b Q4_K_M`) | no dedicated statusline chip (quant-advisor is separate) | — | ❌ **genuinely absent** |
| Embed model (`nomic 768d`) | `nomic-embed-text` used only by the continuous tester | `mooter-continuous-tester.js` | ❌ **genuinely absent (never a chip)** |

### Wave 53 additions (correctly present, not in question)
Routers section (Claude Max + openai + codex + gemini + ollama), Mode pyramid
(Moo / CrazyMoo / LazyMoo), Cycle d10/30 — all added by Wave 53, all rendering.

## Why the gated chips don't show on the Mac

`🎮 VRAM` needs `~/.mooter` GPU-profile data (populated by the hardware probe on a
machine with an NVIDIA GPU). `👤 user` needs `auth.json`. On an Apple-Silicon Mac
with neither, both chips are correctly silent — that is the honest "no data → no
claim" behavior, not a dropped feature. (M-series shared memory is intentionally
not reported as VRAM; see `statusline-multi.js` GPU comment.)

## The mode selector already exists

The kickoff asks for `mooter statusline mode <minimal|standard|extended|legacy>`.
That command **already ships** (Wave 32) as `mooter statusline mode
<mini|compact|full|didactic|auto|legacy>` — and `legacy` was already an alias for
`auto`. Building a second parallel system would duplicate. Wave 55 instead **adds
the kickoff's vocabulary as aliases** onto the existing modes:

| Kickoff name | Canonical mode | Shows |
|---|---|---|
| `minimal` | `mini` | 1 line — headline (savings + tier badge) |
| `standard` | `compact` | 2 lines — headline + operational chips (default richness) |
| `extended` | `full` | 3 lines — compact + synthesis chips (line-3) |
| `legacy` | `auto` | the byte-identical adaptive default |
| (also) | `didactic` | 5 lines — explains every number |

So `mooter statusline mode extended` → persists `statusline_mode: full`, which is
the dense view that surfaces the line-3 chips (incl. `🔧 gpu-high`, setup, and —
when their data exists — the gated VRAM/user chips). **Default is unchanged
(byte-identical).**

## What this wave does / does not do

- **Does:** add the `minimal/standard/extended` aliases (`statusline.ts`), document
  the parity reality (this doc), and harden the CLI test isolation so these tests
  never touch the real `~/.mooter` on Windows (USERPROFILE, not just HOME).
- **Does not:** fork a `restoreLegacyChips()` 4-line renderer for chips that already
  render (that is duplication + risks the byte-identical-default invariant), and
  does **not** add a cleartext `paulo-XXXX` user label (it would regress the
  Wave 33.8 privacy decision — the hash is deliberate).
- **Optional follow-up (not done):** the two genuinely-absent chips (Ollama
  model-name+quant, embed model) could be added if a real data source is wired —
  deferred to avoid an empty/fabricated chip.
