-- The shared ownership trigger referenced NEW.note_id while saving a note.
-- The notes table has no note_id column, so Postgres rejected the insert.

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
