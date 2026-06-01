-- Wave 6.5 D1 — admin access audit log.
--
-- Every admin view of user data writes a row here. Pseudonymous: the target is
-- a hash (never raw email/uuid), metadata carries no PII (filters/counts only).
-- admin_user_id is the admin's own auth id (FK), used for accountability.
--
-- ⚠ Apply with `supabase db push` or via the SQL editor (see Sprint C setup).

create table if not exists public.mooter_admin_audit (
  id                 bigserial primary key,
  admin_user_id      uuid not null references auth.users(id) on delete cascade,
  action             text not null, -- view_users_list | view_user_detail | view_stats | export_data
  target_user_id_hash text,         -- pseudonymous, only when a specific user is viewed
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

create index if not exists idx_admin_audit_user on public.mooter_admin_audit(admin_user_id, created_at desc);

-- RLS on; writes go through the admin's authenticated session (insert policy:
-- a user may insert audit rows attributed to themselves). No select for anon.
alter table public.mooter_admin_audit enable row level security;

drop policy if exists admin_audit_insert_self on public.mooter_admin_audit;
create policy admin_audit_insert_self on public.mooter_admin_audit
  for insert to authenticated
  with check (admin_user_id = auth.uid());

drop policy if exists admin_audit_select_self on public.mooter_admin_audit;
create policy admin_audit_select_self on public.mooter_admin_audit
  for select to authenticated
  using (admin_user_id = auth.uid());
