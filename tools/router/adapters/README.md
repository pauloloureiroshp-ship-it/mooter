# PM Adapters (Frente C · Delivery Cockpit)

Optional, one-way bridges from the **Moo Ledger** to external PM tools. The core cockpit is
`$0` and works with **zero** adapters — everything here is **opt-in and off by default**.

> Filosofia: *o Perfect Handoff não mente sobre o passado; o Delivery Forecast não mente
> sobre o futuro.* The adapters exist to **project** the Ledger outward — never to let an
> external tool become a second source of truth.

## The five laws (red-team invariants)

| Law | Where enforced | What it means |
|---|---|---|
| **Zero-by-default** (line 106/111) | `config.js` | An adapter is off unless the user writes `enabled:true`. Absent/unknown/corrupt config → off. `emit()` with nothing enabled connects nothing. |
| **Unidirectional** (DC-11) | `stamp.js`, `index.js` | Ledger → external only, stamped `ledger_event_id` + `source:'mooter-ledger'`. GitHub read is **display-only**, tagged `_kind:'presentation'`, and **never** fed to the forecast. |
| **Scoped local broker** (DC-12) | `broker.js` | Tokens live in `~/.mooter/pm-adapters/tokens/<tool>.token` at `0600` — **never** in VS Code extension storage. Each tool declares a **minimum scope**. Tokens are `redact()`-ed before any log. |
| **Human write-back gate** (DC-12) | `gate.js`, `index.js` | The **first** write-back per tool requires an explicit recorded human consent (`cli.js grant <tool>`). Until then, events coalesce locally but **nothing leaves the machine**. |
| **Debounce + kill-switch** (DC-13) | `debounce.js` | ≤ 1 summary notification per **5 min** (coalesced). > 20 events/window ⇒ loop suspected ⇒ **kill-switch trips**, all outbound stops until a human `reset`s. |

## Data lives under `~/.mooter/pm-adapters/` (never the Forge's `~/.mooter/adapters/`)

```
~/.mooter/preferences.json      → { "pm_adapters": { "notion": { "enabled": true, "database_id": "…" } } }
~/.mooter/pm-adapters/tokens/<tool>.token   (0600)
~/.mooter/pm-adapters/token-scopes.json
~/.mooter/pm-adapters/consent.json
~/.mooter/pm-adapters/debounce.json
```

## Adapters

| Tool | Direction | Min scope | Notes |
|---|---|---|---|
| `github` | **read-only** | `repo:status` (read) | PR + CI state for the operational chips. Prefers the `gh` CLI (no stored token); read-only REST fallback. |
| `notion` | outbound | one roadmap DB, insert/update | Roadmap write-back, upsert by `ledger_event_id`. |
| `linear` | outbound | one team, create/update | Optional. |
| `slack` | outbound | `chat:write`, one channel | The 5-min summary sink. Webhook or token. |

## Wiring (Ledger → adapters)

```js
const adapters = require('./adapters');           // the AdapterManager

// HOT PATH — the Ledger runner calls this after appendEvent(). Sync, never blocks,
// never throws, no network. Buffers to every enabled outbound tool.
adapters.emit(ledgerEvent);

// NETWORK PATH — a timer / session boundary / the UI calls this. Flushes tools whose
// 5-min window elapsed, if consent + token are present.
await adapters.flushDue({ transport });           // transport injectable for tests

// DISPLAY — Frente B asks for PR/CI chips. Presentation only; never touches the forecast.
const chips = await adapters.enrich({ owner, repo, ref, prNumber });
```

## Operate it (human)

```bash
node adapters/cli.js status
node adapters/cli.js enable notion --db <database_id>
echo "$NOTION_TOKEN" | node adapters/cli.js set-token notion   # token via stdin, never argv
node adapters/cli.js grant notion                              # <-- the human write-back gate
node adapters/cli.js reset notion                              # clear a tripped kill-switch
node adapters/cli.js --self-test
```

## Test

```bash
node --test tools/router/adapters/*.test.js
node tools/router/adapters/cli.js --self-test
```

All tests inject a fake `transport` — **zero network, zero cost**. They prove: off-by-default,
consent-gated writes, the unidirectional watermark on every payload, 5-min coalescing, and the
loop kill-switch.
