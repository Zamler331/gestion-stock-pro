-- Une livraison doit refléter la quantité physiquement remise au pôle,
-- même si le stock informatique de la réserve est insuffisant. La réserve
-- est consommée jusqu'à zéro et le manque est journalisé sans créer de stock
-- négatif. Les corrections du tableau Stock global sont regroupées dans une
-- seule transaction afin d'éviter les enregistrements partiels.

create or replace function public.adjust_stock_levels(
  p_action_id uuid,
  p_adjustments jsonb,
  p_annotation text default 'Correction manuelle depuis le stock global'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor record;
  existing_type text;
  adjustment_row record;
  current_quantity integer;
  delta integer;
  movement_id uuid;
  changed_count integer := 0;
begin
  select * into actor from private.require_app_user(array['admin']);
  perform private.lock_action(p_action_id);

  select operation_type into existing_type
  from private.stock_operations
  where action_id = p_action_id;

  if found then
    if existing_type <> 'adjust_stock_levels' then
      raise exception 'Identifiant déjà utilisé pour une autre opération';
    end if;
    return p_action_id;
  end if;

  if p_adjustments is null
    or jsonb_typeof(p_adjustments) <> 'array'
    or jsonb_array_length(p_adjustments) = 0
    or exists (
      select 1
      from jsonb_to_recordset(p_adjustments)
        as x(product_id uuid, location_id uuid, target_quantity integer)
      where x.product_id is null
        or x.location_id is null
        or x.target_quantity is null
        or x.target_quantity < 0
    )
    or exists (
      select x.product_id, x.location_id
      from jsonb_to_recordset(p_adjustments)
        as x(product_id uuid, location_id uuid, target_quantity integer)
      group by x.product_id, x.location_id
      having count(*) > 1
    ) then
    raise exception 'Corrections de stock invalides' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_adjustments)
      as x(product_id uuid, location_id uuid, target_quantity integer)
    left join public.products p on p.id = x.product_id
    left join public.locations l on l.id = x.location_id
    where p.id is null or l.id is null
  ) then
    raise exception 'Produit ou emplacement introuvable';
  end if;

  -- Toutes les clés sont verrouillées dans un ordre stable avant la première
  -- mutation, ce qui rend la correction complète atomique et sans interblocage.
  for adjustment_row in
    select x.product_id, x.location_id
    from jsonb_to_recordset(p_adjustments)
      as x(product_id uuid, location_id uuid, target_quantity integer)
    order by x.product_id, x.location_id
  loop
    perform private.lock_stock_key(
      adjustment_row.product_id,
      adjustment_row.location_id
    );
  end loop;

  for adjustment_row in
    select x.product_id, x.location_id, x.target_quantity
    from jsonb_to_recordset(p_adjustments)
      as x(product_id uuid, location_id uuid, target_quantity integer)
    order by x.product_id, x.location_id
  loop
    current_quantity := private.available_stock(
      adjustment_row.product_id,
      adjustment_row.location_id
    );
    delta := adjustment_row.target_quantity - current_quantity;

    if delta = 0 then
      continue;
    end if;

    insert into public.movements (
      product_id,
      type,
      quantity,
      source_location_id,
      destination_location_id,
      user_id,
      annotation,
      operation_id
    ) values (
      adjustment_row.product_id,
      case when delta < 0 then 'sortie' else 'correction' end,
      abs(delta),
      case when delta < 0 then adjustment_row.location_id else null end,
      case when delta > 0 then adjustment_row.location_id else null end,
      actor.user_id,
      p_annotation,
      p_action_id
    ) returning id into movement_id;

    if delta < 0 then
      perform * from private.consume_stock(
        adjustment_row.product_id,
        adjustment_row.location_id,
        abs(delta)
      );
    else
      insert into public.stock_batches (
        product_id,
        location_id,
        quantity,
        source_movement_id
      ) values (
        adjustment_row.product_id,
        adjustment_row.location_id,
        delta,
        movement_id
      );
    end if;

    changed_count := changed_count + 1;
  end loop;

  insert into private.stock_operations (action_id, operation_type, result)
  values (
    p_action_id,
    'adjust_stock_levels',
    jsonb_build_object('changed_count', changed_count)
  );

  return p_action_id;
end;
$$;

create or replace function public.deliver_order_atomic(
  p_action_id uuid,
  p_order_id uuid,
  p_deliveries jsonb
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
  item_row record;
  key_row record;
  fragment record;
  movement_id uuid;
  available_quantity integer;
  consumed_quantity integer;
  missing_quantity integer;
begin
  select * into actor from private.require_app_user(array['admin', 'livreur']);
  perform private.lock_action(p_action_id);

  select operation_type, result into existing_type, existing_result
  from private.stock_operations
  where action_id = p_action_id;

  if found then
    if existing_type <> 'deliver_order'
      or (existing_result->>'order_id')::uuid is distinct from p_order_id then
      raise exception 'Identifiant déjà utilisé pour une autre opération';
    end if;
    return p_order_id;
  end if;

  -- Compatibilité avec les livraisons enregistrées avant cette migration.
  if exists (select 1 from public.movements where operation_id = p_action_id) then
    return p_order_id;
  end if;

  select * into order_row from public.orders where id = p_order_id for update;
  if not found then raise exception 'Commande introuvable'; end if;
  if order_row.status = 'delivered' then return p_order_id; end if;
  if jsonb_typeof(p_deliveries) <> 'array' then raise exception 'Livraison invalide'; end if;

  if (select count(*) from jsonb_to_recordset(p_deliveries)
      as d(item_id uuid, reserve_id uuid, quantity integer))
     <> (select count(*) from public.order_items where order_id = p_order_id) then
    raise exception 'Chaque article doit être présent une seule fois';
  end if;

  if exists (
    select d.item_id
    from jsonb_to_recordset(p_deliveries)
      as d(item_id uuid, reserve_id uuid, quantity integer)
    group by d.item_id having count(*) > 1
  ) then
    raise exception 'Article dupliqué dans la livraison';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_deliveries)
      as d(item_id uuid, reserve_id uuid, quantity integer)
    left join public.order_items oi
      on oi.id = d.item_id and oi.order_id = p_order_id
    left join public.locations reserve
      on reserve.id = d.reserve_id and reserve.type = 'reserve'
    where oi.id is null
      or d.quantity < 0
      or d.quantity > oi.quantity_ordered
      or (d.quantity > 0 and reserve.id is null)
  ) then
    raise exception 'Détail de livraison invalide';
  end if;

  -- Les stocks source et destination sont verrouillés avant toute mutation.
  for key_row in
    select distinct keys.product_id, keys.location_id
    from (
      select oi.product_id, d.reserve_id as location_id
      from jsonb_to_recordset(p_deliveries)
        as d(item_id uuid, reserve_id uuid, quantity integer)
      join public.order_items oi on oi.id = d.item_id
      where d.quantity > 0
      union all
      select oi.product_id, order_row.destination_location_id
      from jsonb_to_recordset(p_deliveries)
        as d(item_id uuid, reserve_id uuid, quantity integer)
      join public.order_items oi on oi.id = d.item_id
      where d.quantity > 0
    ) keys
    order by keys.product_id, keys.location_id
  loop
    perform private.lock_stock_key(key_row.product_id, key_row.location_id);
  end loop;

  for item_row in
    select oi.*, d.reserve_id, d.quantity as delivered_quantity
    from public.order_items oi
    join jsonb_to_recordset(p_deliveries)
      as d(item_id uuid, reserve_id uuid, quantity integer) on d.item_id = oi.id
    where oi.order_id = p_order_id
    order by oi.id
  loop
    if item_row.delivered_quantity > 0 then
      available_quantity := private.available_stock(
        item_row.product_id,
        item_row.reserve_id
      );
      consumed_quantity := least(item_row.delivered_quantity, available_quantity);
      missing_quantity := item_row.delivered_quantity - consumed_quantity;

      insert into public.movements (
        product_id,
        type,
        quantity,
        source_location_id,
        destination_location_id,
        user_id,
        annotation,
        operation_id,
        order_item_id
      ) values (
        item_row.product_id,
        'livraison',
        item_row.delivered_quantity,
        item_row.reserve_id,
        order_row.destination_location_id,
        actor.user_id,
        'Livraison commande ' || p_order_id::text,
        p_action_id,
        item_row.id
      ) returning id into movement_id;

      if consumed_quantity > 0 then
        for fragment in select * from private.consume_stock(
          item_row.product_id,
          item_row.reserve_id,
          consumed_quantity
        ) loop
          insert into public.stock_batches (
            product_id,
            location_id,
            quantity,
            expiration_date,
            source_movement_id
          ) values (
            item_row.product_id,
            order_row.destination_location_id,
            fragment.consumed_quantity,
            fragment.consumed_expiration,
            movement_id
          );
        end loop;
      end if;

      if missing_quantity > 0 then
        -- La quantité a bien été remise au pôle : elle est donc ajoutée
        -- sans DLC. L'écart reste un journal d'audit et ne retire aucun stock
        -- supplémentaire à la réserve, déjà ramenée à zéro.
        insert into public.stock_batches (
          product_id,
          location_id,
          quantity,
          source_movement_id
        ) values (
          item_row.product_id,
          order_row.destination_location_id,
          missing_quantity,
          movement_id
        );

        insert into public.movements (
          product_id,
          type,
          quantity,
          source_location_id,
          destination_location_id,
          user_id,
          annotation,
          operation_id
        ) values (
          item_row.product_id,
          'ecart_stock',
          missing_quantity,
          item_row.reserve_id,
          order_row.destination_location_id,
          actor.user_id,
          'Stock réserve insuffisant lors de la livraison de la commande ' ||
            p_order_id::text || ' (manque constaté : ' ||
            missing_quantity::text || ')',
          p_action_id
        );
      end if;
    end if;

    update public.order_items
    set quantity_delivered = item_row.delivered_quantity,
        status = case
          when item_row.delivered_quantity = 0 then 'cancelled'
          when item_row.delivered_quantity < item_row.quantity_ordered then 'partial'
          else 'delivered'
        end,
        is_prepared = true
    where id = item_row.id;

    if item_row.delivered_quantity < item_row.quantity_ordered then
      insert into public.notifications (location_id, product_id, message, read)
      values (
        order_row.destination_location_id,
        item_row.product_id,
        'Livraison partielle : ' || item_row.delivered_quantity::text || '/' ||
          item_row.quantity_ordered::text,
        false
      );
    end if;
  end loop;

  update public.orders
  set status = 'delivered',
      validated_at = statement_timestamp(),
      validated_by = actor.user_id
  where id = p_order_id;

  insert into private.stock_operations (action_id, operation_type, result)
  values (
    p_action_id,
    'deliver_order',
    jsonb_build_object('order_id', p_order_id)
  );

  return p_order_id;
end;
$$;

comment on function public.deliver_order_atomic(uuid, uuid, jsonb) is
  'Livre la quantité physique complète, plafonne la réserve à zéro et journalise tout manque en ecart_stock.';

revoke execute on function public.adjust_stock_levels(uuid, jsonb, text)
  from public, anon;
revoke execute on function public.deliver_order_atomic(uuid, uuid, jsonb)
  from public, anon;

grant execute on function public.adjust_stock_levels(uuid, jsonb, text)
  to authenticated;
grant execute on function public.deliver_order_atomic(uuid, uuid, jsonb)
  to authenticated;
