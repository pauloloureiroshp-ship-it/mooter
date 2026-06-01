# Wave 4 Phase B — Supabase / Auth setup (manual, Paulo)

> **Reality check (2026-05-31):** the landing app **already ships a working
> Supabase auth system** — it does NOT use `@supabase/ssr` (it uses a custom
> `landing/app/lib/supabase` client), and the CLI login flow already exists as
> `GET /api/cli-token`. The original Wave 4 Phase B kickoff assumed a greenfield
> landing; this wave was therefore **adapted** to the existing system. The only
> new code is the **`mooter login` / `mooter logout` CLI** wired to that existing
> endpoint. No new Supabase tables, no new auth pages, no middleware changes.

## What already exists (do NOT rebuild)

- **Supabase project + config** — `landing/supabase/config.toml`, custom client at
  `landing/app/lib/supabase` (`getUser`).
- **Sign-in UI** — `LoginHero` rendered by `/dashboard` (`app/(app)/dashboard`) when
  `/api/me` has no email.
- **Session** — `sb-access-token` / `sb-refresh-token` httpOnly cookies, set by
  `app/auth/token/route.ts`; OAuth callback at `app/auth/callback/route.ts`.
- **Middleware** — `landing/middleware.ts` gates `/onboarding`, `/admin`,
  `/settings`.
- **CLI auth endpoint** — `GET /api/cli-token`: validates the browser session
  cookie and **redirects `token` + one-way `user_hash` to `http://127.0.0.1:7822/callback`**.

## What this wave added

- **`mooter login`** — starts a loopback server on `127.0.0.1:7822`, opens the
  browser at `{landing}/api/cli-token`, receives the redirect, and saves
  `~/.mooter/auth.json` (mode 0600) with `access_token` + `user_id_hash` (never
  the email or raw user id — matches the endpoint's privacy model).
- **`mooter logout`** — deletes `~/.mooter/auth.json`.
- **`mooter login --status`** — shows whether the terminal is connected.

## Setup you (Paulo) still need to confirm

The auth system is already live, so there is **no new Supabase setup** for this
wave. Just verify the existing pieces are configured:

1. **`landing/.env.local`** has the Supabase vars the existing client reads
   (check `landing/app/lib/supabase` for the exact names — typically
   `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
2. **Redirect URLs** in Supabase already include the site origins used by
   `app/auth/callback`. No change needed for the CLI flow (it uses the cookie
   session + a loopback redirect, not an OAuth redirect URL).
3. **`/api/cli-token` redirect host/port** is `http://127.0.0.1:7822/callback` —
   the `mooter login` server listens there. If you ever change the port, update
   both `CLI_CALLBACK_PORT` in `packages/cli/src/commands/login.ts` and the
   landing endpoint together.

## Local test (no Supabase changes required)

```bash
# 1. run the landing locally (already configured)
cd landing && npm run dev

# 2. in another terminal, sign in in the browser, then:
MOOTER_LANDING_URL=http://localhost:3000 mooter login
#   → browser opens /api/cli-token → redirects token to 127.0.0.1:7822
#   → ~/.mooter/auth.json written (0600)

mooter login --status   # → "Logged in (user … )"
mooter logout           # → token removed
```

## Out of scope (later phases)

- The device-code / PKCE / `mooter_cli_codes` table described in the original
  kickoff was **not** built — it duplicated the existing `/api/cli-token` flow.
- Using the saved token to enable **real** remote sync (instead of dry-run) ships
  in **Wave 4 Phase D** (CF Workers backend); the sync client from W3 D3 stays
  dry-run until then.
