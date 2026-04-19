# Mooter Statusline v6.7 — Multi-line Resurrection (Master Prompt)

> **Status:** v6.7 shipped 2026-04-19. Multi-line confirmed working in-prompt for the first time since v6.5 packed everything into one line. Three layered rows render reliably; the dashboard pane (external window) keeps the boxed v6.4 look. This master prompt continues the polish work in a fresh session.

## Mission

Take the working v6.7 multi-line statusline (3-line layered dashboard rendered in-prompt) and close the residual gap to the v6.4 reference design — without breaking the multi-line rendering that took 7 probes to unlock.

## Reference target

The visual goal is the boxed v6.4 layout that the dashboard pane currently shows:

```
╭─ 🐮 mooter · 🐂 CrazyMoo · ●T3 100% · ctx ████░░ 31% ─────── cycle d19/30 ─╮
├─ 🐮 saved $0.00 (0%∅ vs all-Opus) · spent $3.85 · 45 prompts · 0% local ── ● all-Opus ─┤
╰─ 🧠 Claude Max · 1%↓ · 5h 21% · ▁▃ · quota $2.58/200 ──────── ● ─╯
```

Currently rendering inside Claude Code's in-prompt statusline:

```
🐮 mooter · 🐂 CrazyMoo · ●T0 1% · ●T1 7% · ●T2 8% · ●T3 84% --------- cycle d19/30
🐮 saved $49.56 (73%↓ vs all-Opus) · spent $18.46 · 788 prompts ----- ● healthy
🧠 Claude Max · 1%↓ · 5h 21% · ▁▂▃▄▅▆▇ · quota $2.58/200 -------------- ●
```

Working but not pixel-perfect. Differences to close (in priority order):

1. **Box-drawing corners `╭ ├ ╰` (LEFT) and `╮ ┤ ╯` (RIGHT)** — currently absent. Probe attempts with full Unicode corners collapsed multi-line to L1 only. **Untested:** ASCII corners (`+`, `|`), half-corners, or single-side anchors.
2. **Filler char `─` (U+2500)** — currently `-` ASCII. The Unicode `─` consistently kills multi-line (parser appears to treat it as wide-char and width-overflow trips line-discard).
3. **`ctx XX%` bar in L1** — present in mock data but null in real fresh sessions; the existing `ctxPill` block already handles this when `ctxPct` is provided by Claude Code.
4. **`0% local` pill in L2** — present in reference; the `effPart` block in `renderMultiLine` builds it, but only when `tierCounts.local > 0`. Need to render even when 0 (always-show contract).

## Investigation completed in the previous session

### Root cause confirmed via 7 probes (in `gsd-statusline.js`, branch `MOOTER_PROBE`)

| Probe | Payload | Result |
|---|---|---|
| 1 | 4 lines, ASCII only, no ANSI, no padding | ✅ 4 lines render |
| 2 | 4 lines, ANSI cyan, ASCII text | ✅ 4 lines render |
| 3 | 4 lines, block chars `█▓░ ●●●` + sparkline `▁▂▃▄▅▆▇` | ✅ 4 lines render (with minor visual gaps) |
| 4 | 4 lines, dense RGB ANSI + BOLD + DIM (v6.7-grade) | ✅ 4 lines render |
| 5 | 4 lines, ASCII text with right-aligned padding via spaces | ✅ 4 lines render |
| 6 | 4 lines, ASCII `-` filler (`-----`) | ✅ 4 lines render |
| 7 | 4 lines, Unicode `·` middle-dot filler (`·····`) | ✅ 4 lines render |

**The only payload that consistently failed:** `─` (U+2500 BOX DRAWINGS LIGHT HORIZONTAL) used as filler. Hypothesis: Claude Code's in-prompt statusline parser treats `─` as East Asian Width AMBIGUOUS / wide-char. When repeated (`─` × 30+), the computed visual width overflows the terminal column count and the parser collapses subsequent lines.

**Untested but suspected to also fail:**
- `╭ ╮ ├ ┤ ╰ ╯` (corners — same Unicode block as `─`)
- `═` (U+2550 DOUBLE HORIZONTAL)
- Other U+25xx box-drawing chars

### Other findings

- **Width cap of 90 cols** in `flatLine()` is what makes multi-line survive in narrow terminals (~100 cols VS Code default). Without the cap, padding-based right-align produced lines of 120+ chars → wrap → parser collapse.
- **Cumulative tier-count fallback** (`realExecutionCounts(null)` when session-specific returns 0) makes L1 useful from the first prompt of a fresh terminal — no more empty `🐮 mooter · CrazyMoo` row while waiting for tier data to accumulate.
- **`\x1B[3J` clear-scrollback** in `mooter-dashboard.js:88` fixed the append-on-refresh bug in the external dashboard pane. `\x1B[2J\x1B[H` alone leaves Windows Terminal scrollback intact.
- **`mooter.ps1` 8.3 short path resolution** (lines 52-60) is what makes `wt`-spawned dashboard work when `Paulo Loureiro` path has a space.

## Open work — next session probe agenda

### Probe set 8-12 (priority — visual polish)

Add to the existing `MOOTER_PROBE` switch in `gsd-statusline.js` (~line 1789). Each probe is one terminal: `$env:MOOTER_PROBE='N'; claude`. Reports back: how many lines render?

| Probe | Payload | Hypothesis |
|---|---|---|
| 8 | 4 lines wrapped in ASCII pseudo-corners: `+--- … ---+` / `\|--- … ---\|` / `+--- … ---+` | If renders, we get a poor-man's box look |
| 9 | 4 lines with `═` (U+2550 DOUBLE HORIZONTAL) filler | If renders, gives a denser-looking line than `-` |
| 10 | 4 lines with `▁` (U+2581 LOWER ONE EIGHTH BLOCK) filler | Probe 3 already showed `▁▂▃▄▅▆▇` rendering — `▁` alone might work |
| 11 | 4 lines with mixed: ASCII `-` filler + Unicode `╮ ┤ ╯` close-corner only (right anchor) | Tests whether single corner glyph (not paired) survives |
| 12 | 4 lines with NO filler but trailing `\n` after each line (`rows.map(r => r + '\n').join('')`) | The b7f0ec3 commit message claimed trailing `\n` was tested; re-verify under v6.7 conditions |

### Coherence audit — backend ↔ statusline contract

Each pill that the statusline renders must have a verifiable source-of-truth in the backend (tracker, execution.log, decisions.log, settings). No invented data, no hardcoded defaults shown as facts. Audit each rendered element:

1. `🐮 mooter` — brand only, no data needed → ✅ trivial
2. `🐂 CrazyMoo` / `🐄 LazyMoo` — comes from `usageData.recommendation.mode`. Verify: recommendation is set when usage tracker is reachable AND pace/budget triggers it. Document the trigger thresholds.
3. `●T0/T1/T2/T3 N%` — comes from `realExecutionCounts(session)` or fallback `realExecutionCounts(null)`. Verify each tier maps to the right model bucket via `bucketFor()`. Document the model→tier mapping (Opus→T3, Sonnet→T2, Haiku→T1, qwen3:30b→T0, etc).
4. `ctx XX%` — comes from Claude Code's input JSON `context_window.used_percentage`. Verify Claude Code actually sends this in v2.1.114; document the JSON schema.
5. `🐮 saved $X (N%↓)` — comes from the savings appender (`/metrics` endpoint of local tracker on :7821). Verify tracker is healthy; if down, statusline should show fallback ("∅ no data") not stale numbers.
6. `spent $Y` — same source as above.
7. `M prompts` — count from `realExecutionCounts(...).total`.
8. `0% local` / `M% local` — `tierCounts.local / tierCounts.total`.
9. `🧠 Claude Max` (and per-provider rows) — comes from `subscriptions[]` config + `usageData.usage[providerKey]`. Verify configured subscriptions match actual provider keys.
10. `5h XX%` — `usageData.usage[anthropic].rolling_5h.used_pct`.
11. `▁▂▃▄▅▆▇` sparkline — `usageData.sparkline.spark`.
12. `quota $X/$Y` — `usageData.usage[provider].cost_usd / .budget_usd`.
13. `→ /mooter-beast` recommendation — derived from pace_ratio (auto-rec).
14. `🦙 Ollama local` row — `tierCounts.local > 0` predicate.

For each, write one line in `gsd-statusline.js` comments above the pill, citing the source variable and file path.

### Cleanup

- Remove probes 1-7 once probes 8-12 are also done — they were debug instruments. Keep `MOOTER_PROBE` env var hook in case we need fresh probes later.
- Reduce hardcoded width cap (`Math.min(width || 100, 90)` in `flatLine`) by detecting the real terminal width. Claude Code's input JSON may provide this — investigate.
- Update `mooter.ps1` doc comment to reflect v6.7 reality (no boxed dashboard, in-prompt 3-row).

### Stretch — UX polish

- **`ctx XX%` always shown:** even `ctx 0%` is more honest than nothing on a fresh terminal.
- **`MOOTER_LITE` env var:** for users on truly narrow terminals (~70 cols), collapse to v6.5 single-line.
- **Unicode-light theme (`MOOTER_ASCII_ONLY=1`):** swap emojis for `[mooter]`, `[T3]`, etc. for environments that can't render them (CI, tmux without proper locale).

## Key files & line ranges

| File | What lives there | Critical line ranges |
|---|---|---|
| `tools/router/gsd-statusline.js` | The statusline renderer | `flatLine()` ~line 277, `renderSubscriptionRow()` ~865, `renderLocalRow()` ~927, `renderMultiLine()` ~1854, `MOOTER_PROBE` switch + dispatch ~1789, `tierLegendPill` + `ctxPill` + `A_mandatory` ~1620-1665 |
| `tools/router/mooter.ps1` | The `mooter` launcher (sets `MOOTER_MODE=1`, runs `claude`) | Whole file (37 lines) |
| `tools/router/mooter-dashboard.js` | External dashboard pane (boxed v6.4 look) | `\x1B[3J` clear sequence ~line 88; spawned by an external `node` invocation, NOT by `mooter` |
| `~/.claude/settings.json` | Where the `statusLine.command` field points to `gsd-statusline.js` | The `statusLine` block |

## Ground rules for the next session

1. **Never re-introduce `─` (U+2500) into `flatLine`** without re-running probe 6 first. It WILL break.
2. **Never assume terminal width is ≥ 100.** The 90-col cap is what makes multi-line work in VS Code's default terminal. Lowering it is safe; raising it requires probe re-run.
3. **Multi-line is fragile.** Each new visual element is a fresh risk. Add via probe-first → confirm in a new terminal → only then move to `flatLine`.
4. **Backend coherence beats visual perfection.** A pill that lies (shows stale or invented data) is worse than a pill that's honest about being absent.
5. **Test in a brand-new VS Code terminal.** Existing claude sessions don't pick up new env vars; `mooter` (MOOTER_MODE=1) needs a fresh shell.

## Session evidence (commits)

The session that landed v6.7 produced these commits (chronological):

1. `fix(mooter-launcher): wt path with spaces — resolve to 8.3 short` (mooter.ps1)
2. `fix(mooter-dashboard): clear scrollback with \x1B[3J on each refresh`
3. `feat(statusline): v6.7 multi-line dispatch — MOOTER_MODE=1 → flat layered dashboard`
4. `feat(statusline): probes 1-7 to discover in-prompt parser limits (kept under MOOTER_PROBE)`
5. `feat(statusline): cumulative tier-count fallback when session-specific is empty`
6. `feat(mooter): simplify launcher — same-terminal MOOTER_MODE invocation, no external windows`

(The actual atomic commits may differ in count when this is committed; this list is the logical breakdown of what shipped.)

## Acceptance criteria for v6.8 (next session)

- [ ] At least one probe from set 8-12 lands a closer-to-`─`-look filler that survives multi-line. If none survive, mark `-` ASCII as the official ceiling and document.
- [ ] Probes 1-7 removed from production code; probe machinery preserved as documented escape hatch.
- [ ] Coherence audit: every pill has a one-line source-of-truth comment in `gsd-statusline.js`.
- [ ] `0% local` always shown when `tierCounts.total > 0`, regardless of share value.
- [ ] `ctx XX%` always shown when Claude Code provides `context_window.used_percentage` (even 0%).
- [ ] `mooter.ps1` doc comment reflects v6.7 (in-prompt, no external pane by default).

When all criteria pass, ship as **v6.8 — final polish + coherence audit**, update `SYNC.md`, log session in Notion HQ.
