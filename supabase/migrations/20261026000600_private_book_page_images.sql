insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'book-page-images',
  'book-page-images',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Readers can view their own Book page images"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'book-page-images'
    and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  );

create policy "Readers can upload their own Book page images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'book-page-images'
    and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  );

create policy "Readers can update their own Book page images"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'book-page-images'
    and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  )
  with check (
    bucket_id = 'book-page-images'
    and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  );

create policy "Readers can delete their own Book page images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'book-page-images'
    and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  );

create function public.remove_book_page_images()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  delete from storage.objects
  where bucket_id = 'book-page-images'
    and (storage.foldername(name))[1] = old.user_id
    and (storage.foldername(name))[2] = old.id::text;
  return old;
end;
$function$;

create trigger books_remove_private_page_images
  after delete on public.books
  for each row execute function public.remove_book_page_images();
