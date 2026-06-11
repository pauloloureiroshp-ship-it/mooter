# Hooks Guide — Wave Mega 50-51, Phase 3.E (2026-06-09)

Five deterministic, zero-dependency Node.js check scripts live in
`~/.claude/hooks/` (personal infra, NOT in this repo — per doctrine, harness
setup goes to `~/.claude/`). **None of them is wired.** Wiring is documented
here and applied manually only — `~/.claude/settings.json` and existing hooks
are never auto-modified (established Mooter convention).

All five are directly runnable with `node <script>`, perform no destructive
operations, and touch no network except the localhost Ollama ping.

## The scripts

| Script | What it does | Exit codes |
|---|---|---|
| `precommit-sha-guard.js` | Verifies sha256 of `tools/router/classify.js` against the frozen constant `427d8c0b…bc48f`. Loud banner on drift. | 0 intact / not-a-Mooter-repo · **2 on mismatch** |
| `postmerge-version-note.js` | Compares `tools/router/version.json` version vs latest git tag; prints a drift reminder. **Read-only** — never edits version.json (version-sync CI owns it). | always 0 |
| `onerror-logger.js` | Appends `{ts, session_id?, summary}` JSON lines to `~/.claude/errors.log` from stdin JSON or argv text. Caps the log at 1 MB (drops oldest lines). | always 0 |
| `sessionstart-ollama-check.js` | GET `http://127.0.0.1:11434/api/tags` with 1s timeout; one line healthy (model count) / unhealthy. | always 0 |
| `sessionend-summary-trigger.js` | If `mooter` is on PATH AND `mooter session-summary --help` exits 0, runs `mooter session-summary` (10s cap); otherwise one quiet skip line (subcommand ships in a later wave phase). | always 0 |

## Wiring snippets (apply MANUALLY, never automatically)

### 1. precommit-sha-guard — as a plain git hook (recommended)

```sh
# from the Mooter repo root:
printf '#!/bin/sh\nexec node ~/.claude/hooks/precommit-sha-guard.js "$(git rev-parse --show-toplevel)"\n' > .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

`.git/hooks/` is per-clone and not committed, so this never touches shared
config. Exit 2 aborts the commit. (A Claude Code PreToolUse variant is
possible but noisier — the git hook is the right layer for a commit gate.)

### 2. postmerge-version-note — as a plain git hook

```sh
printf '#!/bin/sh\nnode ~/.claude/hooks/postmerge-version-note.js "$(git rev-parse --show-toplevel)" || true\n' > .git/hooks/post-merge
chmod +x .git/hooks/post-merge
```

### 3-5. Claude Code hooks — `~/.claude/settings.json` snippets

Merge into the existing `"hooks"` object by hand. Do not replace existing
entries (PostToolUse etc. are already in use by other hooks).

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "node ~/.claude/hooks/sessionstart-ollama-check.js" }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          { "type": "command", "command": "node ~/.claude/hooks/sessionend-summary-trigger.js" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "node ~/.claude/hooks/onerror-logger.js" }
        ]
      }
    ]
  }
}
```

Notes:
- `onerror-logger.js` reads the hook JSON from stdin and only logs when the
  payload contains an error-shaped field — non-error PostToolUse events are
  silently ignored. It can also be wired on `Stop` if per-tool logging is too
  chatty.
- If the harness lacks a `SessionEnd` event, wire
  `sessionend-summary-trigger.js` on `Stop` instead — it is idempotent and
  exits 0 in <100ms when the subcommand is absent.

## Policy

1. **Manual wiring only.** These scripts being on disk changes nothing until
   Paulo edits settings.json / `.git/hooks/` himself (or explicitly asks).
2. **Never block on informational hooks** — only the sha guard may fail a
   pipeline, and only via exit 2 in a git pre-commit context.
3. **version.json stays CI-owned.** The post-merge note deliberately does NOT
   auto-edit it: `.github/workflows/version-sync.yml` syncs version.json on
   tag push, and a local hook writing the same file would race/fight CI.
