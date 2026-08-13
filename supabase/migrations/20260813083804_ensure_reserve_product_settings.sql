-- Les réserves sont des emplacements de stock pour tous les produits, même
-- lorsqu'elles ne font pas partie de la visibilité configurée pour les pôles.
-- Cette association explicite garantit que le stock global admin peut toujours
-- afficher et corriger chaque combinaison produit/réserve.

insert into public.product_location_settings (product_id, location_id)
select p.id, l.id
from public.products p
cross join public.locations l
where l.type = 'reserve'
on conflict (product_id, location_id) do nothing;

create or replace function public.create_default_product_location_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.product_location_settings (product_id, location_id)
  select new.id, l.id
  from public.locations l
  where l.type in ('pole', 'reserve')
  on conflict (product_id, location_id) do nothing;

  return new;
end;
$$;

create or replace function public.create_default_location_product_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.type in ('pole', 'reserve') then
    insert into public.product_location_settings (product_id, location_id)
    select p.id, new.id
    from public.products p
    on conflict (product_id, location_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trigger_create_location_product_settings
  on public.locations;

create trigger trigger_create_location_product_settings
after insert or update of type on public.locations
for each row
execute function public.create_default_location_product_settings();

revoke execute on function public.create_default_product_location_settings()
  from public, anon, authenticated;
revoke execute on function public.create_default_location_product_settings()
  from public, anon, authenticated;
