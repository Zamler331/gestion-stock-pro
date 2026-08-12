-- Indexe toutes les clés étrangères utilisées par les suppressions, jointures
-- et politiques RLS afin d'éviter les scans complets sous charge.
create index if not exists bug_reports_user_id_idx on public.bug_reports(user_id);
create index if not exists messages_sender_id_idx on public.messages(sender_id);
create index if not exists movements_user_id_idx on public.movements(user_id);
create index if not exists notifications_location_id_idx on public.notifications(location_id);
create index if not exists notifications_product_id_idx on public.notifications(product_id);
create index if not exists order_items_order_id_idx on public.order_items(order_id);
create index if not exists order_items_product_id_idx on public.order_items(product_id);
create index if not exists orders_validated_by_idx on public.orders(validated_by);
create index if not exists product_location_settings_location_id_idx
  on public.product_location_settings(location_id);
create index if not exists products_category_id_idx on public.products(category_id);
create index if not exists profiles_location_id_idx on public.profiles(location_id);
create index if not exists stock_batches_location_id_idx on public.stock_batches(location_id);
create index if not exists stock_batches_source_movement_id_idx
  on public.stock_batches(source_movement_id);

-- FOR ALL crée aussi une politique SELECT permissive redondante. Les droits
-- administratifs sont séparés par commande, tout en conservant les politiques
-- de lecture applicatives déjà limitées par rôle/emplacement.
drop policy if exists admin_products_write on public.products;
drop policy if exists admin_categories_write on public.categories;
drop policy if exists admin_locations_write on public.locations;
drop policy if exists admin_settings_write on public.product_location_settings;

create policy admin_products_insert on public.products for insert to authenticated
with check (private.current_app_role() = 'admin');
create policy admin_products_update on public.products for update to authenticated
using (private.current_app_role() = 'admin')
with check (private.current_app_role() = 'admin');
create policy admin_products_delete on public.products for delete to authenticated
using (private.current_app_role() = 'admin');

create policy admin_categories_insert on public.categories for insert to authenticated
with check (private.current_app_role() = 'admin');
create policy admin_categories_update on public.categories for update to authenticated
using (private.current_app_role() = 'admin')
with check (private.current_app_role() = 'admin');
create policy admin_categories_delete on public.categories for delete to authenticated
using (private.current_app_role() = 'admin');

create policy admin_locations_insert on public.locations for insert to authenticated
with check (private.current_app_role() = 'admin');
create policy admin_locations_update on public.locations for update to authenticated
using (private.current_app_role() = 'admin')
with check (private.current_app_role() = 'admin');
create policy admin_locations_delete on public.locations for delete to authenticated
using (private.current_app_role() = 'admin');

create policy admin_settings_insert on public.product_location_settings for insert to authenticated
with check (private.current_app_role() = 'admin');
create policy admin_settings_update on public.product_location_settings for update to authenticated
using (private.current_app_role() = 'admin')
with check (private.current_app_role() = 'admin');
create policy admin_settings_delete on public.product_location_settings for delete to authenticated
using (private.current_app_role() = 'admin');
