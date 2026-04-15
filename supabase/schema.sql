-- Run this in the Supabase SQL Editor (Dashboard → SQL → New query).
-- Then: Database → Replication → ensure `messages` is enabled for Realtime (usually automatic after ALTER PUBLICATION).

-- Profiles (one row per auth user; used for display names in chat)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null default 'user',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles readable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users insert own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "Users update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'username'), ''),
      split_part(new.email, '@', 1),
      'user'
    )
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Messages
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  room_id text not null default 'general',
  constraint messages_content_len check (
    char_length(trim(content)) > 0 and char_length(content) <= 4000
  )
);

alter table public.messages enable row level security;

create policy "Messages readable by authenticated users"
  on public.messages for select
  to authenticated
  using (true);

create policy "Users insert own messages"
  on public.messages for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Realtime: broadcast new rows to subscribers
alter publication supabase_realtime add table public.messages;
