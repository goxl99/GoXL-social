-- GoXL Commerce: foundation schema. Everything lives in schema "gx" so it cannot collide with other apps in the same project.
create schema if not exists gx;
grant usage on schema gx to anon, authenticated, service_role;

do $$ begin
  create type gx.member_role as enum ('owner','manager','sales','fulfilment');
  create type gx.platform as enum ('instagram','facebook','whatsapp');
  create type gx.conn_status as enum ('disconnected','connected','expired','error');
  create type gx.lead_stage as enum ('new_inquiry','ai_responded','interested','follow_up','order_created','payment_pending','paid','dispatched','delivered','lost');
  create type gx.order_status as enum ('payment_pending','paid','dispatched','delivered','cancelled');
  create type gx.pay_status as enum ('pending','paid','failed','refund_initiated','refunded');
  create type gx.msg_sender as enum ('customer','ai','human','system');
exception when duplicate_object then null; end $$;

create or replace function gx.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- core tenancy ----------
create table if not exists gx.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  category text, description text, phone text, email text, city text,
  delivery_areas text, target_customer text,
  language text not null default 'en' check (language in ('en','hi','gu')),
  tone text default 'Warm and simple',
  brand_primary text not null default '#1B4332' check (brand_primary ~ '^#[0-9A-Fa-f]{6}$'),
  brand_accent text not null default '#C8E600' check (brand_accent ~ '^#[0-9A-Fa-f]{6}$'),
  logo_path text,
  shipping_policy text, return_policy text, faq text,
  free_delivery_threshold numeric(10,2) not null default 999 check (free_delivery_threshold >= 0),
  delivery_fee numeric(10,2) not null default 60 check (delivery_fee >= 0),
  onboarded boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger businesses_touch before update on gx.businesses for each row execute function gx.touch_updated_at();

create table if not exists gx.members (
  business_id uuid not null references gx.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role gx.member_role not null,
  display_name text, email text,
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index if not exists members_user_idx on gx.members(user_id);

create table if not exists gx.invites (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references gx.businesses(id) on delete cascade,
  email text not null check (email = lower(email) and position('@' in email) > 1),
  role gx.member_role not null check (role <> 'owner'),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (business_id, email)
);

-- ---------- helper functions (security definer, avoid RLS recursion) ----------
create or replace function gx.is_member(bid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from gx.members m where m.business_id = bid and m.user_id = auth.uid());
$$;
create or replace function gx.has_role(bid uuid, roles gx.member_role[]) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from gx.members m where m.business_id = bid and m.user_id = auth.uid() and m.role = any(roles));
$$;
revoke all on function gx.is_member(uuid), gx.has_role(uuid, gx.member_role[]) from public, anon;
grant execute on function gx.is_member(uuid), gx.has_role(uuid, gx.member_role[]) to authenticated, service_role;

create or replace function gx.create_business(p_name text, p_category text default null, p_phone text default null, p_city text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare bid uuid; uid uuid := auth.uid(); em text := lower(coalesce(auth.jwt() ->> 'email',''));
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if p_name is null or length(trim(p_name)) = 0 then raise exception 'Business name is required'; end if;
  insert into gx.businesses(name, category, phone, city, email, created_by)
  values (trim(p_name), nullif(trim(p_category),''), nullif(trim(p_phone),''), nullif(trim(p_city),''), nullif(em,''), uid) returning id into bid;
  insert into gx.members(business_id, user_id, role, display_name, email)
  values (bid, uid, 'owner', coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', split_part(em,'@',1)), em);
  return bid;
end $$;

create or replace function gx.accept_invites() returns integer language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); em text := lower(coalesce(auth.jwt() ->> 'email','')); n int := 0; r record;
begin
  if uid is null or em = '' then return 0; end if;
  for r in select * from gx.invites where email = em loop
    insert into gx.members(business_id, user_id, role, display_name, email)
    values (r.business_id, uid, r.role, split_part(em,'@',1), em) on conflict do nothing;
    delete from gx.invites where id = r.id; n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function gx.create_business(text,text,text,text), gx.accept_invites() from public, anon;
grant execute on function gx.create_business(text,text,text,text), gx.accept_invites() to authenticated;

-- Guard: a business must always keep at least one owner.
create or replace function gx.keep_one_owner() returns trigger language plpgsql set search_path = '' as $$
begin
  if (tg_op = 'DELETE' and old.role = 'owner') or (tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner') then
    if not exists (select 1 from gx.members m where m.business_id = old.business_id and m.role = 'owner' and m.user_id <> old.user_id)
       and exists (select 1 from gx.businesses b where b.id = old.business_id) then
      raise exception 'A business needs at least one owner';
    end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger members_keep_owner before update or delete on gx.members for each row execute function gx.keep_one_owner();

-- ---------- catalogue ----------
create table if not exists gx.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references gx.businesses(id) on delete cascade,
  sku text not null check (length(trim(sku)) > 0),
  name text not null check (length(trim(name)) > 0),
  category text, description text,
  price numeric(10,2) not null check (price > 0),
  discount_price numeric(10,2) check (discount_price is null or (discount_price > 0 and discount_price <= price)),
  variants text[] not null default '{}', sizes text[] not null default '{}',
  stock integer not null default 0 check (stock >= 0),
  delivery_info text,
  active boolean not null default true,
  image_paths text[] not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (business_id, sku)
);
create index if not exists products_biz_idx on gx.products(business_id);
create trigger products_touch before update on gx.products for each row execute function gx.touch_updated_at();

create table if not exists gx.social_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references gx.businesses(id) on delete cascade,
  platform gx.platform not null,
  status gx.conn_status not null default 'disconnected',
  handle text, external_id text, token_expires_at timestamptz, connected_at timestamptz,
  unique (business_id, platform)
);
-- NOTE: access tokens are NOT stored in this table. They go into Supabase Vault via a server-only function when OAuth is added.

-- ---------- sales engine (used by the next build stages) ----------
create table if not exists gx.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references gx.businesses(id) on delete cascade,
  name text not null, phone text not null, created_at timestamptz not null default now(),
  unique (business_id, phone)
);
create table if not exists gx.campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references gx.businesses(id) on delete cascade,
  code text not null, name text not null,
  product_id uuid references gx.products(id) on delete set null,
  objective text, offer text, starts_on date, ends_on date,
  created_at timestamptz not null default now(),
  unique (business_id, code)
);
create table if not exists gx.conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references gx.businesses(id) on delete cascade,
  customer_id uuid not null references gx.customers(id) on delete cascade,
  platform gx.platform not null,
  campaign_id uuid references gx.campaigns(id) on delete set null,
  product_id uuid references gx.products(id) on delete set null,
  attribution text not null default 'unattributed' check (attribution in ('exact','link_based','unattributed')),
  stage gx.lead_stage not null default 'new_inquiry',
  ai_enabled boolean not null default true,
  assigned_to uuid references auth.users(id) on delete set null,
  lost_reason text,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists conv_biz_idx on gx.conversations(business_id, last_message_at desc);
create table if not exists gx.messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references gx.businesses(id) on delete cascade,
  conversation_id uuid not null references gx.conversations(id) on delete cascade,
  sender gx.msg_sender not null, body text not null, product_id uuid references gx.products(id) on delete set null,
  external_id text, created_at timestamptz not null default now()
);
create index if not exists msg_conv_idx on gx.messages(conversation_id, created_at);
create unique index if not exists msg_external_uidx on gx.messages(business_id, external_id) where external_id is not null;

create table if not exists gx.counters (business_id uuid not null references gx.businesses(id) on delete cascade, kind text not null, n integer not null default 0, primary key (business_id, kind));
create or replace function gx.next_code(bid uuid, kind text, prefix text) returns text language plpgsql security definer set search_path = '' as $$
declare v int;
begin
  if auth.role() <> 'service_role' and not gx.is_member(bid) then raise exception 'Not allowed'; end if;
  insert into gx.counters(business_id, kind, n) values (bid, kind, 1)
  on conflict (business_id, kind) do update set n = gx.counters.n + 1 returning n into v;
  return prefix || lpad(v::text, 4, '0');
end $$;
revoke all on function gx.next_code(uuid,text,text) from public, anon;
grant execute on function gx.next_code(uuid,text,text) to authenticated, service_role;

create table if not exists gx.orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references gx.businesses(id) on delete cascade,
  code text not null,
  conversation_id uuid references gx.conversations(id) on delete set null,
  customer_id uuid not null references gx.customers(id) on delete restrict,
  campaign_id uuid references gx.campaigns(id) on delete set null,
  platform gx.platform,
  status gx.order_status not null default 'payment_pending',
  address text not null,
  subtotal numeric(10,2) not null check (subtotal >= 0), discount numeric(10,2) not null default 0 check (discount >= 0),
  delivery_charge numeric(10,2) not null default 0 check (delivery_charge >= 0),
  total numeric(10,2) not null check (total >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (business_id, code)
);
create trigger orders_touch before update on gx.orders for each row execute function gx.touch_updated_at();
create table if not exists gx.order_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references gx.businesses(id) on delete cascade,
  order_id uuid not null references gx.orders(id) on delete cascade,
  product_id uuid references gx.products(id) on delete set null,
  name text not null, variant text, size text,
  quantity integer not null check (quantity > 0), unit_price numeric(10,2) not null check (unit_price >= 0)
);
create table if not exists gx.payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references gx.businesses(id) on delete cascade,
  order_id uuid not null references gx.orders(id) on delete cascade,
  provider text not null default 'razorpay',
  provider_link_id text, link_url text, provider_payment_id text unique,
  status gx.pay_status not null default 'pending',
  amount numeric(10,2) not null check (amount >= 0),
  verified_at timestamptz, raw jsonb,
  created_at timestamptz not null default now()
);
create table if not exists gx.shipments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references gx.businesses(id) on delete cascade,
  order_id uuid not null unique references gx.orders(id) on delete cascade,
  courier text not null, tracking_no text not null, status text not null default 'picked_up',
  dispatched_at timestamptz not null default now(), delivered_at timestamptz
);
create table if not exists gx.audit_log (
  id bigint generated always as identity primary key,
  business_id uuid references gx.businesses(id) on delete cascade,
  actor uuid, action text not null, detail jsonb, created_at timestamptz not null default now()
);

-- Order integrity: an order can only become paid/dispatched/delivered through verified payment.
create or replace function gx.guard_order_status() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status in ('paid','dispatched','delivered') and old.status = 'payment_pending'
     and not exists (select 1 from gx.payments p where p.order_id = new.id and p.status = 'paid' and p.verified_at is not null) then
    raise exception 'Order cannot be marked paid without a verified payment';
  end if;
  return new;
end $$;
create trigger orders_guard before update of status on gx.orders for each row execute function gx.guard_order_status();

-- ---------- privileges ----------
grant select, insert, update, delete on all tables in schema gx to authenticated;
grant all on all tables in schema gx to service_role;
grant usage, select on all sequences in schema gx to authenticated, service_role;
alter default privileges in schema gx grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema gx grant all on tables to service_role;

-- ---------- row level security ----------
do $$ declare t text; begin
  foreach t in array array['businesses','members','invites','products','social_accounts','customers','campaigns','conversations','messages','counters','orders','order_items','payments','shipments','audit_log'] loop
    execute format('alter table gx.%I enable row level security', t);
  end loop; end $$;

create policy businesses_read on gx.businesses for select to authenticated using (gx.is_member(id));
create policy businesses_update on gx.businesses for update to authenticated using (gx.has_role(id, array['owner','manager']::gx.member_role[])) with check (gx.has_role(id, array['owner','manager']::gx.member_role[]));
create policy businesses_delete on gx.businesses for delete to authenticated using (gx.has_role(id, array['owner']::gx.member_role[]));

create policy members_read on gx.members for select to authenticated using (gx.is_member(business_id));
create policy members_update on gx.members for update to authenticated using (gx.has_role(business_id, array['owner']::gx.member_role[])) with check (gx.has_role(business_id, array['owner']::gx.member_role[]));
create policy members_delete on gx.members for delete to authenticated using (gx.has_role(business_id, array['owner']::gx.member_role[]) or user_id = auth.uid());

create policy invites_read on gx.invites for select to authenticated using (gx.has_role(business_id, array['owner']::gx.member_role[]));
create policy invites_insert on gx.invites for insert to authenticated with check (gx.has_role(business_id, array['owner']::gx.member_role[]) and invited_by = auth.uid());
create policy invites_delete on gx.invites for delete to authenticated using (gx.has_role(business_id, array['owner']::gx.member_role[]));

create policy products_read on gx.products for select to authenticated using (gx.is_member(business_id));
create policy products_write on gx.products for all to authenticated using (gx.has_role(business_id, array['owner','manager']::gx.member_role[])) with check (gx.has_role(business_id, array['owner','manager']::gx.member_role[]));

create policy social_read on gx.social_accounts for select to authenticated using (gx.is_member(business_id));
create policy social_write on gx.social_accounts for all to authenticated using (gx.has_role(business_id, array['owner','manager']::gx.member_role[])) with check (gx.has_role(business_id, array['owner','manager']::gx.member_role[]));

create policy customers_read on gx.customers for select to authenticated using (gx.is_member(business_id));
create policy customers_write on gx.customers for all to authenticated using (gx.has_role(business_id, array['owner','manager','sales']::gx.member_role[])) with check (gx.has_role(business_id, array['owner','manager','sales']::gx.member_role[]));
create policy campaigns_read on gx.campaigns for select to authenticated using (gx.is_member(business_id));
create policy campaigns_write on gx.campaigns for all to authenticated using (gx.has_role(business_id, array['owner','manager']::gx.member_role[])) with check (gx.has_role(business_id, array['owner','manager']::gx.member_role[]));
create policy conv_read on gx.conversations for select to authenticated using (gx.is_member(business_id));
create policy conv_write on gx.conversations for all to authenticated using (gx.has_role(business_id, array['owner','manager','sales']::gx.member_role[])) with check (gx.has_role(business_id, array['owner','manager','sales']::gx.member_role[]));
create policy msg_read on gx.messages for select to authenticated using (gx.is_member(business_id));
create policy msg_write on gx.messages for all to authenticated using (gx.has_role(business_id, array['owner','manager','sales']::gx.member_role[])) with check (gx.has_role(business_id, array['owner','manager','sales']::gx.member_role[]));
create policy orders_read on gx.orders for select to authenticated using (gx.is_member(business_id));
create policy orders_write on gx.orders for all to authenticated using (gx.has_role(business_id, array['owner','manager','sales']::gx.member_role[])) with check (gx.has_role(business_id, array['owner','manager','sales']::gx.member_role[]));
create policy items_read on gx.order_items for select to authenticated using (gx.is_member(business_id));
create policy items_write on gx.order_items for all to authenticated using (gx.has_role(business_id, array['owner','manager','sales']::gx.member_role[])) with check (gx.has_role(business_id, array['owner','manager','sales']::gx.member_role[]));
-- payments: members can read; only the server (service role, after webhook verification) writes.
create policy payments_read on gx.payments for select to authenticated using (gx.is_member(business_id));
create policy shipments_read on gx.shipments for select to authenticated using (gx.is_member(business_id));
create policy shipments_write on gx.shipments for all to authenticated using (gx.has_role(business_id, array['owner','manager','fulfilment']::gx.member_role[])) with check (gx.has_role(business_id, array['owner','manager','fulfilment']::gx.member_role[]));
create policy audit_read on gx.audit_log for select to authenticated using (gx.has_role(business_id, array['owner','manager']::gx.member_role[]));
-- counters: no direct access; gx.next_code is the only path.
revoke all on gx.counters from authenticated;
revoke insert, update, delete on gx.payments from authenticated;
revoke insert, update, delete on gx.audit_log from authenticated;

-- ---------- storage (own bucket, own policies) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gx-business-assets', 'gx-business-assets', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create or replace function gx.asset_business(name text) returns uuid language sql immutable set search_path = '' as $$
  select case when split_part(name,'/',1) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then split_part(name,'/',1)::uuid end;
$$;
create policy gx_assets_insert on storage.objects for insert to authenticated with check (bucket_id = 'gx-business-assets' and gx.has_role(gx.asset_business(name), array['owner','manager']::gx.member_role[]));
create policy gx_assets_update on storage.objects for update to authenticated using (bucket_id = 'gx-business-assets' and gx.has_role(gx.asset_business(name), array['owner','manager']::gx.member_role[]));
create policy gx_assets_delete on storage.objects for delete to authenticated using (bucket_id = 'gx-business-assets' and gx.has_role(gx.asset_business(name), array['owner','manager']::gx.member_role[]));
-- Public bucket: object URLs are readable by link. No list/select policy is granted for browsing.
