-- Shared feed: show author nickname/avatar on others' posts.
-- Existing policy "profiles_select_own" remains; this adds read for any signed-in user.

create policy "profiles_select_if_authenticated"
  on public.profiles for select
  to authenticated
  using (true);
