# Security & Privacy

Mooter is a **local-first** LLM router for Claude Code. This document states what
that means in code, not in marketing — and how to report a vulnerability.

## Reporting a vulnerability

Email **security@mooter.ai** with a description and reproduction steps. Please do
not open a public issue for undisclosed vulnerabilities. We aim to acknowledge
within 72 hours.

## The three guarantees (and where they live in the code)

### 1. Nothing leaves your machine without consent

Community telemetry is **opt-in via login**. With no auth token at
`~/.mooter/auth.token` (written only after you run `mooter login`), the push
scheduler exits and sends nothing — an anonymous install transmits **zero**
telemetry.

- Gate: `tools/router/hub-events-scheduler.js` (no token → `exit 2`).
- Transport: HTTPS + Bearer to the hub `/submit-events`.

### 2. Your prompts and code never leave (only aggregate features do)

What *can* be uploaded are **bucketed features**, never content. This is enforced
in **five independent layers** — three client-side, two server-side:

| # | Layer | File |
|---|---|---|
| 1 | Field allow-list (any extra key → event rejected) | `tools/router/event-builder.js` |
| 2 | Banned-pattern scan (paths, file extensions, stack frames, URLs, sub-minute timestamps → rejected) | `tools/router/event-builder.js` |
| 3 | HIGH_RISK filter (push/deploy/secret/migration prompts never enter the corpus) | `tools/router/event-builder.js` |
| 4 | Zod schema + privacy `.refine()` (rejects any `prompt`/`content`/`text`/`body`/`messages`/`response`/`file_path`/`stack_trace` key) | `hub/lib/schemas.js` |
| 5 | Input sanitizer (strips XSS, dangerous protocols, control chars, prototype pollution) | `hub/lib/sanitize.js` |

Values are bucketed, never raw: prompt length → `0-50 … 500+`; file refs and code
blocks → `0/1` flags (never the path or the code); timestamps → date + UTC hour
only; `instance_id` → `SHA-256(host|user)[:8]`; `user_id_hash` → 16-hex, sent only
if you logged in. The privacy contract is covered by an attack-case self-test:
`node tools/router/event-builder.js --self-test`.

### 3. The router decides locally, for free

Every prompt is classified by deterministic regex (`tools/router/classify.js`) in
under 50ms — **no LLM call, no network** for the routing decision. The prompt is
forwarded only to the provider *you* chose, with *your* key. The local tier
(Ollama) stays entirely on-device. `classify.js` is frozen and CI-pins its sha256.

## Local services

The savings tracker is an HTTP server bound to **`127.0.0.1` only** (never
`0.0.0.0`), so it is not reachable from the LAN. As of tracker **v0.8.0** it also
defends against the browser as a confused deputy:

- **Host allow-list** — only `127.0.0.1`/`localhost`/`[::1]` on the bound port are
  served; defeats DNS-rebinding.
- **Origin allow-list** — non-browser node clients (no `Origin`) and the VS Code
  webview are allowed; **any website Origin is rejected**. The server never emits
  `Access-Control-Allow-Origin: *`.
- **JSON content-type on writes** — blocks `text/plain` "simple-request" CSRF.

Tests: `node --test tools/router/savings-tracker-security.test.js`.

## Scope still under review

Honesty note: the following are not yet covered by a published guarantee and are
being hardened — the **packs / MCP supply chain** (third-party code you install),
the per-provider call internals, and the hooks that read prompts locally. Treat
packs from unknown authors with the same caution as any third-party dependency.
