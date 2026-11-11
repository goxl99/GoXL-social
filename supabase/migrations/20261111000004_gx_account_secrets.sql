-- Per-account credentials. Values are encrypted by the app (AES-256-GCM) before they reach the database,
-- and these tables are readable only by the server (service role).
alter table gx.businesses add column if not exists ai_provider text not null default 'anthropic' check (ai_provider in ('anthropic','openai'));
alter table gx.businesses add column if not exists ai_model text;

create table if not exists gx.secrets (
  business_id uuid not null references gx.businesses(id) on delete cascade,
  name text not null check (name in ('ai_anthropic_key','ai_openai_key','meta_app_secret','razorpay_key_id','razorpay_key_secret','razorpay_webhook_secret')),
  value text not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (business_id, name)
);
create table if not exists gx.channel_config (
  business_id uuid primary key references gx.businesses(id) on delete cascade,
  wa_verify_token text not null unique,
  created_at timestamptz not null default now()
);
alter table gx.secrets enable row level security;
alter table gx.channel_config enable row level security;
revoke all on gx.secrets, gx.channel_config from authenticated, anon;
grant all on gx.secrets, gx.channel_config to service_role;

-- Payment provider ids must be unique per business so a webhook can only ever touch its own business.
create unique index if not exists payments_link_uidx on gx.payments(business_id, provider_link_id) where provider_link_id is not null;
alter table gx.orders add column if not exists notes text;
alter table gx.orders add column if not exists cancelled_reason text;
