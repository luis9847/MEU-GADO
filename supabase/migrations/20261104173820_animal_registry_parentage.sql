-- Additive optional animal identification and direct parentage; existing RLS and plan guards stay in force.
alter table public.animals
 add column registry_association text,
 add column registry_series text,
 add column registry_birth text,
 add column registry_definitive text,
 add column registry_category text,
 add column reproductive_role text,
 add column male_condition text,
 add column father_id bigint,
 add column father_external_name text,
 add column father_external_registry text,
 add column mother_external_name text,
 add column mother_external_registry text;
alter table public.animals add constraint animals_registry_lengths check (
 coalesce(char_length(registry_association),0)<=80 and coalesce(char_length(registry_series),0)<=30 and
 coalesce(char_length(registry_birth),0)<=40 and coalesce(char_length(registry_definitive),0)<=40 and coalesce(char_length(registry_category),0)<=40 and
 coalesce(char_length(father_external_name),0)<=120 and coalesce(char_length(mother_external_name),0)<=120 and
 coalesce(char_length(father_external_registry),0)<=80 and coalesce(char_length(mother_external_registry),0)<=80
);
alter table public.animals add constraint animals_reproductive_classification check (
 (reproductive_role is null or reproductive_role in ('reprodutor','rufiao','matriz','doadora','receptora')) and
 (male_condition is null or male_condition in ('inteiro','castrado')) and
 (male_condition is null or category in ('Boi','Touro','Novilho','Bezerro')) and
 (reproductive_role is null or (category in ('Vaca','Novilha','Bezerra') and reproductive_role in ('matriz','doadora','receptora')) or (category in ('Boi','Touro','Novilho','Bezerro') and reproductive_role in ('reprodutor','rufiao'))) and
 (male_condition is distinct from 'castrado' or (category is distinct from 'Touro' and coalesce(reproductive_role,'') not in ('reprodutor','rufiao')))
);
alter table public.animals add constraint animals_father_id_fkey foreign key (farm_id,father_id) references public.animals(farm_id,id) on delete set null (father_id);
alter table public.animals add constraint animals_parent_source check (
 (father_id is null or (father_external_name is null and father_external_registry is null)) and
 (mother_id is null or (mother_external_name is null and mother_external_registry is null))
);
create index if not exists animals_farm_father_idx on public.animals(farm_id,father_id) where father_id is not null;
create index if not exists animals_farm_mother_idx on public.animals(farm_id,mother_id) where mother_id is not null;
create function private.mg_guard_animal_pedigree() returns trigger
language plpgsql security invoker set search_path='' as $$
declare p record; parents_changed boolean;
begin
 -- Serialize parentage changes inside each farm, including competing cycle assignments.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mg-pedigree:'||new.farm_id::text,0));
 parents_changed:=tg_op='INSERT';
 if tg_op='UPDATE' then
  parents_changed:=new.father_id is distinct from old.father_id or new.mother_id is distinct from old.mother_id or new.farm_id is distinct from old.farm_id;
 end if;
 if parents_changed then
  for p in select v.id,v.is_mother from (values(new.father_id,false),(new.mother_id,true)) v(id,is_mother) where v.id is not null loop
   if p.id=new.id then raise exception using errcode='23514',message='O animal não pode ser seu próprio pai ou mãe.';end if;
   if not exists(select 1 from public.animals a where a.farm_id=new.farm_id and a.id=p.id and a.deleted_at is null and
    ((a.category in ('Vaca','Novilha','Bezerra') and p.is_mother) or (a.category in ('Boi','Touro','Novilho','Bezerro') and not p.is_mother))) then
    raise exception using errcode='23514',message='Selecione pai e mãe da própria fazenda, com sexo correspondente e fora da Lixeira.';
   end if;
  end loop;
  if exists(
   with recursive ancestors(id) as (
    select unnest(array[new.father_id,new.mother_id])
    union
    select v.id from ancestors t join public.animals a on a.id=t.id and a.farm_id=new.farm_id
     cross join lateral (values(a.father_id),(a.mother_id)) v(id) where v.id is not null
   ) select 1 from ancestors where id=new.id
  ) then raise exception using errcode='23514',message='A filiação criaria um ciclo entre ascendentes e descendentes.';end if;
 end if;
 if tg_op='UPDATE' and new.category is distinct from old.category then
  if (new.category in ('Vaca','Novilha','Bezerra')) and exists(select 1 from public.animals where farm_id=new.farm_id and father_id=new.id) then
   raise exception using errcode='23514',message='Este animal está vinculado como pai. Revise a filiação antes de alterar o sexo.';
  elsif (new.category not in ('Vaca','Novilha','Bezerra')) and exists(select 1 from public.animals where farm_id=new.farm_id and mother_id=new.id) then
   raise exception using errcode='23514',message='Este animal está vinculado como mãe. Revise a filiação antes de alterar o sexo.';
  end if;
 end if;
 return new;
end $$;
revoke all on function private.mg_guard_animal_pedigree() from public,anon,authenticated;
-- Run after mg_plan_write_guard so concurrent transactions acquire locks in the same order.
create trigger mg_zz_pedigree_guard before insert or update of farm_id,category,father_id,mother_id on public.animals for each row execute function private.mg_guard_animal_pedigree();
comment on column public.animals.registry_birth is 'RGN declarado pelo criador. Não representa validação ou comunicação com associação.';
comment on column public.animals.father_external_name is 'Ascendente externo: referência de filiação, sem inclusão no rebanho ou na contagem de animais ativos.';
