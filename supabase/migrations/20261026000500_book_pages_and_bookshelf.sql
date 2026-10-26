alter table public.reading_attempts
  add column reflection text not null default '';

create table public.book_page_fields (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default (auth.jwt() ->> 'sub'),
  book_id uuid,
  label text not null check (length(trim(label)) between 1 and 80),
  field_type text not null check (field_type in ('text', 'multiline', 'list', 'image')),
  position integer not null check (position >= 0),
  is_template boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (book_id, user_id)
    references public.books (id, user_id)
    on delete cascade,
  constraint book_page_field_scope check (
    (is_template and book_id is null)
    or (not is_template and book_id is not null)
  )
);

create index book_page_fields_by_reader_page
  on public.book_page_fields (user_id, book_id, position)
  where is_active;

create function public.seed_book_page_template_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  insert into public.book_page_fields (user_id, label, field_type, position, is_template)
  values
    (new.user_id, 'Series', 'text', 0, true),
    (new.user_id, 'Couple', 'text', 1, true),
    (new.user_id, 'Favorite quotes', 'multiline', 2, true),
    (new.user_id, 'Personal thoughts', 'multiline', 3, true),
    (new.user_id, 'Illustration', 'image', 4, true);
  return new;
end;
$function$;

create trigger reader_profiles_seed_book_page_template
  after insert on public.reader_profiles
  for each row execute function public.seed_book_page_template_fields();

insert into public.book_page_fields (user_id, label, field_type, position, is_template)
select profiles.user_id, template.label, template.field_type, template.position, true
from public.reader_profiles profiles
cross join (values
  ('Series', 'text', 0),
  ('Couple', 'text', 1),
  ('Favorite quotes', 'multiline', 2),
  ('Personal thoughts', 'multiline', 3),
  ('Illustration', 'image', 4)
) as template(label, field_type, position);

create table public.book_page_field_values (
  user_id text not null default (auth.jwt() ->> 'sub'),
  book_id uuid not null,
  field_id uuid not null,
  value text not null,
  updated_at timestamptz not null default now(),
  primary key (book_id, field_id),
  unique (user_id, book_id, field_id),
  foreign key (book_id, user_id)
    references public.books (id, user_id)
    on delete cascade,
  foreign key (field_id, user_id)
    references public.book_page_fields (id, user_id)
    on delete cascade
);

create index book_page_values_by_reader
  on public.book_page_field_values (user_id, book_id);

alter table public.book_page_fields enable row level security;
alter table public.book_page_field_values enable row level security;
revoke all on public.book_page_fields from anon;
revoke all on public.book_page_field_values from anon;
grant select, insert, update, delete on public.book_page_fields to authenticated;
grant select, insert, update, delete on public.book_page_field_values to authenticated;

create policy "Readers can manage their own Book page fields"
  on public.book_page_fields
  for all
  to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id)
  with check (
    (select auth.jwt() ->> 'sub') = user_id
    and (
      book_id is null
      or exists (
        select 1 from public.books
        where books.id = book_page_fields.book_id
          and books.user_id = (select auth.jwt() ->> 'sub')
      )
    )
  );

create policy "Readers can manage their own Book page field values"
  on public.book_page_field_values
  for all
  to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id)
  with check (
    (select auth.jwt() ->> 'sub') = user_id
    and exists (
      select 1 from public.books
      where books.id = book_page_field_values.book_id
        and books.user_id = (select auth.jwt() ->> 'sub')
    )
    and exists (
      select 1 from public.book_page_fields
      where book_page_fields.id = book_page_field_values.field_id
        and book_page_fields.user_id = (select auth.jwt() ->> 'sub')
        and book_page_fields.is_active
        and (book_page_fields.is_template or book_page_fields.book_id = book_page_field_values.book_id)
    )
  );

create function public.reorder_book_page_fields(p_book_id uuid, p_field_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  owner_subject text := auth.jwt() ->> 'sub';
  current_count integer;
begin
  if owner_subject is null then
    raise exception 'A signed-in reader is required.' using errcode = '42501';
  end if;
  if p_book_id is not null and not exists (
    select 1 from public.books where id = p_book_id and user_id = owner_subject
  ) then
    raise exception 'The Book page does not belong to this reader.' using errcode = '42501';
  end if;

  select count(*)::integer into current_count
  from public.book_page_fields
  where user_id = owner_subject
    and is_active
    and book_id is not distinct from p_book_id;

  if coalesce(cardinality(p_field_ids), 0) <> current_count or (
    select count(distinct requested.id) from unnest(coalesce(p_field_ids, '{}'::uuid[])) requested(id)
  ) <> current_count or exists (
    select 1 from unnest(coalesce(p_field_ids, '{}'::uuid[])) requested(id)
    left join public.book_page_fields fields
      on fields.id = requested.id
      and fields.user_id = owner_subject
      and fields.is_active
      and fields.book_id is not distinct from p_book_id
    where fields.id is null
  ) then
    raise exception 'The Book page field order is incomplete.' using errcode = '22023';
  end if;

  update public.book_page_fields as fields
  set position = requested.ordinality - 1, updated_at = now()
  from unnest(p_field_ids) with ordinality as requested(id, ordinality)
  where fields.id = requested.id and fields.user_id = owner_subject;
end;
$function$;

revoke all on function public.reorder_book_page_fields(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_book_page_fields(uuid, uuid[]) to authenticated;

create table public.bookshelf_items (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default (auth.jwt() ->> 'sub'),
  item_type text not null check (item_type in ('book', 'decoration')),
  book_id uuid,
  decoration_kind text check (decoration_kind in ('plant', 'frame')),
  position_x numeric(6, 5) not null default 0.04 check (position_x >= 0 and position_x <= 0.95),
  position_y numeric(8, 2) not null default 32 check (position_y >= 0),
  orientation text not null default 'upright' check (orientation in ('upright', 'tilted', 'horizontal')),
  spine_color text not null default '#82876A' check (spine_color ~ '^#[0-9A-Fa-f]{6}$'),
  spine_color_customized boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (book_id, user_id)
    references public.books (id, user_id)
    on delete cascade,
  constraint bookshelf_item_scope check (
    (item_type = 'book' and book_id is not null and decoration_kind is null)
    or (item_type = 'decoration' and book_id is null and decoration_kind is not null)
  )
);

create unique index one_bookshelf_item_per_book
  on public.bookshelf_items (user_id, book_id)
  where book_id is not null;
create index bookshelf_items_by_reader
  on public.bookshelf_items (user_id, position_y, position_x);

alter table public.bookshelf_items enable row level security;
revoke all on public.bookshelf_items from anon;
grant select, insert, update, delete on public.bookshelf_items to authenticated;

create policy "Readers can manage their own bookshelf items"
  on public.bookshelf_items
  for all
  to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id)
  with check (
    (select auth.jwt() ->> 'sub') = user_id
    and (
      book_id is null
      or exists (
        select 1 from public.books
        where books.id = bookshelf_items.book_id
          and books.user_id = (select auth.jwt() ->> 'sub')
      )
    )
  );

create function public.place_finished_book_on_bookshelf()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  last_x numeric;
  last_y numeric;
  thickness numeric;
  next_x numeric;
  next_y numeric;
begin
  if new.finished_on is not null and (tg_op = 'INSERT' or old.finished_on is null) then
    select items.position_x, items.position_y,
      least(0.12, greatest(0.035, coalesce(books.page_count, 300)::numeric / 10000))
    into last_x, last_y, thickness
    from public.bookshelf_items items
    join public.books on books.id = items.book_id and books.user_id = items.user_id
    where items.user_id = new.user_id and items.item_type = 'book'
    order by items.created_at desc
    limit 1;

    if last_x is null then
      next_x := 0.04;
      next_y := 32;
    elsif last_x + thickness + 0.025 > 0.95 then
      next_x := 0.04;
      next_y := last_y + 270;
    else
      next_x := last_x + thickness + 0.025;
      next_y := last_y;
    end if;

    insert into public.bookshelf_items (user_id, item_type, book_id, position_x, position_y)
    values (new.user_id, 'book', new.book_id, next_x, next_y)
    on conflict (user_id, book_id) where book_id is not null do nothing;
  end if;
  return new;
end;
$function$;

create trigger reading_attempts_add_finished_book_to_bookshelf
  after insert or update of finished_on on public.reading_attempts
  for each row execute function public.place_finished_book_on_bookshelf();

insert into public.bookshelf_items (user_id, item_type, book_id, position_x, position_y)
select ranked.user_id, 'book', ranked.book_id,
  0.04 + ((ranked.position - 1) % 7) * 0.13,
  32 + floor((ranked.position - 1) / 7) * 270
from (
  select distinct on (attempts.user_id, attempts.book_id)
    attempts.user_id,
    attempts.book_id,
    row_number() over (partition by attempts.user_id order by attempts.finished_on, attempts.book_id) as position
  from public.reading_attempts attempts
  where attempts.finished_on is not null
  order by attempts.user_id, attempts.book_id, attempts.finished_on
) ranked
on conflict (user_id, book_id) where book_id is not null do nothing;

grant delete on public.books to authenticated;
create policy "Readers can delete their own Books"
  on public.books
  for delete
  to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);

create function public.delete_book_page(p_book_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  owner_subject text := auth.jwt() ->> 'sub';
begin
  if owner_subject is null then
    raise exception 'A signed-in reader is required.' using errcode = '42501';
  end if;
  delete from public.books where id = p_book_id and user_id = owner_subject;
  if not found then
    raise exception 'The Book page does not belong to this reader.' using errcode = '42501';
  end if;
end;
$function$;

revoke all on function public.delete_book_page(uuid) from public, anon;
grant execute on function public.delete_book_page(uuid) to authenticated;
