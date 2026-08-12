-- Unifie la gestion de stock autour de stock_batches et rend chaque mutation
-- atomique, sérialisée et idempotente.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.stock_operations (
  action_id uuid primary key,
  operation_type text not null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default statement_timestamp()
);
revoke all on table private.stock_operations from public, anon, authenticated;

alter table public.movements
  add column if not exists operation_id uuid,
  add column if not exists order_item_id uuid;

alter table public.orders
  add column if not exists action_id uuid;

create unique index if not exists orders_action_id_unique
  on public.orders (action_id) where action_id is not null;

create unique index if not exists movements_order_item_delivery_unique
  on public.movements (order_item_id)
  where order_item_id is not null and type in ('livraison', 'transfert_libre');

create index if not exists movements_operation_id_idx
  on public.movements (operation_id) where operation_id is not null;

create index if not exists movements_product_id_idx
  on public.movements (product_id);

create index if not exists movements_source_location_id_idx
  on public.movements (source_location_id);

create index if not exists movements_destination_location_id_idx
  on public.movements (destination_location_id);

create index if not exists stock_batches_product_location_idx
  on public.stock_batches (product_id, location_id, expiration_date, created_at);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'movements_order_item_id_fkey'
      and conrelid = 'public.movements'::regclass
  ) then
    alter table public.movements
      add constraint movements_order_item_id_fkey
      foreign key (order_item_id) references public.order_items(id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'stock_batches_quantity_nonnegative'
      and conrelid = 'public.stock_batches'::regclass
  ) then
    alter table public.stock_batches
      add constraint stock_batches_quantity_nonnegative check (quantity >= 0);
  end if;
end $$;

-- Les deux références historiques orphelines sont conservées mais détachées
-- avant d'ajouter la clé étrangère qui empêchera de nouveaux orphelins.
update public.stock_batches b
set source_movement_id = null
where source_movement_id is not null
  and not exists (
    select 1 from public.movements m where m.id = b.source_movement_id
  );

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'stock_batches_source_movement_id_fkey'
      and conrelid = 'public.stock_batches'::regclass
  ) then
    alter table public.stock_batches
      add constraint stock_batches_source_movement_id_fkey
      foreign key (source_movement_id) references public.movements(id)
      on delete restrict;
  end if;
end $$;

create or replace function private.require_app_user(p_roles text[])
returns table(user_id uuid, app_role text, location_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Utilisateur non authentifié' using errcode = '42501';
  end if;

  return query
  select p.id, p.role, p.location_id
  from public.profiles p
  where p.id = (select auth.uid())
    and p.role = any(p_roles);

  if not found then
    raise exception 'Opération non autorisée' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.assert_location_access(p_location_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor record;
begin
  select * into actor
  from private.require_app_user(array['admin', 'livreur', 'pole']);

  if actor.app_role = 'pole' and actor.location_id is distinct from p_location_id then
    raise exception 'Ce pôle ne peut modifier que son propre stock' using errcode = '42501';
  end if;
end;
$$;

-- Helpers RLS : ils ne renvoient que le rôle et l'emplacement du JWT courant.
-- Leur schéma reste hors Data API et seules ces fonctions de lecture seront
-- exécutables par le rôle authenticated.
create or replace function private.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = (select auth.uid())
$$;

create or replace function private.current_location_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.location_id from public.profiles p where p.id = (select auth.uid())
$$;

create or replace function private.can_access_location(p_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p.role in ('admin', 'livreur') then true
    when p.role = 'pole' then p.location_id = p_location_id
    else false
  end
  from public.profiles p
  where p.id = (select auth.uid())
$$;

create or replace function private.lock_action(p_action_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_action_id is null then
    raise exception 'Identifiant idempotent manquant' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('stock-action:' || p_action_id::text, 0)
  );
end;
$$;

create or replace function private.lock_stock_key(p_product_id uuid, p_location_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'stock-key:' || p_product_id::text || ':' || p_location_id::text,
      0
    )
  );
end;
$$;

create or replace function private.available_stock(p_product_id uuid, p_location_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(b.quantity), 0)::integer
  from public.stock_batches b
  left join public.movements m on m.id = b.source_movement_id
  where b.product_id = p_product_id
    and b.location_id = p_location_id
    and b.quantity > 0
    and (b.expiration_date is null or b.expiration_date >= current_date)
    and (m.effective_date is null or m.effective_date <= statement_timestamp())
$$;

create or replace function private.consume_stock(
  p_product_id uuid,
  p_location_id uuid,
  p_quantity integer
)
returns table(consumed_expiration date, consumed_quantity integer)
language plpgsql
set search_path = ''
as $$
declare
  remaining integer := p_quantity;
  batch_row record;
  taken integer;
begin
  if p_quantity <= 0 then
    raise exception 'Quantité invalide' using errcode = '22023';
  end if;

  for batch_row in
    select b.id, b.quantity, b.expiration_date
    from public.stock_batches b
    left join public.movements m on m.id = b.source_movement_id
    where b.product_id = p_product_id
      and b.location_id = p_location_id
      and b.quantity > 0
      and (b.expiration_date is null or b.expiration_date >= current_date)
      and (m.effective_date is null or m.effective_date <= statement_timestamp())
    order by b.expiration_date asc nulls last, b.created_at asc, b.id asc
    for update of b
  loop
    exit when remaining = 0;
    taken := least(batch_row.quantity, remaining);

    if taken = batch_row.quantity then
      delete from public.stock_batches where id = batch_row.id;
    else
      update public.stock_batches
      set quantity = quantity - taken
      where id = batch_row.id;
    end if;

    remaining := remaining - taken;
    consumed_expiration := batch_row.expiration_date;
    consumed_quantity := taken;
    return next;
  end loop;

  if remaining > 0 then
    raise exception 'Stock insuffisant (disponible: %, demandé: %)',
      p_quantity - remaining, p_quantity using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.record_stock_entry(
  p_action_id uuid,
  p_product_id uuid,
  p_location_id uuid,
  p_quantity integer,
  p_expiration_date date default null,
  p_effective_date timestamptz default null,
  p_annotation text default null,
  p_movement_type text default 'entry'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor record;
  movement_id uuid;
begin
  select * into actor from private.require_app_user(array['admin', 'livreur']);
  perform private.lock_action(p_action_id);

  select id into movement_id from public.movements where action_id = p_action_id;
  if movement_id is not null then return movement_id; end if;

  if p_quantity <= 0 or p_movement_type not in ('entry', 'correction', 'transfert_libre') then
    raise exception 'Paramètres de mouvement invalides' using errcode = '22023';
  end if;

  perform private.lock_stock_key(p_product_id, p_location_id);

  insert into public.movements (
    product_id, type, quantity, destination_location_id, user_id,
    annotation, action_id, effective_date
  ) values (
    p_product_id, p_movement_type, p_quantity, p_location_id, actor.user_id,
    p_annotation, p_action_id, coalesce(p_effective_date, statement_timestamp())
  ) returning id into movement_id;

  insert into public.stock_batches (
    product_id, location_id, quantity, expiration_date, source_movement_id
  ) values (
    p_product_id, p_location_id, p_quantity, p_expiration_date, movement_id
  );

  return movement_id;
end;
$$;

create or replace function public.record_stock_exit(
  p_action_id uuid,
  p_product_id uuid,
  p_location_id uuid,
  p_quantity integer,
  p_annotation text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor record;
  movement_id uuid;
begin
  select * into actor from private.require_app_user(array['admin', 'livreur', 'pole']);
  perform private.assert_location_access(p_location_id);
  perform private.lock_action(p_action_id);

  select id into movement_id from public.movements where action_id = p_action_id;
  if movement_id is not null then return movement_id; end if;

  if p_quantity <= 0 then raise exception 'Quantité invalide' using errcode = '22023'; end if;
  perform private.lock_stock_key(p_product_id, p_location_id);

  insert into public.movements (
    product_id, type, quantity, source_location_id, user_id, annotation, action_id
  ) values (
    p_product_id, 'sortie', p_quantity, p_location_id, actor.user_id,
    p_annotation, p_action_id
  ) returning id into movement_id;

  perform * from private.consume_stock(p_product_id, p_location_id, p_quantity);
  return movement_id;
end;
$$;

create or replace function public.record_stock_exits(
  p_action_id uuid,
  p_location_id uuid,
  p_exits jsonb,
  p_annotation text default 'Sortie de stock'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor record;
  existing_type text;
  exit_row record;
  movement_id uuid;
begin
  select * into actor from private.require_app_user(array['admin', 'livreur', 'pole']);
  perform private.assert_location_access(p_location_id);
  perform private.lock_action(p_action_id);

  select operation_type into existing_type
  from private.stock_operations where action_id = p_action_id;
  if found then
    if existing_type <> 'stock_exits' then
      raise exception 'Identifiant déjà utilisé pour une autre opération';
    end if;
    return p_action_id;
  end if;

  if p_exits is null or jsonb_typeof(p_exits) <> 'array' or jsonb_array_length(p_exits) = 0 then
    raise exception 'Aucune sortie à enregistrer' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_exits) as x(product_id uuid, quantity integer)
    where x.product_id is null or x.quantity <= 0
  ) then
    raise exception 'Sortie invalide' using errcode = '22023';
  end if;

  -- Une seule clé par produit, verrouillée dans un ordre stable.
  for exit_row in
    select x.product_id, sum(x.quantity)::integer as quantity
    from jsonb_to_recordset(p_exits) as x(product_id uuid, quantity integer)
    group by x.product_id order by x.product_id
  loop
    perform private.lock_stock_key(exit_row.product_id, p_location_id);
  end loop;

  for exit_row in
    select x.product_id, sum(x.quantity)::integer as quantity
    from jsonb_to_recordset(p_exits) as x(product_id uuid, quantity integer)
    group by x.product_id order by x.product_id
  loop
    if private.available_stock(exit_row.product_id, p_location_id) < exit_row.quantity then
      raise exception 'Stock insuffisant pour le produit %', exit_row.product_id using errcode = 'P0001';
    end if;

    insert into public.movements (
      product_id, type, quantity, source_location_id, user_id,
      annotation, operation_id
    ) values (
      exit_row.product_id, 'sortie', exit_row.quantity, p_location_id,
      actor.user_id, p_annotation, p_action_id
    ) returning id into movement_id;

    perform * from private.consume_stock(exit_row.product_id, p_location_id, exit_row.quantity);
  end loop;

  insert into private.stock_operations(action_id, operation_type, result)
  values (p_action_id, 'stock_exits', jsonb_build_object('count', jsonb_array_length(p_exits)));
  return p_action_id;
end;
$$;

create or replace function public.adjust_stock_level(
  p_action_id uuid,
  p_product_id uuid,
  p_location_id uuid,
  p_target_quantity integer,
  p_annotation text default 'Correction manuelle stock'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor record;
  movement_id uuid;
  current_quantity integer;
  delta integer;
begin
  select * into actor from private.require_app_user(array['admin', 'livreur', 'pole']);
  perform private.assert_location_access(p_location_id);
  perform private.lock_action(p_action_id);

  select id into movement_id from public.movements where action_id = p_action_id;
  if movement_id is not null then return movement_id; end if;
  if p_target_quantity < 0 then raise exception 'Quantité invalide' using errcode = '22023'; end if;

  perform private.lock_stock_key(p_product_id, p_location_id);
  current_quantity := private.available_stock(p_product_id, p_location_id);
  delta := p_target_quantity - current_quantity;

  -- Journalise aussi un ajustement sans écart : si la réponse réseau se perd,
  -- une reprise avec le même action_id restera un no-op même si le stock change.
  if delta = 0 then
    insert into public.movements (
      product_id, type, quantity, destination_location_id,
      user_id, annotation, action_id
    ) values (
      p_product_id, 'correction', 0, p_location_id,
      actor.user_id, p_annotation, p_action_id
    ) returning id into movement_id;
    return movement_id;
  end if;

  insert into public.movements (
    product_id, type, quantity, source_location_id, destination_location_id,
    user_id, annotation, action_id
  ) values (
    p_product_id,
    case when delta < 0 then 'sortie' else 'correction' end,
    abs(delta),
    case when delta < 0 then p_location_id else null end,
    case when delta > 0 then p_location_id else null end,
    actor.user_id, p_annotation, p_action_id
  ) returning id into movement_id;

  if delta < 0 then
    perform * from private.consume_stock(p_product_id, p_location_id, abs(delta));
  else
    insert into public.stock_batches (
      product_id, location_id, quantity, source_movement_id
    ) values (p_product_id, p_location_id, delta, movement_id);
  end if;

  return movement_id;
end;
$$;

create or replace function public.adjust_stock_batch(
  p_action_id uuid,
  p_batch_id uuid,
  p_target_quantity integer,
  p_annotation text default 'Correction manuelle lot DLC'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor record;
  batch_row record;
  movement_id uuid;
  delta integer;
begin
  select * into actor from private.require_app_user(array['admin', 'livreur', 'pole']);
  perform private.lock_action(p_action_id);
  select id into movement_id from public.movements where action_id = p_action_id;
  if movement_id is not null then return movement_id; end if;
  if p_target_quantity < 0 then raise exception 'Quantité invalide' using errcode = '22023'; end if;

  -- Read the stock key first, then take the same advisory lock used by every
  -- other stock mutation before locking the batch row. This global lock order
  -- prevents a batch correction and a FIFO consumption from deadlocking.
  select * into batch_row from public.stock_batches where id = p_batch_id;
  if not found then raise exception 'Lot introuvable'; end if;
  perform private.assert_location_access(batch_row.location_id);
  perform private.lock_stock_key(batch_row.product_id, batch_row.location_id);
  select * into batch_row from public.stock_batches where id = p_batch_id for update;
  if not found then raise exception 'Lot introuvable'; end if;
  delta := p_target_quantity - batch_row.quantity;
  if delta = 0 then
    insert into public.movements (
      product_id, type, quantity, destination_location_id,
      user_id, annotation, action_id
    ) values (
      batch_row.product_id, 'correction', 0, batch_row.location_id,
      actor.user_id, p_annotation, p_action_id
    ) returning id into movement_id;
    return movement_id;
  end if;

  insert into public.movements (
    product_id, type, quantity, source_location_id, destination_location_id,
    user_id, annotation, action_id
  ) values (
    batch_row.product_id,
    case when delta < 0 then 'sortie' else 'correction' end,
    abs(delta),
    case when delta < 0 then batch_row.location_id else null end,
    case when delta > 0 then batch_row.location_id else null end,
    actor.user_id, p_annotation, p_action_id
  ) returning id into movement_id;

  if p_target_quantity = 0 then
    delete from public.stock_batches where id = p_batch_id;
  else
    update public.stock_batches set quantity = p_target_quantity where id = p_batch_id;
  end if;
  return movement_id;
end;
$$;

create or replace function public.reconcile_stock_batches(
  p_action_id uuid,
  p_location_id uuid,
  p_batch_targets jsonb default '[]'::jsonb,
  p_new_batch jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor record;
  existing_type text;
  existing_result jsonb;
  target_row record;
  batch_row record;
  new_product_id uuid;
  new_quantity integer;
  new_expiration date;
  delta integer;
  movement_id uuid;
  changed_count integer := 0;
  result_value jsonb;
begin
  select * into actor from private.require_app_user(array['admin', 'livreur', 'pole']);
  perform private.assert_location_access(p_location_id);
  perform private.lock_action(p_action_id);

  select operation_type, result into existing_type, existing_result
  from private.stock_operations where action_id = p_action_id;
  if found then
    if existing_type <> 'reconcile_stock_batches' then
      raise exception 'Identifiant déjà utilisé pour une autre opération';
    end if;
    return existing_result;
  end if;

  if p_batch_targets is null or jsonb_typeof(p_batch_targets) <> 'array'
    or exists (
      select 1 from jsonb_to_recordset(p_batch_targets)
        as x(batch_id uuid, target_quantity integer)
      where x.batch_id is null or x.target_quantity < 0
    ) or exists (
      select x.batch_id from jsonb_to_recordset(p_batch_targets)
        as x(batch_id uuid, target_quantity integer)
      group by x.batch_id having count(*) > 1
    ) then
    raise exception 'Correction de lots invalide' using errcode = '22023';
  end if;

  if (select count(*) from jsonb_to_recordset(p_batch_targets)
      as x(batch_id uuid, target_quantity integer))
     <> (select count(*) from public.stock_batches b
         join jsonb_to_recordset(p_batch_targets)
           as x(batch_id uuid, target_quantity integer) on x.batch_id = b.id
         where b.location_id = p_location_id) then
    raise exception 'Lot introuvable ou emplacement incorrect';
  end if;

  if p_new_batch is not null then
    new_product_id := (p_new_batch->>'product_id')::uuid;
    new_quantity := (p_new_batch->>'quantity')::integer;
    new_expiration := (p_new_batch->>'expiration_date')::date;
    if actor.app_role not in ('admin', 'livreur') then
      raise exception 'Ajout de lot non autorisé' using errcode = '42501';
    end if;
    if new_product_id is null or new_quantity <= 0 or new_expiration is null then
      raise exception 'Nouveau lot invalide' using errcode = '22023';
    end if;
  end if;

  -- Verrouille toutes les clés avant les lignes de lots, toujours dans le même ordre.
  for target_row in
    select distinct keys.product_id
    from (
      select b.product_id
      from public.stock_batches b
      join jsonb_to_recordset(p_batch_targets)
        as x(batch_id uuid, target_quantity integer) on x.batch_id = b.id
      union all
      select new_product_id where new_product_id is not null
    ) keys
    order by keys.product_id
  loop
    perform private.lock_stock_key(target_row.product_id, p_location_id);
  end loop;

  for target_row in
    select x.batch_id, x.target_quantity
    from jsonb_to_recordset(p_batch_targets)
      as x(batch_id uuid, target_quantity integer)
    order by x.batch_id
  loop
    select * into batch_row from public.stock_batches where id = target_row.batch_id for update;
    if not found or batch_row.location_id is distinct from p_location_id then
      raise exception 'Lot introuvable ou déplacé';
    end if;
    delta := target_row.target_quantity - batch_row.quantity;
    if delta = 0 then continue; end if;

    insert into public.movements(
      product_id, type, quantity, source_location_id, destination_location_id,
      user_id, annotation, operation_id
    ) values (
      batch_row.product_id,
      case when delta < 0 then 'sortie' else 'correction' end,
      abs(delta),
      case when delta < 0 then p_location_id else null end,
      case when delta > 0 then p_location_id else null end,
      actor.user_id, 'Correction manuelle lot DLC', p_action_id
    ) returning id into movement_id;

    if target_row.target_quantity = 0 then
      delete from public.stock_batches where id = target_row.batch_id;
    else
      update public.stock_batches set quantity = target_row.target_quantity
      where id = target_row.batch_id;
    end if;
    changed_count := changed_count + 1;
  end loop;

  if new_product_id is not null then
    insert into public.movements(
      product_id, type, quantity, destination_location_id,
      user_id, annotation, operation_id, effective_date
    ) values (
      new_product_id, 'correction', new_quantity, p_location_id,
      actor.user_id, 'Ajout manuel lot DLC', p_action_id, statement_timestamp()
    ) returning id into movement_id;
    insert into public.stock_batches(
      product_id, location_id, quantity, expiration_date, source_movement_id
    ) values (
      new_product_id, p_location_id, new_quantity, new_expiration, movement_id
    );
    changed_count := changed_count + 1;
  end if;

  if changed_count = 0 then
    raise exception 'Aucune modification à valider' using errcode = '22023';
  end if;
  result_value := jsonb_build_object('changed_count', changed_count);
  insert into private.stock_operations(action_id, operation_type, result)
  values (p_action_id, 'reconcile_stock_batches', result_value);
  return result_value;
end;
$$;

create or replace function public.transfer_stock(
  p_action_id uuid,
  p_product_id uuid,
  p_source_location_id uuid,
  p_destination_location_id uuid,
  p_quantity integer,
  p_annotation text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor record;
  movement_id uuid;
  fragment record;
begin
  select * into actor from private.require_app_user(array['admin', 'livreur']);
  perform private.lock_action(p_action_id);
  select id into movement_id from public.movements where action_id = p_action_id;
  if movement_id is not null then return movement_id; end if;
  if p_quantity <= 0 or p_source_location_id = p_destination_location_id then
    raise exception 'Transfert invalide' using errcode = '22023';
  end if;

  if p_source_location_id::text < p_destination_location_id::text then
    perform private.lock_stock_key(p_product_id, p_source_location_id);
    perform private.lock_stock_key(p_product_id, p_destination_location_id);
  else
    perform private.lock_stock_key(p_product_id, p_destination_location_id);
    perform private.lock_stock_key(p_product_id, p_source_location_id);
  end if;

  insert into public.movements (
    product_id, type, quantity, source_location_id, destination_location_id,
    user_id, annotation, action_id
  ) values (
    p_product_id, 'transfert', p_quantity, p_source_location_id,
    p_destination_location_id, actor.user_id, p_annotation, p_action_id
  ) returning id into movement_id;

  for fragment in select * from private.consume_stock(
    p_product_id, p_source_location_id, p_quantity
  ) loop
    insert into public.stock_batches (
      product_id, location_id, quantity, expiration_date, source_movement_id
    ) values (
      p_product_id, p_destination_location_id, fragment.consumed_quantity,
      fragment.consumed_expiration, movement_id
    );
  end loop;
  return movement_id;
end;
$$;

create or replace function public.create_order_atomic(
  p_action_id uuid,
  p_destination_location_id uuid,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor record;
  order_id uuid;
begin
  select * into actor from private.require_app_user(array['admin', 'pole']);
  if actor.app_role = 'pole' and actor.location_id is distinct from p_destination_location_id then
    raise exception 'Destination non autorisée' using errcode = '42501';
  end if;
  perform private.lock_action(p_action_id);
  select id into order_id from public.orders where action_id = p_action_id;
  if order_id is not null then return order_id; end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Commande vide' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as x(product_id uuid, quantity_ordered integer)
    where x.product_id is null or x.quantity_ordered <= 0
  ) then
    raise exception 'Article de commande invalide' using errcode = '22023';
  end if;

  insert into public.orders (destination_location_id, status, action_id)
  values (p_destination_location_id, 'pending', p_action_id)
  returning id into order_id;

  insert into public.order_items (order_id, product_id, quantity_ordered)
  select order_id, x.product_id, sum(x.quantity_ordered)::integer
  from jsonb_to_recordset(p_items) as x(product_id uuid, quantity_ordered integer)
  group by x.product_id;
  return order_id;
end;
$$;

create or replace function public.submit_pole_inventory_and_orders(
  p_action_id uuid,
  p_location_id uuid,
  p_adjustments jsonb default '[]'::jsonb,
  p_order_groups jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor record;
  existing_type text;
  existing_result jsonb;
  adjustment_row record;
  group_row record;
  item_row record;
  current_quantity integer;
  delta integer;
  movement_id uuid;
  order_id uuid;
  updated_count integer := 0;
  orders_count integer := 0;
  result_value jsonb;
begin
  select * into actor from private.require_app_user(array['admin', 'pole']);
  if actor.app_role = 'pole' and actor.location_id is distinct from p_location_id then
    raise exception 'Pôle non autorisé' using errcode = '42501';
  end if;
  perform private.lock_action(p_action_id);

  select operation_type, result into existing_type, existing_result
  from private.stock_operations where action_id = p_action_id;
  if found then
    if existing_type <> 'pole_inventory_and_orders' then
      raise exception 'Identifiant déjà utilisé pour une autre opération';
    end if;
    return existing_result;
  end if;

  if p_adjustments is null or jsonb_typeof(p_adjustments) <> 'array'
    or p_order_groups is null or jsonb_typeof(p_order_groups) <> 'array' then
    raise exception 'Contenu de validation invalide' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_adjustments)
      as x(product_id uuid, target_quantity integer)
    where x.product_id is null or x.target_quantity < 0
  ) or exists (
    select x.product_id from jsonb_to_recordset(p_adjustments)
      as x(product_id uuid, target_quantity integer)
    group by x.product_id having count(*) > 1
  ) then
    raise exception 'Ajustement de stock invalide' using errcode = '22023';
  end if;

  for adjustment_row in
    select x.product_id, x.target_quantity
    from jsonb_to_recordset(p_adjustments)
      as x(product_id uuid, target_quantity integer)
    order by x.product_id
  loop
    perform private.lock_stock_key(adjustment_row.product_id, p_location_id);
  end loop;

  for adjustment_row in
    select x.product_id, x.target_quantity
    from jsonb_to_recordset(p_adjustments)
      as x(product_id uuid, target_quantity integer)
    order by x.product_id
  loop
    current_quantity := private.available_stock(adjustment_row.product_id, p_location_id);
    delta := adjustment_row.target_quantity - current_quantity;
    if delta = 0 then continue; end if;

    insert into public.movements (
      product_id, type, quantity, source_location_id, destination_location_id,
      user_id, annotation, operation_id
    ) values (
      adjustment_row.product_id,
      case when delta < 0 then 'sortie' else 'correction' end,
      abs(delta),
      case when delta < 0 then p_location_id else null end,
      case when delta > 0 then p_location_id else null end,
      actor.user_id, 'Inventaire pôle', p_action_id
    ) returning id into movement_id;

    if delta < 0 then
      perform * from private.consume_stock(adjustment_row.product_id, p_location_id, abs(delta));
    else
      insert into public.stock_batches(product_id, location_id, quantity, source_movement_id)
      values (adjustment_row.product_id, p_location_id, delta, movement_id);
    end if;
    updated_count := updated_count + 1;
  end loop;

  for group_row in
    select value as items from jsonb_array_elements(p_order_groups)
  loop
    if jsonb_typeof(group_row.items) <> 'array' or jsonb_array_length(group_row.items) = 0
      or exists (
        select 1 from jsonb_to_recordset(group_row.items)
          as x(product_id uuid, quantity_ordered integer)
        where x.product_id is null or x.quantity_ordered <= 0
      ) then
      raise exception 'Groupe de commande invalide' using errcode = '22023';
    end if;

    insert into public.orders(destination_location_id, status)
    values (p_location_id, 'pending') returning id into order_id;

    insert into public.order_items(order_id, product_id, quantity_ordered)
    select order_id, x.product_id, sum(x.quantity_ordered)::integer
    from jsonb_to_recordset(group_row.items)
      as x(product_id uuid, quantity_ordered integer)
    group by x.product_id;
    orders_count := orders_count + 1;
  end loop;

  if updated_count = 0 and orders_count = 0 then
    raise exception 'Aucune modification à valider' using errcode = '22023';
  end if;

  result_value := jsonb_build_object(
    'updated_count', updated_count,
    'orders_count', orders_count
  );
  insert into private.stock_operations(action_id, operation_type, result)
  values (p_action_id, 'pole_inventory_and_orders', result_value);
  return result_value;
end;
$$;

create or replace function public.set_order_item_prepared(
  p_item_id uuid,
  p_is_prepared boolean,
  p_quantity_delivered integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_row record;
begin
  perform * from private.require_app_user(array['admin', 'livreur']);
  select * into item_row from public.order_items where id = p_item_id for update;
  if not found then raise exception 'Article introuvable'; end if;
  if p_quantity_delivered < 0 or p_quantity_delivered > item_row.quantity_ordered then
    raise exception 'Quantité livrée invalide' using errcode = '22023';
  end if;
  update public.order_items
  set is_prepared = p_is_prepared, quantity_delivered = p_quantity_delivered
  where id = p_item_id;
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
  order_row record;
  item_row record;
  key_row record;
  fragment record;
  movement_id uuid;
begin
  select * into actor from private.require_app_user(array['admin', 'livreur']);
  perform private.lock_action(p_action_id);

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
    from jsonb_to_recordset(p_deliveries) as d(item_id uuid, reserve_id uuid, quantity integer)
    group by d.item_id having count(*) > 1
  ) then
    raise exception 'Article dupliqué dans la livraison';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_deliveries) as d(item_id uuid, reserve_id uuid, quantity integer)
    left join public.order_items oi on oi.id = d.item_id and oi.order_id = p_order_id
    where oi.id is null or d.quantity < 0 or d.quantity > oi.quantity_ordered
      or (d.quantity > 0 and d.reserve_id is null)
  ) then
    raise exception 'Détail de livraison invalide';
  end if;

  -- Verrouille toutes les clés dans un ordre stable avant toute mutation.
  for key_row in
    select distinct keys.product_id, keys.location_id
    from (
      select oi.product_id, d.reserve_id as location_id
      from jsonb_to_recordset(p_deliveries) as d(item_id uuid, reserve_id uuid, quantity integer)
      join public.order_items oi on oi.id = d.item_id
      where d.quantity > 0
      union all
      select oi.product_id, order_row.destination_location_id
      from jsonb_to_recordset(p_deliveries) as d(item_id uuid, reserve_id uuid, quantity integer)
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
      insert into public.movements (
        product_id, type, quantity, source_location_id, destination_location_id,
        user_id, annotation, operation_id, order_item_id
      ) values (
        item_row.product_id, 'livraison', item_row.delivered_quantity,
        item_row.reserve_id, order_row.destination_location_id, actor.user_id,
        'Livraison commande ' || p_order_id::text, p_action_id, item_row.id
      ) returning id into movement_id;

      for fragment in select * from private.consume_stock(
        item_row.product_id, item_row.reserve_id, item_row.delivered_quantity
      ) loop
        insert into public.stock_batches (
          product_id, location_id, quantity, expiration_date, source_movement_id
        ) values (
          item_row.product_id, order_row.destination_location_id,
          fragment.consumed_quantity, fragment.consumed_expiration, movement_id
        );
      end loop;
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
  set status = 'delivered', validated_at = statement_timestamp(), validated_by = actor.user_id
  where id = p_order_id;
  return p_order_id;
end;
$$;

-- Vue canonique : valide jusqu'à la fin de la date de DLC et seulement à
-- partir de la date effective du mouvement d'origine.
create or replace view public.current_stock_levels
with (security_invoker = true)
as
with keys as (
  select product_id, location_id from public.stocks
  union
  select product_id, location_id from public.stock_batches
  union
  select product_id, location_id from public.product_location_settings
), totals as (
  select b.product_id, b.location_id, sum(b.quantity)::integer as quantity
  from public.stock_batches b
  left join public.movements m on m.id = b.source_movement_id
  where b.quantity > 0
    and (b.expiration_date is null or b.expiration_date >= current_date)
    and (m.effective_date is null or m.effective_date <= statement_timestamp())
  group by b.product_id, b.location_id
)
select
  k.product_id,
  k.location_id,
  coalesce(t.quantity, 0)::integer as quantity,
  p.name as product_name,
  p.packaging,
  p.category_id,
  c.name as category_name,
  l.name as location_name,
  l.type as location_type
from keys k
join public.products p on p.id = k.product_id
join public.locations l on l.id = k.location_id
left join public.categories c on c.id = p.category_id
left join totals t using (product_id, location_id);

-- Réconcilie la table historique pour les rares anciens lecteurs. Les nouveaux
-- écrans utilisent exclusivement current_stock_levels / stock_batches.
update public.stocks s
set quantity = coalesce((
  select l.quantity from public.current_stock_levels l
  where l.product_id = s.product_id and l.location_id = s.location_id
), 0);

-- Ferme l'accès anonyme à toutes les données internes.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

alter table public.products enable row level security;
alter table public.movements enable row level security;
alter table public.profiles enable row level security;
alter table public.locations enable row level security;
alter table public.stocks enable row level security;
alter table public.product_location_settings enable row level security;
alter table public.categories enable row level security;
alter table public.notifications enable row level security;
alter table public.messages enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.bug_reports enable row level security;
alter table public.stock_batches enable row level security;

drop policy if exists authenticated_read on public.products;
drop policy if exists authenticated_read on public.movements;
drop policy if exists authenticated_read on public.profiles;
drop policy if exists authenticated_read on public.locations;
drop policy if exists authenticated_read on public.stocks;
drop policy if exists authenticated_read on public.product_location_settings;
drop policy if exists authenticated_read on public.categories;
drop policy if exists authenticated_read on public.notifications;
drop policy if exists authenticated_read on public.messages;
drop policy if exists authenticated_read on public.orders;
drop policy if exists authenticated_read on public.order_items;
drop policy if exists authenticated_read on public.bug_reports;
drop policy if exists authenticated_read on public.stock_batches;
drop policy if exists "Users can read messages" on public.messages;

-- Référentiels non sensibles, limités aux comptes applicatifs reconnus.
create policy app_products_read on public.products for select to authenticated
using (private.current_app_role() is not null);
create policy app_categories_read on public.categories for select to authenticated
using (private.current_app_role() is not null);
create policy app_locations_read on public.locations for select to authenticated
using (private.current_app_role() is not null);

-- Un profil n'est visible que par son propriétaire.
create policy own_profile_read on public.profiles for select to authenticated
using (id = (select auth.uid()));

-- Les administrateurs/livreurs voient les emplacements opérationnels ; un
-- pôle ne voit que ses propres données de stock, commande et messagerie.
create policy scoped_settings_read on public.product_location_settings for select to authenticated
using (private.can_access_location(location_id));
create policy scoped_stocks_read on public.stocks for select to authenticated
using (private.can_access_location(location_id));
create policy scoped_batches_read on public.stock_batches for select to authenticated
using (private.can_access_location(location_id));
create policy scoped_movements_read on public.movements for select to authenticated
using (
  private.can_access_location(source_location_id)
  or private.can_access_location(destination_location_id)
);
create policy scoped_orders_read on public.orders for select to authenticated
using (private.can_access_location(destination_location_id));
create policy scoped_order_items_read on public.order_items for select to authenticated
using (exists (
  select 1 from public.orders o
  where o.id = order_items.order_id
    and private.can_access_location(o.destination_location_id)
));
create policy scoped_notifications_read on public.notifications for select to authenticated
using (private.can_access_location(location_id));
create policy scoped_messages_read on public.messages for select to authenticated
using (private.can_access_location(location_id));
create policy scoped_bug_reports_read on public.bug_reports for select to authenticated
using (
  user_id = (select auth.uid())
  or private.current_app_role() = 'admin'
);

create policy admin_products_write on public.products for all to authenticated
using (private.current_app_role() = 'admin')
with check (private.current_app_role() = 'admin');
create policy admin_categories_write on public.categories for all to authenticated
using (private.current_app_role() = 'admin')
with check (private.current_app_role() = 'admin');
create policy admin_locations_write on public.locations for all to authenticated
using (private.current_app_role() = 'admin')
with check (private.current_app_role() = 'admin');
create policy admin_settings_write on public.product_location_settings for all to authenticated
using (private.current_app_role() = 'admin')
with check (private.current_app_role() = 'admin');

create policy authenticated_messages_insert on public.messages for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and private.can_access_location(location_id)
);
create policy authenticated_messages_update on public.messages for update to authenticated
using (private.can_access_location(location_id))
with check (private.can_access_location(location_id));
create policy authenticated_notifications_update on public.notifications for update to authenticated
using (private.can_access_location(location_id))
with check (private.can_access_location(location_id));
create policy authenticated_bug_reports_insert on public.bug_reports for insert to authenticated
with check (user_id = (select auth.uid()));

revoke insert, update, delete, truncate on public.stocks, public.stock_batches,
  public.movements, public.orders, public.order_items from authenticated;
grant select on public.products, public.movements, public.profiles, public.locations,
  public.stocks, public.product_location_settings, public.categories,
  public.notifications, public.messages, public.orders, public.order_items,
  public.bug_reports, public.stock_batches, public.current_stock_levels to authenticated;
grant insert, update, delete on public.products, public.locations,
  public.product_location_settings, public.categories to authenticated;
grant insert on public.messages, public.bug_reports to authenticated;
grant update(read) on public.messages, public.notifications to authenticated;

revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.current_app_role() to authenticated;
grant execute on function private.current_location_id() to authenticated;
grant execute on function private.can_access_location(uuid) to authenticated;

revoke execute on function public.record_stock_entry(uuid,uuid,uuid,integer,date,timestamptz,text,text) from public, anon;
revoke execute on function public.record_stock_exit(uuid,uuid,uuid,integer,text) from public, anon;
revoke execute on function public.record_stock_exits(uuid,uuid,jsonb,text) from public, anon;
revoke execute on function public.adjust_stock_level(uuid,uuid,uuid,integer,text) from public, anon;
revoke execute on function public.adjust_stock_batch(uuid,uuid,integer,text) from public, anon;
revoke execute on function public.reconcile_stock_batches(uuid,uuid,jsonb,jsonb) from public, anon;
revoke execute on function public.transfer_stock(uuid,uuid,uuid,uuid,integer,text) from public, anon;
revoke execute on function public.create_order_atomic(uuid,uuid,jsonb) from public, anon;
revoke execute on function public.submit_pole_inventory_and_orders(uuid,uuid,jsonb,jsonb) from public, anon;
revoke execute on function public.set_order_item_prepared(uuid,boolean,integer) from public, anon;
revoke execute on function public.deliver_order_atomic(uuid,uuid,jsonb) from public, anon;

grant execute on function public.record_stock_entry(uuid,uuid,uuid,integer,date,timestamptz,text,text) to authenticated;
grant execute on function public.record_stock_exit(uuid,uuid,uuid,integer,text) to authenticated;
grant execute on function public.record_stock_exits(uuid,uuid,jsonb,text) to authenticated;
grant execute on function public.adjust_stock_level(uuid,uuid,uuid,integer,text) to authenticated;
grant execute on function public.adjust_stock_batch(uuid,uuid,integer,text) to authenticated;
grant execute on function public.reconcile_stock_batches(uuid,uuid,jsonb,jsonb) to authenticated;
grant execute on function public.transfer_stock(uuid,uuid,uuid,uuid,integer,text) to authenticated;
grant execute on function public.create_order_atomic(uuid,uuid,jsonb) to authenticated;
grant execute on function public.submit_pole_inventory_and_orders(uuid,uuid,jsonb,jsonb) to authenticated;
grant execute on function public.set_order_item_prepared(uuid,boolean,integer) to authenticated;
grant execute on function public.deliver_order_atomic(uuid,uuid,jsonb) to authenticated;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
alter function public.handle_new_user() set search_path = '';
alter function public.create_default_product_location_settings() set search_path = '';
