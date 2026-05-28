# Statusline wire — local install

> Wave 2 Day 2. The `mooter init` wizard ships Day 6 and will perform these
> steps automatically. Until then, follow this guide once per machine.

## What gets wired

Two entries in your **local** `~/.claude/settings.json` (never committed):

1. `statusLine.command` — points to the canonical `statusline-multi.js`.
2. `hooks.SessionStart` — boots `savings-tracker.js` (HTTP :7821) at session
   start so the statusline has metrics to show.

The repo holds the canonical scripts; runtime copies live under `~/.claude/`
and are kept in sync by `/mooter-update` (see
`.claude/rules/router-logic.md`).

## Pre-flight

Confirm the canonical scripts exist on disk and `node` is on `PATH`:

```bash
ls -1 ~/mooter/tools/router/statusline-multi.js \
      ~/mooter/tools/router/savings-tracker.js \
      ~/mooter/tools/router/hooks/SessionStart.sh
command -v node
```

If any file is missing, `git pull` the repo (the symlink `~/mooter` resolves
to the working tree).

## Additive merge of settings.json

The settings file may already hold other keys (`theme`, permissions, ...).
Merge — do not overwrite — with `jq`:

```bash
SETTINGS=~/.claude/settings.json
TMP=$(mktemp)

# Create on first run; otherwise keep whatever is there.
[ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"

jq \
  --arg statusline_cmd "node ${HOME}/mooter/tools/router/statusline-multi.js" \
  --arg session_start  "${HOME}/mooter/tools/router/hooks/SessionStart.sh" \
  '
    .statusLine = ((.statusLine // {}) + {type: "command", command: $statusline_cmd})
    | .hooks    = ((.hooks    // {}) + {SessionStart: $session_start})
  ' "$SETTINGS" > "$TMP" && mv "$TMP" "$SETTINGS"
```

Result (illustrative — existing keys are preserved):

```json
{
  "theme": "light",
  "statusLine": {
    "type": "command",
    "command": "node /home/<user>/mooter/tools/router/statusline-multi.js"
  },
  "hooks": {
    "SessionStart": "/home/<user>/mooter/tools/router/hooks/SessionStart.sh"
  }
}
```

## Verify

After restarting Claude Code:

```bash
# 1. Tracker boots
curl -fsS http://127.0.0.1:7821/health

# 2. Statusline renders three demo states
node ~/mooter/tools/router/statusline-multi.js --mock
```

Expected: green/yellow/red lines plus the new `🛠 mooter setup incomplete`
state when no decisions are logged.

## Degraded mode

If the tracker fails to boot, the statusline falls back to either the GREEN
"routing healthy — $X spent" branch (when there is local quota data) or the
SETUP `🛠 mooter setup incomplete — run /mooter init` headline (clean
install). Either way, no exception ever reaches your terminal.
