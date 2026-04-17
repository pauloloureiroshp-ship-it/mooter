# frugal-hub — Cloudflare Worker

Community hub for frugal router telemetry. Receives anonymized deltas, aggregates stats, and generates community router-tuning.

## Structure

```
hub/
├── worker.js           ← Entry point (Cloudflare Worker)
├── wrangler.toml       ← Cloudflare config
├── routes/
│   ├── delta.js        ← POST /api/delta — receive anonymized deltas
│   ├── stats.js        ← GET /api/stats — public aggregate statistics
│   ├── models.js       ← GET /api/models — model catalog
│   └── version.js      ← GET /api/version — current versions
├── jobs/
│   ├── aggregate.js    ← Cron: hourly aggregate deltas into stats
│   ├── generate.js     ← Cron: daily generate router-tuning
│   └── notify.js       ← Cron: weekly anomaly notification
├── lib/
│   ├── trust.js        ← Trust scoring for delta submissions
│   ├── model-detect.js ← Community model detection
│   └── anomaly.js      ← Anomaly detection for weekly reports
└── migrations/
    ├── 001_init.sql           ← Initial D1 schema
    └── 002_frugal_events.sql  ← frugal_events table (Sprint 1)
```

## Deploy

```bash
cd hub
npx wrangler deploy
```

## Environment

- **Worker URL:** https://mooter-hub.frugal-hub.workers.dev
- **D1 database:** `frugal-hub-db`
- **R2 bucket:** `frugal-hub-storage`
- **Account:** (see INFRA.md)

## Migrations

```bash
npx wrangler d1 migrations apply frugal-hub-db
```

**Deploy order — ALWAYS apply migrations BEFORE deploying the worker.**
Running `wrangler deploy` without applying pending migrations first will leave
routes returning 500 errors when they hit tables that don't yet exist.

Recommended sequence when adding a migration:
```bash
# 1. Apply migration to remote D1 (production)
npx wrangler d1 migrations apply frugal-hub-db --remote
# 2. Verify applied
npx wrangler d1 migrations list frugal-hub-db --remote
# 3. Deploy worker
npx wrangler deploy
```

Note: `002_frugal_events.sql` is created but not yet applied (scheduled for Sprint 3).
`007_device_heartbeats.sql` powers `POST /api/device-heartbeat` (install telemetry).
