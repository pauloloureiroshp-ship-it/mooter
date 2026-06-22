# @mooter/mcp-server

Mooter's MCP server: a **zero-dependency** stdio MCP implementation (hand-rolled
newline-delimited JSON-RPC 2.0) that exposes **21 tools** over the Mooter local
state. It is a thin protocol adapter — every tool reuses the existing Mooter
packages (`synthesis`, `cli`, `effort`, `transparency`, `data-rights`,
`sessions-orchestrator`, `council`) and never invents numbers.

## Run

```sh
mooter mcp serve          # via the Mooter CLI (what Claude Code spawns)
npm run serve             # direct (tsx src/bin.ts)
npm test                  # node:test via tsx
```

Claude Code config (see `manifest.json`):

```json
{ "mcpServers": { "mooter": { "command": "mooter", "args": ["mcp", "serve"] } } }
```

## Tools (20)

| Tool | What it does |
|---|---|
| `mooter_status` | Wave/phase progress + classify.js doctrine-gate sha status |
| `mooter_dogfood_log` | Log a friction observation to `~/.mooter/dogfood.jsonl` |
| `mooter_workflow_create` | Queue a local-first workflow request |
| `mooter_ecosystem_recommend` | Top L15 ecosystem recommendations for this machine |
| `mooter_pastor_hint` | Latest Pastor routing hint |
| `mooter_notion_write` | Create a Wave-log sub-page in Notion (needs `NOTION_TOKEN`) |
| `mooter_pastor_adapter_suggest` | Deterministic LORAUTER adapter suggestion (dry-run) |
| `mooter_obsidian_sync` | Sync the obsidian-vault-sync pack |
| `mooter_effort_set` | Get/set the session-wide effort mode |
| `mooter_ultramoo_toggle` | Toggle Ultramoo (max frugality) |
| `mooter_workflow_watch` | Read/set a workflow's pause/resume/kill control |
| `mooter_data_export` | GDPR-portable JSON export (privacy-audited, redacted) |
| `mooter_sessions_list` | Cross-project Claude Code session list |
| `mooter_sessions_quota_forecast` | Trailing 5h cloud-call rate projection |
| `mooter_sessions_handoff` | Handoff summary for a session id |
| `mooter_sessions_pastor_aggregate` | Cross-session per-category modal-tier signal (advisory) |
| `mooter_route_query` | Run the REAL frozen classifier (`tools/router/classify.js`, read-only spawn) on a prompt → tier, model/backend, confidence, rationale |
| `mooter_get_savings` | Honest savings: decision counts ← `decisions.log`, dollars ← local savings-tracker `/metrics` (same sources as `mooter digest`); explicit empty-state when no data |
| `mooter_explain_tier` | Tier explainer T0–T5 with 2026-06 list pricing (T5/Fable 5 is **opt-in only**, never auto-routed; T4 does not exist) |
| `mooter_session_summary` | Effort mode + recent decision counts by tier (tail of `decisions.log`) + tracker savings |

## Doctrine guarantees

- `tools/router/classify.js` is **frozen**: `mooter_route_query` spawns it
  read-only; nothing in this package ever modifies routing.
- Savings figures come only from `decisions.log` (counts) and the local
  savings-tracker (dollars). When a source is offline the tool says so —
  no fabricated numbers.
- Local-first: the only network calls are the opt-in Notion write and the
  loopback savings-tracker probe.

Registry submission steps live in `docs/MCP_REGISTRY_SUBMISSION.md` (repo root
`docs/`).
