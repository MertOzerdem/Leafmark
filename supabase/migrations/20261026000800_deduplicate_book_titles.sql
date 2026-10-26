create function public.normalize_book_match_text(value text)
returns text
language sql
immutable
set search_path = ''
as $function$
  select regexp_replace(lower(coalesce(value, '')), '[^[:alnum:]]+', '', 'g');
$function$;

revoke all on function public.normalize_book_match_text(text) from public, anon;
grant execute on function public.normalize_book_match_text(text) to authenticated;

create or replace function public.add_book_to_tbr(
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
  normalized_title text := public.normalize_book_match_text(p_title);
  normalized_author text := public.normalize_book_match_text(coalesce(p_authors[1], ''));
  saved_book public.books;
begin
  if owner_subject is null then
    raise exception 'A signed-in reader is required.' using errcode = '42501';
  end if;

  if p_google_volume_id is not null then
    select * into saved_book
    from public.books
    where user_id = owner_subject
      and google_volume_id = p_google_volume_id
    for update;
  end if;

  if saved_book.id is null and normalized_title <> '' then
    perform pg_advisory_xact_lock(
      hashtextextended('leafmark-book:' || owner_subject || ':' || normalized_title, 0)
    );

    select * into saved_book
    from public.books
    where user_id = owner_subject
      and public.normalize_book_match_text(title) = normalized_title
      and (
        public.normalize_book_match_text(coalesce(authors[1], '')) = normalized_author
        or public.normalize_book_match_text(coalesce(authors[1], '')) = ''
        or normalized_author = ''
      )
    order by (public.normalize_book_match_text(coalesce(authors[1], '')) = normalized_author) desc,
      created_at,
      id
    limit 1
    for update;
  end if;

  if saved_book.id is null then
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
    returning * into saved_book;
  elsif cardinality(saved_book.authors) = 0 and cardinality(coalesce(p_authors, '{}'::text[])) > 0 then
    update public.books
    set authors = coalesce(p_authors, '{}'::text[]),
        google_volume_id = case
          when p_google_volume_id is not null and not exists (
            select 1
            from public.books existing
            where existing.user_id = owner_subject
              and existing.google_volume_id = p_google_volume_id
              and existing.id <> saved_book.id
          ) then p_google_volume_id
          else google_volume_id
        end
    where id = saved_book.id
      and user_id = owner_subject
    returning * into saved_book;
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

revoke all on function public.add_book_to_tbr(text, text, text[], text, text[], integer, text) from public, anon;
grant execute on function public.add_book_to_tbr(text, text, text[], text, text[], integer, text) to authenticated;
