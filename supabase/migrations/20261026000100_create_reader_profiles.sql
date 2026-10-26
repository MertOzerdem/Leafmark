create table public.reader_profiles (
  user_id text primary key default (auth.jwt() ->> 'sub'),
  username text not null,
  created_at timestamptz not null default now()
);

alter table public.reader_profiles enable row level security;

revoke all on public.reader_profiles from anon;
grant select, insert, update, delete on public.reader_profiles to authenticated;

create policy "Readers can view their own profile"
  on public.reader_profiles
  for select
  to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);

create policy "Readers can create their own profile"
  on public.reader_profiles
  for insert
  to authenticated
  with check ((select auth.jwt() ->> 'sub') = user_id);

create policy "Readers can update their own profile"
  on public.reader_profiles
  for update
  to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id)
  with check ((select auth.jwt() ->> 'sub') = user_id);

create policy "Readers can delete their own profile"
  on public.reader_profiles
  for delete
  to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);
