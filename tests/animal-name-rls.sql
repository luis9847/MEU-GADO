-- Ephemeral fixtures only. All changes are rolled back.
begin;
select set_config('test.animalname.owner',gen_random_uuid()::text,true),set_config('test.animalname.other',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data) values
(current_setting('test.animalname.owner')::uuid,'name-'||current_setting('test.animalname.owner')||'@example.invalid','{}'),
(current_setting('test.animalname.other')::uuid,'name-'||current_setting('test.animalname.other')||'@example.invalid','{}');
insert into public.farms(owner_id,name) values(current_setting('test.animalname.owner')::uuid,'__ANIMAL_NAME_TEST__');
select set_config('test.animalname.farm',id::text,true) from public.farms where owner_id=current_setting('test.animalname.owner')::uuid;
update public.farm_subscriptions set status='trial',plan='complete',expires_at=now()+interval '1 day' where farm_id=current_setting('test.animalname.farm')::bigint;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.animalname.owner'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
do $$ declare f bigint:=current_setting('test.animalname.farm')::bigint; a bigint; begin
 insert into public.animals(farm_id,number,name,status,category) values(f,'NAME-1','Bela Vista FIV','active','Boi') returning id into a;
 if (select name from public.animals where id=a) is distinct from 'Bela Vista FIV' then raise exception 'Name did not persist';end if;
 update public.animals set name='Bela Vista Atualizado' where id=a;
 if (select name from public.animals where id=a) is distinct from 'Bela Vista Atualizado' then raise exception 'Name edit did not persist';end if;
 insert into public.animals(farm_id,number,name,status,category) values(f,'NAME-2','Bela Vista Atualizado','active','Boi');
 insert into public.animals(farm_id,number,status,category) values(f,'NAME-3','active','Boi');
 update public.animals set name=repeat('Á',120) where id=a;
 begin update public.animals set name=repeat('a',121) where id=a;raise exception 'Oversized name allowed';exception when check_violation then null;end;
 update public.animals set name=null where id=a;
 if (select name from public.animals where id=a) is not null then raise exception 'Optional name cannot be cleared';end if;
 begin insert into public.animals(farm_id,number,name,status,category) values(f,'NAME-1','Different name','active','Boi');raise exception 'Name bypassed number uniqueness';exception when unique_violation then null;end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.animalname.other'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
do $$ declare affected integer;begin
 if exists(select 1 from public.animals where farm_id=current_setting('test.animalname.farm')::bigint) then raise exception 'Other owner can read names';end if;
 update public.animals set name='Cross-tenant' where farm_id=current_setting('test.animalname.farm')::bigint;
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Other owner can change names';end if;
end $$;
reset role;
select 'PASS: optional name, create/edit/clear, Unicode length, duplicate names allowed, number uniqueness and tenant isolation' as result;
rollback;
