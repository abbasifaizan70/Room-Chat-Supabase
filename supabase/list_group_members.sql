-- Run once if members list / "In group" in Add people is broken (0 people).
-- Adds list_group_members RPC used by the app instead of querying group_chat_members directly.

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
