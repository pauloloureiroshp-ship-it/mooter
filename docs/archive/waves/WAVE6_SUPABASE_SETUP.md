# Wave 6 Supabase Setup — install tokens (manual, post-Sprint B)

The Wave 6 D2 install-URL flow needs one migration applied to the landing
Supabase project. Everything is runtime-ready in code; this is the only manual
step. No service-role key is required — all token access goes through
`SECURITY DEFINER` RPCs where the token value is the bearer secret.

## 1. Apply the migration

`landing/migrations/006_install_tokens.sql` creates:

- `public.mooter_install_tokens` (token, user_id, created_at, expires_at 24h,
  used_at, config jsonb) — RLS **on**, no anon/auth policies (definer-only access).
- `create_install_token(p_config jsonb)` — mints a token for `auth.uid()`.
- `peek_install_token(p_token text)` — read-only config (CLI `--from-token`).
- `redeem_install_token(p_token text)` — single-use consume (curl install).

Apply via the SQL editor (paste the file) or the CLI:

```bash
supabase db push          # if using the Supabase CLI with migrations linked
# or: psql "$SUPABASE_DB_URL" -f landing/migrations/006_install_tokens.sql
```

## 2. Smoke the flow

```bash
# 1. Web onboarding (logged in) mints a token → shows
#    `curl https://mooter.ai/i/<token> | bash` on the final step.

# 2. Review the script first (always safe — plain shell, single-use):
curl https://mooter.ai/i/<token> | less

# 3. CLI pre-fill (read-only, does NOT consume the token):
mooter init --from-token=<token>
```

## 3. Guarantees

- **24h expiry + single-use** enforced inside `redeem_install_token` (atomic
  `select … for update` + `used_at` set).
- **Anonymous config only** — hardware class + persona + self-reported plan.
  Never PII, never API keys (sanitized in `app/api/install-token/route.ts`).
- **hub/ untouched** — this is Supabase-only; the deployed worker is not involved.
