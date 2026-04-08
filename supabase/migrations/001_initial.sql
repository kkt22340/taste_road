-- Taste Road: profiles + posts + Storage (Supabase SQL Editor에서 전체 실행)

-- ---------------------------------------------------------------------------
-- profiles (auth.users 1:1, 닉네임·아바타)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null default '' check (char_length(nickname) <= 24),
  avatar_url text,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- posts (회원별 맛집 게시글 — 로컬 마커 id 와 동일 uuid 사용 가능)
-- ---------------------------------------------------------------------------
create table if not exists public.posts (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  note text,
  lat double precision not null,
  lng double precision not null,
  visibility text not null default 'private' check (visibility in ('private', 'shared')),
  kakao_place_id text,
  address_name text,
  category_name text,
  created_at timestamptz not null default now()
);

create index if not exists posts_user_id_created_at_idx
  on public.posts (user_id, created_at desc);

create index if not exists posts_visibility_created_at_idx
  on public.posts (visibility, created_at desc)
  where visibility = 'shared';

alter table public.posts enable row level security;

create policy "posts_select_visible"
  on public.posts for select
  using (auth.uid() = user_id or visibility = 'shared');

create policy "posts_insert_own"
  on public.posts for insert
  with check (auth.uid() = user_id);

create policy "posts_update_own"
  on public.posts for update
  using (auth.uid() = user_id);

create policy "posts_delete_own"
  on public.posts for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- post_photos (Storage 경로 참조)
-- ---------------------------------------------------------------------------
create table if not exists public.post_photos (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  storage_path text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists post_photos_post_id_idx on public.post_photos (post_id);

alter table public.post_photos enable row level security;

create policy "post_photos_select_if_post_visible"
  on public.post_photos for select
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_photos.post_id
        and (p.user_id = auth.uid() or p.visibility = 'shared')
    )
  );

create policy "post_photos_insert_if_own_post"
  on public.post_photos for insert
  with check (
    exists (
      select 1 from public.posts p
      where p.id = post_photos.post_id and p.user_id = auth.uid()
    )
  );

create policy "post_photos_delete_if_own_post"
  on public.post_photos for delete
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_photos.post_id and p.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 신규 가입 시 profiles 행 자동 생성
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nickname)
  values (new.id, '')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Storage buckets (이미 있으면 스킵)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('post-photos', 'post-photos', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- post-photos: {user_id}/...
create policy "post_photos_storage_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'post-photos'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "post_photos_storage_select_public"
  on storage.objects for select
  using (bucket_id = 'post-photos');

create policy "post_photos_storage_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'post-photos'
    and split_part(name, '/', 1) = auth.uid()::text
  );

-- avatars: {user_id}/avatar
create policy "avatars_storage_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "avatars_storage_select_public"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars_storage_update_own"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "avatars_storage_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = auth.uid()::text
  );
