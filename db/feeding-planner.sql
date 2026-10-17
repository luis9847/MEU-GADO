-- Additive deployment. Existing livestock, nutrition and expense records are unchanged.
-- To roll back the UI, revert its commit; keep these tables to preserve producer data.
create table public.feed_ingredients (
 id uuid primary key default gen_random_uuid(),
 farm_id bigint not null references public.farms(id),
 name text not null check (length(btrim(name)) between 1 and 120),
 kind text not null check (kind in ('volumoso','concentrado','suplemento','outro')),
 price_kg numeric(14,4) check (price_kg >= 0 and price_kg <= 1000000),
 stock_kg numeric(16,3) check (stock_kg >= 0 and stock_kg <= 1000000000),
 stock_date date,
 dry_matter_pct numeric(6,3) check (dry_matter_pct > 0 and dry_matter_pct <= 100),
 protein_pct numeric(6,3) check (protein_pct >= 0 and protein_pct <= 100),
 ndt_pct numeric(6,3) check (ndt_pct >= 0 and ndt_pct <= 100),
 composition_source text not null default '' check (length(composition_source)<=300),
 notes text not null default '' check (length(notes)<=2000),
 archived boolean not null default false,
 revision integer not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index feed_ingredients_name_active on public.feed_ingredients (farm_id,lower(btrim(name))) where not archived;
create table public.feeding_plans (
 id uuid primary key default gen_random_uuid(),
 farm_id bigint not null references public.farms(id),
 lot_id bigint not null references public.lots(id),
 name text not null check (length(btrim(name)) between 1 and 120),
 management text not null check (management in ('pasto','semi','confinamento')),
 meals integer not null check (meals between 1 and 12),
 target_gmd numeric(6,3) check (target_gmd > 0 and target_gmd <= 5),
 start_date date not null,
 end_date date check (end_date >= start_date),
 technical_reference text not null default '' check (length(technical_reference)<=300),
 notes text not null default '' check (length(notes)<=2000),
 items jsonb not null check (jsonb_typeof(items)='array' and jsonb_array_length(items) between 1 and 30),
 archived boolean not null default false,
 revision integer not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create extension if not exists btree_gist with schema extensions;
alter table public.feeding_plans add constraint feeding_plans_no_overlap exclude using gist (farm_id with =,lot_id with =,daterange(start_date,end_date,'[]') with &&) where (not archived);
create index feeding_plans_farm_lot on public.feeding_plans(farm_id,lot_id);
-- Price/composition snapshots come from this farm's catalog, never from client totals.
create function public.validate_feeding_plan() returns trigger language plpgsql security invoker set search_path='' as $$
declare item jsonb; ingredient public.feed_ingredients; snapshots jsonb := '[]'; seen uuid[] := '{}'; ingredient_id uuid; qty numeric;
begin
 if tg_op='UPDATE' and new.farm_id<>old.farm_id then raise exception 'A propriedade não pode ser alterada.'; end if;
 if not new.archived and not exists(select 1 from public.lots where id=new.lot_id and farm_id=new.farm_id and active and deleted_at is null) then
   raise exception 'Selecione um lote ativo desta propriedade.';
 end if;
 if jsonb_typeof(new.items)<>'array' or jsonb_array_length(new.items) not between 1 and 30 then raise exception 'Informe de 1 a 30 alimentos.'; end if;
 -- Archiving does not require reactivating ingredients from an old plan.
 if tg_op='INSERT' or new.items is distinct from old.items or new.archived=false then
 for item in select value from jsonb_array_elements(new.items) loop
   ingredient_id := (item->>'ingredient_id')::uuid;
   qty := (item->>'kg_head_day')::numeric;
   if ingredient_id is null or qty is null or qty::text in ('NaN','Infinity','-Infinity') or qty<0.001 or qty>1000 then raise exception 'Quantidade por animal inválida.'; end if;
   if ingredient_id=any(seen) then raise exception 'Não repita o mesmo alimento no plano.'; end if;
   select * into ingredient from public.feed_ingredients where id=ingredient_id and farm_id=new.farm_id and not archived;
   if not found then raise exception 'Alimento não disponível nesta propriedade.'; end if;
   seen := array_append(seen,ingredient_id);
   snapshots := snapshots || jsonb_build_array(jsonb_build_object('ingredient_id',ingredient.id,'name',ingredient.name,'kind',ingredient.kind,'kg_head_day',round(qty,3),'price_kg',ingredient.price_kg,'dry_matter_pct',ingredient.dry_matter_pct,'protein_pct',ingredient.protein_pct,'ndt_pct',ingredient.ndt_pct));
 end loop;
 new.items := snapshots;
 end if;
 if tg_op='UPDATE' then new.revision:=old.revision+1; else new.revision:=1; end if;
 new.updated_at:=now();
 return new;
end; $$;
create trigger feeding_plans_validate before insert or update on public.feeding_plans for each row execute function public.validate_feeding_plan();
create function public.validate_feed_ingredient() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then
   if new.farm_id<>old.farm_id then raise exception 'A propriedade não pode ser alterada.'; end if;
   if new.archived and not old.archived and exists(select 1 from public.feeding_plans p where p.farm_id=new.farm_id and not p.archived and exists(select 1 from jsonb_array_elements(p.items) i where i->>'ingredient_id'=new.id::text)) then
     raise exception 'Este alimento está em um plano ativo. Arquive ou edite o plano primeiro.';
   end if;
   new.revision:=old.revision+1;
 else new.revision:=1;
 end if;
 if new.stock_kg is not null and new.stock_date is null then raise exception 'Informe a data do estoque.'; end if;
 new.updated_at:=now(); return new;
end; $$;
create trigger feed_ingredients_validate before insert or update on public.feed_ingredients for each row execute function public.validate_feed_ingredient();
revoke all on function public.validate_feeding_plan(),public.validate_feed_ingredient() from public,anon,authenticated;
alter table public.feed_ingredients enable row level security;
alter table public.feeding_plans enable row level security;
revoke all on public.feed_ingredients, public.feeding_plans from anon,authenticated;
grant select,insert,update on public.feed_ingredients, public.feeding_plans to authenticated;
grant all on public.feed_ingredients, public.feeding_plans to service_role;
-- These screens include costs; access follows the existing owner/manager finance role.
create policy feed_ingredients_read on public.feed_ingredients for select to authenticated using(public.has_farm_role(farm_id,array['owner','admin','manager']));
create policy feed_ingredients_insert on public.feed_ingredients for insert to authenticated with check(public.has_farm_role(farm_id,array['owner','admin','manager']));
create policy feed_ingredients_update on public.feed_ingredients for update to authenticated using(public.has_farm_role(farm_id,array['owner','admin','manager'])) with check(public.has_farm_role(farm_id,array['owner','admin','manager']));
create policy feeding_plans_read on public.feeding_plans for select to authenticated using(public.has_farm_role(farm_id,array['owner','admin','manager']));
create policy feeding_plans_insert on public.feeding_plans for insert to authenticated with check(public.has_farm_role(farm_id,array['owner','admin','manager']));
create policy feeding_plans_update on public.feeding_plans for update to authenticated using(public.has_farm_role(farm_id,array['owner','admin','manager'])) with check(public.has_farm_role(farm_id,array['owner','admin','manager']));
