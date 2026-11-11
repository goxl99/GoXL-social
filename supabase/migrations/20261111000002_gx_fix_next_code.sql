drop function if exists gx.next_code(uuid,text,text);
create function gx.next_code(bid uuid, p_kind text, prefix text) returns text language plpgsql security definer set search_path = '' as $$
declare v int;
begin
  if auth.role() <> 'service_role' and not gx.is_member(bid) then raise exception 'Not allowed'; end if;
  insert into gx.counters as c (business_id, kind, n) values (bid, p_kind, 1)
  on conflict (business_id, kind) do update set n = c.n + 1 returning c.n into v;
  return prefix || lpad(v::text, 4, '0');
end $$;
revoke all on function gx.next_code(uuid,text,text) from public, anon;
grant execute on function gx.next_code(uuid,text,text) to authenticated, service_role;
