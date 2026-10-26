alter table public.reading_attempts
  drop constraint reading_attempts_finished_rating;

alter table public.reading_attempts
  add constraint reading_attempts_finished_rating
    check (
      (finished_on is null and rating is null)
      or (
        finished_on is not null
        and rating is not null
        and rating >= 1
        and rating <= 5
        and rating * 2 = trunc(rating * 2)
      )
    );
