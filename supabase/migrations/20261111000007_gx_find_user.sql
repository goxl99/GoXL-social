create or replace function gx.find_user_by_email(p_email text) returns uuid language sql stable security definer set search_path = '' as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1
$$;
revoke all on function gx.find_user_by_email(text) from public, anon, authenticated;
grant execute on function gx.find_user_by_email(text) to service_role;
