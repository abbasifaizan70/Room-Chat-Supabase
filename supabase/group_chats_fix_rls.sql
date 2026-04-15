-- Fix "infinite recursion detected in policy for relation group_chat_members".
-- Run once if you already applied an older group_chats.sql before the is_group_member helper.

drop policy if exists "Members read group row" on public.group_chats;
drop policy if exists "Members read membership" on public.group_chat_members;
drop policy if exists "Members read group messages" on public.group_messages;
drop policy if exists "Members send as self in group" on public.group_messages;

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
