begin;
select set_config('test.postpartum.owner',gen_random_uuid()::text,true),set_config('test.postpartum.other',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data)
select v::uuid,'postpartum-'||v||'@example.invalid','{}' from unnest(array[current_setting('test.postpartum.owner'),current_setting('test.postpartum.other')]) v;
insert into public.farms(owner_id,name) values
(current_setting('test.postpartum.owner')::uuid,'__POS_PARTO_TESTE__'),(current_setting('test.postpartum.other')::uuid,'__POS_PARTO_OUTRO__');
select set_config('test.postpartum.farm',id::text,true) from public.farms where owner_id=current_setting('test.postpartum.owner')::uuid;
update public.farm_subscriptions set plan='essential',status='active',billing_period='monthly',expires_at=now()+interval '1 month'
where farm_id=current_setting('test.postpartum.farm')::bigint;
select set_config('request.jwt.claim.sub',current_setting('test.postpartum.owner'),true);
set local role authenticated;
do $$
declare f bigint:=current_setting('test.postpartum.farm')::bigint; a bigint; b bigint;
begin
 insert into public.animals(farm_id,number,category) values(f,'__POS_PARTO_1__','Vaca') returning id into a;
 insert into public.reproductive_events(farm_id,animal_id,event_type,event_date) values(f,a,'Parto',current_date) returning id into b;
 perform set_config('test.postpartum.birth',b::text,true);
 update public.reproductive_events set postpartum_checklist='{"vaca":true,"colostro":true}' where id=b;
 if not exists(select 1 from public.reproductive_events where id=b and postpartum_checklist->'colostro'='true'::jsonb) then raise exception 'Checklist did not save';end if;
 begin
  update public.reproductive_events set postpartum_checklist='{"colostro":"yes"}' where id=b;
  raise exception 'Non-boolean value accepted';
 exception when check_violation then null;end;
 begin
  update public.reproductive_events set postpartum_checklist='{"sem_cria_viva":true,"peso":true}' where id=b;
  raise exception 'Inconsistent calf checklist accepted';
 exception when check_violation then null;end;
 update public.reproductive_events set notes='date correction' where id=b;
 if not exists(select 1 from public.reproductive_events where id=b and postpartum_checklist->'colostro'='true'::jsonb) then raise exception 'Checklist was erased by normal correction';end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.postpartum.other'),true);
do $$ declare b bigint:=current_setting('test.postpartum.birth')::bigint;begin
 if exists(select 1 from public.reproductive_events where id=b) then raise exception 'Checklist leaked to another farm';end if;
 update public.reproductive_events set postpartum_checklist='{}' where id=b;
 if found then raise exception 'Another farm changed the checklist';end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.postpartum.owner'),true);
do $$ declare b bigint:=current_setting('test.postpartum.birth')::bigint;begin
 update public.reproductive_events set event_type='Aborto' where id=b;
 if not exists(select 1 from public.reproductive_events where id=b and postpartum_checklist is null) then raise exception 'Checklist must not transfer to a different event';end if;
end $$;
reset role;
select 'PASS: plan Essential, persisted checklist, validation, tenant isolation and event correction' as result;
rollback;
