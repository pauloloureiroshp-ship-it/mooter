# Wave 4 Phase D — backend setup (client-only slice shipped)

> **Reality check (2026-05-31):** the original kickoff asked for a greenfield
> `cf-workers/` project. Recon found a **fully deployed Cloudflare Workers backend
> already exists at `hub/`** (worker `frugal-hub`, D1 `mooter-hub`, R2, cron jobs,
> routes incl. `POST /api/events` + `POST /api/delta` + `POST /api/device-heartbeat`,
> migrations 003–009 with `mooter_events`/device/user tables). Building a second
> `cf-workers/` backend would duplicate and fragment a live telemetry backend.
>
> **Paulo's decision:** ship only the genuinely-missing, low-risk **client** piece
> — `mooter sync` real mode — and DEFER the backend route + dashboard activation to
> a separate **hub-aware** kickoff. No `cf-workers/` was created; `hub/` was not
> touched.

## What shipped (this wave)

- **`mooter sync` real mode** (`packages/cli/src/commands/sync.ts` → `runSyncReal`):
  feature-flagged. With no backend URL it falls back to dry-run + a clear warning.
  With a URL it requires `mooter login` (auth.json) + telemetry consent, builds the
  same W3 D3 sync events, and `POST`s them to `${backendUrl}/v1/events` with a
  Bearer token, writing a `real-sync` audit entry. Fetch is injectable; tests use a
  mock (ZERO real network).

## What was NOT built (already exists / deferred)

- `cf-workers/` — NOT created. The backend is `hub/` (already deployed).
- D1 schema / events ingestion / aggregates — already in `hub/` (migrations + routes).
- Dashboard `ActivityChart` activation — stays the honest Phase C note until the
  backend contract is wired.

## To enable real sync (when the hub route exists)

The client posts to `${backendUrl}/v1/events`. **No backend serves `/v1/events`
yet** — `hub/` serves `/api/events` with a *different* contract (delta/heartbeat
shape, not the W3 D3 `mooter_sync_event` schema). So before real sync works
end-to-end, a **hub-aware kickoff** must add a `hub/` route that accepts the W3 D3
`mooter_sync_event` v1 contract (HMAC-verified) and maps it into the existing D1.

Once that route exists and `hub/` is deployed (`cd hub && wrangler deploy` — manual,
Paulo), enable the client:

```bash
# point the CLI at the deployed hub backend
export MOOTER_CF_BACKEND_URL=https://mooter-hub.frugal-hub.workers.dev
# or persist it:
echo '{"backend_url":"https://mooter-hub.frugal-hub.workers.dev"}' > ~/.mooter/sync-config.json

mooter login           # get a token (Phase B)
mooter sync            # real mode (was: dry-run only)
mooter sync audit list # confirm a real-sync entry with bytes_sent > 0
```

## Why `/v1/events` (not `/api/events`)

The W3 D3 sync contract deliberately versioned the path as `/v1/events` to keep the
new anonymized-aggregate schema separate from `hub/`'s existing `/api/events`
(per-device delta/heartbeat). The hub-aware kickoff decides whether to add a
`/v1/events` route to `hub/` or adapt the client to the existing `/api/events`
contract — that mapping is the remaining work.

## Honesty

- No secrets committed. No `hub/` (production) files changed. No auto-deploy.
- Real sync is OFF by default (no `MOOTER_CF_BACKEND_URL` → dry-run).
- The audit log distinguishes `dry-run` (bytes_sent=0) from `real-sync` (bytes_sent>0).
