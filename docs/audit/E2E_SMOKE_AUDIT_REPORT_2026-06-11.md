# E2E Smoke Audit — Production (Wave 55, Phase D.4)

> Ran 2026-06-11 from the `wave55-product-audit` worktree. Read-only: HTTP GETs to
> Mooter infra + local hashing. Scripts: `scripts/audit/{e2e_smoke_prod,
> mcp_tools_health,pastor_health}.sh`.

## Results

### `e2e_smoke_prod.sh` — 7 ok · 1 warn · 0 fail (exit 0)
| Check | Result |
|---|---|
| classify.js sha (local) | ✅ INTACT `427d8c0b…364bc48f` |
| classify.js sha (remote `main`) | ✅ INTACT |
| hub `/v1/pricing` | ✅ 200 |
| hub `/aggregate-stats` | ✅ 200 |
| landing `https://mooter.ai` | ✅ 200 |
| `install.sh` | ✅ 200 |
| landing version | ⚠️ `v1.21.5` — **stale** (actual 1.35.0; P4: copy refresh OUT OF SCOPE) |
| latest release | ✅ `v1.35.0-ccaf-audit-overnight` |

### `mcp_tools_health.sh` — ✅ 20 tools (exit 0)
`mooter_status, mooter_dogfood_log, mooter_workflow_create, mooter_ecosystem_recommend,
mooter_pastor_hint, mooter_notion_write, mooter_pastor_adapter_suggest,
mooter_obsidian_sync, mooter_effort_set, mooter_ultramoo_toggle, mooter_workflow_watch,
mooter_data_export, mooter_sessions_list, mooter_sessions_quota_forecast,
mooter_sessions_handoff, mooter_sessions_pastor_aggregate, mooter_route_query,
mooter_get_savings, mooter_explain_tier, mooter_session_summary`
→ confirms Day-0 P5 (12 W32 + 16→20 W-Mega = 20). Manifest-level; runtime
accessibility needs the server up + an MCP client.

### `pastor_health.sh` — corpus + trainer present; adapters pre-train
- ⚠️ `~/.mooter/pastor` and `~/.mooter/adapters` absent — adapters not materialised
  (expected: the overnight train hasn't run; Wave 31/Mega finding).
- ✅ corpus `audit/lora_train.jsonl` — **560 samples, 212 at score≥8** (matches the
  runbook; trainer floor is 20).
- ✅ `scripts/train_lora.sh` + `scripts/requirements-lora.txt` (unsloth 2026.6.1).

## Findings

1. **classify.js sha intact** end-to-end (local + remote `main`) — the frozen-engine
   invariant holds in prod.
2. **Landing stale `v1.21.5`** — known (P4); copy refresh is explicitly out of scope
   for this wave.
3. **⚠️ Repo visibility — verify.** The remote `classify.js` was fetchable from
   `raw.githubusercontent.com/<repo>/main/…` **unauthenticated**, which implies the
   repository may be **public**. The standing mandate is REPO MUST STAY PRIVATE.
   Paulo should confirm the repo's visibility on GitHub (Settings → Danger Zone) —
   if it is public, make it private and rotate any exposed secrets. (Could also be a
   cached credential on this box; the unauthenticated raw fetch is the signal to check.)
4. **Pastor adapters pending** — corpus + trainer are ready; materialised adapters
   land after the overnight train (`scripts/train_lora.sh`, see LORA runbook).

## Re-run
```bash
bash scripts/audit/e2e_smoke_prod.sh     # exits non-zero only on a classify.js sha mismatch
bash scripts/audit/mcp_tools_health.sh
bash scripts/audit/pastor_health.sh
```
