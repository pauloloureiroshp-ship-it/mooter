# MCP Registry Submission — Mooter MCP Server

> Wave 50-51 Phase 1.C. Docs only — **nothing has been submitted**. These are the
> exact manual steps + metadata for submitting `@mooter/mcp-server` (20 tools) to
> the official MCP Registry (`registry.modelcontextprotocol.io`). All commands are
> run by a human, deliberately — no CI automation.

## Prerequisites (one-time)

1. **Publish the server to npm first.** The registry does not host code; it
   indexes packages. The package must be public on npm under a name we control.
   - Current blocker: `packages/mcp-server` is `"private": true` and named
     `@mooter/mcp-server`. Before submission, either publish the `@mooter` npm
     scope (requires the `mooter` npm org) or fold the server into the already
     published CLI package and submit that. Decide which before step 1 below.
   - The published package must include the **`mcpName` field** in `package.json`
     (the registry validates npm ownership through it):
     ```json
     { "mcpName": "io.github.pauloloureiro-shp/mooter" }
     ```
     (Namespace must match the auth method chosen in step 2 — GitHub login ⇒
     `io.github.<github-username>/…`.)
2. **Install the publisher CLI** (no global install needed):
   ```sh
   brew install mcp-publisher        # macOS
   # or: go install github.com/modelcontextprotocol/registry/cmd/publisher@latest
   ```

## Submission steps

```sh
cd packages/mcp-server

# 1. Create server.json (registry manifest — distinct from our manifest.json)
mcp-publisher init                  # scaffolds server.json; then edit it (metadata below)

# 2. Authenticate (GitHub account that owns the namespace)
mcp-publisher login github          # device-code flow in the browser

# 3. Validate + publish
mcp-publisher publish               # validates server.json, checks npm mcpName, submits

# 4. Verify it landed
curl "https://registry.modelcontextprotocol.io/v0/servers?search=mooter"
```

## server.json metadata (copy-paste basis)

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-09-29/server.schema.json",
  "name": "io.github.pauloloureiro-shp/mooter",
  "description": "Local-first LLM router companion: live tier routing (frozen classifier), honest savings from real local state, tier/pricing explainer, session summaries, cross-session orchestration, workflows, GDPR export. 20 tools, zero-dep stdio.",
  "version": "0.2.0",
  "websiteUrl": "https://mooter.ai",
  "repository": {
    "url": "https://github.com/<owner>/<repo>",
    "source": "github"
  },
  "packages": [
    {
      "registryType": "npm",
      "identifier": "<published npm package name>",
      "version": "<published version>",
      "transport": { "type": "stdio" },
      "runtimeHint": "npx"
    }
  ]
}
```

Notes for Paulo when filling it in:
- `repository.url`: use the public repo URL (the mooter monorepo is private today —
  the registry accepts entries without a repo, but listings with one rank better;
  consider a public mirror of just the server package).
- `version` must match the npm-published version exactly; bump both together.
- Transport is `stdio` (what `mooter mcp serve` / `mooter-mcp` speaks);
  `protocolVersion` 2024-11-05 is declared in the handshake, not in server.json.

## Tool inventory to declare (20)

`mooter_status` · `mooter_dogfood_log` · `mooter_workflow_create` ·
`mooter_ecosystem_recommend` · `mooter_pastor_hint` · `mooter_notion_write` ·
`mooter_pastor_adapter_suggest` · `mooter_obsidian_sync` · `mooter_effort_set` ·
`mooter_ultramoo_toggle` · `mooter_workflow_watch` · `mooter_data_export` ·
`mooter_sessions_list` · `mooter_sessions_quota_forecast` ·
`mooter_sessions_handoff` · `mooter_sessions_pastor_aggregate` ·
`mooter_route_query` · `mooter_get_savings` · `mooter_explain_tier` ·
`mooter_session_summary`

## Honesty / safety statements for the listing description

- The router core (`tools/router/classify.js`) is frozen; the server only spawns
  it read-only. Listing must not claim the server "tunes" or "learns" routing.
- Savings figures are read from local state (`decisions.log`, savings-tracker);
  the tools return explicit empty-states when data is missing.
- Network use: only the opt-in Notion write (needs `NOTION_TOKEN`) and a loopback
  probe to the local savings-tracker. Everything else is local filesystem reads.
- T5 (Fable 5) is opt-in only and never auto-routed — keep this wording if tiers
  are mentioned in the listing.

## Post-submission checklist

- [ ] Entry visible via the `/v0/servers?search=mooter` query above
- [ ] `npx <package>` cold-start smoke test from a clean machine
- [ ] Add the registry badge/link to `landing/` (separate wave — touching landing
      is out of scope for 1.C)
- [ ] Note the submission in SYNC.md + Notion session log
