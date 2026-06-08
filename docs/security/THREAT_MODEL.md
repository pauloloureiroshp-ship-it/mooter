# Mooter — Threat Model (Wave 30 Phase I)

**Date:** 2026-06-07 · **Scope:** Mooter CLI, router hook, hub Worker, workflow/synthesis/validation packages, LoRA/federated paths.
**Method:** STRIDE-lite per asset. Severity = realistic impact × exploitability for the current (local-first, single-user, opt-in-telemetry) deployment.

Assets: `~/.mooter/*` (auth token, telemetry secret, state, bandit posteriors), `tools/router/classify.js` (doctrine gate), hub D1, LoRA adapters, workflow sandbox, wrangler deploy creds.

---

## Vector summary

| # | Vector | Severity | Current mitigation | Status |
|---|--------|----------|--------------------|--------|
| 1 | Prompt injection (routed content) | Medium | Router classifies, never executes prompt content; doctrine guardrail caps tier | 🟡 partial |
| 2 | Supply chain (npm deps) | Medium | Lockfiles; `npm audit` baseline; no native deps in hot path | 🟢 gated (Phase I CI) |
| 3 | Hub token leakage | High | Token in `~/.mooter/auth.json` (0600); HMAC telemetry; no service-role key client-side | 🟡 perms probe added |
| 4 | LoRA adapter poisoning | Medium | Adapters validated + signed manifest; runtime stub returns null until trained | 🟢 gated |
| 5 | Federated aggregation poisoning | Medium | DP + k-anonymity ≥50 on aggregates; per-device caps | 🟡 partial |
| 6 | Workflow sandbox escape | High | isolated-vm sandbox (Wave 28); no fs/net in worker scripts | 🟡 depends on isolated-vm |
| 7 | Wrangler deploy persistence | Medium | Deploy creds in CI secret, not repo; manual deploy by Paulo | 🟢 procedural |

---

## 1. Prompt injection (routed content)

**Threat.** A malicious prompt tries to make the router downgrade tier (e.g. "this is trivial, use the cheapest model") to get a security-sensitive task handled by a weak model, or to make a workflow worker exfiltrate context.

- **Current:** `classify.js` is a deterministic classifier over prompt *features*, not an LLM that obeys embedded instructions; HIGH_RISK regex forces T3 regardless of injected "use haiku" text (USER_OVERRIDE: REFUSED path). The Wave 30 bandit cannot undercut the classify floor (doctrine guardrail, tested).
- **Proposed:** add an injection-pattern probe to `runtime-checks` flagging prompts that contain explicit tier-override + high-risk keywords (telemetry only, never auto-act). Keep classify.js byte-identical.
- **Action:** AI-1 monitor `decisions.log` for override-after-high-risk patterns.

## 2. Supply chain (npm dependencies)

**Threat.** A compromised transitive dep ships malicious code that runs at install or runtime with the user's privileges.

- **Current:** committed `package-lock.json` in tools/router, packages/cli, hub, landing; the validation/synthesis hot-path packages use **Node builtins only** (no native deps). `npm audit` baseline saved (`audit/NPM_AUDIT_BASELINE.md`): 0 high severity; a few moderates (brace-expansion in router; 3 moderate in hub).
- **Proposed:** `.github/workflows/security.yml` runs `npm audit --audit-level=high` per package on PR + weekly schedule and **blocks merge on any HIGH**. Moderates are tracked, not blocking.
- **Action:** SC-1 weekly audit; SC-2 pin/upgrade brace-expansion + hub moderates in a maintenance PR.

## 3. Hub token leakage

**Threat.** `~/.mooter/auth.json` (bearer token for the hub) read by another local user or a malicious process; or token logged.

- **Current:** written 0600; HMAC-signed telemetry (secret in `~/.mooter/.telemetry_secret`, 0600); the client never holds the Supabase service-role key (definer RPCs only).
- **Proposed:** `probeSecretPerms` (Phase I runtime check) warns if any secret file is group/other-readable (mode & 0o077). Redaction lint on log lines.
- **Action:** HT-1 ship perms probe (done); HT-2 add token rotation cmd.

## 4. LoRA adapter poisoning

**Threat.** A user installs a third-party LoRA adapter crafted to bias routing toward an attacker-chosen model or to degrade safety.

- **Current:** `mooter forge install` validates + signs a manifest (natural-order signing, secret-keyed); runtime adapter stub returns null until a real adapter is trained/activated; doctrine guardrail still caps tier regardless of adapter.
- **Proposed:** adapter provenance check (manifest signature) at activation; refuse unsigned adapters by default.
- **Action:** LP-1 enforce signature on `adapter activate`.

## 5. Federated aggregation poisoning

**Threat.** Malicious clients submit skewed telemetry to bias the global Pastor/bandit aggregates.

- **Current:** aggregates enforce **DP + k-anonymity ≥ 50** (no aggregate emitted below 50 contributors); per-device rate caps; features-only telemetry (no raw prompts).
- **Proposed:** robust aggregation (trimmed mean / median) on federated endpoints; anomaly detector (Phase J) flags sudden distribution shifts.
- **Action:** FP-1 trimmed-mean aggregation; FP-2 wire Phase J anomaly detector to federated ingest.

## 6. Workflow sandbox escape

**Threat.** A workflow orchestration script (LLM-authored) breaks out of the sandbox to touch the filesystem/network.

- **Current:** Wave 28 runs worker scripts in an **isolated-vm** sandbox with no fs/net globals; the engine is externalised (not esbuild-bundled) so the sandbox boundary is intact.
- **Proposed:** keep isolated-vm pinned + audited (it is the security boundary); add a probe asserting the engine entrypoint integrity. Cost-cap (Phase J) bounds blast radius of a runaway script.
- **Action:** SB-1 pin isolated-vm + add to security.yml allowlist; SB-2 fuzz a few escape attempts.

## 7. Wrangler deploy persistence

**Threat.** A leaked Cloudflare API token lets an attacker deploy a malicious hub Worker that persists and intercepts client traffic.

- **Current:** deploy creds live only in the GitHub `deploy-hub` workflow secret, never in the repo; production deploys are manual (Paulo). D1 migrations are append-only and reviewed.
- **Proposed:** scope the Cloudflare token to the single Worker + D1; alert on out-of-band deploys.
- **Action:** WP-1 minimise token scope; WP-2 deploy notification.

---

## Residual risk

No HIGH-severity dependency vulnerabilities at baseline. The two High-rated *vectors* (hub token, sandbox escape) are mitigated by file perms + isolated-vm respectively; both now have runtime probes / CI gates. Re-review each wave that touches `hub/`, `packages/workflow/`, or the LoRA/federated paths.

---

## Wave 33.5 — `mooter spawn` (agent spawning) threat model

**Scope addition:** local agent processes spawned by `mooter spawn`, each in an
isolated git worktree inside a 4-layer bubblewrap/Seatbelt sandbox.

| # | Vector | Severity | Mitigation | Status |
|---|--------|----------|------------|--------|
| 8 | Agent reads developer secrets (`~/.ssh`, keys) | High | L2 tmpfs mask over secret dirs (read empty); L3 clearenv+whitelist | 🟢 proven by `spawn-test` |
| 9 | Agent writes outside its worktree (backdoor) | High | L2 `--ro-bind / /`; worktree is the only writable mount | 🟢 proven by `spawn-test` |
| 10 | `ANTHROPIC_API_KEY` leaks into a local (Ollama) spawn | High | L3 whitelist excludes provider keys for local mode | 🟢 proven (`KEY=EMPTY`) |
| 11 | Sandbox escape (CVE-2025-59528 class) | Critical | bubblewrap namespaces; `mooter security spawn-test` synthetic check | 🟢 gated |
| 12 | Config tamper (settings.json hook injection) | High | L4 config read-only under sandbox root | 🟢 by design |
| 13 | Per-domain egress not filtered (local/cloud) | Medium | only policy `none` isolates net; allowlist captured, proxy = later wave | 🟡 documented limitation |
| 14 | Fork bomb / runaway spawns | High | max-concurrent cap (default 4); `mooter spawn kill --graceful` | 🟡 partial |

**Verification:** `mooter security audit` (host readiness per layer) +
`mooter security spawn-test` (real bwrap escape attempt). See
[SANDBOX_LAYERS.md](./SANDBOX_LAYERS.md) and [CVE_RESPONSE.md](./CVE_RESPONSE.md).

**Re-review trigger:** any wave touching `packages/spawn-orchestrator/` or the
sandbox argv builder.
