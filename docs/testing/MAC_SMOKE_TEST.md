# Mac Smoke Test — Statusline Rendering (Wave 55, Phase A.2)

> Paulo runs this offline on an Apple-Silicon Mac; CC has no Mac in its env. The
> goal is a real screenshot baseline to confirm (or refute) the emoji-width drift
> documented in [[../strategy/MAC_INCONSISTENCIES_RECON.md]]. ~10 minutes.

## Prerequisites
- Apple-Silicon Mac (M1+).
- One or more of: Terminal.app · iTerm2 · Warp · Ghostty (default settings each).
- Mooter installed: `bash <(curl -fsSL https://mooter.ai/install.sh)` — or run from
  a repo checkout: `node tools/router/statusline-multi.js --demo green`.

## Steps

1. **Baseline render** at a known width (default emoji mode):
   ```bash
   COLUMNS=120 node tools/router/statusline-multi.js --demo green
   COLUMNS=120 node tools/router/statusline-multi.js --demo yellow
   COLUMNS=80  node tools/router/statusline-multi.js --demo green   # narrow
   ```
   Screenshot each. Look for: glyph alignment (does the `│` separator land in the
   same column as on Windows?), the `🪙 T0 · T1 · T2 · T3` chip spacing, and any
   line that **wraps** when it shouldn't.

2. **Repeat per terminal** — Terminal.app, then iTerm2, then Warp, then Ghostty,
   all at default font + settings. The font (SF Mono vs your override) is the
   variable we're isolating.

3. **ASCII fallback** — confirm the escape hatch renders cleanly:
   ```bash
   MOOTER_GLYPH_MODE=ascii COLUMNS=120 node tools/router/statusline-multi.js --demo green
   ```
   Expect `[M]` instead of `🐮`, `cloud`/`$`/`adapter` instead of `☁`/`🪙`/`🧬`,
   and **no tofu boxes**. If the default emoji render badly but this looks clean,
   that confirms the issue is glyph width/font, and ascii mode is the interim fix.

4. **Data-gated chips** (optional) — `🎮 VRAM` and `👤 user` are silent without a
   GPU profile / `auth.json`. If you want to see them, that is a setup/data task,
   not a render bug (see [[../strategy/WAVE55_STATUSLINE_PARITY_AUDIT.md]]).

## Report

Drop screenshots + notes in `docs/testing/MAC_SMOKE_FINDINGS_<YYYY-MM-DD>.md`:

- Which terminal(s) misrender, and how (wrap / misalignment / tofu / contrast).
- Whether `MOOTER_GLYPH_MODE=ascii` resolves it.
- Whether the `│` separator column matches the Windows baseline.

These findings feed the Wave 55.1 cross-platform patch (the `string-width`
width-aware fix), which can't be validated without exactly this screenshot
evidence. P1 ("Mac issue is rendering/font, not data") stays **unconfirmed** until
this runs.
