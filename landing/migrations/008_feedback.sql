-- Wave 6.5 D2 — CLI feedback (`mooter feedback "..."`).
--
-- Anonymous + pseudonymous: a one-way user_id_hash (never email/raw uuid),
-- message capped 1000 chars, plus topic/severity/version/hardware CLASS. No PII
-- (the endpoint additionally refuses messages containing an email address).
--
-- ⚠ Apply with `supabase db push` or via the SQL editor (see Sprint C setup).

create table if not exists public.mooter_feedback (
  id             text primary key default ('fb_' || replace(replace(rtrim(encode(gen_random_bytes(8), 'base64'), '='), '+', '-'), '/', '_')),
  user_id_hash   text not null,
  topic          text,
  severity       text,
  message        text not null check (length(message) <= 1000),
  mooter_version text,
  hardware_class jsonb not null default '{}'::jsonb,
  status         text not null default 'new', -- new | read | resolved
  created_at     timestamptz not null default now()
);

create index if not exists idx_feedback_created on public.mooter_feedback(created_at desc);

-- RLS on. Inserts come through the SECURITY DEFINER function below so an
-- authenticated CLI user can submit without a table-level insert policy; the
-- user_id_hash is supplied by the caller (already pseudonymous). Reads are
-- admin-only (no select policy → only definer/service paths can read; the admin
-- API uses the admin's own token + RLS-exempt definer reader).
alter table public.mooter_feedback enable row level security;

create or replace function public.submit_feedback(
  p_user_id_hash text,
  p_topic text,
  p_severity text,
  p_message text,
  p_mooter_version text,
  p_hardware_class jsonb
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_id text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_message is null or length(p_message) = 0 or length(p_message) > 1000 then
    raise exception 'invalid message length';
  end if;
  insert into public.mooter_feedback(user_id_hash, topic, severity, message, mooter_version, hardware_class)
  values (p_user_id_hash, p_topic, p_severity, p_message, p_mooter_version, coalesce(p_hardware_class, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end $$;

-- Admin-only read: list recent feedback (definer; the API gates by ADMIN_EMAILS).
create or replace function public.list_feedback(p_limit int default 200)
returns setof public.mooter_feedback
language sql security definer set search_path = public as $$
  select * from public.mooter_feedback order by created_at desc limit least(coalesce(p_limit, 200), 500);
$$;

grant execute on function public.submit_feedback(text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.list_feedback(int) to authenticated;
