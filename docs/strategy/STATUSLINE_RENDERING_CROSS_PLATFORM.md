# Statusline Rendering — Cross-Platform Notes (Wave 55, Phase A.1)

> How `tools/router/statusline-multi.js` renders across Windows (PowerShell /
> Windows Terminal) and macOS (Terminal.app / iTerm2 / Warp / Ghostty). The
> detailed line-referenced audit is in [[MAC_INCONSISTENCIES_RECON.md]]; this is
> the operator-facing summary + the knobs Wave 55 ships.

## The three rendering axes

### 1. Color — portable, no action needed
The statusline emits **basic 16-color SGR only** (`\x1b[32m` …), gated by
`useColor()` on `NO_COLOR` / `MOOTER_NO_COLOR` / `TERM=dumb`. Basic SGR renders
identically on macOS Terminal, iTerm2, Warp and Windows Terminal — there is **no
256-color or truecolor portability risk** (verified: no `\x1b[38;5;…` or
`\x1b[38;2;…` anywhere). Pipe-safety: color is intentionally on even when not a
TTY, because Claude Code renders the statusline through a pipe with ANSI enabled.

### 2. Width — `detectWidth()` is correct
`detectWidth()` reads `stdout.isTTY && stdout.columns` first, then the `COLUMNS`
env, then a 100-col default. This is the right order on both platforms. One known
gap (deferred): a few sites read `process.env.COLUMNS` directly instead of through
`detectWidth()` — on macOS `COLUMNS` is usually unexported in a non-interactive
process, so those fall to a hardcoded default. Tracked as C1 in the recon, deferred
to Wave 55.1 (touches shared layout math, needs visual verification).

### 3. Glyphs — the real macOS difference + the Wave 55 knob
macOS renders many emoji as **2 cells**; the layout math counts `.length`, so
emoji-dense lines can over-pack and wrap, and padded columns go ragged (recon B1,
B2, B4). The proper fix needs a `string-width` dependency and is **deferred to a
focused Wave 55.1 cross-platform patch** (see [[REFUTATIONS_LOG.md]]).

What Wave 55 **does** ship — a dependency-free escape hatch:

```bash
MOOTER_GLYPH_MODE=ascii   # opt-in: transcribe the bovine emoji to ASCII tokens
```

Default (unset) is byte-identical. When set, `glyphs.js toAscii()` folds the emoji
to plain tokens — `🐮→[M]`, `🐂→[!]`, `☁→cloud`, `🪙→$`, `🧬→adapter`, `🎮→GPU`,
`👤→user`, `🔥→burn`, … — and strips any unmapped emoji so nothing renders as
tofu. Box-drawing/block bars (`│ · ▓░ ▅`) are kept: they render 1-cell everywhere
and carry the line's structure, not its iconography. This is the honest fallback
for a terminal/font where the emoji misrender, until the width-aware fix lands.

Preview it:
```bash
MOOTER_GLYPH_MODE=ascii node tools/router/statusline-multi.js --demo green
```

## Data-gated chips (a Mac "looks broken" cause that is NOT a render bug)
`🎮 VRAM` and `👤 user` are present in code but **gated on data** (a GPU profile,
`auth.json`) that an Apple-Silicon Mac may not have populated — so they are
correctly silent there. That is "no data → no claim", not a regression. See
[[WAVE55_STATUSLINE_PARITY_AUDIT.md]].

## What's verified vs needs a Mac
- Verified in CC env: color portability, width-detection logic, the ascii fallback.
- Needs a real Apple-Silicon screenshot: the actual emoji cell-width drift and the
  font-specific separator alignment. Run [[../testing/MAC_SMOKE_TEST.md]] and drop
  screenshots in `docs/testing/MAC_SMOKE_FINDINGS_<date>.md`.
