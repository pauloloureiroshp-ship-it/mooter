# Mooter Sandbox — the 4 layers

Every `mooter spawn` runs inside a sandbox enforced by **bubblewrap** (Linux/WSL2)
or **Apple Seatbelt** (macOS, planned). There is **no unsandboxed mode** — if no
backend is available, Mooter refuses to spawn (`SandboxUnavailableError`).

Implementation: `packages/spawn-orchestrator/src/sandbox/`.

## Layer 1 — Network egress
- Policy `none` → `--unshare-net`: the spawn gets a fresh, empty network namespace
  (no loopback to host services, no internet). Proven by the escape test.
- Policy `local` (Ollama spawns) / `cloud` (provider spawns) currently keep the
  host network so the agent can reach `127.0.0.1:11434` or `api.anthropic.com`.
  **Known limitation:** per-domain allowlisting (`allowedDomains`) is captured in
  the config but **not yet enforced** — that needs an egress proxy (socat/HTTP
  proxy) and lands in a later wave. We document this rather than imply isolation
  we don't yet provide.

## Layer 2 — Filesystem boundary
- `--ro-bind / /` — the entire host root is **read-only**.
- `--tmpfs $HOME` — the **entire home directory** is masked wholesale (fail-closed):
  every credential store under `$HOME` reads back **empty** — `~/.ssh`, `~/.gnupg`,
  **`~/.claude/.credentials.json`** (OAuth token), **`~/.mooter/.telemetry_secret`**,
  **`~/.config/gh/hosts.yml`** (GitHub token), and any project `.env` outside the
  worktree. This is an allowlist-by-construction, not an enumerated denylist — a
  new credential file added tomorrow is masked automatically.
- `--bind <worktree> <worktree>` — applied **after** the home mask, the spawn's git
  worktree is re-exposed as the **single writable mount**. A spawn cannot write to
  the parent repo, the rest of `$HOME`, or `/`.
- `--dev /dev`, `--proc /proc`, `--tmpfs /tmp` give a minimal working environment.

## Layer 3 — Secrets scoping
- `--clearenv` drops the **entire** host environment, then only a small whitelist
  is re-injected (`TERM`, `LANG`, `NODE_ENV`, `CLAUDE_PROJECT_DIR`, …).
- `ANTHROPIC_API_KEY` is injected **only for cloud spawns** (the tier requires it)
  and **never for local (Ollama) spawns**. Proven by the escape test
  (`KEY=EMPTY` inside a local spawn).

## Layer 4 — Config protection
- `~/.claude/settings.json` and `~/.mooter/preferences.json` are read-only by
  virtue of the read-only root and the worktree being the only writable mount —
  a spawn can read them but never rewrite them.

## Verifying enforcement
```bash
mooter security audit          # host readiness, per layer
mooter security spawn-test     # REAL bwrap escape test (CVE-2025-59528 scenario)
```
The escape test seeds fake credential stores (`~/.ssh/id_rsa`,
`~/.claude/.credentials.json`, `~/.mooter/.telemetry_secret`,
`~/.config/gh/hosts.yml`) **under the real `$HOME`** — crucially NOT under `/tmp`,
which the sandbox masks wholesale and would otherwise give a false pass — then
asserts: write-inside succeeds · **all** credential stores read blocked · write
outside the worktree blocked (real read-only root) · provider key not leaked. All
four must pass on every release.
