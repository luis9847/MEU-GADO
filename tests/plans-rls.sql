-- Real DB checks under authenticated/anon roles. All fixtures rolled back.
begin;
select set_config('test.plan.owner',gen_random_uuid()::text,true),set_config('test.plan.owner2',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data) values
(current_setting('test.plan.owner')::uuid,'plan-'||current_setting('test.plan.owner')||'@example.invalid','{}'),
(current_setting('test.plan.owner2')::uuid,'plan-'||current_setting('test.plan.owner2')||'@example.invalid','{}');
select set_config('test.plan.admin',user_id::text,true) from public.admin_users limit 1;
-- Fixtures own no real customer data. Sequence values may advance; rows never persist.
insert into public.farms(owner_id,name) values(current_setting('test.plan.owner')::uuid,'__PLAN_TEST_A__');
select set_config('test.plan.farm',id::text,true) from public.farms where name='__PLAN_TEST_A__';
insert into public.farms(owner_id,name) values(current_setting('test.plan.owner2')::uuid,'__PLAN_TEST_B__');
select set_config('test.plan.other',id::text,true) from public.farms where name='__PLAN_TEST_B__';
-- A newly registered property starts pending and cannot self-activate.
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.plan.owner'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
do $$ declare f bigint:=current_setting('test.plan.farm')::bigint; n int; begin
 if public.get_farm_plan(f)->>'status'<>'pending' then raise exception 'New farm not pending'; end if;
 begin update public.farm_subscriptions set status='active' where farm_id=f;raise exception 'Owner self-activation allowed';exception when insufficient_privilege then null;end;
 begin perform public.admin_set_farm_plan(f,'complete','trial','monthly',null,1);raise exception 'Owner admin RPC allowed';exception when insufficient_privilege then null;end;
 begin insert into public.animals(farm_id,number,category) values(f,'PENDING','Boi');raise exception 'Pending write allowed';exception when insufficient_privilege then null;end;
 if exists(select 1 from public.subscription_audit) then raise exception 'Audit leaked';end if;
end $$;
reset role;
-- Admin with configured MFA must use aal2.
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.plan.admin'),'role','authenticated','aal','aal2')::text,true);
set local role authenticated;
select public.admin_set_farm_plan(current_setting('test.plan.farm')::bigint,'complete','trial','monthly',now()+interval '14 days',1);
select public.admin_set_farm_plan(current_setting('test.plan.other')::bigint,'complete','trial','monthly',null,1);
do $$ declare f bigint:=current_setting('test.plan.farm')::bigint;begin
 if not exists(select 1 from public.subscription_audit where farm_id=f and before_value->>'status'='pending' and after_value->>'status'='trial') then raise exception 'Audit missing';end if;
 begin perform public.admin_set_farm_plan(f,'complete','active','annual',null,1);raise exception 'Stale update allowed';exception when serialization_failure then null;end;
 begin perform public.admin_set_farm_plan(f,'invalid','trial','monthly',null,2);raise exception 'Invalid plan allowed';exception when invalid_parameter_value then null;end;
 begin perform public.admin_set_farm_plan(f,'complete','trial','monthly',now()-interval '1 day',2);raise exception 'Past validity accepted';exception when invalid_parameter_value then null;end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.plan.owner'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
insert into public.expenses(farm_id,category,expense_date,amount,description) values(current_setting('test.plan.farm')::bigint,'OUTROS',current_date,1,'__PLAN_TEST__');
insert into public.feed_ingredients(farm_id,name,kind) values(current_setting('test.plan.farm')::bigint,'__PLAN_TEST__','outro');
insert into public.animals(farm_id,number,status,category) select current_setting('test.plan.farm')::bigint,'TEST-'||i,'active','Boi' from generate_series(1,149) i;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.plan.admin'),'role','authenticated','aal','aal2')::text,true);
set local role authenticated;
select public.admin_set_farm_plan(current_setting('test.plan.farm')::bigint,'essential','active','annual',now()+interval '1 year',2);
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.plan.owner'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
do $$ declare f bigint:=current_setting('test.plan.farm')::bigint; a bigint; begin
 if (public.get_farm_plan(f)->>'head_limit')::int<>150 then raise exception 'Quota missing';end if;
 if exists(select 1 from public.expenses where farm_id=f) or exists(select 1 from public.feed_ingredients where farm_id=f) then raise exception 'Essential premium read allowed';end if;
 begin insert into public.expenses(farm_id,category,expense_date,amount) values(f,'OUTROS',current_date,1);raise exception 'Essential expense allowed';exception when insufficient_privilege then null;end;
 insert into public.nutrition_entries(farm_id,lot_name,entry_date,feed_name,quantity_kg) values(f,'TEST',current_date,'SILO',10);
 insert into public.animals(farm_id,number,status,category) values(f,'TEST-150','active','Boi') returning id into a;
 begin insert into public.animals(farm_id,number,status,category) values(f,'TEST-151','active','Boi');raise exception '151st animal allowed';exception when check_violation then null;end;
 -- Ordinary editing at the limit must still work.
 update public.animals set notes='Edit at limit' where id=a;
 update public.animals set status='inactive' where id=a;
 insert into public.animals(farm_id,number,status,category) values(f,'TEST-REPLACE','active','Boi');
 begin update public.animals set status='active' where id=a;raise exception 'Reactivation bypassed limit';exception when check_violation then null;end;
 update public.animals set deleted_at=now() where number='TEST-REPLACE' and farm_id=f;
 insert into public.animals(farm_id,number,status,category) values(f,'TEST-AFTER-TRASH','active','Boi');
 begin update public.animals set deleted_at=null where number='TEST-REPLACE' and farm_id=f;raise exception 'Restore bypassed limit';exception when check_violation then null;end;
 -- Existing user cannot transfer an animal to another owned property to evade access rules.
 begin update public.animals set farm_id=current_setting('test.plan.other')::bigint where id=a;raise exception 'Farm transfer allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.plan.admin'),'role','authenticated','aal','aal2')::text,true);
set local role authenticated;
select public.admin_set_farm_plan(current_setting('test.plan.farm')::bigint,'complete','active','monthly',null,3);
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.plan.owner'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
insert into public.animals(farm_id,number,status,category) values(current_setting('test.plan.farm')::bigint,'TEST-151-COMPLETE','active','Boi');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.plan.admin'),'role','authenticated','aal','aal2')::text,true);
set local role authenticated;
do $$begin
 begin perform public.admin_set_farm_plan(current_setting('test.plan.farm')::bigint,'essential','active','monthly',null,4);raise exception 'Downgrade over limit allowed';exception when invalid_parameter_value then null;end;
end $$;
reset role;
-- Simulate server-side expiry. Existing rows stay readable, writes (including definer RPC deletes) fail.
update public.farm_subscriptions set expires_at=now()-interval '1 minute',status='trial' where farm_id=current_setting('test.plan.farm')::bigint;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.plan.owner'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
do $$declare f bigint:=current_setting('test.plan.farm')::bigint;begin
 if (public.get_farm_plan(f)->>'can_write')::boolean then raise exception 'Expired subscription writable';end if;
 if not exists(select 1 from public.animals where farm_id=f) then raise exception 'Existing data lost on expiry';end if;
 begin insert into public.weighings(farm_id,animal_id,weighing_date,weight) select f,id,current_date,400 from public.animals where farm_id=f limit 1;raise exception 'Expired weighing allowed';exception when insufficient_privilege then null;end;
 begin perform public.permanently_delete_trash_item('animals',id) from public.animals where farm_id=f and deleted_at is not null limit 1;raise exception 'Definer delete bypassed expiry';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
set local role authenticated;
do $$declare f bigint:=current_setting('test.plan.farm')::bigint;begin
 if exists(select 1 from public.farm_subscriptions) then raise exception 'Other user subscription leak';end if;
 begin perform public.get_farm_plan(f);raise exception 'Other user snapshot allowed';exception when insufficient_privilege then null;end;
 begin perform private.mg_plan_snapshot(f);raise exception 'Private function bypassed ownership';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.get_farm_plan(current_setting('test.plan.farm')::bigint);raise exception 'Anon RPC allowed';exception when insufficient_privilege then null;end;
 begin perform 1 from public.farm_subscriptions;raise exception 'Anon subscription SELECT allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'PASS: pending, trials, manual plans, audit, self-escalation, cross-tenant, invalid inputs, expiry, premium RLS, 149/150/151, reactivation, restoration, downgrade, definer deletes and anon (rolled back)' as result;
rollback;
