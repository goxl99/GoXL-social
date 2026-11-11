-- Who is signing up: a business owner, or an agency that manages marketing for clients.
alter table gx.businesses
  add column if not exists account_type text not null default 'business' check (account_type in ('business','agency'));
