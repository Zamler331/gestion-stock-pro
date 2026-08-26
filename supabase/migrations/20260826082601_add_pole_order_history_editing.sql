-- Permet a un pole de corriger les quantites d'une commande encore en attente.
-- Les flux existants de creation et de livraison restent inchanges.

create or replace function public.update_pending_order_atomic(
  p_action_id uuid,
  p_order_id uuid,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor record;
  existing_type text;
  existing_result jsonb;
  order_row record;
begin
  select * into actor
  from private.require_app_user(array['pole']);

  perform private.lock_action(p_action_id);

  select operation_type, result
  into existing_type, existing_result
  from private.stock_operations
  where action_id = p_action_id;

  if found then
    if existing_type <> 'update_pending_order'
      or (existing_result->>'order_id')::uuid is distinct from p_order_id then
      raise exception 'Identifiant deja utilise pour une autre operation';
    end if;

    return p_order_id;
  end if;

  select * into order_row
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Commande introuvable';
  end if;

  if order_row.destination_location_id is distinct from actor.location_id then
    raise exception 'Ce pole ne peut modifier que ses propres commandes'
      using errcode = '42501';
  end if;

  if order_row.status <> 'pending' then
    raise exception 'Cette commande a deja ete livree et ne peut plus etre modifiee';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0 then
    raise exception 'Commande vide' using errcode = '22023';
  end if;

  -- Verrouille les articles dans un ordre stable pour serialiser une edition
  -- avec la preparation du livreur.
  perform oi.id
  from public.order_items oi
  where oi.order_id = p_order_id
  order by oi.id
  for update;

  if exists (
    select 1
    from public.order_items oi
    where oi.order_id = p_order_id
      and oi.is_prepared
  ) then
    raise exception 'Modification impossible : la preparation a deja commence';
  end if;

  if (
    select count(*)
    from jsonb_to_recordset(p_items)
      as item(item_id uuid, quantity_ordered integer)
  ) <> (
    select count(*)
    from public.order_items oi
    where oi.order_id = p_order_id
  ) then
    raise exception 'Chaque article doit etre present une seule fois';
  end if;

  if exists (
    select item.item_id
    from jsonb_to_recordset(p_items)
      as item(item_id uuid, quantity_ordered integer)
    group by item.item_id
    having count(*) > 1
  ) then
    raise exception 'Article duplique dans la commande';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items)
      as item(item_id uuid, quantity_ordered integer)
    left join public.order_items oi
      on oi.id = item.item_id
      and oi.order_id = p_order_id
    where oi.id is null
      or item.quantity_ordered is null
      or item.quantity_ordered <= 0
  ) then
    raise exception 'Detail de commande invalide' using errcode = '22023';
  end if;

  update public.order_items oi
  set quantity_ordered = item.quantity_ordered,
      quantity_delivered = 0,
      status = 'pending',
      is_prepared = false
  from jsonb_to_recordset(p_items)
    as item(item_id uuid, quantity_ordered integer)
  where oi.id = item.item_id
    and oi.order_id = p_order_id;

  insert into private.stock_operations (action_id, operation_type, result)
  values (
    p_action_id,
    'update_pending_order',
    jsonb_build_object(
      'order_id', p_order_id,
      'items_count', jsonb_array_length(p_items)
    )
  );

  return p_order_id;
end;
$$;

comment on function public.update_pending_order_atomic(uuid, uuid, jsonb) is
  'Modifie atomiquement les quantites d une commande pending appartenant au pole connecte, tant que la preparation n a pas commence.';

revoke execute on function public.update_pending_order_atomic(uuid, uuid, jsonb)
  from public, anon;
grant execute on function public.update_pending_order_atomic(uuid, uuid, jsonb)
  to authenticated;
