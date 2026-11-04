begin;
create temp table billing_original as select farm_id,to_jsonb(s) value from public.farm_subscriptions s;
select set_config('test.bill.owner',gen_random_uuid()::text,true),set_config('test.bill.other',gen_random_uuid()::text,true),set_config('test.bill.contract',gen_random_uuid()::text,true),set_config('test.bill.contract2',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data) values(current_setting('test.bill.owner')::uuid,'billing-'||current_setting('test.bill.owner')||'@example.invalid','{}'),(current_setting('test.bill.other')::uuid,'billing-'||current_setting('test.bill.other')||'@example.invalid','{}');
insert into public.farms(owner_id,name) values(current_setting('test.bill.owner')::uuid,'__BILL_OWNER__'),(current_setting('test.bill.other')::uuid,'__BILL_OTHER__');
select set_config('test.bill.farm',id::text,true) from public.farms where name='__BILL_OWNER__';
select set_config('test.bill.farm2',id::text,true) from public.farms where name='__BILL_OTHER__';
select set_config('test.bill.admin',user_id::text,true) from public.admin_users limit 1;
update public.billing_settings set enabled=true,seller_id='11111';
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.bill.owner'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
do $$
#variable_conflict use_variable
declare f bigint:=current_setting('test.bill.farm')::bigint;begin
 if (public.billing_owner(f)->>'farm_id')::bigint<>f then raise exception 'Owner context failed';end if;
 begin perform public.billing_owner(current_setting('test.bill.farm2')::bigint);raise exception 'Cross-tenant context allowed';exception when insufficient_privilege then null;end;
 begin perform count(*) from public.billing_contracts;raise exception 'Client contract table read allowed';exception when insufficient_privilege then null;end;
 begin perform public.billing_job_secret();raise exception 'Client job secret read allowed';exception when insufficient_privilege then null;end;
 begin perform public.billing_claim(gen_random_uuid(),gen_random_uuid());raise exception 'Client billing write allowed';exception when insufficient_privilege then null;end;
 begin update public.billing_settings set enabled=true;raise exception 'Client enabled payments';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims','{}',true);
set local role service_role;
do $$
#variable_conflict use_variable
declare r jsonb;f bigint:=current_setting('test.bill.farm')::bigint;id uuid:=current_setting('test.bill.contract')::uuid;lease uuid;paid timestamptz:=now()-interval '1 day';until1 timestamptz;rev integer;payload jsonb;
begin
 r:=public.billing_reserve(id,current_setting('test.bill.owner')::uuid,f,'essential','monthly','11111',repeat('a',64));
 if not (r->>'created')::boolean or (r->'contract'->>'amount')::int<>90 then raise exception 'Reservation price failed';end if;
 r:=public.billing_reserve(id,current_setting('test.bill.owner')::uuid,f,'essential','monthly','11111',repeat('b',64));if (r->>'created')::boolean then raise exception 'Duplicate reservation';end if;
 begin perform public.billing_reserve(gen_random_uuid(),current_setting('test.bill.owner')::uuid,f,'complete','monthly','11111',repeat('a',64));raise exception 'Second open contract allowed';exception when invalid_parameter_value then null;end;
 update public.billing_contracts set provider_id='production-test-provider',status='pending' where billing_contracts.id=id;
 lease:=gen_random_uuid();if not public.billing_claim(id,lease) or public.billing_claim(id,gen_random_uuid()) then raise exception 'Lease did not serialize';end if;
 payload:=jsonb_build_array(jsonb_build_object('id','bill-p1','status','approved','approved_at',paid,'modified_at',now(),'amount',90,'refunded_amount',0));
 -- A payment while authorization is still pending must wait, without cancelling a valid checkout.
 r:=public.billing_apply(id,lease,'pending','22222',payload);if r->>'review_reason' is not null or (select status from public.farm_subscriptions where farm_id=f)<>'pending' then raise exception 'Pending authorized access';end if;
 lease:=gen_random_uuid();perform public.billing_claim(id,lease);r:=public.billing_apply(id,lease,'authorized','22222',payload);
 select expires_at,revision into until1,rev from public.farm_subscriptions where farm_id=f;
 if (select status from public.farm_subscriptions where farm_id=f)<>'active' or until1<=now() then raise exception 'Approved payment did not activate';end if;
 if until1 is distinct from (((paid at time zone 'America/Sao_Paulo')+interval '1 month') at time zone 'America/Sao_Paulo') then raise exception 'Wrong monthly period';end if;
 lease:=gen_random_uuid();perform public.billing_claim(id,lease);perform public.billing_apply(id,lease,'authorized','22222',payload);
 if (select expires_at from public.farm_subscriptions where farm_id=f)<>until1 or (select revision from public.farm_subscriptions where farm_id=f)<>rev or (select count(*) from public.billing_payments where contract_id=id)<>1 then raise exception 'Duplicate extended access';end if;
 -- Refund removes its entitlement. A fresh approved renewal restores it.
 lease:=gen_random_uuid();perform public.billing_claim(id,lease);perform public.billing_apply(id,lease,'authorized','22222',jsonb_build_array(jsonb_build_object('id','bill-p1','status','refunded','approved_at',paid,'modified_at',now()+interval '1 second','amount',90,'refunded_amount',90)));
 if (select status from public.farm_subscriptions where farm_id=f)<>'suspended' then raise exception 'Refund did not suspend';end if;
 lease:=gen_random_uuid();perform public.billing_claim(id,lease);perform public.billing_apply(id,lease,'authorized','22222',jsonb_build_array(jsonb_build_object('id','bill-p2','status','approved','approved_at',now(),'modified_at',now()+interval '2 seconds','amount',90,'refunded_amount',0)));
 if (select status from public.farm_subscriptions where farm_id=f)<>'active' then raise exception 'Renewal did not restore';end if;
 -- An older out-of-order approved snapshot cannot undo the refund.
 lease:=gen_random_uuid();perform public.billing_claim(id,lease);perform public.billing_apply(id,lease,'authorized','22222',payload);
 if (select status from public.billing_payments where payment_id='bill-p1')<>'refunded' then raise exception 'Old snapshot reversed refund';end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.bill.admin'),'role','authenticated','aal','aal2')::text,true);
set local role authenticated;
do $$
#variable_conflict use_variable
declare f bigint:=current_setting('test.bill.farm')::bigint;rev integer;begin
 select revision into rev from public.farm_subscriptions where farm_id=f;
 begin perform public.admin_set_farm_plan(f,'complete','trial','monthly',null,rev);raise exception 'Live renewal replaced by free access without cancel';exception when invalid_parameter_value then null;end;
end $$;
reset role;
select set_config('request.jwt.claims','{}',true);
set local role service_role;
do $$
#variable_conflict use_variable
declare id uuid:=current_setting('test.bill.contract')::uuid;lease uuid:=gen_random_uuid();until1 timestamptz;begin
 select paid_until into until1 from public.billing_contracts where billing_contracts.id=id;
 perform public.billing_claim(id,lease);perform public.billing_apply(id,lease,'cancelled','22222','[]');
 if (select expires_at from public.farm_subscriptions where farm_id=current_setting('test.bill.farm')::bigint)<>until1 then raise exception 'Cancel removed paid access';end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.bill.admin'),'role','authenticated','aal','aal2')::text,true);
set local role authenticated;
do $$
#variable_conflict use_variable
declare f bigint:=current_setting('test.bill.farm')::bigint;rev integer;begin
 select revision into rev from public.farm_subscriptions where farm_id=f;
 perform public.admin_set_farm_plan(f,'complete','trial','monthly',null,rev);
 if (select billing_contract_id from public.farm_subscriptions where farm_id=f) is not null then raise exception 'Manual grant retained old billing source';end if;
end $$;
reset role;
select set_config('request.jwt.claims','{}',true);
set local role service_role;
do $$
#variable_conflict use_variable
declare id uuid:=current_setting('test.bill.contract')::uuid;id2 uuid:=current_setting('test.bill.contract2')::uuid;lease uuid:=gen_random_uuid();r jsonb;begin
 perform public.billing_claim(id,lease);r:=public.billing_apply(id,lease,'cancelled','22222','[]');
 if (select status from public.farm_subscriptions where farm_id=current_setting('test.bill.farm')::bigint)<>'trial' or r->>'review_reason'<>'manual_override' then raise exception 'Old billing overwrote free trial';end if;
 r:=public.billing_reserve(id2,current_setting('test.bill.other')::uuid,current_setting('test.bill.farm2')::bigint,'complete','annual','11111',repeat('a',64));
 if (r->'contract'->>'amount')::int<>1440 then raise exception 'Wrong annual price';end if;
end $$;
reset role;
-- An admin free grant after checkout creation wins over a late payment.
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.bill.admin'),'role','authenticated','aal','aal2')::text,true);
set local role authenticated;
select public.admin_set_farm_plan(current_setting('test.bill.farm2')::bigint,'complete','trial','monthly',null,1);
reset role;
select set_config('request.jwt.claims','{}',true);
set local role service_role;
do $$
#variable_conflict use_variable
declare id uuid:=current_setting('test.bill.contract2')::uuid;lease uuid:=gen_random_uuid();r jsonb;begin
 perform public.billing_claim(id,lease);r:=public.billing_apply(id,lease,'authorized','33333',jsonb_build_array(jsonb_build_object('id','bill-year','status','approved','approved_at',now(),'modified_at',now(),'amount',1440,'refunded_amount',0)));
 if r->>'review_reason'<>'access_changed' or (select status from public.farm_subscriptions where farm_id=current_setting('test.bill.farm2')::bigint)<>'trial' then raise exception 'Late payment overwrote admin decision';end if;
 if (r->>'paid_until')::timestamptz is distinct from (((now() at time zone 'America/Sao_Paulo')+interval '12 months') at time zone 'America/Sao_Paulo') then raise exception 'Wrong annual period';end if;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.billing_owner(null);raise exception 'Anonymous owner context';exception when insufficient_privilege then null;end;
 begin perform public.billing_job_secret();raise exception 'Anonymous job credential';exception when insufficient_privilege then null;end;
 begin perform public.billing_job_claim(0);raise exception 'Anonymous job claim';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$ begin if position('x-billing-job' in pg_get_functiondef('private.billing_run_job()'::regprocedure))>0 then raise exception 'Job secret queued';end if;end $$;
do $$ begin if exists(select 1 from billing_original b join public.farm_subscriptions s using(farm_id) where b.value is distinct from to_jsonb(s)) then raise exception 'Real customer access changed';end if;end $$;
rollback;
