alter table public.reading_attempts
  add column finished_on date,
  add column rating numeric(2, 1),
  add constraint reading_attempts_finish_after_start
    check (finished_on is null or finished_on >= started_on),
  add constraint reading_attempts_finished_rating
    check (
      (finished_on is null and rating is null)
      or (
        finished_on is not null
        and rating is not null
        and rating >= 0.5
        and rating <= 5
        and rating * 2 = trunc(rating * 2)
      )
    ),
  add constraint finished_reading_attempt_is_not_current
    check (finished_on is null or not is_current);

create index reading_attempts_by_finish
  on public.reading_attempts (user_id, finished_on desc, book_id)
  where finished_on is not null;

create function public.validate_reading_log_finish_date()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  attempt_finish date;
begin
  select finished_on into attempt_finish
  from public.reading_attempts
  where id = new.attempt_id
    and user_id = new.user_id;

  if found and attempt_finish is not null and new.logged_on > attempt_finish then
    raise exception 'A Reading log cannot be dated after its Reading attempt finished.' using errcode = '22023';
  end if;

  return new;
end;
$function$;

create trigger reading_logs_validate_finish_date
  before insert or update on public.reading_logs
  for each row execute function public.validate_reading_log_finish_date();

create function public.finish_reading_attempt(
  p_attempt_id uuid,
  p_finished_on date,
  p_rating numeric
)
returns setof public.reading_attempts
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  owner_subject text := auth.jwt() ->> 'sub';
  attempt public.reading_attempts;
  saved_attempt public.reading_attempts;
begin
  if owner_subject is null then
    raise exception 'A signed-in reader is required.' using errcode = '42501';
  end if;

  select * into attempt
  from public.reading_attempts
  where id = p_attempt_id
    and user_id = owner_subject
  for update;

  if not found then
    raise exception 'The Reading attempt does not belong to this reader.' using errcode = '42501';
  end if;
  if not attempt.is_current or attempt.finished_on is not null then
    raise exception 'Only the Current book can be marked finished.' using errcode = '22023';
  end if;
  if p_finished_on is null or p_finished_on < attempt.started_on then
    raise exception 'A finish date must be on or after the Reading attempt start date.' using errcode = '22023';
  end if;
  if p_rating is null or p_rating < 0.5 or p_rating > 5 or p_rating * 2 <> trunc(p_rating * 2) then
    raise exception 'Choose a rating from 0.5 to 5 stars in half-star increments.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.reading_logs
    where attempt_id = p_attempt_id
      and user_id = owner_subject
      and logged_on > p_finished_on
  ) then
    raise exception 'A Book cannot be finished before one of its Reading logs.' using errcode = '22023';
  end if;

  update public.reading_attempts
  set finished_on = p_finished_on,
      rating = p_rating,
      is_current = false
  where id = p_attempt_id
    and user_id = owner_subject
  returning * into saved_attempt;

  delete from public.tbr_entries
  where book_id = attempt.book_id
    and user_id = owner_subject;

  return next saved_attempt;
end;
$function$;

revoke all on function public.finish_reading_attempt(uuid, date, numeric) from public, anon;
grant execute on function public.finish_reading_attempt(uuid, date, numeric) to authenticated;
