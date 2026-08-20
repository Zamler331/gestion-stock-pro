-- Rouvre une commande livree sans modifier le flux de livraison existant.
-- L'operation compense les stocks, conserve l'audit et reste idempotente.

create or replace function public.reopen_delivered_order_atomic(
  p_action_id uuid,
  p_order_id uuid
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
  key_row record;
  delivery_group record;
  fragment record;
  reversal_movement_id uuid;
  restored_from_fragment integer;
  remaining_to_restore integer;
begin
  select * into actor
  from private.require_app_user(array['admin', 'livreur']);

  perform private.lock_action(p_action_id);

  select operation_type, result
  into existing_type, existing_result
  from private.stock_operations
  where action_id = p_action_id;

  if found then
    if existing_type <> 'reopen_delivered_order'
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

  if order_row.status <> 'delivered' then
    raise exception 'Cette commande n''est plus validee';
  end if;

  -- Chaque quantite livree positive doit avoir exactement un mouvement actif
  -- correspondant. Une ancienne commande sans trace fiable n'est pas annulee.
  if exists (
    select 1
    from public.order_items oi
    where oi.order_id = p_order_id
      and coalesce(oi.quantity_delivered, 0) > 0
      and (
        select count(*)
        from public.movements m
        where m.order_item_id = oi.id
          and m.type = 'livraison'
          and m.quantity = oi.quantity_delivered
          and m.destination_location_id = order_row.destination_location_id
          and m.source_location_id is not null
      ) <> 1
  ) then
    raise exception 'Annulation impossible : historique de livraison incomplet';
  end if;

  if exists (
    select 1
    from public.movements m
    join public.order_items oi on oi.id = m.order_item_id
    where oi.order_id = p_order_id
      and m.type = 'livraison'
      and coalesce(oi.quantity_delivered, 0) = 0
  ) then
    raise exception 'Annulation impossible : historique de livraison incoherent';
  end if;

  -- Les verrous sont toujours pris dans le meme ordre pour eviter les
  -- interblocages avec les autres mutations atomiques de stock.
  for key_row in
    select distinct keys.product_id, keys.location_id
    from (
      select m.product_id, m.source_location_id as location_id
      from public.movements m
      join public.order_items oi on oi.id = m.order_item_id
      where oi.order_id = p_order_id
        and m.type = 'livraison'
      union all
      select m.product_id, m.destination_location_id as location_id
      from public.movements m
      join public.order_items oi on oi.id = m.order_item_id
      where oi.order_id = p_order_id
        and m.type = 'livraison'
    ) keys
    where keys.location_id is not null
    order by keys.product_id, keys.location_id
  loop
    perform private.lock_stock_key(key_row.product_id, key_row.location_id);
  end loop;

  for delivery_group in
    with delivered as (
      select
        m.operation_id,
        m.product_id,
        m.source_location_id,
        m.destination_location_id,
        sum(m.quantity)::integer as delivered_quantity
      from public.movements m
      join public.order_items oi on oi.id = m.order_item_id
      where oi.order_id = p_order_id
        and m.type = 'livraison'
      group by
        m.operation_id,
        m.product_id,
        m.source_location_id,
        m.destination_location_id
    ), shortages as (
      select
        e.operation_id,
        e.product_id,
        e.source_location_id,
        e.destination_location_id,
        sum(e.quantity)::integer as shortage_quantity
      from public.movements e
      where e.type = 'ecart_stock'
        and exists (
          select 1
          from public.movements m
          join public.order_items oi on oi.id = m.order_item_id
          where oi.order_id = p_order_id
            and m.type = 'livraison'
            and m.operation_id = e.operation_id
        )
      group by
        e.operation_id,
        e.product_id,
        e.source_location_id,
        e.destination_location_id
    )
    select
      d.*,
      coalesce(s.shortage_quantity, 0)::integer as shortage_quantity,
      (d.delivered_quantity - coalesce(s.shortage_quantity, 0))::integer
        as quantity_to_restore
    from delivered d
    left join shortages s
      on s.operation_id = d.operation_id
      and s.product_id = d.product_id
      and s.source_location_id = d.source_location_id
      and s.destination_location_id = d.destination_location_id
    order by
      d.product_id,
      d.destination_location_id,
      d.source_location_id,
      d.operation_id
  loop
    if delivery_group.shortage_quantity < 0
      or delivery_group.quantity_to_restore < 0 then
      raise exception 'Annulation impossible : ecart de stock incoherent';
    end if;

    if private.available_stock(
      delivery_group.product_id,
      delivery_group.destination_location_id
    ) < delivery_group.delivered_quantity then
      raise exception
        'Annulation impossible : stock du pole insuffisant pour retirer % unite(s)',
        delivery_group.delivered_quantity;
    end if;

    reversal_movement_id := null;

    if delivery_group.quantity_to_restore > 0 then
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
        delivery_group.product_id,
        'annulation_livraison',
        delivery_group.quantity_to_restore,
        delivery_group.destination_location_id,
        delivery_group.source_location_id,
        actor.user_id,
        'Annulation livraison commande ' || p_order_id::text,
        p_action_id
      ) returning id into reversal_movement_id;
    end if;

    remaining_to_restore := delivery_group.quantity_to_restore;

    for fragment in
      select *
      from private.consume_stock(
        delivery_group.product_id,
        delivery_group.destination_location_id,
        delivery_group.delivered_quantity
      )
    loop
      restored_from_fragment := least(
        fragment.consumed_quantity,
        remaining_to_restore
      );

      if restored_from_fragment > 0 then
        insert into public.stock_batches (
          product_id,
          location_id,
          quantity,
          expiration_date,
          source_movement_id
        ) values (
          delivery_group.product_id,
          delivery_group.source_location_id,
          restored_from_fragment,
          fragment.consumed_expiration,
          reversal_movement_id
        );

        remaining_to_restore := remaining_to_restore - restored_from_fragment;
      end if;
    end loop;

    if remaining_to_restore <> 0 then
      raise exception 'Annulation impossible : compensation de stock incomplete';
    end if;

    if delivery_group.shortage_quantity > 0 then
      insert into public.movements (
        product_id,
        type,
        quantity,
        source_location_id,
        user_id,
        annotation,
        operation_id
      ) values (
        delivery_group.product_id,
        'annulation_ecart_stock',
        delivery_group.shortage_quantity,
        delivery_group.destination_location_id,
        actor.user_id,
        'Annulation de l''ecart constate pour la commande ' || p_order_id::text,
        p_action_id
      );
    end if;
  end loop;

  -- Les lignes restent consultables mais ne bloquent plus une nouvelle
  -- livraison de ces memes articles (index unique sur le type livraison).
  update public.movements m
  set type = 'livraison_annulee',
      annotation = coalesce(m.annotation || ' - ', '') ||
        'Validation annulee le ' || statement_timestamp()::text
  from public.order_items oi
  where oi.id = m.order_item_id
    and oi.order_id = p_order_id
    and m.type = 'livraison';

  update public.movements e
  set type = 'ecart_stock_annule',
      annotation = coalesce(e.annotation || ' - ', '') ||
        'Validation annulee le ' || statement_timestamp()::text
  where e.type = 'ecart_stock'
    and exists (
      select 1
      from public.movements m
      join public.order_items oi on oi.id = m.order_item_id
      where oi.order_id = p_order_id
        and m.type = 'livraison_annulee'
        and m.operation_id = e.operation_id
    );

  update public.order_items
  set status = 'pending',
      is_prepared = false
  where order_id = p_order_id;

  update public.orders
  set status = 'pending',
      validated_at = null,
      validated_by = null
  where id = p_order_id;

  insert into private.stock_operations (action_id, operation_type, result)
  values (
    p_action_id,
    'reopen_delivered_order',
    jsonb_build_object('order_id', p_order_id)
  );

  return p_order_id;
end;
$$;

comment on function public.reopen_delivered_order_atomic(uuid, uuid) is
  'Annule atomiquement une validation, compense les lots et remet la commande en attente avec les quantites precedemment saisies.';

revoke execute on function public.reopen_delivered_order_atomic(uuid, uuid)
  from public, anon;
grant execute on function public.reopen_delivered_order_atomic(uuid, uuid)
  to authenticated;
