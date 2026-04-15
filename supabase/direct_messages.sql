-- Run in Supabase SQL Editor AFTER schema.sql (profiles must exist).
-- Enables private 1:1 chats + Realtime on direct_messages.

-- Pair-wise DM threads (user_a < user_b for uniqueness)
create table if not exists public.direct_conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint direct_pair_order check (user_a < user_b),
  constraint direct_pair_distinct check (user_a <> user_b),
  unique (user_a, user_b)
);

create index if not exists direct_conversations_updated_at_idx
  on public.direct_conversations (updated_at desc);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.direct_conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  constraint direct_messages_content_len check (
    char_length(trim(content)) > 0 and char_length(content) <= 4000
  )
);

create index if not exists direct_messages_conversation_created_idx
  on public.direct_messages (conversation_id, created_at desc);

alter table public.direct_conversations enable row level security;
alter table public.direct_messages enable row level security;

create policy "Participants read own conversations"
  on public.direct_conversations for select
  to authenticated
  using (auth.uid() = user_a or auth.uid() = user_b);

create policy "Participants read messages in their conversations"
  on public.direct_messages for select
  to authenticated
  using (
    exists (
      select 1 from public.direct_conversations dc
      where dc.id = conversation_id
        and (dc.user_a = auth.uid() or dc.user_b = auth.uid())
    )
  );

create policy "Participants send messages as self"
  on public.direct_messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.direct_conversations dc
      where dc.id = conversation_id
        and (dc.user_a = auth.uid() or dc.user_b = auth.uid())
    )
  );

create or replace function public.bump_dm_conversation_ts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.direct_conversations
  set updated_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists on_direct_message_insert on public.direct_messages;
create trigger on_direct_message_insert
  after insert on public.direct_messages
  for each row execute function public.bump_dm_conversation_ts();

-- Open or create a 1:1 thread (sorted pair)
create or replace function public.get_or_create_dm(p_other uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  a uuid;
  b uuid;
  cid uuid;
begin
  if p_other is null or p_other = me then
    raise exception 'invalid peer';
  end if;
  if me < p_other then
    a := me;
    b := p_other;
  else
    a := p_other;
    b := me;
  end if;

  select id into cid
  from public.direct_conversations
  where user_a = a and user_b = b;

  if cid is not null then
    return cid;
  end if;

  insert into public.direct_conversations (user_a, user_b)
  values (a, b)
  returning id into cid;

  return cid;
end;
$$;

grant execute on function public.get_or_create_dm(uuid) to authenticated;

create or replace function public.list_my_dms()
returns table (
  conversation_id uuid,
  updated_at timestamptz,
  other_user_id uuid,
  other_username text,
  last_content text,
  last_created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    dc.id,
    dc.updated_at,
    case when dc.user_a = auth.uid() then dc.user_b else dc.user_a end,
    p.username,
    dm.content,
    dm.created_at
  from public.direct_conversations dc
  join public.profiles p
    on p.id = case when dc.user_a = auth.uid() then dc.user_b else dc.user_a end
  left join lateral (
    select m.content, m.created_at
    from public.direct_messages m
    where m.conversation_id = dc.id
    order by m.created_at desc
    limit 1
  ) dm on true
  where dc.user_a = auth.uid() or dc.user_b = auth.uid()
  order by dc.updated_at desc;
$$;

grant execute on function public.list_my_dms() to authenticated;

-- Realtime (if this errors because the table is already published, skip it)
alter publication supabase_realtime add table public.direct_messages;
