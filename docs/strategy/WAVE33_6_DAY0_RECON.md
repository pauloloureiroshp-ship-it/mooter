# Wave 33.6 Mega — Day 0 Honest Recon

**Date:** 2026-06-08 · **Branch:** `wave33_6-mega` (base `main @ b445826`, Wave 33.5 ship)
**Executor:** CC (Opus) ultracode + dangerous autonomous

> **TL;DR (lost-in-the-middle mitigation — read first):**
> 1. **classify.js sha INTACT** `7b01eb8623a0b8fc…` — last modification Wave 9, untouched 15+ waves. ✅
> 2. **Wave 28–33.5 packages all present + untouched** (15 packages). ✅
> 3. **🔴 CRITICAL — Phase 2 brief is misframed.** A mature **Next.js 15 + React 19 + Supabase** landing already exists at `landing/` and **serves mooter.ai in production**. The kickoff Block L1 ("create `landing-prod/` from scratch, migrate static HTML, add Tailwind v4 + shadcn") would discard the live production app. **Phase 2 must be reframed from "rebuild" → "enhance existing `landing/`". Escalated to Paulo before proceeding.**
> 4. **Phase 1 (6 polish blocks) is mostly valid** with two premise corrections (P1 = bump `version.json` not `install.sh`; P2 = error is in the *install-time* bundle, not `packages/cli`).

---

## The 10 recon points

### 1. classify.js sha INTACT ✅
- `sha256sum tools/router/classify.js` → `7b01eb8623a0b8fc…` — matches the sacred sha.
- `git log --all --diff-filter=M -- tools/router/classify.js` → last modification is **Wave 9** (`d46f8c2`, prod-parity, 2026-06-01). No modifications since. Guardrail holds.

### 2. Wave 28–33.5 packages audit ✅
`ls packages/` shows all 15: `arbitrage-monitor`, `cli`, `data-rights`, `effort`, `mcp-server`, `minimax-watcher`, `router`, `sessions-orchestrator`, `spawn-orchestrator`, `synthesis`, `transparency`, `turboquant-backend`, `validation`, `vllm-backend`, `workflow`, `worktree-conductor`. **INTOCADOS** — extend only via new sub-packages.

### 3. install.sh VERSION — **premise correction** ⚠️
- install.sh does **not** hardcode `v1.6.0`. It reads: `VERSION="$(node -e "...require('.../tools/router/version.json').version)" || echo "0.10.0")"`.
- **The stale value lives in `tools/router/version.json`** → `"version": "1.6.0"` (released 2026-06-02, channel beta).
- **P1 fix = bump `version.json` to `1.21.1`** (+ auto-bump on tag), not edit install.sh.

### 4. p-limit build error — **premise correction** ⚠️
- `cd packages/cli && npm run build` → **succeeds clean** (esbuild → `mooter.js`).
- `p-limit` **is** already declared in `packages/workflow/package.json` (`^6.2.0`), used in `packages/workflow/src/pool.ts`.
- The failing build is the **install-time v1 bundle** built by `install.sh:166` (esbuild from source). The error path is install.sh's bundle step, not `packages/cli`. P2 fix targets that bundle invocation (ensure p-limit resolves / externalize).

### 5. terminal-name-status.js MOOTER_TERMINAL_NAME ✅ (gap confirmed)
- `resolveLabel({ env, cwd, override })` exists; reads `preferences.json terminal_label` (override) + TMUX/Zellij/WezTerm.
- **Does not read `$MOOTER_TERMINAL_NAME`.** P5 valid — add env var as priority #1.

### 6. Shim doctor/uninstall routing
- Repo shim `bin/mooter` = tsx-native shim that `exec`s `packages/cli/src/index.ts` (all commands → v1). No special doctor/uninstall routing in repo shim.
- Installed: `~/.mooter/cli-v1/mooter.js` (646 KB esbuild bundle, fresh 2026-06-08). No `~/.mooter/bin/mooter` present at expected path.
- **P4 lives in install.sh's generated shim** (the dispatcher install.sh writes). Verify there whether doctor/uninstall fall through to legacy `tools/cli/mooter.js`.

### 7. conductor-status.js chip ✅ (gap confirmed)
- `find tools/ -name "*conductor*"` → empty. `conductor-status.js` **does not exist**.
- Hook `~/.claude/hooks/conductor-autolock.js` **does** exist (Wave 33.5). P3 valid — create the chip.

### 8. landing structure — **🔴 CRITICAL FINDING**
- **`landing/` = production Next.js app** (`mooter-next-landing`, Next 15.5.15, React 19, TS strict, Sentry, zod).
  - Route groups: `app/(app)/` (protected: dashboard, settings, admin) + `app/(marketing)/` (compare, install, packs, packs/[id], privacy, security, sessions, spawn, under-the-hood, methodology, changelog).
  - Auth already wired: `middleware.ts`, `app/lib/supabase.ts`, `app/auth/callback/route.ts`, `app/auth/token/route.ts`.
  - ~30 API routes incl. `api/dashboard/aggregates` (**real** — `fetchHubAggregates()` from `lib/hub`, community scope live, per-user scope = declared deferred gap), `api/cli-token`, `api/install-token`, `api/me`, `api/community/pulse`, `api/feedback`, `api/admin/*`, `api/og`.
  - Styling = **hand-rolled CSS tokens** (`--color-*` in `app/globals.css`), **NOT Tailwind**.
  - **Vercel project `landing`** (projectId `prj_2aZMQ…`, orgId `team_q3kDk3fE…`, rootDirectory `landing`, framework nextjs, node 24.x) — **this is what serves mooter.ai**.
- **`landing-v12-deploy/`** = separate Claude Design canvas (static HTML `site/*.html` + JSX prototypes), separate Vercel project `landing-v12-deploy` → `preview.mooter.ai`. Not git-tracked. Keep as-is.
- **Implication:** Block L1 as written (greenfield `landing-prod/` + static-HTML migration + Tailwind/shadcn) is **wrong**. Correct path = enhance the existing `landing/` app.

### 9. Supabase env ✅
- No `.env` at repo root, but `landing/.env.local` is set: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ADMIN_EMAILS` (all present).
- `.env.example` documents full env contract incl. `NEXT_PUBLIC_MOOTER_HUB_URL`, `NEXT_PUBLIC_SITE_URL`, Sentry keys.
- Supabase project already provisioned (per MEMORY: ref `eymtobwinevywmmlmxqa`, migrations 006/007/008 applied). **L2 = verify/enable GitHub OAuth on existing project, not greenfield auth.**

### 10. Mooter Hub endpoints
- Worker config: `hub/wrangler.mooter.toml` → name `mooter-hub`, D1 `mooter-hub` (`3659b56e-…`), R2 `mooter-hub-storage`.
- `curl …workers.dev/v1/wave-status` → empty/non-200 on the guessed `frugal-hub.workers.dev` host. **Deployed host/route needs confirming** before L3 (the brief's host string may be stale). Last migration on disk = `017_transparency_events.sql`; migration `018` would be next.

---

## Decisions taken (Paulo, this session)

- **Phase 2 → DEFERRED to its own wave.** Paulo chose "Só Phase 1 esta sessão": the brief
  assumed a greenfield landing, but a production Next.js 15 + Supabase landing already
  serves mooter.ai. Phase 2 (OAuth confirm, per-user dashboard wiring, SEO/perf, Vercel
  deploy, DNS swap, hub migration 018) will be re-briefed separately against the **existing
  `landing/` app** (enhance-in-place), not a rebuild. Nothing in Phase 2 shipped this wave.
- **P4 → compose, not reroute.** Paulo chose the recommended path: keep the shim routing
  `doctor`/`uninstall` to the install-lifecycle-complete legacy CLI, and have legacy
  `mooter doctor` append the v1 bundle's spawn/runtime health as an advisory section. No
  shim change; no regression to the 10 install-integrity checks or full uninstall.

## What shipped (Phase 1 — all 6 polish blocks)

| Block | Change | Commit |
|---|---|---|
| P2 | Bundle `p-limit` into v1 CLI (fixes fresh-install bundle build) | `39eae9c` |
| P1 | `version.json` 1.6.0→1.21.2 + `version-sync.yml` tag-driven auto-bump | `ac97ef4` |
| P5 | terminal-name chip honours `$MOOTER_TERMINAL_NAME` (priority #1) | `3c2732a` |
| P3 | `conductor-status.js` lock-count chip (TTL-stale aware, ≤10ms) | `549d161` |
| P6 | Wire conductor chip into line-3 + consolidate chip tests (8/8) | `14c9c26` |
| P4 | Compose v1 spawn/runtime health into legacy `mooter doctor` | (this) |

classify.js sha `7b01eb8623a0b8fc…` verified INTACT (mid + post). Wave 28–33.5 source
packages untouched (only `packages/cli/package.json` devDep `p-limit` added for P2).
Tag for this polish-only ship: `v1.21.2-polish`.
