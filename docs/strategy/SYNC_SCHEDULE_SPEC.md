# Sync Schedule Spec (Wave 3 Day 3)

> Defines the cadence contract for remote telemetry sync. **No cron is started in
> this build** — Wave 3 D3 only records intent in `consent.json`. The scheduler
> lands in Wave 4 Phase D (alongside the real CF Workers backend) and MUST honour
> this spec.

## Where it lives

`~/.mooter/consent.json → sync_schedule`:

```json
{
  "telemetry_enabled": true,
  "sync_schedule": {
    "cadence": "daily",
    "time_of_day": "03:00",
    "timezone": "local"
  }
}
```

`cadence` defaults to `daily` (set by `buildConsent`). It is operational config,
intentionally NOT covered by the consent HMAC signature (the signature attests
the opt-in + data categories, not the cadence).

## Cadences

| cadence | meaning |
|---|---|
| `daily` (default) | one sync attempt per day at `time_of_day` (local tz) |
| `weekly` | one sync attempt per week |
| `manual-only` | never automatic — only `mooter sync` run by the user |

## Changing it

```bash
mooter quiet --sync-cadence=manual-only
mooter quiet --sync-cadence=weekly
mooter quiet --sync-cadence=daily
```

Invalid values are rejected (exit 1). The command rewrites `consent.json`
preserving every other field.

## Hard rules the Wave 4 scheduler must follow

1. **Consent gate is absolute** — if `telemetry_enabled` is false, the scheduler
   does nothing, regardless of cadence.
2. **`manual-only` means no cron** — the scheduler must not register any timer.
3. **Every run (auto or manual) writes a signed `sync-audit.jsonl` entry.**
4. **Dry-run remains the default of `mooter sync`** until Wave 4 D ships the real
   client; even then, `--dry-run` must stay available and never touch the network.
5. **Revocation is immediate** — `mooter quiet --telemetry-off` halts all future
   syncs at the next gate check.

## When the cron arrives

Wave 4 Phase D (or D+1) adds the scheduler. Until then, `mooter sync --dry-run`
is the only path and it makes ZERO network calls. This spec is the contract the
scheduler is built against.
