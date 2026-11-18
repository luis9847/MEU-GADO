begin;
create temp table billing_original as select farm_id,to_jsonb(s) value from public.farm_subscriptions s;
select set_config('test.bill.owner',gen_random_uuid()::text,true),set_config('test.bill.other',gen_random_uuid()::text,true),set_config('test.bill.contract',gen_random_uuid()::text,true),set_config('test.bill.contract2',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data) values(current_setting('test.bill.owner')::uuid,'billing-'||current_setting('test.bill.owner')||'@example.invalid','{}'),(current_setting('test.bill.other')::uuid,'billing-'||current_setting('test.bill.other')||'@example.invalid','{}');
insert into public.farms(owner_id,name) values(current_setting('test.bill.owner')::uuid,'__BILL_OWNER__'),(current_setting('test.bill.other')::uuid,'__BILL_OTHER__');
select set_config('test.bill.farm',id::text,true) from public.farms where name='__BILL_OWNER__';
select set_config('test.bill.farm2',id::text,true) from public.farms where name='__BILL_OTHER__';
select set_config('test.bill.admin',user_id::text,true) from public.admin_users limit 1;
update public.billing_settings set enabled=true,seller_id='11111';

set local role authenticated;
do $$ begin
 if has_function_privilege('authenticated','public.billing_reserve_pix(uuid,uuid,bigint,text,text,text,text,boolean)','execute') then raise exception 'Pix reservation exposed';end if;
end $$;
set local role service_role;
do $$
declare c uuid:=current_setting('test.bill.contract')::uuid; f bigint:=current_setting('test.bill.farm')::bigint; actor uuid:=current_setting('test.bill.owner')::uuid; r jsonb;l uuid; until1 timestamptz; payload jsonb;
begin
 r:=public.billing_reserve_pix(c,actor,f,'essential','monthly','11111',repeat('a',64),false);
 if r->'contract'->>'payment_method'<>'pix' then raise exception 'Wrong payment method';end if;
 r:=public.billing_reserve_pix(c,actor,f,'essential','monthly','11111',repeat('a',64),false);
 if (r->>'created')::boolean then raise exception 'Duplicate reservation';end if;
 payload:=jsonb_build_array(jsonb_build_object('id','pix-sql-fixture','status','approved','approved_at',now(),'modified_at',now(),'amount',90,'refunded_amount',0));
 l:=gen_random_uuid();perform public.billing_claim(c,l);r:=public.billing_apply(c,l,'authorized','22222',payload);
 if r->>'status'<>'cancelled' or r->>'activated_at' is null or r->>'review_reason' is not null then raise exception 'Pix activation/closure failed';end if;
 if (select status from public.farm_subscriptions where farm_id=f)<>'active' then raise exception 'Pix access not active';end if;
 until1:=(r->>'paid_until')::timestamptz;
 l:=gen_random_uuid();perform public.billing_claim(c,l);r:=public.billing_apply(c,l,'authorized','22222',payload);
 if (r->>'paid_until')::timestamptz<>until1 then raise exception 'Duplicate payment extended validity';end if;
 l:=gen_random_uuid();perform public.billing_claim(c,l);r:=public.billing_apply(c,l,'cancelled','22222',jsonb_build_array(jsonb_build_object('id','pix-sql-fixture','status','refunded','approved_at',now(),'modified_at',now()+interval '1 second','amount',90,'refunded_amount',90)));
 if (select status from public.farm_subscriptions where farm_id=f)<>'suspended' then raise exception 'Refund retained access';end if;
 update public.farm_subscriptions set status='pending',expires_at=null,billing_contract_id=null where farm_id=f;
 update public.billing_contracts set review_reason=null where id=c;
 c:=current_setting('test.bill.contract2')::uuid;
 r:=public.billing_reserve_pix(c,actor,f,'complete','annual','11111',repeat('b',64),false);
 update public.billing_contracts set status='cancelled' where id=c;
 l:=gen_random_uuid();perform public.billing_claim(c,l);r:=public.billing_apply(c,l,'authorized','22222',jsonb_build_array(jsonb_build_object('id','pix-sql-late','status','approved','approved_at',now(),'modified_at',now(),'amount',1440,'refunded_amount',0)));
 if r->>'review_reason'<>'payment_after_cancellation' or r->>'activated_at' is not null then raise exception 'Late cancelled Pix activated access';end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from billing_original o join public.farm_subscriptions s using(farm_id) where o.value<>to_jsonb(s)) then raise exception 'Real customer access changed';end if;
end $$;
rollback;
