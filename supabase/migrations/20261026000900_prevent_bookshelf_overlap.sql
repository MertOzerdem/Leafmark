create function public.find_available_bookshelf_position(
  p_user_id text,
  p_page_count integer
)
returns table(position_x numeric, position_y numeric)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  owner_subject text := auth.jwt() ->> 'sub';
  candidate_width numeric := greatest(0.1125, least(0.225, coalesce(p_page_count, 300)::numeric * 0.000296875));
  candidate_x numeric;
  candidate_y numeric;
  next_candidate_x numeric;
  highest_y numeric;
  item_count integer;
  last_row integer;
  row_index integer;
  position_index integer;
begin
  if owner_subject is null or owner_subject is distinct from p_user_id then
    raise exception 'A signed-in reader can only arrange their own bookshelf.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('leafmark-bookshelf:' || owner_subject, 0));

  select coalesce(max(items.position_y), 32), count(*)::integer
  into highest_y, item_count
  from public.bookshelf_items items
  where items.user_id = owner_subject;

  last_row := greatest(1, ceil((highest_y + 204 - 32) / 270)::integer + 1);

  for row_index in 0..last_row loop
    candidate_y := 32 + row_index * 270;
    candidate_x := 0.04;

    for position_index in 1..item_count + 1 loop
      with occupied_items as (
        select
          items.position_x,
          items.position_y,
          case
            when items.item_type = 'decoration' then 0.24
            when items.orientation = 'horizontal' then 0.65
            when items.orientation = 'tilted' then least(0.95,
              greatest(0.1125, least(0.225, coalesce(books.page_count, 300)::numeric * 0.000296875)) + 0.09)
            else greatest(0.1125, least(0.225, coalesce(books.page_count, 300)::numeric * 0.000296875))
          end as item_width,
          case
            when items.item_type = 'decoration' then 75
            when items.orientation = 'horizontal' then 72
            else 204
          end as item_height
        from public.bookshelf_items items
        left join public.books on books.id = items.book_id and books.user_id = items.user_id
        where items.user_id = owner_subject
      )
      select max(items.position_x + items.item_width + 0.025)
      into next_candidate_x
      from occupied_items items
      where items.position_y < candidate_y + 204
        and items.position_y + items.item_height > candidate_y
        and items.position_x < candidate_x + candidate_width + 0.025
        and items.position_x + items.item_width > candidate_x;

      if next_candidate_x is null then
        return query select candidate_x, candidate_y;
        return;
      end if;

      candidate_x := next_candidate_x;
      if candidate_x + candidate_width > 0.95 then
        exit;
      end if;
    end loop;
  end loop;

  raise exception 'A free position could not be found for this bookshelf item.' using errcode = '54000';
end;
$function$;

revoke all on function public.find_available_bookshelf_position(text, integer) from public, anon;
grant execute on function public.find_available_bookshelf_position(text, integer) to authenticated;

create or replace function public.place_finished_book_on_bookshelf()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  next_x numeric;
  next_y numeric;
  page_total integer;
begin
  if new.finished_on is not null and (tg_op = 'INSERT' or old.finished_on is null) then
    if exists (
      select 1 from public.bookshelf_items
      where user_id = new.user_id and book_id = new.book_id
    ) then
      return new;
    end if;

    select page_count into page_total
    from public.books
    where id = new.book_id and user_id = new.user_id;

    select position_x, position_y into next_x, next_y
    from public.find_available_bookshelf_position(new.user_id, page_total);

    insert into public.bookshelf_items (user_id, item_type, book_id, position_x, position_y)
    values (new.user_id, 'book', new.book_id, next_x, next_y)
    on conflict (user_id, book_id) where book_id is not null do nothing;
  end if;
  return new;
end;
$function$;

create function public.add_bookshelf_decoration(p_decoration_kind text)
returns setof public.bookshelf_items
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  owner_subject text := auth.jwt() ->> 'sub';
  next_y numeric;
  saved_item public.bookshelf_items;
begin
  if owner_subject is null then
    raise exception 'A signed-in reader is required.' using errcode = '42501';
  end if;
  if p_decoration_kind not in ('plant', 'frame') then
    raise exception 'Choose a supported bookshelf decoration.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('leafmark-bookshelf:' || owner_subject, 0));

  select coalesce(max(position_y) + 270, 32) into next_y
  from public.bookshelf_items
  where user_id = owner_subject;

  insert into public.bookshelf_items (item_type, decoration_kind, position_x, position_y)
  values ('decoration', p_decoration_kind, 0.04, next_y)
  returning * into saved_item;

  return next saved_item;
end;
$function$;

revoke all on function public.add_bookshelf_decoration(text) from public, anon;
grant execute on function public.add_bookshelf_decoration(text) to authenticated;
