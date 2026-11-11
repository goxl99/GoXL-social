-- Super admin console: platform admins, account activation, platform-wide default keys, audit trail.

alter table gx.businesses
  add column if not exists status text not null default 'pending' check (status in ('pending','active','suspended')),
  add column if not exists activated_at timestamptz,
  add column if not exists activated_by uuid references auth.users(id) on delete set null,
  add column if not exists admin_notes text;

-- Accounts that existed before the console keep working.
update gx.businesses set status = 'active', activated_at = coalesce(activated_at, now()) where status = 'pending';

-- Only the server (service role / direct DB) may change activation fields. API users (owners, managers) cannot.
create or replace function gx.guard_business_status() returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.status := 'pending'; new.activated_at := null; new.activated_by := null; new.admin_notes := null;
    elsif new.status is distinct from old.status or new.activated_at is distinct from old.activated_at
       or new.activated_by is distinct from old.activated_by or new.admin_notes is distinct from old.admin_notes then
      raise exception 'Only a GoXL administrator can change account activation';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists businesses_status_guard on gx.businesses;
create trigger businesses_status_guard before insert or update on gx.businesses for each row execute function gx.guard_business_status();

create table if not exists gx.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

-- GoXL-wide default keys, used only when an account has not set its own.
create table if not exists gx.platform_secrets (
  name text primary key check (name in ('ai_anthropic_key','ai_openai_key','meta_app_secret')),
  value text not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists gx.admin_audit (
  id bigint generated always as identity primary key,
  actor_id uuid, actor_email text,
  business_id uuid references gx.businesses(id) on delete set null,
  action text not null, detail text,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_created_idx on gx.admin_audit(created_at desc);

-- Service-role only: RLS on with no policies, and no direct privileges for API roles.
alter table gx.platform_admins enable row level security;
alter table gx.platform_secrets enable row level security;
alter table gx.admin_audit enable row level security;
revoke all on gx.platform_admins, gx.platform_secrets, gx.admin_audit from anon, authenticated;
grant all on gx.platform_admins, gx.platform_secrets, gx.admin_audit to service_role;

insert into gx.platform_admins (user_id, email)
select id, lower(email) from auth.users where lower(email) = 'goxloffice@gmail.com'
on conflict do nothing;
