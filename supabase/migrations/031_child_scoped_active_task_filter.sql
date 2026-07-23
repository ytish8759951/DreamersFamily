-- Little Dreamers Family
-- Keep child-scoped task sync aligned with the parent active task list.

create or replace function public.get_child_scoped_repository_state(
  p_child_id uuid,
  p_device_binding_id text,
  p_device_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child public.children%rowtype;
  v_binding public.device_bindings%rowtype;
  v_parent_id uuid;
  v_today date := public.taipei_today();
begin
  select binding_row.*
  into v_binding
  from public.device_bindings as binding_row
  where binding_row.id = p_device_binding_id
    and binding_row.child_id = p_child_id
    and binding_row.device_id = p_device_id
    and binding_row.binding_status = 'bound'
    and coalesce(binding_row.device_binding_status, 'active') = 'active'
    and binding_row.revoked_at is null
    and binding_row.replaced_at is null
  limit 1;

  if not found then
    raise exception 'Child device binding is invalid'
      using errcode = '28000';
  end if;

  select child_row.*
  into v_child
  from public.children as child_row
  where child_row.id = p_child_id
    and child_row.family_id = v_binding.family_id
    and child_row.status = 'active'
  limit 1;

  if not found then
    raise exception 'Child is not active'
      using errcode = '28000';
  end if;

  perform public._ensure_daily_task_instances(v_child.family_id, v_child.id, v_today);

  v_parent_id := coalesce(v_child.parent_id, v_child.created_by);

  update public.device_bindings as binding_row
  set last_heartbeat_at = now(),
      updated_at = now()
  where binding_row.id = v_binding.id;

  return jsonb_build_object(
    'family_id', v_child.family_id,
    'parent_id', v_parent_id,
    'child_id', v_child.id,
    'updated_at', now(),
    'child', to_jsonb(v_child),
    'device_binding', to_jsonb(v_binding),
    'device_bindings', coalesce((select jsonb_agg(to_jsonb(binding_row) order by binding_row.updated_at desc) from public.device_bindings as binding_row where binding_row.id = v_binding.id), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(to_jsonb(task_row) order by task_row.updated_at desc)
      from public.tasks as task_row
      where task_row.family_id = v_child.family_id
        and task_row.child_id = v_child.id
        and task_row.archived_at is null
        and task_row.status not in ('cancelled', 'expired')
        and (
          task_row.category <> 'daily'
          or (
            coalesce(task_row.daily_template_active, false) = false
            and task_row.occurrence_date = v_today
          )
        )
    ), '[]'::jsonb),
    'task_records', coalesce((
      select jsonb_agg(to_jsonb(record_row) order by record_row.created_at desc)
      from public.task_records as record_row
      where record_row.family_id = v_child.family_id
        and record_row.child_id = v_child.id
        and exists (
          select 1
          from public.tasks as task_row
          where task_row.id = record_row.task_id
            and task_row.family_id = v_child.family_id
            and task_row.child_id = v_child.id
            and task_row.archived_at is null
            and task_row.status not in ('cancelled', 'expired')
            and (
              task_row.category <> 'daily'
              or (
                coalesce(task_row.daily_template_active, false) = false
                and task_row.occurrence_date = v_today
              )
            )
        )
    ), '[]'::jsonb),
    'stars', coalesce((select jsonb_agg(to_jsonb(star_row) order by star_row.created_at desc) from public.stars as star_row where star_row.family_id = v_child.family_id and star_row.child_id = v_child.id), '[]'::jsonb),
    'piggy_bank_records', coalesce((select jsonb_agg(to_jsonb(piggy_row) order by piggy_row.created_at desc) from public.piggy_bank_records as piggy_row where piggy_row.family_id = v_child.family_id and piggy_row.child_id = v_child.id), '[]'::jsonb),
    'store_items', coalesce((select jsonb_agg(to_jsonb(store_row) order by store_row.updated_at desc) from public.store_items as store_row where store_row.family_id = v_child.family_id and store_row.child_id = v_child.id), '[]'::jsonb),
    'purchases', coalesce((select jsonb_agg(to_jsonb(purchase_row) order by purchase_row.updated_at desc) from public.purchases as purchase_row where purchase_row.family_id = v_child.family_id and purchase_row.child_id = v_child.id), '[]'::jsonb),
    'dreams', coalesce((select jsonb_agg(to_jsonb(dream_row) order by dream_row.updated_at desc) from public.dreams as dream_row where dream_row.family_id = v_child.family_id and dream_row.child_id = v_child.id), '[]'::jsonb),
    'dream_funds', coalesce((select jsonb_agg(to_jsonb(fund_row) order by fund_row.created_at desc) from public.dream_funds as fund_row where fund_row.family_id = v_child.family_id and fund_row.child_id = v_child.id), '[]'::jsonb),
    'shares', coalesce((select jsonb_agg(to_jsonb(share_row) order by share_row.updated_at desc) from public.shares as share_row where share_row.family_id = v_child.family_id and share_row.child_id = v_child.id), '[]'::jsonb),
    'share_media', coalesce((select jsonb_agg(to_jsonb(media_row) order by media_row.created_at desc) from public.share_media as media_row where media_row.family_id = v_child.family_id and media_row.child_id = v_child.id), '[]'::jsonb),
    'encouragement_cards', coalesce((select jsonb_agg(to_jsonb(card_row) order by card_row.updated_at desc) from public.encouragement_cards as card_row where card_row.family_id = v_child.family_id and card_row.child_id = v_child.id), '[]'::jsonb),
    'special_days', coalesce((select jsonb_agg(to_jsonb(day_row) order by day_row.updated_at desc) from public.special_days as day_row where day_row.family_id = v_child.family_id and (day_row.child_id = v_child.id or day_row.child_id is null)), '[]'::jsonb),
    'growth_records', coalesce((select jsonb_agg(to_jsonb(growth_row) order by growth_row.updated_at desc) from public.growth_records as growth_row where growth_row.family_id = v_child.family_id and growth_row.child_id = v_child.id), '[]'::jsonb),
    'tablet_time', coalesce((select jsonb_agg(to_jsonb(tablet_row) order by tablet_row.updated_at desc) from public.tablet_time as tablet_row where tablet_row.family_id = v_child.family_id and tablet_row.child_id = v_child.id), '[]'::jsonb),
    'badges', coalesce((select jsonb_agg(to_jsonb(badge_row) order by badge_row.created_at desc) from public.badges as badge_row where badge_row.family_id = v_child.family_id), '[]'::jsonb),
    'child_badges', coalesce((select jsonb_agg(to_jsonb(child_badge_row) order by child_badge_row.awarded_at desc) from public.child_badges as child_badge_row where child_badge_row.family_id = v_child.family_id and child_badge_row.child_id = v_child.id), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_child_scoped_repository_state(uuid, text, uuid) from public;
grant execute on function public.get_child_scoped_repository_state(uuid, text, uuid) to anon, authenticated;
