-- Integration checks against existing farm roles, with all test writes rolled back.
begin;
select set_config('test.fp_farm1',f.id::text,true),set_config('test.fp_user1',f.owner_id::text,true),set_config('test.fp_lot1',l.id::text,true)
from public.farms f join public.lots l on l.farm_id=f.id and l.active and l.deleted_at is null
where f.archived_at is null and not f.blocked and exists(select 1 from public.farm_members m where m.farm_id=f.id and m.user_id=f.owner_id and m.active and m.role='owner') order by f.id,l.id limit 1;
select set_config('test.fp_farm2',f.id::text,true)
from public.farms f where f.id<>current_setting('test.fp_farm1')::bigint and f.archived_at is null and not f.blocked order by f.id limit 1;
select set_config('test.fp_food1',gen_random_uuid()::text,true),set_config('test.fp_food2',gen_random_uuid()::text,true),set_config('test.fp_plan',gen_random_uuid()::text,true);
insert into public.feed_ingredients(id,farm_id,name,kind,price_kg,dry_matter_pct) values
(current_setting('test.fp_food1')::uuid,current_setting('test.fp_farm1')::bigint,'TEST-'||current_setting('test.fp_food1'),'volumoso',0.30,35),
(current_setting('test.fp_food2')::uuid,current_setting('test.fp_farm2')::bigint,'TEST-'||current_setting('test.fp_food2'),'concentrado',2,90);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.fp_user1'),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare n int; p public.feeding_plans;
begin
 if not public.has_farm_role(current_setting('test.fp_farm1')::bigint,array['owner']) then raise exception 'Owner fixture invalid'; end if;
 select count(*) into n from public.feed_ingredients where id=current_setting('test.fp_food2')::uuid;
 if n<>0 then raise exception 'Cross-farm SELECT leaked'; end if;
 update public.feed_ingredients set price_kg=999 where id=current_setting('test.fp_food2')::uuid;
 get diagnostics n=row_count; if n<>0 then raise exception 'Cross-farm UPDATE allowed'; end if;
 begin
  insert into public.feed_ingredients(farm_id,name,kind) values(current_setting('test.fp_farm2')::bigint,'DENIED','outro');
  raise exception 'Cross-farm INSERT allowed';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.feed_ingredients(farm_id,name,kind,price_kg) values(current_setting('test.fp_farm1')::bigint,'NEGATIVE','outro',-1);
  raise exception 'Negative price accepted';
 exception when check_violation then null; end;
 insert into public.feeding_plans(id,farm_id,lot_id,name,management,meals,start_date,end_date,items)
 values(current_setting('test.fp_plan')::uuid,current_setting('test.fp_farm1')::bigint,current_setting('test.fp_lot1')::bigint,'TEST PLAN','semi',2,'2099-01-01','2099-01-10',jsonb_build_array(jsonb_build_object('ingredient_id',current_setting('test.fp_food1'),'kg_head_day',15,'price_kg',999))) returning * into p;
 if (p.items->0->>'price_kg')::numeric<>0.30 then raise exception 'Client price was trusted'; end if;
 begin
  update public.feeding_plans set items=jsonb_build_array(jsonb_build_object('ingredient_id',current_setting('test.fp_food2'),'kg_head_day',1)) where id=p.id;
  raise exception 'Foreign ingredient accepted';
 exception when raise_exception then if sqlerrm='Foreign ingredient accepted' then raise; end if; end;
 begin
  insert into public.feeding_plans(farm_id,lot_id,name,management,meals,start_date,items) values(p.farm_id,p.lot_id,'OVERLAP','semi',2,'2099-01-02',p.items);
  raise exception 'Overlapping plan allowed';
 exception when exclusion_violation then null; end;
 begin
  update public.feed_ingredients set archived=true where id=current_setting('test.fp_food1')::uuid;
  raise exception 'Ingredient with active plan archived';
 exception when raise_exception then if sqlerrm='Ingredient with active plan archived' then raise; end if; end;
 update public.feeding_plans set name='TEST EDIT' where id=p.id and revision=1;
 get diagnostics n=row_count;if n<>1 then raise exception 'Own plan edit failed';end if;
 update public.feeding_plans set name='STALE EDIT' where id=p.id and revision=1;
 get diagnostics n=row_count;if n<>0 then raise exception 'Revision conflict failed';end if;
 update public.feeding_plans set archived=true where id=p.id;
 update public.feed_ingredients set archived=true where id=current_setting('test.fp_food1')::uuid;
end $$;
-- Unrelated authenticated identity cannot see farm catalog/plans or insert data.
select set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
do $$ begin
 if exists(select 1 from public.feed_ingredients where id in (current_setting('test.fp_food1')::uuid,current_setting('test.fp_food2')::uuid)) then raise exception 'Unrelated user can read foods';end if;
 if exists(select 1 from public.feeding_plans where id=current_setting('test.fp_plan')::uuid) then raise exception 'Unrelated user can read plans';end if;
 begin
 insert into public.feed_ingredients(farm_id,name,kind) values(current_setting('test.fp_farm1')::bigint,'DENIED','outro');
 raise exception 'Unrelated user can insert';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform 1 from public.feed_ingredients limit 1;raise exception 'Anon SELECT allowed';exception when insufficient_privilege then null;end;
 begin insert into public.feed_ingredients(farm_id,name,kind) values(current_setting('test.fp_farm1')::bigint,'DENIED','outro');raise exception 'Anon INSERT allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'PASS: persistence, authoritative snapshots, cross-farm SELECT/INSERT/UPDATE, unrelated user, anon, overlap, revision and archive checks (rolled back)' as result;
rollback;
