-- Real authenticated policies and triggers; fixtures never persist.
begin;
select set_config('test.breeding.owner',gen_random_uuid()::text,true),set_config('test.breeding.other',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data) values
(current_setting('test.breeding.owner')::uuid,'breeding-'||current_setting('test.breeding.owner')||'@example.invalid','{}'),
(current_setting('test.breeding.other')::uuid,'breeding-'||current_setting('test.breeding.other')||'@example.invalid','{}');
insert into public.farms(owner_id,name) values(current_setting('test.breeding.owner')::uuid,'__BREEDING_A__'),(current_setting('test.breeding.other')::uuid,'__BREEDING_B__');
select set_config('test.breeding.farm',id::text,true) from public.farms where owner_id=current_setting('test.breeding.owner')::uuid;
select set_config('test.breeding.foreign',id::text,true) from public.farms where owner_id=current_setting('test.breeding.other')::uuid;
update public.farm_subscriptions set status='trial',plan='complete',expires_at=now()+interval '1 day' where farm_id in(current_setting('test.breeding.farm')::bigint,current_setting('test.breeding.foreign')::bigint);
insert into public.animals(farm_id,number,category,status) values(current_setting('test.breeding.foreign')::bigint,'FOREIGN','Touro','active');
select set_config('test.breeding.foreign_animal',id::text,true) from public.animals where farm_id=current_setting('test.breeding.foreign')::bigint;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.breeding.owner'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
do $$ declare f bigint:=current_setting('test.breeding.farm')::bigint; dad bigint; mom bigint; son bigint; grandkid bigint; before_count bigint;begin
 insert into public.animals(farm_id,number,name,category,reproductive_role,male_condition,status,registry_association,registry_series,registry_birth,registry_definitive,registry_category)
 values(f,'DAD','Touro Teste','Touro','reprodutor','inteiro','active','ABCZ','MG','001','002','PO') returning id into dad;
 insert into public.animals(farm_id,number,category,reproductive_role,status) values(f,'MOM','Vaca','matriz','inactive') returning id into mom;
 insert into public.animals(farm_id,number,category,status,father_id,mother_id) values(f,'SON','Touro','active',dad,mom) returning id into son;
 if not exists(select 1 from public.animals where id=son and father_id=dad and mother_id=mom) then raise exception 'Parent links did not persist';end if;
 if (select registry_birth from public.animals where id=dad) is distinct from '001' then raise exception 'Registry did not persist';end if;
 select count(*) into before_count from public.animals where farm_id=f;
 update public.animals set father_external_name='Central Externa',father_external_registry='CENT 77' where id=dad;
 if (select count(*) from public.animals where farm_id=f)<>before_count then raise exception 'External ancestor increased herd';end if;
 -- Preserve unrelated fields on legacy updates, allow explicit clearing.
 update public.animals set notes='Legacy payload' where id=dad;
 if (select registry_birth from public.animals where id=dad) is distinct from '001' then raise exception 'Legacy update erased registry';end if;
 update public.animals set registry_birth=null where id=dad;
 begin update public.animals set father_id=son,father_external_name=null,father_external_registry=null where id=dad;raise exception 'Cycle permitted';exception when check_violation then null;end;
 begin update public.animals set father_id=son where id=son;raise exception 'Self parent permitted';exception when check_violation then null;end;
 begin update public.animals set father_id=current_setting('test.breeding.foreign_animal')::bigint where id=son;raise exception 'Cross-farm parent permitted';exception when check_violation then null;end;
 begin update public.animals set father_id=mom where id=son;raise exception 'Female father permitted';exception when check_violation then null;end;
 begin update public.animals set mother_id=dad where id=son;raise exception 'Male mother permitted';exception when check_violation then null;end;
 begin update public.animals set father_external_name='Conflicting source' where id=son;raise exception 'Two parent sources permitted';exception when check_violation then null;end;
 begin update public.animals set registry_series=repeat('a',31) where id=dad;raise exception 'Oversized series permitted';exception when check_violation then null;end;
 begin update public.animals set category='Outra' where id=dad;raise exception 'Unknown category permitted';exception when check_violation then null;end;
 begin update public.animals set male_condition='castrado' where id=dad;raise exception 'Castrated bull permitted';exception when check_violation then null;end;
 begin update public.animals set reproductive_role='doadora' where id=dad;raise exception 'Wrong reproductive role permitted';exception when check_violation then null;end;
 begin update public.animals set category='Boi',reproductive_role=null where id=mom;raise exception 'Changed sex of linked dam';exception when check_violation then null;end;
 update public.animals set deleted_at=now() where id=dad;
 update public.animals set notes='Historical link retained' where id=son;
 begin insert into public.animals(farm_id,number,category,status,father_id) values(f,'TRASH_PARENT','Bezerro','active',dad);raise exception 'New trash parent permitted';exception when check_violation then null;end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.breeding.other'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
do $$ declare affected integer;begin
 if exists(select 1 from public.animals where farm_id=current_setting('test.breeding.farm')::bigint) then raise exception 'Other owner reads pedigree';end if;
 update public.animals set registry_birth='Cross-tenant' where farm_id=current_setting('test.breeding.farm')::bigint;get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Other owner writes pedigree';end if;
end $$;
reset role;
select 'PASS: registry CRUD, parents, external references, historical links, cycles, sex/role, castration, limits and cross-farm isolation' as result;
rollback;
