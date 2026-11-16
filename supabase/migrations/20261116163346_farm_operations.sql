begin;

create table public.farm_animal_sales (
 id bigint generated always as identity primary key,
 farm_id bigint not null references public.farms(id) on delete cascade,
 animal_id bigint,
 animal_number text not null,
 animal_name text,
 lot text,
 sale_date date not null,
 amount numeric not null check(amount>=0),
 buyer text check(char_length(buyer)<=120),
 due_date date check(due_date>=sale_date),
 received_on date check(received_on is null or (received_on>=sale_date and received_on<=(now() at time zone 'America/Sao_Paulo')::date and amount>0)),
 cancelled_at timestamptz,
 foreign key(farm_id,animal_id) references public.animals(farm_id,id) on delete set null (animal_id)
);
create index farm_sales_by_date on public.farm_animal_sales(farm_id,sale_date desc,id desc);
create unique index farm_sales_open_animal on public.farm_animal_sales(farm_id,animal_id) where cancelled_at is null;
alter table public.farm_animal_sales enable row level security;
revoke all on public.farm_animal_sales from public,anon,authenticated;
grant select on public.farm_animal_sales to authenticated,service_role;
grant update(buyer,due_date,received_on) on public.farm_animal_sales to authenticated;
create policy farm_sales_read on public.farm_animal_sales for select to authenticated using(
 private.mg_plan_member(farm_id) and private.mg_plan_feature(farm_id,'expenses') and public.has_farm_role(farm_id,array['owner','admin','manager']));
create policy farm_sales_edit on public.farm_animal_sales for update to authenticated using(
 cancelled_at is null and private.mg_plan_member(farm_id) and private.mg_plan_feature(farm_id,'expenses') and public.has_farm_role(farm_id,array['owner','admin','manager']))
 with check(cancelled_at is null and private.mg_plan_member(farm_id) and private.mg_plan_feature(farm_id,'expenses') and public.has_farm_role(farm_id,array['owner','admin','manager']));
create trigger mg_plan_write_guard before update on public.farm_animal_sales for each row execute function private.mg_guard_plan_write();

-- Runs only as a trigger on already-authorized animal writes, so users cannot
-- insert ledger entries or rewrite price, animal identity or sale date directly.
create function private.mg_capture_animal_sale() returns trigger
language plpgsql security definer set search_path='' as $$
declare was_sale boolean:=false; is_sale boolean; same_sale boolean:=false;
begin
 is_sale:=new.status='inactive' and new.exit_type='Vendido' and new.exit_date is not null;
 if tg_op='UPDATE' then
  was_sale:=old.status='inactive' and old.exit_type='Vendido' and old.exit_date is not null;
  same_sale:=was_sale and is_sale and (old.exit_date,old.exit_value) is not distinct from (new.exit_date,new.exit_value);
 end if;
 if was_sale and not same_sale then
  update public.farm_animal_sales set cancelled_at=now()
   where farm_id=old.farm_id and animal_id=old.id and cancelled_at is null and received_on is null;
  if exists(select 1 from public.farm_animal_sales where farm_id=old.farm_id and animal_id=old.id and cancelled_at is null) then
   raise exception 'Desfaça o recebimento no Financeiro da Fazenda antes de alterar esta baixa.' using errcode='23514';
  end if;
 end if;
 if is_sale and not same_sale then
  insert into public.farm_animal_sales(farm_id,animal_id,animal_number,animal_name,lot,sale_date,amount)
  values(new.farm_id,new.id,new.number,new.name,new.lot,new.exit_date,greatest(coalesce(new.exit_value,0),0));
 end if;
 return new;
end $$;
revoke all on function private.mg_capture_animal_sale() from public,anon,authenticated,service_role;
create trigger mg_capture_animal_sale after insert or update of exit_type,exit_date,exit_value,status on public.animals
 for each row execute function private.mg_capture_animal_sale();
insert into public.farm_animal_sales(farm_id,animal_id,animal_number,animal_name,lot,sale_date,amount)
 select farm_id,id,number,name,lot,exit_date,greatest(coalesce(exit_value,0),0)
 from public.animals where status='inactive' and exit_type='Vendido' and exit_date is not null and deleted_at is null;

create table public.farm_management_tasks (
 id uuid primary key default gen_random_uuid(),
 farm_id bigint not null references public.farms(id) on delete cascade,
 animal_id bigint,
 lot_id bigint references public.lots(id) on delete set null,
 kind text not null check(kind in ('health','weight','reproduction','move','other')),
 title text not null check(char_length(btrim(title)) between 1 and 100),
 due_date date not null,
 notes text not null default '' check(char_length(notes)<=500),
 status text not null default 'pending' check(status in ('pending','done','cancelled')),
 created_at timestamptz not null default now(),
 foreign key(farm_id,animal_id) references public.animals(farm_id,id) on delete set null (animal_id)
);
create index farm_tasks_by_date on public.farm_management_tasks(farm_id,due_date,id);
alter table public.farm_management_tasks enable row level security;
revoke all on public.farm_management_tasks from public,anon,authenticated;
grant select,insert on public.farm_management_tasks to authenticated;
grant update(title,due_date,notes,status,animal_id,lot_id,kind) on public.farm_management_tasks to authenticated;
grant select on public.farm_management_tasks to service_role;
create policy farm_tasks_read on public.farm_management_tasks for select to authenticated using(private.mg_plan_member(farm_id));
create policy farm_tasks_add on public.farm_management_tasks for insert to authenticated with check(
 private.mg_plan_member(farm_id) and public.has_farm_role(farm_id,array['owner','admin','manager']) and status='pending'
 and (lot_id is null or exists(select 1 from public.lots l where l.id=farm_management_tasks.lot_id and l.farm_id=farm_management_tasks.farm_id)));
create policy farm_tasks_edit on public.farm_management_tasks for update to authenticated using(
 private.mg_plan_member(farm_id) and public.has_farm_role(farm_id,array['owner','admin','manager']))
 with check(private.mg_plan_member(farm_id) and public.has_farm_role(farm_id,array['owner','admin','manager'])
 and (lot_id is null or exists(select 1 from public.lots l where l.id=farm_management_tasks.lot_id and l.farm_id=farm_management_tasks.farm_id)));
create trigger mg_plan_write_guard before insert or update on public.farm_management_tasks
 for each row execute function private.mg_guard_plan_write();
commit;
