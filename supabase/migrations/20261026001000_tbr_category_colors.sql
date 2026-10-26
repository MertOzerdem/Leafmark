create table public.tbr_category_colors (
  user_id text not null default (auth.jwt() ->> 'sub'),
  category_name text not null check (
    length(btrim(category_name)) > 0
    and category_name = lower(btrim(category_name))
  ),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  updated_at timestamptz not null default now(),
  primary key (user_id, category_name)
);

alter table public.tbr_category_colors enable row level security;

revoke all on public.tbr_category_colors from anon;
grant select, insert, update, delete on public.tbr_category_colors to authenticated;

create policy "Readers can view their own TBR category colors"
  on public.tbr_category_colors
  for select
  to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);

create policy "Readers can create their own TBR category colors"
  on public.tbr_category_colors
  for insert
  to authenticated
  with check ((select auth.jwt() ->> 'sub') = user_id);

create policy "Readers can update their own TBR category colors"
  on public.tbr_category_colors
  for update
  to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id)
  with check ((select auth.jwt() ->> 'sub') = user_id);

create policy "Readers can delete their own TBR category colors"
  on public.tbr_category_colors
  for delete
  to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);
