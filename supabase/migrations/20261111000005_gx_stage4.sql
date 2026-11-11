-- Stock reservation: atomic, service-role only (called from server code after role checks).
create or replace function gx.reserve_stock(p_product uuid, p_business uuid, p_qty int) returns boolean language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update gx.products set stock = stock - p_qty where id = p_product and business_id = p_business and stock >= p_qty;
  get diagnostics n = row_count;
  return n = 1;
end $$;
create or replace function gx.release_stock(p_product uuid, p_business uuid, p_qty int) returns void language sql security definer set search_path = '' as $$
  update gx.products set stock = stock + p_qty where id = p_product and business_id = p_business;
$$;
revoke all on function gx.reserve_stock(uuid,uuid,int), gx.release_stock(uuid,uuid,int) from public, anon, authenticated;
grant execute on function gx.reserve_stock(uuid,uuid,int), gx.release_stock(uuid,uuid,int) to service_role;
alter table gx.orders add column if not exists stock_released boolean not null default false;
