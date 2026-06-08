# GDPR Data Rights (Wave 32)

Mooter is local-first and privacy-first. Telemetry is opt-in, anonymous, and
features-only. These commands give you the GDPR rights of access, portability,
and erasure — all from the CLI.

```bash
mooter data export [--format json]   # right to access + portability
mooter data delete-all [--confirm]   # local erasure
mooter data forget-me [--confirm]    # erasure of your contributions on the hub
```

## `mooter data export` — access & portability

Produces a portable JSON dump (`mooter-data-export/v1`) of **your** local data:
configuration (`preferences.json`, `effort.json`, `profile.json`, `consent.json`,
`limits.toml`, `state.json`), Pastor state, and your routing decisions
(features only — your decisions log never stores prompts or responses).

**Credentials are redacted.** `auth.json`, `credentials.json`, and the telemetry
secret are listed as `redacted_present` (proof they exist) but their **values are
never emitted** — they are auth material, not portable personal data. Every export
is run through a **privacy audit** (emails, bearer tokens, JWTs, private keys, and
the known telemetry secret) *before* it is printed; if a leak is ever detected the
export is **blocked** and reports the violation rather than emitting it.

## `mooter data delete-all` — local erasure

Wipes everything under `~/.mooter` **plus the router decisions log**
(`~/.claude/tools/router/decisions.log`, or `$MOOTER_CLAUDE_DIR`) — that log is
the other place your routing history lives, so a true erasure must include it. It
is **destructive and irreversible**, so it requires `--confirm`; without it you get
a dry-run listing of exactly what would be removed. Those are the only two locations
touched — one directory (`~/.mooter`) and one explicit, disclosed file.

## `mooter data forget-me` — erasure on the hub

Asks the federated hub to erase **your device's contributions** from the aggregates.
It sends only an **HMAC-signed `device_id`** (`HMAC-SHA256(device_id|ts)` with your
local telemetry secret) — never any telemetry. The hub queues the request
(`POST /v1/forget-me` → `202`) and removes your contributions on its next
**k-anonymity (≥50)** aggregation pass. Requires `--confirm`.

## Data minimisation guarantees

- Telemetry is **opt-in** (default off) and **features-only** — the hub's
  `transparency_events` ingestion rejects any metadata key resembling content
  (`prompt`, `response`, `content`, `message`, `text`, `code`, `body`).
- All public aggregates are **k-anonymity ≥ 50** gated.
- `device_id` is `client_id_pseudonymous` — a SHA-256 of a per-machine secret,
  anonymous and unlinkable to your identity.
