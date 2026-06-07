# Mooter — Recovery Flows (user-facing) — Wave 30 Phase M

How each failure looks to the user and what they do. Pairs with the machine-readable
`ERROR_CATALOG.md`. Principle: **degrade, never dead-end** — Mooter keeps working
locally when the cloud or hub is unavailable, and tells the user exactly what changed.

## Flow A — "my local model stopped working" (Ollama down / model-bare)

1. Statusline shows `🔧 ollama down — setup repair`.
2. Routing temporarily escalates trivial tasks to the cheapest cloud tier (so work continues), and logs the degrade.
3. User runs `mooter setup repair` → starts the daemon, pulls the default model.
4. Statusline clears; local routing resumes. No prompt is lost.

## Flow B — "I'm offline / hub is down" (Hub unreachable)

- Telemetry and sync events are appended to `~/.mooter/sync-queue.jsonl`.
- Statusline: `📡 hub offline — queued`. Nothing blocks; routing is fully local-capable.
- On next reachable heartbeat, the queue drains automatically (signed, idempotent).

## Flow C — "I ran out of cloud quota" (Quota exhausted)

- Provider 429 / quota-zero detected → routing biases **hard to local** for the rest of the window.
- Statusline: `🪫 quota out — local only` with the reset ETA when the provider exposes it.
- T3 tasks that genuinely need cloud surface a one-line notice instead of silently failing.

## Flow D — "my big task crashed" (Workflow crash)

- A run left `running` with a stale checkpoint is detected on next `mooter workflow` invocation.
- Statusline: `🔄 workflow resumable`.
- User runs `mooter workflow resume <runId>` → resumes from the last checkpoint (cross-session, SQLite-backed). Not auto, because the user should decide.

## Flow E — "my adapter is broken" (LoRA incompatible)

- At activation, a base-model mismatch or signature failure disables the adapter and falls back to the baseline router.
- Statusline: `🧩 adapter off — baseline`. Routing is unbiased but fully functional.

## Flow F — "running out of disk" (Disk low)

- Pre-flight before a large model pull, `mooter setup audit` warns if free space < 500 MB.
- Statusline: `💾 disk low`. The pull is not started blindly; the user is asked to free space first.

## Flow G — "everything is slow" (Network slow)

- Rolling cloud latency > 5 s → auto-degrade prefers local where quality allows.
- Statusline: `🐢 net slow — local-bias`. Recovers automatically when latency normalises.

---

*All flows are driven by `planRecovery(signals)`; the statusline chips are the Phase N line-3 surface. Auto vs. manual is set per scenario in `error-catalog.ts`.*
