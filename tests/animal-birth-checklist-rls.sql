begin;
select set_config('test.birth.owner',gen_random_uuid()::text,true),set_config('test.birth.other',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data) values
(current_setting('test.birth.owner')::uuid,gen_random_uuid()::text||'@example.invalid','{}'),
(current_setting('test.birth.other')::uuid,gen_random_uuid()::text||'@example.invalid','{}');
insert into public.farms(owner_id,name) values(current_setting('test.birth.owner')::uuid,'__BIRTH_CHECKLIST_TEST__');
select set_config('test.birth.farm',id::text,true) from public.farms where name='__BIRTH_CHECKLIST_TEST__';
update public.farm_subscriptions set status='trial',plan='complete',expires_at=now()+interval '1 day' where farm_id=current_setting('test.birth.farm')::bigint;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.birth.owner'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
insert into public.animals(farm_id,number,category,status,birth_date,birth_checklist) values
(current_setting('test.birth.farm')::bigint,'__BIRTH_M__','Bezerro','active',current_date,'{"colostro":true,"umbigo":true,"brinco":false,"peso":false}'),
(current_setting('test.birth.farm')::bigint,'__BIRTH_F__','Bezerra','active',current_date,'{"colostro":false}');
do $$ declare f bigint:=current_setting('test.birth.farm')::bigint;begin
 if not exists(select 1 from public.animals where farm_id=f and number='__BIRTH_M__' and birth_checklist @> '{"colostro":true,"peso":false}') then raise exception 'Birth care not saved';end if;
 update public.animals set birth_checklist='{"colostro":false,"umbigo":true,"brinco":true,"peso":true}' where farm_id=f and number='__BIRTH_M__';
 update public.animals set category='Novilho',notes='Grown calf' where farm_id=f and number='__BIRTH_M__';
 if not exists(select 1 from public.animals where farm_id=f and number='__BIRTH_M__' and birth_checklist @> '{"umbigo":true,"colostro":false}') then raise exception 'History lost on growth/edit';end if;
 begin update public.animals set birth_checklist='{"vaca":true}' where farm_id=f;raise exception 'Matrix key accepted';exception when check_violation then null;end;
 begin update public.animals set birth_checklist='{"colostro":"true"}' where farm_id=f;raise exception 'Non boolean accepted';exception when check_violation then null;end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.birth.other'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
do $$begin
 if exists(select 1 from public.animals where farm_id=current_setting('test.birth.farm')::bigint) then raise exception 'Another farm data leaked';end if;
 update public.animals set birth_checklist='{}' where farm_id=current_setting('test.birth.farm')::bigint;
 if found then raise exception 'Other user edited care';end if;
end $$;
reset role;
select 'PASS: calf care saved, editable, historical, validated and isolated by farm' as result;
rollback;
