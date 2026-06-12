# macOS Terminal-Output Inconsistencies — Recon (Wave 55, Phase A.5/A.6)

> Read-only audit of every terminal-output path, comparing macOS rendering (where
> emoji are 2-cell and 256/truecolor support varies) against Windows, where Paulo
> develops and therefore never sees these bugs. Produced 2026-06-11. Line numbers
> are exact against the audited revision.
>
> **A.6 status: documented, not applied.** Every macOS-alignment fix below needs a
> `string-width` dependency the repo does not have yet, and they rewrite shared
> layout math — so by Phase A.5's own fix-classing they are all "risky". Applying
> them is gated on (a) a dependency decision (`package.json` edit = T3 guardrail),
> (b) confirming the `packages/*` wave-28–34.5 freeze allowlists these files, and
> (c) the missing Phase A-base / B context from the kickoff. None are applied
> speculatively. See "What to do next".

## Scope

| File | Role |
|---|---|
| `tools/router/statusline-multi.js` | main statusline (only color emitter) |
| `tools/router/post_tool_badge.js` | PostToolUse Bash badge |
| `packages/cli/src/commands/digest.ts` | `mooter digest` |
| `packages/cli/src/commands/explain.ts` | `mooter explain <chip>` |
| `packages/cli/src/commands/status.ts` | `mooter status` |
| `packages/cli/src/commands/sessions.ts` | `mooter sessions` |

## What is NOT a problem (verified clean — don't "fix" these)

- **256-color / truecolor portability (dim A): clean everywhere.** The only color
  emitter, `statusline-multi.js`, uses **basic 16-color SGR only** (`\x1b[32m`,
  `\x1b[2m`, …, L667). Basic SGR renders identically on macOS Terminal, iTerm2 and
  Windows. No `\x1b[38;5;Nm` (256) or `\x1b[38;2;R;G;Bm` (truecolor) anywhere.
- **Line endings (dim E): clean in all 6 files.** Every file emits `\n`; none
  hardcode `\r\n`; no `\r` in-place-redraw tricks. Log tails split on `\n` and a
  stray `\r` from a Windows-written log is tolerated by `JSON.parse`.
- **`status.ts`, `explain.ts`, `post_tool_badge.js`: clean on all 5 dimensions.**
  Their emoji are decorative in free-flowing lines; the only `padEnd` in this set
  (`explain.ts` L260) pads lowercase-ASCII chip names, not emoji.
- **Width detection model exists:** `statusline-multi.js detectWidth()` (L1289) is
  correct (`stdout.isTTY && columns` → `COLUMNS` env → default 100). It is the
  helper other sites should route through (see finding C1).

## Findings (ranked by impact)

### B1 — `digest.ts` L257: `🏠` vs `☁` under one `padEnd(22)` → ragged columns [HIGH]
`` `${TIER_GLYPH[t.tier]||"·"} ${t.tier} ${t.model}`.padEnd(22) `` leads the T0 row
with 🏠 and T1–T3 rows with ☁. On macOS 🏠 is 2 cells; `.length` counts it as 2
UTF-16 units while ☁ (U+2601) is 1 — so identical `padEnd(22)` yields **different
visible widths per row**, and the `bar()` + count columns after them misalign.
Invisible on Windows (both ~1 cell). **Fix-class: risky** (needs display-width pad).

### B2 — `statusline-multi.js` `layoutChips`/`lineLen` L1346: wrong collapse threshold [HIGH]
The responsive chip-collapse budget sums `c.text.length`. A line carries ~10
double-width emoji (🏠🎮📚☁📝🪙🐄🔒🧬⏱️…); `.length` under-counts real macOS width,
so lines that "fit" overflow and wrap — defeating the responsive layout on macOS.
**Fix-class: risky** (measure joined plain text by display width).

### D1 — `sessions.ts` L323: `p + "/"` hardcodes the POSIX separator [MED — and a Windows bug]
The `◀ this` worktree match does `here.startsWith(p + "/")`. Git worktree paths +
`process.cwd()` use `\` on Windows, so this **never matches on Windows** (works on
macOS). This is the inverse of the macOS framing — it degrades Paulo's own box.
**Fix-class: safe** (normalize with `path.sep` / compare normalized paths). This is
the single highest-value *safe* fix and the only one not blocked on `string-width`.

### C1 — `statusline-multi.js`: raw `COLUMNS` reads bypass `detectWidth()` [MED]
L592, L642, L1097, L1278 read `parseInt(process.env.COLUMNS||'…')` directly. On
macOS/Linux `COLUMNS` is usually **unexported** in a non-interactive process, so
these fall to a hardcoded default and disagree with the layout engine's own width.
**Fix-class: risky** (route through `detectWidth()`; touches shared layout, verify
with the statusline test suite).

### B3 — `digest.ts` L275 / L234: `truncate`+`padEnd(38)` on preview text by `.length` [MED]
Arbitrary prompt-preview text (any emoji/CJK the user typed) is truncated and
padded by `.length`, misaligning the `→ model` column on macOS. **Fix-class: risky**.

### B4 — `statusline-multi.js` `truncateToWidth` L1359 / `renderNarrow` L1372 [MED]
Already strips ANSI before measuring (good) but then uses `plain.length`, not
display width, so narrow-layout truncation is off by 1 cell at the boundary on a
double-width emoji. **Fix-class: risky** (swap `.length` → `string-width`; the
ANSI-strip is already in place, so this one is a near-drop-in).

## Cannot fix in code — font/terminal-specific (document only)

- `statusline-multi.js` glyph cell width of the 🐮/🐂/🚨/🛠 headline prefixes
  (L565–571): the 1-cell-vs-2-cell decision is the terminal+font's, not the code's.
  The `│` separator drifting ~1 column on macOS is inherent to emoji-presentation
  glyphs; only a non-emoji prefix would remove it (a brand decision, not a bug fix).
- `sessions.ts` L330/L332 `●`/`◀` are East-Asian-**ambiguous** width — 1 cell in
  most fonts, 2 under a CJK-configured iTerm2/Terminal. Not column-critical (joined
  with spaces, not padded).
- `ctxBar`/`pctBar`/`bar()` box-drawing (`▰▱▓░█`) ambiguous width — balanced fill,
  cosmetic only.

## Honest caveat (per the brief)

As Phase A.6 anticipated: the genuinely macOS-specific issues are **emoji display
width** (B1–B4) and they are **not cleanly CC-fixable today** — the repo has no
`string-width`/`wcwidth`, and hand-rolling a width table is its own bug surface.
They are a single batched dependency decision, not six independent edits.

## What to do next (recommended order, when unblocked)

1. **Apply D1 now-ish** (`sessions.ts` separator) — safe, dependency-free, and fixes
   a real Windows bug. Pending only: confirmation that the `packages/*` freeze
   allowlists `sessions.ts` for this wave.
2. **Decide the `string-width` dependency** for `packages/cli` (and a tiny shared
   `displayWidth()` helper in `tools/router/`). One decision unblocks B1–B4 + C1.
3. With the helper in place, fix in this order: B1 (digest columns) → B2 (chip
   collapse) → B4 (narrow truncate, near-drop-in) → B3 (preview) → C1 (consolidate
   `COLUMNS` reads through `detectWidth()`), each verified against the statusline +
   digest test suites.
4. Leave the font/terminal-specific items documented; they are not code bugs.

> These edits belong with Phase A-base (broader Mac statusline pass), which is
> blocked on `WAVE55_V3_PRODUCT_AUDIT_KICKOFF.md`. This recon is the input to that
> phase, not a substitute for it.
