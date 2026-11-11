-- Stage 2 (creatives, campaigns, posts) and Stage 3 (inbox, assistant, CRM, channel secrets)
alter table gx.campaigns add column if not exists budget numeric(10,2) check (budget is null or budget >= 0);
alter table gx.campaigns add column if not exists creative_id uuid;
alter table gx.conversations add column if not exists follow_up_at timestamptz;
alter table gx.conversations add column if not exists needs_human boolean not null default false;
alter table gx.conversations add column if not exists draft_order jsonb;
alter table gx.conversations add column if not exists is_test boolean not null default false;

create table if not exists gx.creatives (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references gx.businesses(id) on delete cascade,
  product_id uuid references gx.products(id) on delete set null,
  category text not null, language text not null default 'en' check (language in ('en','hi','gu')),
  headline text not null check (length(trim(headline)) > 0), caption text not null, hashtags text,
  style text not null default 'brand' check (style in ('brand','forest','paper')),
  extra_image_path text, approved boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists creatives_biz_idx on gx.creatives(business_id, created_at desc);
create trigger creatives_touch before update on gx.creatives for each row execute function gx.touch_updated_at();
alter table gx.campaigns drop constraint if exists campaigns_creative_fk;
alter table gx.campaigns add constraint campaigns_creative_fk foreign key (creative_id) references gx.creatives(id) on delete set null;

create table if not exists gx.posts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references gx.businesses(id) on delete cascade,
  campaign_id uuid not null references gx.campaigns(id) on delete cascade,
  creative_id uuid references gx.creatives(id) on delete set null,
  platform gx.platform not null,
  format text not null check (format in ('post','story','status')),
  status text not null default 'draft' check (status in ('draft','scheduled','publishing','published','failed','share_manually','shared')),
  scheduled_for timestamptz, published_at timestamptz, external_id text, error text,
  caption text not null default '', attempts integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists posts_due_idx on gx.posts(status, scheduled_for);
create index if not exists posts_campaign_idx on gx.posts(campaign_id);

-- Channel credentials: readable and writable only by the server (service role). No policies, no grants to app users.
create table if not exists gx.channel_secrets (
  business_id uuid not null references gx.businesses(id) on delete cascade,
  platform gx.platform not null,
  access_token text not null,
  updated_at timestamptz not null default now(),
  primary key (business_id, platform)
);
alter table gx.channel_secrets enable row level security;
revoke all on gx.channel_secrets from authenticated, anon;
grant all on gx.channel_secrets to service_role;

alter table gx.creatives enable row level security;
alter table gx.posts enable row level security;
create policy creatives_read on gx.creatives for select to authenticated using (gx.is_member(business_id));
create policy creatives_write on gx.creatives for all to authenticated using (gx.has_role(business_id, array['owner','manager']::gx.member_role[])) with check (gx.has_role(business_id, array['owner','manager']::gx.member_role[]));
create policy posts_read on gx.posts for select to authenticated using (gx.is_member(business_id));
create policy posts_write on gx.posts for all to authenticated using (gx.has_role(business_id, array['owner','manager']::gx.member_role[])) with check (gx.has_role(business_id, array['owner','manager']::gx.member_role[]));

-- One WhatsApp number can belong to only one business, so inbound webhooks route unambiguously.
create unique index if not exists social_wa_number_uidx on gx.social_accounts(external_id) where platform = 'whatsapp' and external_id is not null;
