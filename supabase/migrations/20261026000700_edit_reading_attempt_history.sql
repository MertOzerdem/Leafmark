create or replace function public.update_reading_attempt_start(p_attempt_id uuid, p_started_on date)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  owner_subject text := auth.jwt() ->> 'sub';
  attempt public.reading_attempts;
begin
  if owner_subject is null then
    raise exception 'A signed-in reader is required.' using errcode = '42501';
  end if;
  if p_started_on is null then
    raise exception 'Choose a valid Reading attempt start date.' using errcode = '22023';
  end if;

  select * into attempt
  from public.reading_attempts
  where id = p_attempt_id and user_id = owner_subject
  for update;
  if not found then
    raise exception 'The Reading attempt does not belong to this reader.' using errcode = '42501';
  end if;
  if attempt.finished_on is not null and p_started_on > attempt.finished_on then
    raise exception 'The start date must be on or before the finish date.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.reading_logs
    where attempt_id = p_attempt_id and user_id = owner_subject and logged_on < p_started_on
  ) then
    raise exception 'The start date cannot be after one of its Reading logs.' using errcode = '22023';
  end if;

  update public.reading_attempts
  set started_on = p_started_on
  where id = p_attempt_id and user_id = owner_subject;
end;
$function$;

create function public.update_reading_attempt_finish(
  p_attempt_id uuid,
  p_finished_on date,
  p_rating numeric
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  owner_subject text := auth.jwt() ->> 'sub';
  attempt public.reading_attempts;
begin
  if owner_subject is null then
    raise exception 'A signed-in reader is required.' using errcode = '42501';
  end if;
  select * into attempt
  from public.reading_attempts
  where id = p_attempt_id and user_id = owner_subject
  for update;
  if not found then
    raise exception 'The Reading attempt does not belong to this reader.' using errcode = '42501';
  end if;
  if attempt.is_current or attempt.finished_on is null then
    raise exception 'Only a finished Reading attempt can have its finish details edited.' using errcode = '22023';
  end if;
  if p_finished_on is null or p_finished_on < attempt.started_on then
    raise exception 'A finish date must be on or after the Reading attempt start date.' using errcode = '22023';
  end if;
  if p_rating is null or p_rating < 0.5 or p_rating > 5 or p_rating * 2 <> trunc(p_rating * 2) then
    raise exception 'Choose a rating from 0.5 to 5 stars in half-star increments.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.reading_logs
    where attempt_id = p_attempt_id and user_id = owner_subject and logged_on > p_finished_on
  ) then
    raise exception 'A Book cannot be finished before one of its Reading logs.' using errcode = '22023';
  end if;

  update public.reading_attempts
  set finished_on = p_finished_on, rating = p_rating
  where id = p_attempt_id and user_id = owner_subject;
end;
$function$;

revoke all on function public.update_reading_attempt_finish(uuid, date, numeric) from public, anon;
grant execute on function public.update_reading_attempt_finish(uuid, date, numeric) to authenticated;
