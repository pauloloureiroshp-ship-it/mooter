# SAVINGS_DISPLAY_SETUP.md — frugal v0.4.0

> Live savings display: terminal statusline + VS Code status bar + sidebar panel + toast notifications. All fed by a tiny local HTTP server (`savings-tracker.js`) that reads `~/.claude/tools/router/decisions.log`.

---

## Architecture

```
decisions.log  ←  inject_context.js (one line per prompt)
      │
      ▼
savings-tracker.js   (Node.js, http://127.0.0.1:7821)
      ├── /health     → liveness probe
      ├── /metrics    → JSON: prompts, real_cost, naive_cost, saved, by_tier
      ├── /summary    → human-readable plain text
      └── /last       → last log entry
            │
            ├── statusline.sh                     → terminal
            └── vscode-extension/extension.js     → status bar + sidebar + toasts
```

---

## Cost model

| Tier | Provider | Cost per prompt (USD) |
|------|----------|----------------------:|
| T0 | Ollama / local | $0.000 |
| T1 | Claude Haiku | $0.0008 |
| T2 | Claude Sonnet / Codex | $0.008 |
| T3 | Claude Opus | $0.045 |

Naive baseline = "what every prompt would have cost if routed to T3 (Opus)".
Savings = `naive_cost - real_cost`.

If a `decisions.log` entry includes a `cost_estimate` field, that overrides the tier flat-rate (per-call accuracy when token counts are known).

---

## Install

```bash
# 1. The savings tracker is already in place if you ran install.sh:
ls ~/.claude/tools/router/savings-tracker.js

# 2. Build & install the VS Code extension
cd ~/frugal/vscode-extension
npm install   # only on first run (no runtime deps, just vsce)
npx --yes @vscode/vsce package --no-dependencies
code --install-extension frugal-savings-0.4.0.vsix

# 3. Optional: register the new statusline in Claude Code
#    Add to ~/.claude/settings.json:
#    {
#      "statusline": {
#        "enabled": true,
#        "command": "bash ~/.claude/tools/router/statusline.sh",
#        "refreshMs": 10000
#      }
#    }
```

---

## VS Code configuration

```json
{
  "frugal.refreshIntervalMs": 8000,
  "frugal.toastThresholdUSD": 0.001,
  "frugal.showToasts": true,
  "frugal.statusBarAlignment": "right",
  "frugal.trackerUrl": "http://127.0.0.1:7821"
}
```

| Setting | Default | Description |
|---|---|---|
| `frugal.refreshIntervalMs` | `8000` | How often the extension polls `/metrics` |
| `frugal.toastThresholdUSD` | `0.001` | Minimum avg savings/prompt before a toast fires |
| `frugal.showToasts` | `true` | Master toggle for toast notifications |
| `frugal.statusBarAlignment` | `right` | `left` or `right` |
| `frugal.trackerUrl` | `http://127.0.0.1:7821` | Override only if you bind elsewhere |

---

## What you'll see

### Terminal statusline

```
◈ claude-sonnet-4-6 │ ctx:23% ▓▓░░░░░░░░ │ 5h:37% ▓▓▓░░░░░░░ │ 7d:12% │ $0.04 │ 💰 $0.31 (89%) │ alltime:$4.21 │ max:T3
```

### VS Code status bar

```
💰 $0.31 (89%) │ $0.04 real │ alltime $4.21
```

Colour: green ≥75%, amber ≥40%, default <40%.

### Sidebar panel (Activity Bar → frugal icon)

- Big saved-USD number with progress bar
- Real / Naive / Saved table
- Tier breakdown (count, %, cost)
- Buttons: Full summary, decisions.log, Refresh

### Toast notification

```
💰 frugal saved ~$0.0042/prompt (89% cheaper) │ T0:83% T2:13% T3:4%
                                       [See Summary]  [Dismiss]
```

---

## Manual tracker control

```bash
# Start (idempotent — exits silently if already bound)
node ~/.claude/tools/router/savings-tracker.js &

# Verify
curl -s http://127.0.0.1:7821/health
curl -s http://127.0.0.1:7821/metrics | node -e "console.log(JSON.parse(require('fs').readFileSync('/dev/stdin')))"
curl -s http://127.0.0.1:7821/summary

# Verbose mode (prints listening message)
FRUGAL_TRACKER_VERBOSE=1 node ~/.claude/tools/router/savings-tracker.js
```

The tracker is also auto-started by `statusline.sh`, the VS Code extension, and `inject_context.js` (whichever runs first).

---

## Troubleshooting

**1. `💰 –` in statusline / "frugal: –" in VS Code**

The tracker is not running. Check:

```bash
curl -s http://127.0.0.1:7821/health
```

If empty: the auto-start failed. Run manually once and watch for errors:

```bash
FRUGAL_TRACKER_VERBOSE=1 node ~/.claude/tools/router/savings-tracker.js
```

Most common causes: `decisions.log` doesn't exist yet (send one prompt in any Claude Code session), or another process is squatting on port `7821` (`netstat -ano | grep 7821`).

**2. Toasts never fire**

- `frugal.showToasts` must be `true`
- Average savings must reach `frugal.toastThresholdUSD` (default `$0.001`)
- The extension only fires when **new** prompts arrive between polls — if your decisions.log is static, no toasts

Lower the threshold to `0` to verify the path:

```json
{ "frugal.toastThresholdUSD": 0 }
```

**3. Status bar shows the wrong cost**

The cost table is hard-coded in `savings-tracker.js` (`COSTS` constant). Edit it to match your real billing if you have a custom enterprise rate, then restart the tracker:

```bash
pkill -f savings-tracker.js
node ~/.claude/tools/router/savings-tracker.js &
```
