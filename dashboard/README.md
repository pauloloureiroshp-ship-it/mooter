# frugal — Dashboard (v0.6.0)

Local-only web UI for exploring `decisions.log`, `router-tuning.json`, and
cost trends. Bound to `127.0.0.1:7820`. Never listens on a public interface.

## Prerequisites

- Node.js 20+
- The frugal savings-tracker running on `127.0.0.1:7821`
  (started automatically by `inject_context.js` on the first prompt)
- `decisions.log` at `~/.claude/tools/router/decisions.log`

## Install & run

```bash
cd dashboard
npm install
npm run dev
# → http://127.0.0.1:7820
```

For production mode:

```bash
npm run build
npm run start
```

## Configuration

| Env var | Default | Description |
|---|---|---|
| `FRUGAL_ROOT` | `~/.claude/tools/router` | Location of `decisions.log` and `router-tuning.json` |

## What's inside

### Sections

1. **KPIs** — prompts, saved $, savings %, avg/prompt, arbiter calls + cache hit rate
2. **Tier distribution** — T0/T1/T2/T3 bar with live percentages
3. **Decisions** — table with filters (window, tier, category, confidence band) — updates on every filter change
4. **Cost trend** — SVG chart, cumulative `frugal` vs `naive Opus` over the selected window
5. **Router tuning** — live preview of `router-tuning.json` with demote/promote patterns + plain-language explainers
6. **Retrain** — button that runs `backtest.js && update-router.js`, with a **Preview (`--dry-run`)** mode that shows the block that would be injected without touching `classify.js`

### API routes

| Route | Description |
|---|---|
| `GET /api/metrics` | Proxies to savings-tracker `/metrics` |
| `GET /api/decisions?window=24h&tier=T3&min_conf=0.5` | Filtered slice of `decisions.log` |
| `GET /api/tuning` | Current `router-tuning.json` with pattern explainers |
| `POST /api/retrain?dry_run=true` | Runs `backtest.js` + `update-router.js` |

## Privacy

- Listens **only** on `127.0.0.1`.
- Never sends data off-machine.
- Never reads anything outside `FRUGAL_ROOT`.
- `decisions.log` prompt previews are already capped at 80 chars by
  `inject_context.js`; the dashboard truncates to 120 for display.

## Troubleshooting

- **"tracker_offline"** — run `node ~/.claude/tools/router/savings-tracker.js`
- **"tuning_missing"** — run `node tools/router/backtest.js` at least once
- **"log_missing"** — frugal isn't active yet; open a Claude Code session
  in this repo and the first prompt will create `decisions.log`

## Success criteria (from ROADMAP.md)

> Paulo can debug any misrouting in under 30 seconds without grep.

Workflow:
1. Open `127.0.0.1:7820`
2. Tier distribution shows the mix — spot the outlier
3. Filter decisions by that tier + low confidence
4. Hover the `preview` column for the truncated prompt
5. Pattern explainer in Router tuning shows why the pattern was generated
6. Preview → Retrain if the fix looks good
