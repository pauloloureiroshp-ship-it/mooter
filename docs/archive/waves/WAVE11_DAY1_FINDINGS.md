# Wave 11 — Day 1 Findings (recon + Docker install test)

> CC, 2026-06-02. Dimensions 1–4 recon + the critical fresh-Docker install test.
> Scope: Balanced. Prod baseline `v1.5.1-signin-fix`. No code changed Day 1.
> **Paulo Gate A** at the bottom (D4-4 + D4-5 + 2 newly-surfaced criticals).

## TL;DR (most critical first)

1. 🔴 **The public "Install mooter →" path is a dead stub.** Hero CTA → `/install` → shows `bash <(curl …mooter.ai/install.sh)`, but that script is a **friends-beta stub** that prints "request access / clone manually" and `exit 0` when curl-piped. A friend who clicks Install does NOT get an install. Only `/i/<token>` (post sign-in + wizard) actually installs.
2. 🔴 **`mooter feedback` requires `mooter login` first** ("✗ Run `mooter login` first."). The outreach kit promises "anonymous feedback" — contradiction. The validation feedback loop breaks unless every tester logs in.
3. 🟢 **The real install path WORKS end-to-end in fresh Docker** (`/i/<token>` = git clone public repo → npm → install.sh): exit 0, v1 CLI bundle built, **6 subagents copied**, idempotent, uninstall present, honest no-Ollama/no-key messaging.
4. 🟠 Install reports **`v0.11.0 (friends-beta)`** everywhere (banner, `--version`, `doctor`) — stale vs prod `v1.5.1` and vs the CLI's own `1.0.0`. Looks unfinished to a friend.

Net: the **mechanics** of install are solid; the **public on-ramp** (CTA → stub) and the **feedback gate** (login required) are the two things that block a real warm intro.

---

## Severity summary

| Severity | Count | IDs |
|---|---|---|
| 🔴 Critical | 4 | PUB-STUB, FB-LOGIN, D2-config (OAuth, needs Paulo test), — |
| 🟠 Important | 5 | D1-1 copy, D4-VERSION, D2-4, D2-5, D5-7 (verify) |
| 🟡 Polish / no-op | 7 | D1-2, D1-3, D1-4, D1-5✓, D4-4✓, D4-5✓, D4-7✓/D4-8✓ |

---

## Dimension 1 — Landing message

- **D1-1 🟠 (honesty):** `landing/app/page.tsx:37` — sub-tagline reads **"…routes every prompt to the optimal model. Same results. Up to 90% less cost."** Two problems: (a) "Same results" is a §3 banned phrase; (b) the 90% claim has **no citation/disclaimer within a scroll** — `/methodology` is only in nav/footer. Proposed fix (Gate A approval — Paulo flagged copy as no-touch-without-sign-off): "…routes every prompt to the optimal model. **Comparable quality on routine tasks, up to 90% less cost on T0-heavy sessions**" + a `*` link to `/methodology` next to it.
- **D1-2 🟡 no-op:** `GotMoo?` H1 (`page.tsx:24-27`). Documented per instruction; NOT changing without Paulo. Trade-off: playful/memorable vs. Anthropic-reviewer expectation of restraint. Default = keep.
- **D1-3 🟡 defer:** LCP/CLS not reliably measurable from the bash sandbox (no Chrome). Defer to Cowork Chrome MCP / Lighthouse.
- **D1-4 🟡 defer:** cross-browser — headless only here; documented limit.
- **D1-5 ✅ holds:** Wave 10 B.2c mobile clamp present (`page.tsx:70`, `@media ≤480px → clamp(38px,12vw,56px) + flex-wrap`). No fix.

## Dimension 2 — OAuth login

- Wiring verified: `signInWithGitHub()` (supabase.ts:385) → Supabase authorize `?provider=github`; `/auth/callback/route.ts` exchanges code → sets `sb-access-token`/`sb-refresh-token` cookies (**httpOnly + secure + sameSite=lax** ✓ D2-7) → bridge HTML → redirect. Live: `/auth/callback` 200, `/auth/token` 405-on-GET (POST-only, correct), `/api/me` 401 anon ✓.
- **D2-1/2-2/2-3 🔴 (config — UNVERIFIABLE from repo):** Supabase GitHub provider creds + redirect-URL whitelist (`https://mooter.ai/auth/callback` + `preview.`) live in the Supabase/GitHub dashboards. **Requires Paulo's incognito throwaway-GitHub test** before D2 can be declared done (per kickoff §Dimension 2). CC cannot confirm.
- **D2-4 🟠:** OAuth failure → `/?auth=error`, but `page.tsx` does **not read `auth=error`** → silent failure, no user-facing message. Fix: small error banner when `?auth=error`.
- **D2-5 🟠:** callback **always** redirects to `/onboarding` (new AND returning users). Returning users re-enter the wizard. Fix: route returning (onboarding_completed) users → `/dashboard`.

## Dimension 3 — Onboarding wizard

- Wired: `_lib/hardware.ts` + `_lib/persona.ts`; wizard posts to `/api/install-token` → `create_install_token` RPC (SECURITY DEFINER, migration 006) → `/i/<token>`. Persona "Other"-preserve (B.2b F-3) + provider persistence (B.2b Gemini tile) already verified in prod. `/onboarding` 307→/dashboard for anon (middleware gate, by design).
- **D3-1/3-7 (runtime nav, back-button state, mid-flow auth flip): require Paulo's incognito wizard test** (post-D2). Not testable headless.
- **D3-5 ✅:** token-mint path present + RPC wired. **D3-6:** install URL preview includes inspect-first text — verify exact proximity at fix time.

## Dimension 4 — Install (fresh node:20 Docker) — THE BIG TEST

Method: `docker run node:20` → `git clone` public repo (== what `/i/<token>` does) → stub `claude` binary + `~/.claude` → `bash install.sh`. Two runs.

| # | Result |
|---|---|
| D4-1 recon | install.sh (308 lines) = prereqs → copy runtime → **esbuild v1 bundle** → shim+env+PATH → **copy `agents/*.md`** → hooks merge → Ollama optional. `/i/<token>` script (`install-script.ts`) git-clones the **public** repo then runs it. |
| D4-2 install completes | ✅ **exit 0** (both runs) |
| D4-3 commands work | ✅ `mooter --version`, `mooter init` (Step 1/5 scan), `mooter doctor` (10 checks), `mooter uninstall` all dispatch. ⚠ `mooter feedback` → **"Run `mooter login` first"** (see FB-LOGIN). |
| D4-4 subagents | ✅ **All 6 copied to `~/.claude/agents/`** (install.sh:171). **Decision effectively = Option A already shipped** (bundled via repo clone). |
| D4-5 Ollama auto-pull | ✅ **Already implemented** (install.sh:277-281: unconditional `ollama pull qwen2.5:3b` if Ollama present). No Y/n prompt today. |
| D4-6 error states | ✅ honest: no-Ollama → "T0 disabled + how to enable"; no-API-key → "subagent fallback"; no Claude Code → "open Claude Code once". |
| D4-7 idempotency | ✅ ran twice, exit 0 both. |
| D4-8 uninstall | ✅ `mooter uninstall` present. |
| D4-9 settings merge | install.sh comments claim non-destructive merge; not deep-verified (no pre-existing settings.json in test). Verify at fix time. |
| **PUB-STUB** 🔴 | the **public `curl …/install.sh \| bash`** (the hero Install CTA path) hits the **friends-beta stub** (BASH_SOURCE not a file → no `classify.js` → prints "private friends-beta, clone manually" + exit 0). Does NOT install. |
| **D4-VERSION** 🟠 | `tools/router/version.json` = `0.11.0` / channel `friends-beta` / 2026-05-05. Reported in banner, `--version`, `doctor`. Stale vs prod `v1.5.1` and vs `packages/cli` `1.0.0`. |

## Dimension 5 — preview (full audit is Day-?, but surfaced now)

- **FB-LOGIN 🔴:** `mooter feedback` requires `mooter login` first. Kit §4 says "anonymous, no PII". Either (a) allow anonymous feedback (device-hash only), or (b) update the kit + make `mooter login` an explicit onboarding step. Validation Week 1 depends on this.
- D5-7 (telemetry opt-out `MOOTER_TELEMETRY=off`): not yet audited — Day 5.

---

## Paulo Gate A — decisions needed before Day 2 fixes

**Pre-resolved (just confirm):**
- **D4-4 subagents** — already bundled (Option A), verified in Docker. Keep as-is? (recommend yes)
- **D4-5 Ollama auto-pull** — already auto-pulls `qwen2.5:3b` unconditionally if Ollama present. Keep unconditional, or add a `Y/n` opt-in prompt (kickoff's Option A)? (recommend: add a one-line opt-in prompt with default-yes, so it's not a surprise download)

**Newly surfaced — need your call (these reshape Day 2 priority):**
- **PUB-STUB** — make the public `install.sh` one-liner actually work by self-cloning the now-public repo (mirror `install-script.ts`), OR repoint the `/install` page CTA to "sign in → onboarding → personalized install"? The repo is public since 2026-05-27, so self-clone is viable.
- **FB-LOGIN** — anonymous feedback vs login-gated + kit update?
- **D1-1 copy** — approve the proposed honest rewrite of "Same results / 90%" (you flagged copy as no-touch-without-sign-off)?

Day 2 fix priority is gated on these answers.

---

## Gate A — DECIDED (Paulo, 2026-06-02)

1. **PUB-STUB → install.sh self-clones the public repo** when curl-piped (mirror `install-script.ts`), so the public one-liner actually installs.
2. **FB-LOGIN → anonymous feedback** (device/user_id_hash HMAC, no login required) — verify `/api/feedback` accepts anon; ungate the CLI.
3. **D4-5 → add a `Y/n` (default-yes, timeout→skip) prompt** before `ollama pull qwen2.5:3b`.
4. **D1-1 → approved rewrite**: "Comparable quality on routine tasks, up to 90% less cost on T0-heavy sessions" + `*`/methodology link near the claim. Remove "Same results".
- D4-4 (subagents) confirmed keep-as-is (already bundled). D4-VERSION bump folded into the install PR.

### Day 2 PR plan (each squash→dev, tests + final-reviewer, Gate B before promote)
- **PR-A** (landing): D1-1 hero copy rewrite + /methodology link · D2-4 `?auth=error` banner · D2-5 returning-user → /dashboard.
- **PR-B** (install.sh): PUB-STUB self-clone public repo · D4-5 Ollama Y/n prompt · D4-VERSION version.json bump to current channel/version.
- **PR-C** (CLI + landing api): FB-LOGIN anonymous `mooter feedback` (verify/allow anon at `/api/feedback`).
- Re-run the Docker install test against the updated install.sh before Gate B.
- Still pending (not Day-2-blocking): D2-config + wizard runtime → Paulo incognito test (Day 4); D5-7 telemetry opt-out audit.
