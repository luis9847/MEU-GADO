-- Entire fixture is rolled back. No live customer record is changed.
begin;
select set_config('test.grace.owner',gen_random_uuid()::text,true),set_config('test.grace.other',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data) values
(current_setting('test.grace.owner')::uuid,gen_random_uuid()::text||'@example.invalid','{}'),
(current_setting('test.grace.other')::uuid,gen_random_uuid()::text||'@example.invalid','{}');
select set_config('test.grace.admin',user_id::text,true) from public.admin_users limit 1;
insert into public.farms(owner_id,name) values(current_setting('test.grace.owner')::uuid,'__GRACE_DELETE_TEST__'),(current_setting('test.grace.other')::uuid,'__GRACE_KEEP_TEST__');
select set_config('test.grace.farm',id::text,true) from public.farms where name='__GRACE_DELETE_TEST__';
select set_config('test.grace.keep',id::text,true) from public.farms where name='__GRACE_KEEP_TEST__';
update public.farm_subscriptions set status='active',plan='complete',expires_at=now()-interval '47 hours' where farm_id=current_setting('test.grace.farm')::bigint;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.grace.owner'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
insert into public.animals(farm_id,number,status,category) values(current_setting('test.grace.farm')::bigint,'__GRACE_ANIMAL__','active','Boi');
do $$ declare f bigint:=current_setting('test.grace.farm')::bigint;s jsonb;begin
 s:=public.get_farm_plan(f);
 if not (s->>'can_write')::boolean or not (s->>'in_grace')::boolean then raise exception '48-hour grace not active';end if;
 begin perform public.admin_delete_farm(f,'__GRACE_DELETE_TEST__');raise exception 'Owner deleted farm';exception when insufficient_privilege then null;end;
 begin delete from public.farms where id=f;raise exception 'Owner direct deletion allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.farm_subscriptions set expires_at=now()-interval '48 hours' where farm_id=current_setting('test.grace.farm')::bigint;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.grace.owner'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
do $$ declare f bigint:=current_setting('test.grace.farm')::bigint;s jsonb;begin
 s:=public.get_farm_plan(f);
 if (s->>'can_write')::boolean or not (s->>'payment_blocked')::boolean then raise exception '48-hour boundary not blocked';end if;
 if exists(select 1 from public.animals where farm_id=f) then raise exception 'Overdue data readable';end if;
 if not exists(select 1 from public.farms where id=f) then raise exception 'Renewal farm unavailable';end if;
 if public.billing_owner(f)->>'farm_id'<>f::text then raise exception 'Renewal context inaccessible';end if;
 begin insert into public.animals(farm_id,number,status,category) values(f,'BLOCKED','active','Boi');raise exception 'Expired write allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
-- Renewal restores access without toggling the manual blocked flag.
update public.farm_subscriptions set expires_at=now()+interval '30 days' where farm_id=current_setting('test.grace.farm')::bigint;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.grace.owner'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
do $$begin
 if not exists(select 1 from public.animals where farm_id=current_setting('test.grace.farm')::bigint) then raise exception 'Renewed data unavailable';end if;
end $$;
reset role;
-- Only admin can delete. Wrong name and financial history must be rejected.
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.grace.admin'),'role','authenticated','aal','aal2')::text,true);
set local role authenticated;
do $$begin
 begin perform public.admin_delete_farm(current_setting('test.grace.farm')::bigint,'wrong name');raise exception 'Incorrect name accepted';exception when invalid_parameter_value then null;end;
end $$;
reset role;
insert into public.billing_contracts(id,farm_id,created_by,plan,billing_period,amount,expected_revision,seller_id,notify_hash,status)
select gen_random_uuid(),current_setting('test.grace.keep')::bigint,current_setting('test.grace.owner')::uuid,'complete','monthly',130,1,'fixture',repeat('0',64),'cancelled';
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.grace.admin'),'role','authenticated','aal','aal2')::text,true);
set local role authenticated;
do $$begin
 begin perform public.admin_delete_farm(current_setting('test.grace.keep')::bigint,'__GRACE_KEEP_TEST__');raise exception 'Contract history deleted';exception when invalid_parameter_value then null;end;
end $$;
select public.admin_delete_farm(current_setting('test.grace.farm')::bigint,'__GRACE_DELETE_TEST__');
reset role;
do $$begin
 if exists(select 1 from public.farms where id=current_setting('test.grace.farm')::bigint) or exists(select 1 from public.animals where farm_id=current_setting('test.grace.farm')::bigint) then raise exception 'Deletion incomplete';end if;
 if not exists(select 1 from public.admin_farm_audit where farm_id=current_setting('test.grace.farm')::bigint and action='delete' and farm_name='__GRACE_DELETE_TEST__') then raise exception 'Deletion audit missing';end if;
 if not exists(select 1 from public.farms where id=current_setting('test.grace.keep')::bigint) or not exists(select 1 from auth.users where id=current_setting('test.grace.owner')::uuid) then raise exception 'Other farm/user deleted';end if;
end $$;
select 'PASS: grace, expiry, renewal, admin-only deletion and financial preservation' as result;
rollback;
