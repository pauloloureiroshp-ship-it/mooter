-- Wave 6 D2 — personalized install tokens.
--
-- A short-lived (24h), single-use token that carries an ANONYMOUS install
-- pre-config (hardware class + persona + self-reported plan — never PII, never
-- secrets). The web onboarding mints one; `curl mooter.ai/install/<token>` and
-- `mooter init --from-token=<token>` redeem/peek it.
--
-- No service-role key is used anywhere: lookups go through SECURITY DEFINER
-- functions where the token itself is the bearer secret, so the anon key is
-- enough. This matches the codebase's REST-wrapper pattern (no @supabase/...).
--
-- ⚠ Apply with `supabase db push` or via the SQL editor (see WAVE6_SUPABASE_SETUP.md).

create table if not exists public.mooter_install_tokens (
  token       text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '24 hours'),
  used_at     timestamptz,
  config      jsonb not null default '{}'::jsonb,
  constraint not_expired check (expires_at > created_at)
);

create index if not exists idx_install_tokens_user on public.mooter_install_tokens(user_id);

-- RLS on; no anon/auth policies — ALL access is via the definer functions below.
alter table public.mooter_install_tokens enable row level security;

-- A URL-safe token: base64url of 24 random bytes (=> 32 chars, no padding).
create or replace function public.gen_install_token() returns text
language sql volatile as $$
  select replace(replace(rtrim(encode(gen_random_bytes(24), 'base64'), '='), '+', '-'), '/', '_');
$$;

-- Mint a token for the CURRENT authenticated user. The config is sanitized by
-- the caller (API route) to anonymous fields only.
create or replace function public.create_install_token(p_config jsonb)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_token   text;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;
  v_token := public.gen_install_token();
  insert into public.mooter_install_tokens(token, user_id, config)
  values (v_token, v_user_id, coalesce(p_config, '{}'::jsonb));
  return v_token;
end $$;

-- Read a token's config WITHOUT consuming it (CLI --from-token validation).
-- Returns null when missing / expired / already used.
create or replace function public.peek_install_token(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_row public.mooter_install_tokens%rowtype;
begin
  select * into v_row from public.mooter_install_tokens where token = p_token;
  if not found or v_row.expires_at < now() or v_row.used_at is not null then
    return null;
  end if;
  return v_row.config;
end $$;

-- Consume a token: mark used + return its config atomically. Returns null when
-- missing / expired / already used (so the caller emits the right error script).
create or replace function public.redeem_install_token(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_row public.mooter_install_tokens%rowtype;
begin
  select * into v_row from public.mooter_install_tokens where token = p_token for update;
  if not found or v_row.expires_at < now() or v_row.used_at is not null then
    return null;
  end if;
  update public.mooter_install_tokens set used_at = now() where token = p_token;
  return v_row.config;
end $$;

-- Anon may CALL the definer functions; the token value is the secret.
grant execute on function public.create_install_token(jsonb) to authenticated;
grant execute on function public.peek_install_token(text)   to anon, authenticated;
grant execute on function public.redeem_install_token(text) to anon, authenticated;
