-- Meu Gado: manually administered subscriptions. No payment collection.
begin;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
create table public.farm_subscriptions (
 farm_id bigint primary key references public.farms(id),
 plan text not null default 'essential' check(plan in ('essential','complete')),
 status text not null default 'pending' check(status in ('pending','active','trial','legacy','suspended')),
 billing_period text not null default 'monthly' check(billing_period in ('monthly','annual')),
 expires_at timestamptz,
 revision integer not null default 1,
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id),
 check(status <> 'legacy' or (plan='complete' and expires_at is null))
);
create table public.subscription_audit (
 id bigint generated always as identity primary key,
 farm_id bigint not null references public.farms(id),
 actor_id uuid not null references auth.users(id),
 before_value jsonb, after_value jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.farm_subscriptions enable row level security;
alter table public.subscription_audit enable row level security;
revoke all on public.farm_subscriptions, public.subscription_audit from public, anon, authenticated;
grant select on public.farm_subscriptions, public.subscription_audit to authenticated;

create function private.mg_platform_admin() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null
 and exists(select 1 from public.admin_users where user_id=auth.uid())
 and (coalesce(auth.jwt()->>'aal','aal1')='aal2'
      or not exists(select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified'));
$$;
create function private.mg_plan_member(p_farm_id bigint) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
 select 1 from public.farms f where f.id=p_farm_id and not f.blocked and f.archived_at is null
 and (f.owner_id=auth.uid() or exists(select 1 from public.farm_members m where m.farm_id=f.id and m.user_id=auth.uid() and m.active)));
$$;
create policy subscription_read on public.farm_subscriptions for select to authenticated
 using(private.mg_platform_admin() or private.mg_plan_member(farm_id));
create policy subscription_audit_admin on public.subscription_audit for select to authenticated
 using(private.mg_platform_admin());

-- Preserve the current test population until the owner explicitly assigns access.
-- This transition status cannot be granted again through the admin RPC.
insert into public.farm_subscriptions(farm_id,plan,status)
 select id,'complete','legacy' from public.farms;
create function private.mg_subscription_on_farm() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.farm_subscriptions(farm_id) values(new.id);
 return new;
end $$;
create trigger mg_subscription_on_farm after insert on public.farms
 for each row execute function private.mg_subscription_on_farm();

create function private.mg_plan_feature(p_farm_id bigint,p_feature text) returns boolean
 language sql stable security definer set search_path='' as $$
 select private.mg_platform_admin() or (
 private.mg_plan_member(p_farm_id) and exists(select 1 from public.farm_subscriptions s
 where s.farm_id=p_farm_id and (p_feature='core' or
 (p_feature in ('expenses','planning','performance','reports') and s.plan='complete'))));
$$;
create function private.mg_plan_snapshot(p_farm_id bigint) returns jsonb
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
 allowed:=s.status in ('active','trial','legacy') and (s.expires_at is null or s.expires_at>now());
 return jsonb_build_object('farm_id',s.farm_id,'plan',s.plan,'status',s.status,
  'billing_period',s.billing_period,'expires_at',s.expires_at,'revision',s.revision,
  'server_now',now(),'can_write',allowed,'is_admin',adm,
  'active_heads',heads,'head_limit',case when s.plan='essential' then 150 else null end,
  'monthly_price',case when s.plan='essential' then 90 else 130 end,
  'annual_price',case when s.plan='essential' then 900 else 1440 end,
  'features',jsonb_build_object('core',true,'expenses',s.plan='complete','planning',s.plan='complete',
   'performance',s.plan='complete','reports',s.plan='complete'));
end $$;
create function public.get_farm_plan(p_farm_id bigint) returns jsonb
 language sql stable security invoker set search_path='' as $$ select private.mg_plan_snapshot(p_farm_id); $$;

create function private.mg_admin_set_plan(p_farm_id bigint,p_plan text,p_status text,
 p_billing_period text,p_expires_at timestamptz,p_expected_revision integer) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare s public.farm_subscriptions%rowtype; before_row jsonb; heads bigint;
begin
 if not private.mg_platform_admin() then raise exception 'Acesso administrativo e verificação de segurança necessários.' using errcode='42501'; end if;
 if p_plan is null or p_plan not in ('essential','complete') or p_status is null
 or p_status not in ('pending','active','trial','suspended') or p_billing_period is null
 or p_billing_period not in ('monthly','annual') then
  raise exception 'Plano, situação ou período inválido.' using errcode='22023';
 end if;
 if p_status in ('active','trial') and p_expires_at is not null and p_expires_at<=now() then
  raise exception 'A validade deve ser futura.' using errcode='22023';
 end if;
 select * into s from public.farm_subscriptions where farm_id=p_farm_id for update;
 if not found then raise exception 'Fazenda não encontrada.' using errcode='P0002'; end if;
 if p_expected_revision is null or p_expected_revision<>s.revision then
  raise exception 'O acesso foi alterado por outra sessão. Atualize antes de salvar.' using errcode='40001';
 end if;
 if exists(select 1 from public.farms where id=p_farm_id and archived_at is not null) then
  raise exception 'Restaure a fazenda antes de alterar o plano.' using errcode='22023';
 end if;
 select count(*) into heads from public.animals where farm_id=p_farm_id and deleted_at is null
 and lower(coalesce(status,'active')) in ('active','ativo','');
 if p_plan='essential' and heads>150 then
  raise exception 'Esta fazenda tem % animais ativos. O Essencial permite até 150.',heads using errcode='22023';
 end if;
 before_row:=to_jsonb(s);
 update public.farm_subscriptions set plan=p_plan,status=p_status,billing_period=p_billing_period,
 expires_at=p_expires_at,revision=revision+1,updated_at=now(),updated_by=auth.uid()
 where farm_id=p_farm_id returning * into s;
 insert into public.subscription_audit(farm_id,actor_id,before_value,after_value)
 values(p_farm_id,auth.uid(),before_row,to_jsonb(s));
 return private.mg_plan_snapshot(p_farm_id);
end $$;
create function public.admin_set_farm_plan(p_farm_id bigint,p_plan text,p_status text,
 p_billing_period text,p_expires_at timestamptz,p_expected_revision integer) returns jsonb
 language sql security invoker set search_path='' as $$
 select private.mg_admin_set_plan(p_farm_id,p_plan,p_status,p_billing_period,p_expires_at,p_expected_revision);
$$;

-- Database-level guard also covers direct REST, RPC, imports and offline replay.
-- Lock the subscription row before counting to serialize quota admission per farm.
create function private.mg_guard_plan_write() returns trigger
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
 if not found or s.status not in ('active','trial','legacy') or (s.expires_at is not null and s.expires_at<=now()) then
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
do $$ declare t text; begin
 foreach t in array array['animals','lots','weighings','health_events','reproductive_events','nutrition_entries',
 'expenses','feed_ingredients','feeding_plans','milk_production','milk_sales','milk_expenses','milk_quality_tests','dairy_lactations'] loop
  execute format('create trigger mg_plan_write_guard before insert or update or delete on public.%I for each row execute function private.mg_guard_plan_write()',t);
 end loop;
 foreach t in array array['expenses','feed_ingredients','feeding_plans','milk_expenses'] loop
  execute format('create policy mg_complete_guard on public.%I as restrictive for all to authenticated using(private.mg_plan_feature(farm_id,''expenses'')) with check(private.mg_plan_feature(farm_id,''expenses''))',t);
 end loop;
end $$;
-- No accidental default EXECUTE on privileged entry points or triggers.
revoke all on function private.mg_platform_admin(),private.mg_plan_member(bigint),
 private.mg_subscription_on_farm(),private.mg_plan_feature(bigint,text),private.mg_plan_snapshot(bigint),
 private.mg_admin_set_plan(bigint,text,text,text,timestamptz,integer),private.mg_guard_plan_write(),
 public.get_farm_plan(bigint),public.admin_set_farm_plan(bigint,text,text,text,timestamptz,integer)
 from public, anon, authenticated;
grant execute on function private.mg_platform_admin(),private.mg_plan_member(bigint),
 private.mg_plan_feature(bigint,text),private.mg_plan_snapshot(bigint),
 private.mg_admin_set_plan(bigint,text,text,text,timestamptz,integer),
 public.get_farm_plan(bigint),public.admin_set_farm_plan(bigint,text,text,text,timestamptz,integer)
 to authenticated;
commit;
