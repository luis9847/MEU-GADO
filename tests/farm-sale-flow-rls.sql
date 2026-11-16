begin;
select set_config('test.sales.owner',gen_random_uuid()::text,true),set_config('test.sales.other',gen_random_uuid()::text,true),set_config('test.sales.employee',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data)
select v::uuid,'sale-flow-'||v||'@example.invalid','{}' from unnest(array[current_setting('test.sales.owner'),current_setting('test.sales.other'),current_setting('test.sales.employee')]) v;
insert into public.farms(owner_id,name) values
(current_setting('test.sales.owner')::uuid,'__VENDA_TESTE__'),(current_setting('test.sales.other')::uuid,'__VENDA_OUTRA__');
select set_config('test.sales.farm',id::text,true) from public.farms where owner_id=current_setting('test.sales.owner')::uuid;
update public.farm_subscriptions set plan='complete',status='active',billing_period='monthly',expires_at=now()+interval '1 month' where farm_id=current_setting('test.sales.farm')::bigint;
insert into public.farm_members(farm_id,user_id,role,active) values(current_setting('test.sales.farm')::bigint,current_setting('test.sales.employee')::uuid,'employee',true);
select set_config('request.jwt.claim.sub',current_setting('test.sales.owner'),true);
set local role authenticated;
do $$
declare f bigint:=current_setting('test.sales.farm')::bigint;
 d date:=(now() at time zone 'America/Sao_Paulo')::date; a bigint; b bigint; c bigint; sa bigint; sb bigint;
begin
 insert into public.animals(farm_id,number,category,lot) values(f,'__VENDA_AVISTA__','Vaca','Lote A') returning id into a;
 insert into public.animals(farm_id,number,category,lot) values(f,'__VENDA_PRAZO__','Vaca','Lote B') returning id into b;
 insert into public.animals(farm_id,number,category) values(f,'__VENDA_NAO_ALTERAR__','Vaca') returning id into c;
 perform set_config('test.sales.c',c::text,true);
 sa:=public.mg_register_farm_sale(f,a,d,1550.25,'À vista',null,true,null);
 sb:=public.mg_register_farm_sale(f,b,d-15,1200,'A prazo',d,false,null);
 if not exists(select 1 from public.farm_animal_sales where id=sa and received_on=d and amount=1550.25 and lot='Lote A') then raise exception 'Immediate receipt was not atomic';end if;
 if not exists(select 1 from public.farm_animal_sales where id=sb and received_on is null and due_date=d and amount=1200) then raise exception 'Deferred sale was not pending';end if;
 if (select count(*) from public.animals where id in(a,b) and status='inactive' and exit_type='Vendido')<>2 then raise exception 'Animals not marked sold';end if;
 begin perform public.mg_register_farm_sale(f,a,d,1550.25,null,null,true,null);raise exception 'Duplicate sale allowed';exception when invalid_parameter_value then null;end;
 begin perform public.mg_register_farm_sale(f,c,d,1200,null,d-1,false,null);raise exception 'Invalid due date accepted';exception when invalid_parameter_value then null;end;
 if not exists(select 1 from public.animals where id=c and status='active') then raise exception 'Failed sale left animal inactive';end if;
 update public.farm_animal_sales set received_on=d where id=sb and received_on is null;
 if not exists(select 1 from public.farm_animal_sales where id=sb and received_on=d) then raise exception 'Pending receipt was not confirmed';end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.sales.employee'),true);
do $$ begin
 begin perform public.mg_register_farm_sale(current_setting('test.sales.farm')::bigint,current_setting('test.sales.c')::bigint,current_date,1200,null,null,true,null);
 raise exception 'Employee registered sale';exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.sales.other'),true);
do $$ begin
 begin perform public.mg_register_farm_sale(current_setting('test.sales.farm')::bigint,current_setting('test.sales.c')::bigint,current_date,1200,null,null,true,null);
 raise exception 'Cross-farm sale succeeded';exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: immediate, deferred, confirmation, duplicate protection, invalid dates, employee and tenant access' as result;
rollback;
