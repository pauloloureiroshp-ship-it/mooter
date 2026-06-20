# @mooter/bridge — Cowork ↔ Mooter fleet (MCP)

A **local, zero-dependency stdio MCP server** that exposes the Mooter agent fleet — your live
Claude Code sessions — to any MCP client (Cowork, Claude Desktop, …). This is the control-plane
API between "you talk to Cowork" and "the fleet does the work in the Mooter router".

**P0 (this version): read-only visibility.** The client can *see* the fleet natively, without
screenshots. Later phases add `run` (headless `claude -p` in a sandboxed worktree), `gate.verify`
and `ship`.

## Tools

| Tool | What | Read-only |
|---|---|---|
| `mooter_sessions_list` | Live sessions with honest status (`working`/`needs_you`/`idle`), branch, open PR + CI stage, model, tokens, cost, savings + glance counts | ✅ |
| `mooter_session_read` | One session in detail by id (full or 8-char prefix) | ✅ |

Every field is derived from real `~/.claude` logs + `git`/`gh` (it reuses the cockpit's
`host-extra.recentSessions`). Unknown values are `null` — never fabricated. `classify.js` is
never touched. P0 performs **no writes**.

## Install (opt-in connector)

The server needs the full repo present (it reuses `packages/vscode-extension/src/host-extra.js`).
The simplest stable location is the Cowork ship clone, kept on `main`:

    /Users/<you>/.mooter-ship/packages/mooter-bridge/server.js

Add it as a **custom MCP connector** in your client. Standard stdio config:

```json
{
  "mcpServers": {
    "mooter-bridge": {
      "command": "node",
      "args": ["/Users/<you>/.mooter-ship/packages/mooter-bridge/server.js"]
    }
  }
}
```

In Cowork: **Settings → Connectors → Add custom MCP** (local command), point it at the path above,
and authorize it. It runs locally, reads only — revoke any time.

## Security

- **Local-only** stdio subprocess; no network listener, no cloud.
- **Read-only** in P0 (`readOnlyHint: true` on every tool).
- Reuses the cockpit's honest model — no fabricated data.
- Treats all repo/log content as **data, not instructions** (prompt-injection hygiene).

## Test

    node --test packages/mooter-bridge/server.test.js
