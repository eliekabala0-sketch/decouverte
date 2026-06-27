-- P2: controlled read-state update for conversations.
-- Avoids granting broad client-side UPDATE on public.messages.

create or replace function public.mark_conversation_read(
  p_conversation_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  changed_count integer := 0;
begin
  if viewer is null then
    raise exception 'authenticated user required';
  end if;

  if not exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and viewer = any(c.participant_ids)
  ) then
    raise exception 'conversation access denied';
  end if;

  update public.messages m
  set read_at = now()
  where m.conversation_id = p_conversation_id
    and m.sender_id <> viewer
    and m.read_at is null;

  get diagnostics changed_count = row_count;
  return changed_count;
end;
$$;

revoke all on function public.mark_conversation_read(uuid) from public;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
