-- Run AFTER schema.sql + direct_messages.sql (needs public.profiles).
-- Group chats: named rooms, multiple members, group_messages.

create table if not exists public.group_chats (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_chats_name_len check (
    char_length(trim(name)) > 0 and char_length(name) <= 100
  )
);

create table if not exists public.group_chat_members (
  group_chat_id uuid not null references public.group_chats (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_chat_id, user_id)
);

create index if not exists group_chat_members_user_idx
  on public.group_chat_members (user_id);

create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_chat_id uuid not null references public.group_chats (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  constraint group_messages_content_len check (
    char_length(trim(content)) > 0 and char_length(content) <= 4000
  )
);

create index if not exists group_messages_group_created_idx
  on public.group_messages (group_chat_id, created_at desc);

alter table public.group_chats enable row level security;
alter table public.group_chat_members enable row level security;
alter table public.group_messages enable row level security;

-- Membership check without querying group_chat_members from RLS (avoids infinite recursion).
create or replace function public.is_group_member(p_group_chat_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_chat_members
    where group_chat_id = p_group_chat_id
      and user_id = auth.uid()
  );
$$;

grant execute on function public.is_group_member(uuid) to authenticated;

create policy "Members read group row"
  on public.group_chats for select
  to authenticated
  using (public.is_group_member(id));

create policy "Members read membership"
  on public.group_chat_members for select
  to authenticated
  using (public.is_group_member(group_chat_id));

create policy "Members read group messages"
  on public.group_messages for select
  to authenticated
  using (public.is_group_member(group_chat_id));

create policy "Members send as self in group"
  on public.group_messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_group_member(group_chat_id)
  );

create or replace function public.bump_group_chat_ts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.group_chats
  set updated_at = new.created_at
  where id = new.group_chat_id;
  return new;
end;
$$;

drop trigger if exists on_group_message_insert on public.group_messages;
create trigger on_group_message_insert
  after insert on public.group_messages
  for each row execute function public.bump_group_chat_ts();

-- Create group + add creator + optional members (security definer bypasses RLS for inserts)
create or replace function public.create_group_chat(p_name text, p_member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  gid uuid;
  m uuid;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  if p_name is null or trim(p_name) = '' then
    raise exception 'invalid name';
  end if;

  insert into public.group_chats (name, created_by)
  values (trim(p_name), me)
  returning id into gid;

  insert into public.group_chat_members (group_chat_id, user_id)
  values (gid, me)
  on conflict do nothing;

  if p_member_ids is not null then
    for m in select distinct unnest(coalesce(p_member_ids, array[]::uuid[]))
    loop
      if m is not null and m <> me then
        insert into public.group_chat_members (group_chat_id, user_id)
        values (gid, m)
        on conflict do nothing;
      end if;
    end loop;
  end if;

  return gid;
end;
$$;

grant execute on function public.create_group_chat(text, uuid[]) to authenticated;

-- Existing members can add more profiles
create or replace function public.add_group_members(p_group_id uuid, p_user_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  u uuid;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  if not exists (
    select 1 from public.group_chat_members
    where group_chat_id = p_group_id and user_id = me
  ) then
    raise exception 'not a member';
  end if;

  if p_user_ids is null then
    return;
  end if;

  for u in select distinct unnest(coalesce(p_user_ids, array[]::uuid[]))
  loop
    if u is not null and u <> me then
      insert into public.group_chat_members (group_chat_id, user_id)
      values (p_group_id, u)
      on conflict do nothing;
    end if;
  end loop;
end;
$$;

grant execute on function public.add_group_members(uuid, uuid[]) to authenticated;

create or replace function public.list_my_group_chats()
returns table (
  group_chat_id uuid,
  name text,
  updated_at timestamptz,
  last_content text,
  last_created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id as group_chat_id,
    g.name,
    g.updated_at,
    gm.content as last_content,
    gm.created_at as last_created_at
  from public.group_chats g
  join public.group_chat_members mem on mem.group_chat_id = g.id and mem.user_id = auth.uid()
  left join lateral (
    select m.content, m.created_at
    from public.group_messages m
    where m.group_chat_id = g.id
    order by m.created_at desc
    limit 1
  ) gm on true
  order by g.updated_at desc;
$$;

grant execute on function public.list_my_group_chats() to authenticated;

-- Reliable member list for the UI (direct .from('group_chat_members') + embed can return 0 rows with RLS/embed issues).
create or replace function public.list_group_members(p_group_id uuid)
returns table (
  user_id uuid,
  username text,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.user_id,
    p.username,
    m.joined_at
  from public.group_chat_members m
  inner join public.profiles p on p.id = m.user_id
  where m.group_chat_id = p_group_id
    and public.is_group_member(p_group_id);
$$;

grant execute on function public.list_group_members(uuid) to authenticated;

alter publication supabase_realtime add table public.group_messages;
