begin;
select set_config('test.pilot.owner',gen_random_uuid()::text,true),set_config('test.pilot.other',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data)
select v::uuid,'pilot-'||v||'@example.invalid','{}' from unnest(array[current_setting('test.pilot.owner'),current_setting('test.pilot.other')]) v;
insert into public.farms(owner_id,name) values
(current_setting('test.pilot.owner')::uuid,'__PILOT_OWNER__'),(current_setting('test.pilot.other')::uuid,'__PILOT_OTHER__');
select set_config('test.pilot.farm',id::text,true) from public.farms where owner_id=current_setting('test.pilot.owner')::uuid;
select set_config('test.pilot.farm2',id::text,true) from public.farms where owner_id=current_setting('test.pilot.other')::uuid;
update public.billing_settings set enabled=true,seller_id='11111',pilot_farm_id=current_setting('test.pilot.farm')::bigint,pilot_owner_id=current_setting('test.pilot.owner')::uuid,pilot_expires_at=now()-interval '1 hour';
set local role authenticated;
do $$ begin
 if has_function_privilege(current_user,'public.billing_reserve_pilot(uuid,uuid,bigint,text,text)','execute') then raise exception 'Public pilot reservation privilege';end if;
 if has_table_privilege(current_user,'public.billing_settings','update') then raise exception 'Public pilot grant privilege';end if;
end $$;
reset role;
set local role service_role;
do $$
declare f bigint:=current_setting('test.pilot.farm')::bigint;f2 bigint:=current_setting('test.pilot.farm2')::bigint;
 owner_id uuid:=current_setting('test.pilot.owner')::uuid;other_id uuid:=current_setting('test.pilot.other')::uuid;
 cid uuid:=gen_random_uuid();lease uuid:=gen_random_uuid();regular_id uuid:=gen_random_uuid();r jsonb;
begin
 begin perform public.billing_reserve_pilot(cid,owner_id,f,'11111',repeat('a',64));raise exception 'Expired offer accepted';exception when insufficient_privilege then null;end;
 update public.billing_settings set pilot_expires_at=now()+interval '48 hours';
 begin perform public.billing_reserve_pilot(cid,other_id,f2,'11111',repeat('a',64));raise exception 'Other farm accepted';exception when insufficient_privilege then null;end;
 r:=public.billing_reserve(regular_id,other_id,f2,'complete','monthly','11111',repeat('a',64));
 if (r->'contract'->>'amount')::int is distinct from 130 then raise exception 'Normal price changed';end if;
 r:=public.billing_reserve_pilot(cid,owner_id,f,'11111',repeat('a',64));
 if (r->>'created')::boolean is distinct from true or (r->'contract'->>'amount')::int is distinct from 5 or (r->'contract'->>'is_pilot')::boolean is distinct from true then raise exception 'Wrong pilot reservation';end if;
 r:=public.billing_reserve_pilot(cid,owner_id,f,'11111',repeat('a',64));
 if (r->>'created')::boolean is distinct from false then raise exception 'Duplicate pilot reservation';end if;
 perform public.billing_claim(cid,lease);
 r:=public.billing_apply(cid,lease,'authorized','22222',jsonb_build_array(jsonb_build_object('id','pilot-fixture-'||cid,'status','approved','approved_at',now(),'modified_at',now(),'amount',5,'refunded_amount',0)));
 if r->>'activated_at' is null or not exists(select 1 from public.farm_subscriptions where farm_id=f and status='active' and plan='complete' and billing_contract_id=cid) then raise exception 'Pilot did not activate';end if;
 lease:=gen_random_uuid();perform public.billing_claim(cid,lease);perform public.billing_apply(cid,lease,'cancelled','22222','[]');
 if not exists(select 1 from public.farm_subscriptions where farm_id=f and status='active' and expires_at>now()) then raise exception 'Cancelled renewal removed paid access';end if;
 begin perform public.billing_reserve_pilot(gen_random_uuid(),owner_id,f,'11111',repeat('a',64));raise exception 'Second pilot accepted';exception when invalid_parameter_value then null;end;
end $$;
reset role;
select 'PASS: restricted pilot, unchanged public amount, R$5 activation and cancellation' as result;
rollback;
