-- Personal brands and influencers are a third kind of account.
alter table gx.businesses drop constraint if exists businesses_account_type_check;
alter table gx.businesses add constraint businesses_account_type_check check (account_type in ('business','agency','creator'));
