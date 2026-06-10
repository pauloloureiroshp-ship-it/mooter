# Mooter Observability Guide (OTLP export)

> Wave Mega 50-51 · Phase 1.A — `mooter observability`

Mooter can export its **routing decisions** as OpenTelemetry spans to any
OTLP/HTTP collector (OpenTelemetry Collector, Jaeger, Grafana Tempo,
Honeycomb, Traceloop, …). It is **opt-in, on-demand, and batch** — nothing is
ever sent until you enable it *and* run an export.

## Quick start

```bash
mooter observability status          # disabled by default
mooter observability enable
mooter observability export --dry-run   # preview the first span, no network
mooter observability export --last 50   # POST the last 50 decisions
mooter observability export-config      # collector receiver YAML to paste
```

Config lives at `~/.mooter/observability.json`:

```json
{
  "enabled": false,
  "otlp_endpoint": "http://127.0.0.1:4318",
  "service_name": "mooter-router"
}
```

Edit `otlp_endpoint` to point at any OTLP/HTTP collector. Spans are POSTed as
OTLP JSON to `<otlp_endpoint>/v1/traces`.

## What is exported

The source of truth is the router's `decisions.log`
(`~/.claude/tools/router/decisions.log`, written by the frozen
`classify.js` pipeline). Only entries that represent a routing decision
(`classified` / `executed` events carrying a `tier`) become spans.

### Span schema

| Field | Value |
|---|---|
| name | `mooter.route` |
| kind | `1` (INTERNAL) |
| startTimeUnixNano | the decision's `ts_ms`/`ts` |
| endTimeUnixNano | start + `duration_ms` when recorded, else = start |
| resource `service.name` | `mooter-router` (configurable) |

### Span attributes

| Attribute | Source | When present |
|---|---|---|
| `mooter.tier` | `tier` (T0/T1/T2/T3/T5) | always (it's what makes the line a decision) |
| `mooter.model` | `recommended_model` / `model_used` | when the log entry has one |
| `gen_ai.request.model` | same as `mooter.model` | same — OTel GenAI / OpenLLMetry semantic convention |
| `gen_ai.system` | `recommended_backend` (e.g. `ollama`, `claude_subagent`) | when present |
| `mooter.confidence` | `confidence` (0–1) | when present |
| `mooter.event` | `classified` / `executed` | when present |
| `mooter.task_category` | `task_category` | when present |
| `mooter.cost_estimate_usd` | logged `cost_usd`, else computed from token counts × the authoritative per-Mtok price table | **only** when the entry carries real token counts (or a recorded non-zero `cost_usd`) |
| `mooter.savings_vs_t3_usd` | T3/Opus cost of the same token volume minus the chosen tier's cost | **only** when token counts exist |

**Cost attributes are never fabricated.** `classified` events (the majority of
the log) carry no token counts, so their spans simply have no cost/savings
attributes. That is correct behavior, not missing data.

## Pointing at a local collector / Jaeger

`mooter observability export-config` prints a ready-to-paste OpenTelemetry
Collector config with an OTLP/HTTP receiver on `127.0.0.1:4318`. For a
one-container Jaeger that accepts OTLP directly:

```bash
docker run --rm -p 16686:16686 -p 4318:4318 jaegertracing/jaeger:latest
mooter observability enable
mooter observability export
# open http://localhost:16686 → service "mooter-router"
```

## OpenLLMetry compatibility

Spans carry `gen_ai.*` attributes (`gen_ai.request.model`, `gen_ai.system`)
following the OpenTelemetry GenAI semantic conventions that OpenLLMetry uses,
so backends that group LLM traffic by those attributes will treat Mooter's
routing spans like other LLM spans. Mooter does **not** use the Traceloop SDK:
the CLI makes no live Anthropic API calls to instrument, so it emits OTLP
JSON directly with zero dependencies.

## Honest limitations

- **Batch, on-demand — not live tracing.** Spans are derived from
  `decisions.log` when you run `export`. There is no background daemon, no
  streaming, and re-running `export` re-sends the same tail (collectors will
  see duplicate spans with fresh trace/span IDs — dedupe is not implemented).
- **No prompt contents, ever.** `prompt_preview` and all text fields are
  dropped at conversion time — features only, privacy preserved (same policy
  as the rest of Mooter's telemetry).
- **Savings are estimates.** `mooter.savings_vs_t3_usd` uses the published
  per-Mtok price table (T1 $1/$5 · T2 $3/$15 · T3 $5/$25 · T5 $10/$50) on the
  logged token volume; entries without token counts get no savings number at
  all.
- **Read-only on the router.** The exporter only reads `decisions.log`;
  `tools/router/` (including `classify.js`) is untouched.
