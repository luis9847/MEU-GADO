begin;
create temp table billing_plan_before as select md5(coalesce(string_agg(row_to_json(s)::text,',' order by farm_id),'')) fingerprint from public.farm_subscriptions s;
-- Service-only reservations are idempotent, authoritatively priced and rate limited.
set local role service_role;
do $$
declare actor uuid; testid uuid:=gen_random_uuid();r jsonb;i integer;
begin
 select user_id into actor from public.admin_users order by created_at limit 1;
 if actor is null then raise exception 'Test needs an existing administrator.';end if;
 r:=public.billing_test_reserve(testid,actor,'essential','monthly','22222','11111',repeat('a',64));
 if not (r->>'created')::boolean or (r->'row'->>'amount')::int<>90 then raise exception 'Bad monthly reservation';end if;
 r:=public.billing_test_reserve(testid,actor,'essential','monthly','22222','11111',repeat('b',64));
 if (r->>'created')::boolean or r->'row'->>'notify_hash'<>repeat('a',64) then raise exception 'Reservation duplicated';end if;
 if not public.billing_test_claim(testid) or public.billing_test_claim(testid) then raise exception 'Refresh lock failed';end if;
 r:=public.billing_test_reserve(gen_random_uuid(),actor,'complete','annual','22222','11111',repeat('a',64));
 if (r->'row'->>'amount')::int<>1440 then raise exception 'Bad annual reservation';end if;
 begin
 perform public.billing_test_reserve(gen_random_uuid(),actor,'fake','monthly','22222','11111',repeat('a',64));
 raise exception 'Invalid plan allowed';
 exception when invalid_parameter_value then null;end;
 for i in 1..10 loop perform public.billing_test_reserve(gen_random_uuid(),actor,'complete','monthly','22222','11111',repeat('a',64));end loop;
 begin
 perform public.billing_test_reserve(gen_random_uuid(),actor,'complete','monthly','22222','11111',repeat('a',64));
 raise exception 'Rate limit failed';
 exception when program_limit_exceeded then null;end;
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',gen_random_uuid(),'aal','aal1','role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 if public.billing_test_is_admin() then raise exception 'Non-admin accepted';end if;
 begin perform count(*) from public.billing_test_checkouts;raise exception 'Client read allowed';exception when insufficient_privilege then null;end;
 begin perform public.billing_test_claim(gen_random_uuid());raise exception 'Client claim allowed';exception when insufficient_privilege then null;end;
 begin perform public.billing_test_reserve(gen_random_uuid(),gen_random_uuid(),'complete','monthly','22222','11111',repeat('a',64));raise exception 'Client reserve allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
-- DB admin authorization respects the MFA assurance level.
select set_config('request.jwt.claims',json_build_object('sub',(select user_id from public.admin_users order by created_at limit 1),'aal','aal2','role','authenticated')::text,true);
set local role authenticated;
do $$ begin if not public.billing_test_is_admin() then raise exception 'Admin with MFA denied';end if;end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.billing_test_is_admin();raise exception 'Anonymous check allowed';exception when insufficient_privilege then null;end;
 begin perform count(*) from public.billing_test_checkouts;raise exception 'Anonymous read allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$ begin
 if (select fingerprint from billing_plan_before) is distinct from (select md5(coalesce(string_agg(row_to_json(s)::text,',' order by farm_id),'')) from public.farm_subscriptions s) then raise exception 'Real access changed';end if;
end $$;
rollback;
