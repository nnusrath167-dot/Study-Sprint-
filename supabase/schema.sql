-- StudySprint Supabase setup
-- Run this whole file in Supabase Dashboard → SQL Editor → New query.
-- RLS ensures users can access only rows and storage objects belonging to their own auth.uid().

create table if not exists public.study_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.study_state enable row level security;

drop policy if exists "Students read their own study state" on public.study_state;
create policy "Students read their own study state"
  on public.study_state for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Students create their own study state" on public.study_state;
create policy "Students create their own study state"
  on public.study_state for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Students update their own study state" on public.study_state;
create policy "Students update their own study state"
  on public.study_state for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.study_state to authenticated;
revoke all on public.study_state from anon;

create table if not exists public.study_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null,
  content_type text not null default 'application/octet-stream',
  byte_size bigint not null default 0 check (byte_size >= 0),
  created_at timestamptz not null default now()
);

alter table public.study_files enable row level security;

drop policy if exists "Students read their own file records" on public.study_files;
create policy "Students read their own file records"
  on public.study_files for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Students add their own file records" on public.study_files;
create policy "Students add their own file records"
  on public.study_files for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Students delete their own file records" on public.study_files;
create policy "Students delete their own file records"
  on public.study_files for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, delete on public.study_files to authenticated;
revoke all on public.study_files from anon;

-- Private bucket; users can only read, create, or delete objects in their own user-id folder.
insert into storage.buckets (id, name, public, file_size_limit)
values ('studysprint-files', 'studysprint-files', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists "Students read their own StudySprint objects" on storage.objects;
create policy "Students read their own StudySprint objects"
  on storage.objects for select to authenticated
  using (bucket_id = 'studysprint-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Students upload to their own StudySprint folder" on storage.objects;
create policy "Students upload to their own StudySprint folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'studysprint-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Students delete their own StudySprint objects" on storage.objects;
create policy "Students delete their own StudySprint objects"
  on storage.objects for delete to authenticated
  using (bucket_id = 'studysprint-files' and (storage.foldername(name))[1] = auth.uid()::text);
