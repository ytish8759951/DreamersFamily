-- Little Dreamers Family
-- Share encouragement stars integrated with the existing immutable stars ledger.

create unique index if not exists uq_stars_share_reward_once
  on public.stars(family_id, share_id)
  where transaction_type = 'share_reward' and share_id is not null;

create or replace function public.encourage_share_with_stars(
  p_share_id uuid,
  p_stars integer
)
returns public.stars
language plpgsql
security definer
set search_path = public
as $$
declare
  v_share public.shares%rowtype;
  v_star public.stars%rowtype;
  v_key text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required'
      using errcode = '28000';
  end if;

  if p_share_id is null then
    raise exception 'Share is required'
      using errcode = '22023';
  end if;

  if p_stars is null or p_stars < 1 or p_stars > 5 then
    raise exception 'Stars must be between 1 and 5'
      using errcode = '22023';
  end if;

  select *
  into v_share
  from public.shares
  where id = p_share_id
    and deleted_at is null
  for share;

  if not found then
    raise exception 'Share not found'
      using errcode = 'P0002';
  end if;

  if not public.can_write_family(v_share.family_id) then
    raise exception 'Not allowed to encourage this share'
      using errcode = '42501';
  end if;

  select *
  into v_star
  from public.stars
  where family_id = v_share.family_id
    and share_id = v_share.id
    and transaction_type = 'share_reward'
  order by created_at asc
  limit 1;

  if found then
    return v_star;
  end if;

  v_key := 'share_reward:' || v_share.id::text;

  begin
    insert into public.stars (
      family_id,
      child_id,
      amount,
      transaction_type,
      reason,
      task_id,
      share_id,
      dream_id,
      reversal_of_id,
      idempotency_key,
      created_by
    )
    values (
      v_share.family_id,
      v_share.child_id,
      p_stars,
      'share_reward',
      '分享獲得家長鼓勵',
      null,
      v_share.id,
      null,
      null,
      v_key,
      auth.uid()
    )
    returning *
    into v_star;
  exception
    when unique_violation then
      select *
      into v_star
      from public.stars
      where family_id = v_share.family_id
        and share_id = v_share.id
        and transaction_type = 'share_reward'
      order by created_at asc
      limit 1;
  end;

  if v_star.id is null then
    select *
    into v_star
    from public.stars
    where family_id = v_share.family_id
      and idempotency_key = v_key
    limit 1;
  end if;

  if not found then
    raise exception 'Unable to save share encouragement'
      using errcode = 'XX000';
  end if;

  return v_star;
end;
$$;

revoke all on function public.encourage_share_with_stars(uuid, integer) from public;
grant execute on function public.encourage_share_with_stars(uuid, integer) to authenticated;
