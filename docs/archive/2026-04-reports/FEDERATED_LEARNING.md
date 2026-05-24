# frugal · Federated Learning

> *How frugal improves across users without ever seeing their prompts.*

## Philosophy

**Never share prompts. Share only anonymized fingerprints of routing errors.**

Every frugal install silently learns from local routing outcomes via
`backtest.js`, which produces `router-tuning.json` — a set of demote/promote
regex patterns that are applied to the next cycle of classifier runs.

That learning stays 100% local unless you deliberately export a **delta** —
a structured fingerprint of *where the classifier was wrong*, stripped of
any identifying content.

## What a delta contains

A delta is a JSON file with this shape:

```json
{
  "frugal_version": "0.9.0",
  "classifier_version": "1.0.0",
  "generated_at": "2026-04-09T02:00:00Z",
  "instance_id": "a1b2c3d4",
  "hardware_tier": "gpu-high",
  "deltas": [
    {
      "delta_type": "misroute",
      "decided_tier": "T2",
      "correct_tier": "T0",
      "prompt_len_bucket": "50-100",
      "has_file_refs": false,
      "has_code_block": false,
      "keyword_signals": ["commit", "message"],
      "session_hour": 14,
      "n": 8
    }
  ],
  "promote_signals": [
    {
      "delta_type": "underpowered",
      "decided_tier": "T1",
      "correct_tier": "T2",
      "keyword_signals": ["debug", "trace", "root cause"],
      "n": 3
    }
  ]
}
```

### What a delta does NOT contain (privacy guarantees)

These guarantees are enforced by `backtest.js --export-delta` and re-validated
by `aggregate-deltas.js` at ingest time. Any delta with extra fields is
**rejected**, not trimmed.

- ❌ **Never** the raw prompt text, or any substring of it
- ❌ **Never** file paths (only `has_file_refs: true/false`)
- ❌ **Never** variable, function, or class names
- ❌ **Never** full dates — only `session_hour` (0-23 UTC)
- ❌ `instance_id` is `SHA-256(machine-id).slice(0, 8)` — **not reversible**
- ✅ `keyword_signals` is restricted to an allow-list of 30 neutral tokens
  (see `KEYWORD_ALLOW_LIST` in `tools/router/backtest.js`)
- ✅ `prompt_len_bucket` is a 50-char bucket, not the exact length

## Manual flow (for 2–10 friends, no hub)

This is the workflow Paulo uses today while `frugal-hub` (the automated
collector) is not yet deployed.

### 1. Export your delta

```bash
node tools/router/backtest.js --export-delta \
  --output delta-$(hostname).json
```

This reads your local `decisions.log`, anonymizes it, and writes a JSON file.
**Open the file first** and verify it contains no surprising content.

### 2. Share it (safely)

A delta is safe to share because it contains no prompts, paths, or
identifiers. Any of these work:

- **GitHub issue**: `gh issue create --title "delta: $(hostname)" --body "$(cat delta-$(hostname).json)"`
- **PR**: commit the file under `community-deltas/` and open a pull request
- **Gist**: public or private, your call

### 3. Aggregate (once 2+ deltas are available)

Whoever is maintaining the tuning snapshot runs:

```bash
node tools/router/aggregate-deltas.js \
  delta-alice.json delta-bob.json delta-carol.json \
  --output router-tuning-v1.1.json
```

The aggregator:
- Validates each file against the allow-list schema
- Groups identical `(decided_tier, correct_tier, keyword_signals)` fingerprints
- Requires at least 1 contributor and combined `n ≥ 3` per group before keeping
- Applies `hardware_tier` weighting (`gpu-high: 1.2`, `cpu-only: 0.8`)
- Writes a versioned `router-tuning-vN.json`

### 4. Apply the updated tuning

```bash
# Review first (highly recommended):
node tools/router/update-router.js --dry-run

# Then apply:
node tools/router/update-router.js
```

### 5. Friends pull and apply

```bash
git pull
node tools/router/update-router.js
```

## Roadmap — `frugal-hub` (v1.1)

Once there are 5+ regular contributors, the manual flow becomes friction. The
plan is to deploy a small Cloudflare Worker at `frugal-hub.workers.dev` that:

- `POST /submit-delta` → accepts a delta, validates the schema, stores in D1
- `GET /latest-tuning` → serves the latest aggregated `router-tuning-vN.json`
- Daily cron → re-aggregates submitted deltas into a new tuning version

**Stack**: Cloudflare Workers + D1 (SQLite) + R2 (object storage). The free
tier comfortably covers frugal's scale (2-50 users, a few kB per submission
per day).

No private data ever reaches the hub — the ingest endpoint runs the same
`validateDelta()` function used by `aggregate-deltas.js` and rejects anything
with unexpected fields.

## Running your own hub

Nothing about the protocol is tied to `frugal-hub.workers.dev`. Any endpoint
that accepts a POST body matching the delta schema and serves the aggregated
tuning JSON will work. Set `FRUGAL_HUB_URL` and the daily cron will POST to
your hub instead.

## FAQ

**Q: Why not just share anonymized prompts?**
Because "anonymized" is easier said than done. Stripping PII from natural
language prompts requires NLP heuristics that fail at the edges. Fingerprints
are strictly structural — no natural language leaves the machine.

**Q: What if my delta reveals I asked about a specific library?**
It doesn't. `keyword_signals` is an allow-list of 30 neutral routing tokens
(`commit`, `debug`, `refactor`, etc.). Library names, project names, and
anything resembling a proper noun are filtered out before export.

**Q: Can I opt out?**
Yes — don't run `backtest.js --export-delta`. The daily local backtest
(`backtest.js` alone) never exports anything off-machine.

**Q: What's `instance_id` for?**
Just to prevent one noisy user from dominating the aggregation. Two deltas
from the same `instance_id` count as one contributor. It's not reversible
and we don't correlate it with anything else.
