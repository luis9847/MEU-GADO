-- Paid access gets exactly 48 hours after expiry. Trial dates stay exact.
create or replace function private.mg_access_deadline(p_status text,p_expires_at timestamptz)
returns timestamptz language sql immutable set search_path='' as $$
 select p_expires_at + case when p_status='active' then interval '48 hours' else interval '0 hours' end;
$$;
revoke all on function private.mg_access_deadline(text,timestamptz) from public,anon;
grant execute on function private.mg_access_deadline(text,timestamptz) to authenticated;
create or replace function private.mg_paid_overdue(p_farm_id bigint) returns boolean
language sql stable security definer set search_path='' as $$
 select not private.mg_platform_admin() and exists(select 1 from public.farm_subscriptions
 where farm_id=p_farm_id and status='active' and private.mg_access_deadline(status,expires_at)<=now());
$$;
revoke all on function private.mg_paid_overdue(bigint) from public,anon;
grant execute on function private.mg_paid_overdue(bigint) to authenticated;

create or replace function private.mg_guard_plan_write() returns trigger
 language plpgsql security definer set search_path='' as $$
declare fid bigint; s public.farm_subscriptions%rowtype; premium boolean; old_live boolean:=false; new_live boolean:=false; heads bigint;
begin
 if tg_op='DELETE' then fid:=old.farm_id; else fid:=new.farm_id; end if;
 if tg_op='UPDATE' and new.farm_id is distinct from old.farm_id then
  raise exception 'Não é permitido transferir registros entre fazendas.' using errcode='42501';
 end if;
 -- Only trusted maintenance connections with no user JWT bypass plan checks.
 if auth.uid() is null and current_setting('role',true) in ('none','postgres','service_role','supabase_admin') then
  if tg_op='DELETE' then return old; else return new; end if;
 end if;
 if private.mg_platform_admin() then
  if tg_op='DELETE' then return old; else return new; end if;
 end if;
 if not private.mg_plan_member(fid) then raise exception 'Sem acesso a esta fazenda.' using errcode='42501'; end if;
 select * into s from public.farm_subscriptions where farm_id=fid for update;
 if not found or s.status not in ('active','trial','legacy') or (s.expires_at is not null and private.mg_access_deadline(s.status,s.expires_at)<=now()) then
  raise exception 'Acesso aguardando liberação, encerrado ou vencido. Contate o suporte do Meu Gado. Seus dados foram preservados.' using errcode='42501';
 end if;
 premium:=tg_table_name in ('expenses','feed_ingredients','feeding_plans','milk_expenses');
 if premium and s.plan<>'complete' then raise exception 'Este recurso faz parte do plano Completo.' using errcode='42501'; end if;
 if tg_table_name='animals' and s.plan='essential' then
  if tg_op<>'DELETE' then new_live:=new.deleted_at is null and lower(coalesce(new.status,'active')) in ('active','ativo',''); end if;
  if tg_op<>'INSERT' then old_live:=old.deleted_at is null and lower(coalesce(old.status,'active')) in ('active','ativo',''); end if;
  if new_live and not old_live then
   select count(*) into heads from public.animals where farm_id=fid and deleted_at is null
   and lower(coalesce(status,'active')) in ('active','ativo','');
   if heads>=150 then raise exception 'Limite de 150 animais ativos do Essencial atingido. Solicite o plano Completo.' using errcode='23514'; end if;
  end if;
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
create or replace function private.mg_plan_snapshot(p_farm_id bigint) returns jsonb
 language plpgsql stable security definer set search_path='' as $$
declare s public.farm_subscriptions%rowtype; heads bigint; allowed boolean; adm boolean;
begin
 adm:=private.mg_platform_admin();
 if not adm and not private.mg_plan_member(p_farm_id) then
  raise exception 'Sem acesso a esta fazenda.' using errcode='42501';
 end if;
 select * into s from public.farm_subscriptions where farm_id=p_farm_id;
 if not found then raise exception 'Plano não configurado. Contate o suporte.' using errcode='42501'; end if;
 select count(*) into heads from public.animals where farm_id=p_farm_id and deleted_at is null
 and lower(coalesce(status,'active')) in ('active','ativo','');
 allowed:=s.status in ('active','trial','legacy') and (s.expires_at is null or private.mg_access_deadline(s.status,s.expires_at)>now());
 return jsonb_build_object('farm_id',s.farm_id,'plan',s.plan,'status',s.status,
  'billing_period',s.billing_period,'expires_at',s.expires_at,'revision',s.revision,
  'server_now',now(),'can_write',allowed,'access_until',private.mg_access_deadline(s.status,s.expires_at),
  'in_grace',s.status='active' and s.expires_at<=now() and private.mg_access_deadline(s.status,s.expires_at)>now(),
  'payment_blocked',s.status='active' and private.mg_access_deadline(s.status,s.expires_at)<=now(),'is_admin',adm,
  'active_heads',heads,'head_limit',case when s.plan='essential' then 150 else null end,
  'monthly_price',case when s.plan='essential' then 90 else 130 end,
  'annual_price',case when s.plan='essential' then 900 else 1440 end,
  'features',jsonb_build_object('core',true,'expenses',s.plan='complete','planning',s.plan='complete',
   'performance',s.plan='complete','reports',s.plan='complete'));
end $$;

-- Retain identity/membership and subscription access so the owner can renew.
-- Operational data stays in the database but cannot be queried during paid delinquency.
do $$ declare t text;begin
 foreach t in array array['animals','lots','weighings','health_events','reproductive_events','nutrition_entries',
 'expenses','feed_ingredients','feeding_plans','milk_production','milk_sales','milk_expenses','milk_quality_tests',
 'dairy_lactations','farm_animal_sales','farm_management_tasks'] loop
 execute format('create policy mg_overdue_read_guard on public.%I as restrictive for select to authenticated using(not private.mg_paid_overdue(farm_id))',t);
 end loop;
end $$;


alter table public.admin_farm_audit add column if not exists farm_name text;
alter table public.admin_farm_audit drop constraint admin_farm_audit_action_check;
alter table public.admin_farm_audit add constraint admin_farm_audit_action_check
 check(action in ('archive','restore','block_access','unblock_access','delete'));
create or replace function private.mg_admin_delete_farm(p_farm_id bigint,p_confirmation text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.farms%rowtype;
begin
 if not private.mg_platform_admin() then raise exception 'Acesso administrativo e verificação de segurança necessários.' using errcode='42501';end if;
 -- Same settings/farm order as pilot reservation; farm lock serializes ordinary checkout creation.
 perform 1 from public.billing_settings where id for update;
 select * into f from public.farms where id=p_farm_id for update;
 if not found then raise exception 'Fazenda não encontrada.' using errcode='P0002';end if;
 if p_confirmation is distinct from f.name then raise exception 'Digite o nome exato da fazenda.' using errcode='22023';end if;
 if exists(select 1 from public.billing_contracts where farm_id=f.id) then
  raise exception 'Esta fazenda tem histórico de contratação. Use Arquivar fazenda para preservar cobranças e pagamentos.' using errcode='22023';end if;
 -- Remove archival lock inside the same transaction to allow cascading cleanup.
 update public.farms set archived_at=null,archived_by=null where id=f.id;
 -- No user account, profile or other property is removed.
 delete from public.feeding_plans where farm_id=f.id;
 delete from public.feed_ingredients where farm_id=f.id;
 delete from public.subscription_audit where farm_id=f.id;
 delete from public.farm_subscriptions where farm_id=f.id;
 update public.billing_settings set pilot_farm_id=null,pilot_owner_id=null,pilot_expires_at=null where pilot_farm_id=f.id;
 insert into public.admin_farm_audit(farm_id,actor_id,action,farm_name) values(f.id,auth.uid(),'delete',f.name);
 delete from public.farms where id=f.id;
 return jsonb_build_object('ok',true,'farm_id',f.id);
end $$;
create or replace function public.admin_delete_farm(p_farm_id bigint,p_confirmation text)
returns jsonb language sql security invoker set search_path='' as $$
 select private.mg_admin_delete_farm(p_farm_id,p_confirmation);
$$;
revoke all on function private.mg_admin_delete_farm(bigint,text),public.admin_delete_farm(bigint,text) from public,anon,authenticated;
grant execute on function private.mg_admin_delete_farm(bigint,text),public.admin_delete_farm(bigint,text) to authenticated;
CREATE OR REPLACE FUNCTION public.guard_archived_farm_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare old_id bigint; new_id bigint; is_admin boolean;
begin
 is_admin:=exists(select 1 from public.admin_users where user_id=auth.uid());
 if tg_table_name='farms' then
  if tg_op='DELETE' then
   if not private.mg_platform_admin() then raise exception 'Somente o administrador pode excluir fazendas.' using errcode='42501';end if;
   if exists(select 1 from public.billing_contracts where farm_id=old.id) then raise exception 'Preserve o histórico financeiro: arquive esta fazenda.' using errcode='22023';end if;
   return old;
  end if;
  if not is_admin and (
   (tg_op='INSERT' and (new.archived_at is not null or new.archived_by is not null)) or
   (tg_op='UPDATE' and (old.archived_at is not null or new.archived_at is distinct from old.archived_at or new.archived_by is distinct from old.archived_by))
  ) then raise exception 'Somente o administrador pode arquivar ou restaurar fazendas.' using errcode='42501'; end if;
 else
  if tg_op<>'INSERT' then old_id:=old.farm_id; end if;
  if tg_op<>'DELETE' then new_id:=new.farm_id; end if;
  if exists(select 1 from public.farms where id in(old_id,new_id) and archived_at is not null) then
   raise exception 'Fazenda arquivada. Restaure antes de alterar seus dados.' using errcode='42501';
  end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $function$;
