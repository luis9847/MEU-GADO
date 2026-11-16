begin;
select set_config('test.ops.owner',gen_random_uuid()::text,true),set_config('test.ops.other',gen_random_uuid()::text,true),set_config('test.ops.employee',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data)
select v::uuid,'farm-ops-'||v||'@example.invalid','{}' from unnest(array[current_setting('test.ops.owner'),current_setting('test.ops.other'),current_setting('test.ops.employee')]) v;
insert into public.farms(owner_id,name) values
(current_setting('test.ops.owner')::uuid,'__FARM_OPS_OWNER__'),(current_setting('test.ops.other')::uuid,'__FARM_OPS_OTHER__');
select set_config('test.ops.farm',id::text,true) from public.farms where owner_id=current_setting('test.ops.owner')::uuid;
select set_config('test.ops.farm2',id::text,true) from public.farms where owner_id=current_setting('test.ops.other')::uuid;
update public.farm_subscriptions set plan='complete',status='active',billing_period='monthly',expires_at=now()+interval '1 month'
where farm_id=current_setting('test.ops.farm')::bigint;
insert into public.farm_members (farm_id,user_id,role,active) values
(current_setting('test.ops.farm')::bigint,current_setting('test.ops.employee')::uuid,'employee',true);
insert into public.lots(farm_id,name) values(current_setting('test.ops.farm2')::bigint,'__FARM_OPS_FOREIGN_LOT__');
select set_config('test.ops.lot2',id::text,true) from public.lots where farm_id=current_setting('test.ops.farm2')::bigint and name='__FARM_OPS_FOREIGN_LOT__';
select set_config('request.jwt.claim.sub',current_setting('test.ops.owner'),true);
set local role authenticated;
do $$
declare f bigint:=current_setting('test.ops.farm')::bigint; a bigint; s bigint;
 d date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 insert into public.animals(farm_id,number,category,lot) values(f,'__OPS_361__','Vaca','Lote A') returning id into a;
 update public.animals set status='inactive',exit_type='Vendido',exit_date=d-10,exit_value=1550.25 where id=a;
 select id into s from public.farm_animal_sales where animal_id=a and amount=1550.25 and received_on is null and lot='Lote A';
 if s is null then raise exception 'Expected sale was not captured';end if;
 update public.farm_animal_sales set buyer='Comprador teste',due_date=d,received_on=d where id=s;
 if not exists(select 1 from public.farm_animal_sales where id=s and received_on=d) then raise exception 'Receipt could not be saved';end if;
 begin update public.farm_animal_sales set amount=1 where id=s;raise exception 'Sale amount was editable';exception when insufficient_privilege then null;end;
 begin update public.animals set status='active' where id=a;raise exception 'Received sale was cancelled';exception when check_violation then null;end;
 update public.farm_animal_sales set received_on=null where id=s;
 update public.animals set status='active' where id=a;
 if not exists(select 1 from public.farm_animal_sales where id=s and cancelled_at is not null) then raise exception 'Sale was not cancelled';end if;
 update public.animals set status='inactive',exit_type='Vendido',exit_date=d,exit_value=1632 where id=a;
 if (select count(*) from public.farm_animal_sales where animal_id=a)<>2 then raise exception 'Sale history was lost';end if;
 insert into public.farm_management_tasks(farm_id,title,kind,due_date) values(f,'__MANEJO__','health',d);
 update public.farm_management_tasks set status='done' where farm_id=f;
 if not exists(select 1 from public.farm_management_tasks where farm_id=f and status='done') then raise exception 'Task did not complete';end if;
 begin
  insert into public.farm_management_tasks(farm_id,title,kind,due_date,lot_id) values(f,'__OUTRO_LOTE__','health',d,current_setting('test.ops.lot2')::bigint);
  raise exception 'Foreign lot accepted';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.ops.employee'),true);
do $$ declare f bigint:=current_setting('test.ops.farm')::bigint;begin
 if exists(select 1 from public.farm_animal_sales where farm_id=f) then raise exception 'Employee got private finance';end if;
 if not exists(select 1 from public.farm_management_tasks where farm_id=f) then raise exception 'Employee cannot read agenda';end if;
 update public.farm_management_tasks set status='pending' where farm_id=f;
 if found then raise exception 'Employee modified agenda';end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.ops.other'),true);
do $$ declare f bigint:=current_setting('test.ops.farm')::bigint;begin
 if exists(select 1 from public.farm_animal_sales where farm_id=f) then raise exception 'Finance leaked between farms';end if;
 if exists(select 1 from public.farm_management_tasks where farm_id=f) then raise exception 'Agenda leaked between farms';end if;
end $$;
reset role;
select 'PASS: sales, receipts, reversal, task completion, wrong lot, employee and tenant isolation' as result;
rollback;
