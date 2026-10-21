-- Admin panel support: audit logs, issue notes, and first-admin claim.

alter table public.reported_issues
  add column if not exists admin_notes text not null default '';

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.profiles (id) on delete cascade,
  action_type text not null,
  resource_type text not null,
  resource_id text,
  result text not null default 'success' check (result in ('success', 'failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_logs_created_idx
  on public.admin_audit_logs (created_at desc);

create index if not exists admin_audit_logs_action_idx
  on public.admin_audit_logs (action_type, created_at desc);

alter table public.admin_audit_logs enable row level security;

revoke all on public.admin_audit_logs from anon, authenticated;
grant select on public.admin_audit_logs to authenticated;

drop policy if exists admin_audit_select on public.admin_audit_logs;
create policy admin_audit_select on public.admin_audit_logs
for select to authenticated using (public.is_admin());

insert into public.application_settings (key, value, description) values
  ('processing_retry_limit', '3'::jsonb, 'Maximum user-visible retries for a failed processing job.'),
  ('audio_retention_days', '30'::jsonb, 'Suggested audio retention period in days for operational guidance.'),
  ('default_preferred_language', '"en-US"'::jsonb, 'Default preferred language for new accounts.'),
  ('default_summary_style', '"balanced"'::jsonb, 'Default note summary style for new accounts.'),
  ('usage_warning_threshold', '80'::jsonb, 'Percent of the hourly AI limit that should warn operators.'),
  ('maintenance_mode', 'false'::jsonb, 'When true, the admin panel shows a maintenance banner.')
on conflict (key) do nothing;

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and coalesce(auth.role(), '') <> 'service_role' and auth.uid() is not null then
    if new.role is distinct from old.role
      and current_setting('app.allow_role_change', true) is distinct from 'on' then
      raise exception 'role_change_forbidden';
    end if;
    if new.account_status is distinct from old.account_status then
      raise exception 'status_change_forbidden';
    end if;
    if new.id is distinct from old.id then
      raise exception 'id_change_forbidden';
    end if;
    if new.email is distinct from old.email and not exists (
      select 1 from auth.users where id = new.id and email is not distinct from new.email
    ) then
      raise exception 'email_change_forbidden';
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_role text := 'user';
begin
  perform pg_advisory_xact_lock(814201);
  if coalesce(new.raw_user_meta_data ->> 'signup_as', '') = 'admin'
    and not exists (select 1 from public.profiles where role = 'admin') then
    assigned_role := 'admin';
  end if;
  insert into public.profiles (id, full_name, email, role, account_status)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 'New user'),
    coalesce(new.email, ''),
    assigned_role,
    'active'
  );
  insert into public.user_preferences (user_id) values (new.id);
  return new;
end;
$$;

create or replace function public.claim_first_admin()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_role text;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;
  perform pg_advisory_xact_lock(814201);
  select role into current_role from public.profiles where id = auth.uid();
  if current_role = 'admin' then
    return 'admin';
  end if;
  if exists (select 1 from public.profiles where role = 'admin') then
    return coalesce(current_role, 'user');
  end if;
  perform set_config('app.allow_role_change', 'on', true);
  update public.profiles set role = 'admin' where id = auth.uid();
  return 'admin';
end;
$$;

revoke all on function public.claim_first_admin() from public, anon;
grant execute on function public.claim_first_admin() to authenticated;
