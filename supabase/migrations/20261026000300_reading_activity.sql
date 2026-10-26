create table public.reading_configurations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default (auth.jwt() ->> 'sub'),
  measure text not null check (measure in ('minutes', 'pages', 'chapters')),
  starts_on date not null,
  categories jsonb not null,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create index reading_configurations_by_reader_date
  on public.reading_configurations (user_id, starts_on, created_at);

create table public.reading_category_colors (
  user_id text not null default (auth.jwt() ->> 'sub'),
  position integer not null check (position >= 0 and position < 10),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  updated_at timestamptz not null default now(),
  primary key (user_id, position)
);

create table public.reading_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default (auth.jwt() ->> 'sub'),
  book_id uuid not null,
  started_on date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (book_id, user_id)
    references public.books (id, user_id)
    on delete cascade
);

create unique index one_current_reading_attempt_per_reader
  on public.reading_attempts (user_id)
  where is_current;

create index reading_attempts_by_book
  on public.reading_attempts (user_id, book_id, started_on desc);

create table public.reading_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default (auth.jwt() ->> 'sub'),
  attempt_id uuid not null,
  configuration_id uuid not null,
  logged_on date not null,
  amount integer not null check (amount > 0),
  category_position integer not null check (category_position >= 0 and category_position < 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, attempt_id, logged_on),
  foreign key (attempt_id, user_id)
    references public.reading_attempts (id, user_id)
    on delete cascade,
  foreign key (configuration_id, user_id)
    references public.reading_configurations (id, user_id)
    on delete cascade
);

create index reading_logs_by_reader_date
  on public.reading_logs (user_id, logged_on);

alter table public.reading_configurations enable row level security;
alter table public.reading_category_colors enable row level security;
alter table public.reading_attempts enable row level security;
alter table public.reading_logs enable row level security;

revoke all on public.reading_configurations from anon;
revoke all on public.reading_category_colors from anon;
revoke all on public.reading_attempts from anon;
revoke all on public.reading_logs from anon;
grant select, insert, update on public.reading_configurations to authenticated;
grant select, insert, update on public.reading_category_colors to authenticated;
grant select, insert, update on public.reading_attempts to authenticated;
grant select, insert, update on public.reading_logs to authenticated;

create policy "Readers can view their own Reading configurations"
  on public.reading_configurations
  for select
  to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);

create policy "Readers can create their own Reading configurations"
  on public.reading_configurations
  for insert
  to authenticated
  with check ((select auth.jwt() ->> 'sub') = user_id);

create policy "Readers can update their own Reading configurations"
  on public.reading_configurations
  for update
  to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id)
  with check ((select auth.jwt() ->> 'sub') = user_id);

create policy "Readers can view their own Reading category colors"
  on public.reading_category_colors
  for select
  to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);

create policy "Readers can create their own Reading category colors"
  on public.reading_category_colors
  for insert
  to authenticated
  with check ((select auth.jwt() ->> 'sub') = user_id);

create policy "Readers can update their own Reading category colors"
  on public.reading_category_colors
  for update
  to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id)
  with check ((select auth.jwt() ->> 'sub') = user_id);

create policy "Readers can view their own Reading attempts"
  on public.reading_attempts
  for select
  to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);

create policy "Readers can create their own Reading attempts"
  on public.reading_attempts
  for insert
  to authenticated
  with check (
    (select auth.jwt() ->> 'sub') = user_id
    and exists (
      select 1 from public.books
      where books.id = reading_attempts.book_id
        and books.user_id = (select auth.jwt() ->> 'sub')
    )
  );

create policy "Readers can update their own Reading attempts"
  on public.reading_attempts
  for update
  to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id)
  with check (
    (select auth.jwt() ->> 'sub') = user_id
    and exists (
      select 1 from public.books
      where books.id = reading_attempts.book_id
        and books.user_id = (select auth.jwt() ->> 'sub')
    )
  );

create policy "Readers can view their own Reading logs"
  on public.reading_logs
  for select
  to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);

create policy "Readers can create their own Reading logs"
  on public.reading_logs
  for insert
  to authenticated
  with check (
    (select auth.jwt() ->> 'sub') = user_id
    and exists (
      select 1 from public.reading_attempts
      where reading_attempts.id = reading_logs.attempt_id
        and reading_attempts.user_id = (select auth.jwt() ->> 'sub')
    )
    and exists (
      select 1 from public.reading_configurations
      where reading_configurations.id = reading_logs.configuration_id
        and reading_configurations.user_id = (select auth.jwt() ->> 'sub')
    )
  );

create policy "Readers can update their own Reading logs"
  on public.reading_logs
  for update
  to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id)
  with check (
    (select auth.jwt() ->> 'sub') = user_id
    and exists (
      select 1 from public.reading_attempts
      where reading_attempts.id = reading_logs.attempt_id
        and reading_attempts.user_id = (select auth.jwt() ->> 'sub')
    )
    and exists (
      select 1 from public.reading_configurations
      where reading_configurations.id = reading_logs.configuration_id
        and reading_configurations.user_id = (select auth.jwt() ->> 'sub')
    )
  );

create function public.validate_reading_configuration()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  category jsonb;
  category_count integer;
  category_position integer;
  minimum_value integer;
  maximum_value integer;
  expected_minimum integer := 1;
  category_index integer := 0;
begin
  if new.measure not in ('minutes', 'pages', 'chapters') then
    raise exception 'Choose minutes, pages, or chapters as the Reading measure.' using errcode = '22023';
  end if;
  if jsonb_typeof(new.categories) is distinct from 'array' then
    raise exception 'Reading categories must be a list.' using errcode = '22023';
  end if;

  category_count := jsonb_array_length(new.categories);
  if category_count < 1 or category_count > 10 then
    raise exception 'Configure between one and ten Reading categories.' using errcode = '22023';
  end if;

  for category in select value from jsonb_array_elements(new.categories) loop
    if coalesce(category ->> 'position', '') !~ '^[0-9]+$'
      or coalesce(category ->> 'minimum', '') !~ '^[0-9]+$' then
      raise exception 'Reading category positions and limits must be whole numbers.' using errcode = '22023';
    end if;
    if coalesce(category ->> 'color', '') !~ '^#[0-9A-Fa-f]{6}$' then
      raise exception 'Choose a valid color for each Reading category.' using errcode = '22023';
    end if;

    category_position := (category ->> 'position')::integer;
    minimum_value := (category ->> 'minimum')::integer;
    if category_position <> category_index or minimum_value <> expected_minimum then
      raise exception 'Reading categories must be ordered, continuous ranges starting at one.' using errcode = '22023';
    end if;

    if category_index = category_count - 1 then
      if category -> 'maximum' is distinct from 'null'::jsonb then
        raise exception 'The last Reading category must include all higher totals.' using errcode = '22023';
      end if;
    else
      if coalesce(category ->> 'maximum', '') !~ '^[0-9]+$' then
        raise exception 'Every Reading category except the last needs an upper limit.' using errcode = '22023';
      end if;
      maximum_value := (category ->> 'maximum')::integer;
      if maximum_value < minimum_value then
        raise exception 'Reading category limits must increase.' using errcode = '22023';
      end if;
      expected_minimum := maximum_value + 1;
    end if;

    category_index := category_index + 1;
  end loop;

  if tg_op = 'UPDATE' and exists (
    select 1 from public.reading_logs
    where configuration_id = old.id
      and user_id = old.user_id
  ) and (
    new.measure is distinct from old.measure
    or new.starts_on is distinct from old.starts_on
    or new.categories is distinct from old.categories
  ) then
    raise exception 'Reading measure ranges cannot change after a Reading log uses them.' using errcode = '22023';
  end if;

  return new;
end;
$function$;

create trigger reading_configurations_validate
  before insert or update on public.reading_configurations
  for each row execute function public.validate_reading_configuration();

create function public.validate_reading_log_category()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  category jsonb;
  expected_position integer;
  category_minimum integer;
  category_maximum integer;
  category_maximum_text text;
  saved_categories jsonb;
  attempt_start date;
begin
  select categories into saved_categories
  from public.reading_configurations
  where id = new.configuration_id
    and user_id = new.user_id;
  if not found then
    raise exception 'Choose a Reading configuration owned by this account.' using errcode = '42501';
  end if;

  expected_position := null;
  for category in select value from jsonb_array_elements(saved_categories) loop
    category_minimum := (category ->> 'minimum')::integer;
    category_maximum_text := category ->> 'maximum';
    if new.amount >= category_minimum and (
      category_maximum_text is null
      or new.amount <= category_maximum_text::integer
    ) then
      expected_position := (category ->> 'position')::integer;
      exit;
    end if;
  end loop;

  if expected_position is null or expected_position <> new.category_position then
    raise exception 'The saved total does not match its Reading category.' using errcode = '22023';
  end if;

  select started_on into attempt_start
  from public.reading_attempts
  where id = new.attempt_id
    and user_id = new.user_id;
  if not found then
    raise exception 'Choose a Reading attempt owned by this account.' using errcode = '42501';
  end if;
  if attempt_start > new.logged_on then
    raise exception 'A Reading log cannot be dated before its book start date.' using errcode = '22023';
  end if;

  return new;
end;
$function$;

create trigger reading_logs_validate_category
  before insert or update on public.reading_logs
  for each row execute function public.validate_reading_log_category();

create function public.save_reading_configuration(
  p_configuration_id uuid,
  p_measure text,
  p_starts_on date,
  p_categories jsonb
)
returns setof public.reading_configurations
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  owner_subject text := auth.jwt() ->> 'sub';
  saved_configuration public.reading_configurations;
  existing_configuration public.reading_configurations;
  category jsonb;
begin
  if owner_subject is null then
    raise exception 'A signed-in reader is required.' using errcode = '42501';
  end if;

  if p_configuration_id is not null then
    select * into existing_configuration
    from public.reading_configurations
    where id = p_configuration_id
      and user_id = owner_subject
    for update;

    if not found then
      raise exception 'The Reading configuration does not belong to this reader.' using errcode = '42501';
    end if;

    if exists (
      select 1 from public.reading_logs
      where configuration_id = p_configuration_id
        and user_id = owner_subject
    ) then
      if p_measure = existing_configuration.measure then
        raise exception 'Reading category ranges are fixed after a Reading log uses them.' using errcode = '22023';
      end if;
      insert into public.reading_configurations (measure, starts_on, categories)
      values (p_measure, p_starts_on, p_categories)
      returning * into saved_configuration;
    elsif p_measure = existing_configuration.measure then
      update public.reading_configurations
      set starts_on = p_starts_on,
          categories = p_categories
      where id = p_configuration_id
        and user_id = owner_subject
      returning * into saved_configuration;
    else
      insert into public.reading_configurations (measure, starts_on, categories)
      values (p_measure, p_starts_on, p_categories)
      returning * into saved_configuration;
    end if;
  else
    insert into public.reading_configurations (measure, starts_on, categories)
    values (p_measure, p_starts_on, p_categories)
    returning * into saved_configuration;
  end if;

  for category in select value from jsonb_array_elements(p_categories) loop
    insert into public.reading_category_colors (position, color)
    values ((category ->> 'position')::integer, category ->> 'color')
    on conflict (user_id, position)
    do update set color = excluded.color, updated_at = now();
  end loop;

  return next saved_configuration;
end;
$function$;

create function public.start_reading_attempt(p_book_id uuid, p_started_on date)
returns setof public.reading_attempts
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  owner_subject text := auth.jwt() ->> 'sub';
  current_attempt public.reading_attempts;
  saved_attempt public.reading_attempts;
begin
  if owner_subject is null then
    raise exception 'A signed-in reader is required.' using errcode = '42501';
  end if;
  perform 1 from public.books where id = p_book_id and user_id = owner_subject;
  if not found then
    raise exception 'Choose a Book owned by this reader.' using errcode = '42501';
  end if;

  select * into current_attempt
  from public.reading_attempts
  where user_id = owner_subject
    and book_id = p_book_id
    and is_current
  for update;

  if found then
    if exists (
      select 1 from public.reading_logs
      where attempt_id = current_attempt.id
        and user_id = owner_subject
        and logged_on < p_started_on
    ) then
      raise exception 'The book start date cannot be after one of its Reading logs.' using errcode = '22023';
    end if;
    update public.reading_attempts
    set started_on = p_started_on
    where id = current_attempt.id
      and user_id = owner_subject
    returning * into saved_attempt;
    return next saved_attempt;
    return;
  end if;

  update public.reading_attempts
  set is_current = false
  where user_id = owner_subject
    and is_current;

  insert into public.reading_attempts (book_id, started_on, is_current)
  values (p_book_id, p_started_on, true)
  returning * into saved_attempt;

  return next saved_attempt;
end;
$function$;

create function public.update_reading_attempt_start(p_attempt_id uuid, p_started_on date)
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
  if exists (
    select 1 from public.reading_logs
    where attempt_id = p_attempt_id
      and user_id = owner_subject
      and logged_on < p_started_on
  ) then
    raise exception 'The book start date cannot be after one of its Reading logs.' using errcode = '22023';
  end if;

  update public.reading_attempts
  set started_on = p_started_on
  where id = p_attempt_id
    and user_id = owner_subject
    and is_current;

  if not found then
    raise exception 'The Current book attempt does not belong to this reader.' using errcode = '42501';
  end if;
end;
$function$;

create function public.save_daily_reading_total(
  p_log_id uuid,
  p_book_id uuid,
  p_configuration_id uuid,
  p_logged_on date,
  p_amount integer
)
returns setof public.reading_logs
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  owner_subject text := auth.jwt() ->> 'sub';
  selected_configuration public.reading_configurations;
  effective_configuration public.reading_configurations;
  selected_attempt public.reading_attempts;
  previous_log public.reading_logs;
  saved_log public.reading_logs;
  category jsonb;
  resolved_category_position integer;
  category_minimum integer;
  category_maximum_text text;
begin
  if owner_subject is null then
    raise exception 'A signed-in reader is required.' using errcode = '42501';
  end if;
  if p_amount is null or p_amount < 1 then
    raise exception 'A daily Reading total must be a positive whole number.' using errcode = '22023';
  end if;
  perform 1 from public.books where id = p_book_id and user_id = owner_subject;
  if not found then
    raise exception 'Choose a Book owned by this reader.' using errcode = '42501';
  end if;

  select * into selected_configuration
  from public.reading_configurations
  where id = p_configuration_id
    and user_id = owner_subject;
  if not found then
    raise exception 'Choose a Reading configuration owned by this reader.' using errcode = '42501';
  end if;

  select * into effective_configuration
  from public.reading_configurations
  where user_id = owner_subject
    and starts_on <= p_logged_on
  order by starts_on desc, created_at desc
  limit 1;
  if not found then
    select * into effective_configuration
    from public.reading_configurations
    where user_id = owner_subject
    order by starts_on asc, created_at asc
    limit 1;
  end if;
  if effective_configuration.id is null or effective_configuration.id <> selected_configuration.id then
    raise exception 'The selected Reading measure does not apply to this date.' using errcode = '22023';
  end if;

  resolved_category_position := null;
  for category in select value from jsonb_array_elements(selected_configuration.categories) loop
    category_minimum := (category ->> 'minimum')::integer;
    category_maximum_text := category ->> 'maximum';
    if p_amount >= category_minimum and (
      category_maximum_text is null
      or p_amount <= category_maximum_text::integer
    ) then
      resolved_category_position := (category ->> 'position')::integer;
      exit;
    end if;
  end loop;
  if resolved_category_position is null then
    raise exception 'The daily Reading total does not match a configured category.' using errcode = '22023';
  end if;

  if p_log_id is not null then
    select * into previous_log
    from public.reading_logs
    where id = p_log_id
      and user_id = owner_subject
    for update;
    if not found then
      raise exception 'The Reading log does not belong to this reader.' using errcode = '42501';
    end if;

    select * into selected_attempt
    from public.reading_attempts
    where id = previous_log.attempt_id
      and user_id = owner_subject
      and book_id = p_book_id;

    if not found then
      select * into selected_attempt
      from public.reading_attempts
      where user_id = owner_subject
        and book_id = p_book_id
        and started_on <= p_logged_on
      order by started_on desc, created_at desc
      limit 1;
    end if;

    if not found then
      insert into public.reading_attempts (book_id, started_on, is_current)
      values (p_book_id, p_logged_on, false)
      returning * into selected_attempt;
    elsif selected_attempt.started_on > p_logged_on then
      update public.reading_attempts
      set started_on = p_logged_on
      where id = selected_attempt.id
        and user_id = owner_subject
      returning * into selected_attempt;
    end if;

    update public.reading_logs
    set attempt_id = selected_attempt.id,
        configuration_id = selected_configuration.id,
        logged_on = p_logged_on,
        amount = p_amount,
        category_position = resolved_category_position,
        updated_at = now()
    where id = p_log_id
      and user_id = owner_subject
    returning * into saved_log;
  else
    select * into selected_attempt
    from public.reading_attempts
    where user_id = owner_subject
      and book_id = p_book_id
      and is_current
    for update;

    if not found then
      select * into selected_attempt
      from public.reading_attempts
      where user_id = owner_subject
        and book_id = p_book_id
        and started_on <= p_logged_on
      order by started_on desc, created_at desc
      limit 1
      for update;
    end if;

    if found then
      if selected_attempt.started_on > p_logged_on then
        update public.reading_attempts
        set started_on = p_logged_on
        where id = selected_attempt.id
          and user_id = owner_subject
        returning * into selected_attempt;
      end if;
      if not selected_attempt.is_current then
        update public.reading_attempts
        set is_current = false
        where user_id = owner_subject
          and is_current;
        update public.reading_attempts
        set is_current = true
        where id = selected_attempt.id
          and user_id = owner_subject
        returning * into selected_attempt;
      end if;
    else
      update public.reading_attempts
      set is_current = false
      where user_id = owner_subject
        and is_current;
      insert into public.reading_attempts (book_id, started_on, is_current)
      values (p_book_id, p_logged_on, true)
      returning * into selected_attempt;
    end if;

    insert into public.reading_logs (attempt_id, configuration_id, logged_on, amount, category_position)
    values (selected_attempt.id, selected_configuration.id, p_logged_on, p_amount, resolved_category_position)
    on conflict (user_id, attempt_id, logged_on)
    do update set
      configuration_id = excluded.configuration_id,
      amount = excluded.amount,
      category_position = excluded.category_position,
      updated_at = now()
    returning * into saved_log;
  end if;

  return next saved_log;
end;
$function$;

revoke all on function public.save_reading_configuration(uuid, text, date, jsonb) from public, anon;
revoke all on function public.start_reading_attempt(uuid, date) from public, anon;
revoke all on function public.update_reading_attempt_start(uuid, date) from public, anon;
revoke all on function public.save_daily_reading_total(uuid, uuid, uuid, date, integer) from public, anon;
grant execute on function public.save_reading_configuration(uuid, text, date, jsonb) to authenticated;
grant execute on function public.start_reading_attempt(uuid, date) to authenticated;
grant execute on function public.update_reading_attempt_start(uuid, date) to authenticated;
grant execute on function public.save_daily_reading_total(uuid, uuid, uuid, date, integer) to authenticated;
