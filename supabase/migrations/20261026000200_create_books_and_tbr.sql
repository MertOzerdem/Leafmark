create table public.books (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default (auth.jwt() ->> 'sub'),
  google_volume_id text,
  title text not null check (length(btrim(title)) > 0),
  authors text[] not null default '{}',
  cover_url text,
  categories text[] not null default '{}',
  page_count integer check (page_count is null or page_count > 0),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, google_volume_id)
);

create table public.tbr_entries (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default (auth.jwt() ->> 'sub'),
  book_id uuid not null,
  position integer not null check (position >= 0),
  added_at timestamptz not null default now(),
  unique (user_id, book_id),
  foreign key (book_id, user_id)
    references public.books (id, user_id)
    on delete cascade
);

create index books_by_reader on public.books (user_id, created_at desc);
create index tbr_entries_by_order on public.tbr_entries (user_id, position, added_at);

alter table public.books enable row level security;
alter table public.tbr_entries enable row level security;

revoke all on public.books from anon;
revoke all on public.tbr_entries from anon;
grant select, insert, update, delete on public.books to authenticated;
grant select, insert, update, delete on public.tbr_entries to authenticated;

create policy "Readers can view their own books"
  on public.books
  for select
  to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);

create policy "Readers can create their own books"
  on public.books
  for insert
  to authenticated
  with check ((select auth.jwt() ->> 'sub') = user_id);

create policy "Readers can update their own books"
  on public.books
  for update
  to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id)
  with check ((select auth.jwt() ->> 'sub') = user_id);

create policy "Readers can delete their own books"
  on public.books
  for delete
  to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);

create policy "Readers can view their own TBR entries"
  on public.tbr_entries
  for select
  to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);

create policy "Readers can create their own TBR entries"
  on public.tbr_entries
  for insert
  to authenticated
  with check (
    (select auth.jwt() ->> 'sub') = user_id
    and exists (
      select 1
      from public.books
      where books.id = tbr_entries.book_id
        and books.user_id = (select auth.jwt() ->> 'sub')
    )
  );

create policy "Readers can update their own TBR entries"
  on public.tbr_entries
  for update
  to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id)
  with check (
    (select auth.jwt() ->> 'sub') = user_id
    and exists (
      select 1
      from public.books
      where books.id = tbr_entries.book_id
        and books.user_id = (select auth.jwt() ->> 'sub')
    )
  );

create policy "Readers can remove their own TBR entries"
  on public.tbr_entries
  for delete
  to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);

create function public.add_book_to_tbr(
  p_google_volume_id text,
  p_title text,
  p_authors text[],
  p_cover_url text,
  p_categories text[],
  p_page_count integer,
  p_description text
)
returns setof public.books
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  owner_subject text := auth.jwt() ->> 'sub';
  saved_book public.books;
begin
  if owner_subject is null then
    raise exception 'A signed-in reader is required.' using errcode = '42501';
  end if;

  insert into public.books (
    google_volume_id,
    title,
    authors,
    cover_url,
    categories,
    page_count,
    description
  )
  values (
    p_google_volume_id,
    p_title,
    coalesce(p_authors, '{}'::text[]),
    p_cover_url,
    coalesce(p_categories, '{}'::text[]),
    p_page_count,
    p_description
  )
  on conflict (user_id, google_volume_id) do nothing
  returning * into saved_book;

  if not found and p_google_volume_id is not null then
    select * into saved_book
    from public.books
    where user_id = owner_subject
      and google_volume_id = p_google_volume_id;
  end if;

  insert into public.tbr_entries (book_id, position)
  values (
    saved_book.id,
    coalesce((
      select max(position)
      from public.tbr_entries
      where user_id = owner_subject
    ), -1) + 1
  )
  on conflict (user_id, book_id) do nothing;

  return next saved_book;
end;
$function$;

create function public.reorder_tbr(p_book_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  owner_subject text := auth.jwt() ->> 'sub';
  current_count integer;
  request_count integer;
  unique_count integer;
begin
  if owner_subject is null then
    raise exception 'A signed-in reader is required.' using errcode = '42501';
  end if;

  select count(*) into current_count
  from public.tbr_entries
  where user_id = owner_subject;

  select count(*), count(distinct requested.book_id)
  into request_count, unique_count
  from unnest(coalesce(p_book_ids, array[]::uuid[])) as requested(book_id);

  if request_count <> current_count or unique_count <> current_count then
    raise exception 'The submitted order must contain every TBR book exactly once.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_book_ids, array[]::uuid[])) as requested(book_id)
    left join public.tbr_entries entry
      on entry.user_id = owner_subject
      and entry.book_id = requested.book_id
    where entry.id is null
  ) then
    raise exception 'The submitted order contains a book outside this reader''s TBR.' using errcode = '22023';
  end if;

  update public.tbr_entries entry
  set position = requested.ordinality::integer - 1
  from unnest(coalesce(p_book_ids, array[]::uuid[])) with ordinality as requested(book_id, ordinality)
  where entry.user_id = owner_subject
    and entry.book_id = requested.book_id;
end;
$function$;

revoke all on function public.add_book_to_tbr(text, text, text[], text, text[], integer, text) from public, anon;
grant execute on function public.add_book_to_tbr(text, text, text[], text, text[], integer, text) to authenticated;
revoke all on function public.reorder_tbr(uuid[]) from public, anon;
grant execute on function public.reorder_tbr(uuid[]) to authenticated;
