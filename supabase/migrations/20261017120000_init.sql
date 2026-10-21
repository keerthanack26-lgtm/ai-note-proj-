-- VoiceNote AI schema, row level security, and private audio storage.
-- Run this in a new Supabase project from the SQL editor or with the Supabase CLI.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  role text not null default 'user' check (role in ('user', 'admin')),
  account_status text not null default 'active' check (account_status in ('active', 'deactivated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  preferred_language text not null default 'en',
  summary_style text not null default 'balanced' check (summary_style in ('concise', 'balanced', 'detailed')),
  auto_create_tasks boolean not null default false,
  retain_audio boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audio_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 26214400),
  duration_seconds numeric check (duration_seconds is null or duration_seconds >= 0),
  source text not null default 'upload' check (source in ('recording', 'upload')),
  removed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  audio_file_id uuid not null references public.audio_files (id) on delete cascade,
  note_id uuid,
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  current_stage text not null default 'preparing' check (current_stage in (
    'uploading', 'preparing', 'transcribing', 'generating_notes', 'extracting_actions', 'saving', 'completed', 'failed'
  )),
  error_code text,
  error_message text,
  retry_count integer not null default 0 check (retry_count >= 0),
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  audio_file_id uuid references public.audio_files (id) on delete set null,
  title text not null default 'Untitled note',
  transcript text not null default '',
  short_summary text not null default '',
  detailed_summary text not null default '',
  key_points jsonb not null default '[]'::jsonb,
  decisions jsonb not null default '[]'::jsonb,
  action_items jsonb not null default '[]'::jsonb,
  deadlines jsonb not null default '[]'::jsonb,
  segments jsonb not null default '[]'::jsonb,
  language text,
  category text not null default 'general' check (category in ('general', 'meeting', 'lecture', 'interview', 'idea', 'personal')),
  processing_status text not null default 'draft' check (processing_status in ('draft', 'processing', 'completed', 'failed')),
  speaker_labels_supported boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.processing_jobs
  add constraint processing_jobs_note_id_fkey
  foreign key (note_id) references public.notes (id) on delete set null;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  note_id uuid references public.notes (id) on delete set null,
  title text not null,
  description text not null default '',
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed')),
  due_date date,
  confidence text check (confidence is null or confidence in ('high', 'low', 'unknown')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.note_chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  note_id uuid not null references public.notes (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  grounded boolean,
  missing_information boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.reported_issues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,
  subject text not null check (char_length(subject) between 5 and 120),
  description text not null check (char_length(description) between 10 and 4000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.application_settings (
  key text primary key,
  value jsonb not null,
  description text not null default '',
  updated_at timestamptz not null default now()
);

create table public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  job_id uuid references public.processing_jobs (id) on delete set null,
  operation text not null check (operation in ('transcribe', 'generate_notes', 'chat')),
  provider text not null,
  model text,
  status text not null check (status in ('success', 'failed')),
  input_tokens integer,
  output_tokens integer,
  audio_seconds numeric,
  error_code text,
  created_at timestamptz not null default now()
);

create index audio_files_user_created_idx on public.audio_files (user_id, created_at desc);
create index processing_jobs_user_status_idx on public.processing_jobs (user_id, status, created_at desc);
create index processing_jobs_status_idx on public.processing_jobs (status, created_at desc);
create index notes_user_created_idx on public.notes (user_id, created_at desc);
create index notes_user_title_idx on public.notes (user_id, title);
create index notes_title_trgm_idx on public.notes using gin (title gin_trgm_ops);
create index tasks_user_status_idx on public.tasks (user_id, status, due_date);
create index chat_note_created_idx on public.note_chat_messages (note_id, created_at);
create index issues_status_idx on public.reported_issues (status, created_at desc);
create index usage_user_created_idx on public.ai_usage_events (user_id, created_at desc);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and account_status = 'active'
  );
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and account_status = 'active'
  );
$$;

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and coalesce(auth.role(), '') <> 'service_role' and auth.uid() is not null then
    if new.role is distinct from old.role then
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
begin
  insert into public.profiles (id, full_name, email, role, account_status)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 'New user'),
    coalesce(new.email, ''),
    'user',
    'active'
  );
  insert into public.user_preferences (user_id) values (new.id);
  return new;
end;
$$;

create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set email = coalesce(new.email, ''), updated_at = now()
  where id = new.id;
  return new;
end;
$$;

create trigger profiles_protect_privileges
before update on public.profiles
for each row execute function public.protect_profile_privileges();

create trigger preferences_set_updated_at
before update on public.user_preferences
for each row execute function public.set_updated_at();

create trigger jobs_set_updated_at
before update on public.processing_jobs
for each row execute function public.set_updated_at();

create trigger notes_set_updated_at
before update on public.notes
for each row execute function public.set_updated_at();

create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

create trigger issues_set_updated_at
before update on public.reported_issues
for each row execute function public.set_updated_at();

create trigger settings_set_updated_at
before update on public.application_settings
for each row execute function public.set_updated_at();

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create trigger on_auth_user_email_updated
after update of email on auth.users
for each row
when (old.email is distinct from new.email)
execute function public.sync_profile_email();

alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.audio_files enable row level security;
alter table public.processing_jobs enable row level security;
alter table public.notes enable row level security;
alter table public.tasks enable row level security;
alter table public.note_chat_messages enable row level security;
alter table public.reported_issues enable row level security;
alter table public.application_settings enable row level security;
alter table public.ai_usage_events enable row level security;

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.user_preferences to authenticated;
grant select, insert, update on public.audio_files to authenticated;
grant select, insert on public.processing_jobs to authenticated;
grant select, insert, update, delete on public.notes to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, delete on public.note_chat_messages to authenticated;
grant select, insert on public.reported_issues to authenticated;
grant select on public.application_settings to authenticated;
grant select on public.ai_usage_events to authenticated;
revoke all on all tables in schema public from anon;

create policy profiles_select_own on public.profiles
for select to authenticated using (id = auth.uid() or public.is_admin());

create policy profiles_update_own on public.profiles
for update to authenticated using (id = auth.uid() and public.is_active_user())
with check (id = auth.uid());

create policy preferences_own on public.user_preferences
for all to authenticated using (user_id = auth.uid() and public.is_active_user())
with check (user_id = auth.uid() and public.is_active_user());

create policy audio_select_own on public.audio_files
for select to authenticated using (user_id = auth.uid() and public.is_active_user());

create policy audio_insert_own on public.audio_files
for insert to authenticated with check (
  user_id = auth.uid()
  and public.is_active_user()
  and storage_path like (auth.uid()::text || '/%')
);

create policy audio_update_own on public.audio_files
for update to authenticated using (user_id = auth.uid() and public.is_active_user())
with check (user_id = auth.uid() and storage_path like (auth.uid()::text || '/%'));

create policy jobs_select on public.processing_jobs
for select to authenticated using ((user_id = auth.uid() and public.is_active_user()) or public.is_admin());

create policy jobs_insert_own on public.processing_jobs
for insert to authenticated with check (
  user_id = auth.uid()
  and public.is_active_user()
  and status = 'queued'
  and current_stage = 'preparing'
  and retry_count = 0
  and audio_file_id in (select id from public.audio_files where user_id = auth.uid())
);

create policy notes_own on public.notes
for all to authenticated using (user_id = auth.uid() and public.is_active_user())
with check (user_id = auth.uid() and public.is_active_user());

create policy tasks_own on public.tasks
for all to authenticated using (user_id = auth.uid() and public.is_active_user())
with check (user_id = auth.uid() and public.is_active_user());

create policy chat_select_own on public.note_chat_messages
for select to authenticated using (user_id = auth.uid() and public.is_active_user());

create policy chat_delete_own on public.note_chat_messages
for delete to authenticated using (user_id = auth.uid() and public.is_active_user());

create policy issues_select on public.reported_issues
for select to authenticated using ((user_id = auth.uid() and public.is_active_user()) or public.is_admin());

create policy issues_insert_own on public.reported_issues
for insert to authenticated with check (
  user_id = auth.uid() and public.is_active_user() and status = 'open'
);

create policy settings_read on public.application_settings
for select to authenticated using (public.is_active_user() or public.is_admin());

create policy usage_select on public.ai_usage_events
for select to authenticated using ((user_id = auth.uid() and public.is_active_user()) or public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'voice-recordings',
  'voice-recordings',
  false,
  26214400,
  array['audio/webm', 'audio/wav', 'audio/wave', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/ogg']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy voice_recordings_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'voice-recordings'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.is_active_user()
);

create policy voice_recordings_select on storage.objects
for select to authenticated using (
  bucket_id = 'voice-recordings'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.is_active_user()
);

create policy voice_recordings_delete on storage.objects
for delete to authenticated using (
  bucket_id = 'voice-recordings'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.is_active_user()
);

create or replace function public.enforce_ownership_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data jsonb := to_jsonb(new);
  audio_id uuid := nullif(row_data ->> 'audio_file_id', '')::uuid;
  linked_note_id uuid := nullif(row_data ->> 'note_id', '')::uuid;
begin
  -- Read optional columns from jsonb. Direct NEW.note_id fails on notes,
  -- because that table has no note_id column and this trigger is shared.
  if tg_table_name = 'notes' and audio_id is not null then
    if not exists (
      select 1 from public.audio_files
      where id = audio_id and user_id = new.user_id
    ) then
      raise exception 'audio_owner_mismatch';
    end if;
  end if;

  if tg_table_name = 'processing_jobs' then
    if audio_id is null or not exists (
      select 1 from public.audio_files
      where id = audio_id and user_id = new.user_id
    ) then
      raise exception 'audio_owner_mismatch';
    end if;
    if linked_note_id is not null and not exists (
      select 1 from public.notes where id = linked_note_id and user_id = new.user_id
    ) then
      raise exception 'note_owner_mismatch';
    end if;
  end if;

  if tg_table_name in ('tasks', 'note_chat_messages') and linked_note_id is not null then
    if not exists (
      select 1 from public.notes where id = linked_note_id and user_id = new.user_id
    ) then
      raise exception 'note_owner_mismatch';
    end if;
  end if;

  return new;
end;
$$;

create trigger notes_enforce_owner before insert or update on public.notes
for each row execute function public.enforce_ownership_links();
create trigger jobs_enforce_owner before insert or update on public.processing_jobs
for each row execute function public.enforce_ownership_links();
create trigger tasks_enforce_owner before insert or update on public.tasks
for each row execute function public.enforce_ownership_links();
create trigger chat_enforce_owner before insert or update on public.note_chat_messages
for each row execute function public.enforce_ownership_links();

create or replace function public.claim_processing_job(target_id uuid, owner_id uuid)
returns public.processing_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.processing_jobs;
begin
  update public.processing_jobs
  set status = 'processing', locked_at = now()
  where id = target_id
    and user_id = owner_id
    and status <> 'completed'
    and (
      status in ('queued')
      or locked_at is null
      or locked_at < now() - interval '3 minutes'
    )
    and status <> 'failed'
  returning * into claimed;
  return claimed;
end;
$$;

revoke all on function public.claim_processing_job(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_processing_job(uuid, uuid) to service_role;

insert into public.application_settings (key, value, description) values
  ('max_upload_bytes', '26214400'::jsonb, 'Maximum audio upload size in bytes. Do not set this above 25 MB for the default speech provider.'),
  ('allowed_mime_types', '["audio/webm","audio/wav","audio/wave","audio/mpeg","audio/mp3","audio/mp4","audio/m4a","audio/x-m4a","audio/ogg"]'::jsonb, 'MIME types accepted for upload.'),
  ('ai_hourly_limit', '30'::jsonb, 'Maximum AI operations per user each hour.'),
  ('chat_max_input_chars', '2000'::jsonb, 'Maximum characters in one note question.'),
  ('chat_history_enabled', 'true'::jsonb, 'Store note chat messages for the note owner.'),
  ('max_recording_seconds', '3600'::jsonb, 'Browser recording stops at this many seconds.')
on conflict (key) do nothing;
