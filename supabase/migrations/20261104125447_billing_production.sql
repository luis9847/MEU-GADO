begin;
-- Server-only production billing; test records cannot enter this ledger.
create table public.billing_settings (
 id boolean primary key default true check(id), enabled boolean not null default false,
 seller_id text, updated_at timestamptz not null default now(), updated_by uuid references auth.users(id)
);
insert into public.billing_settings(id) values(true);
create table public.billing_contracts (
 id uuid primary key, farm_id bigint not null references public.farms(id),
 created_by uuid not null references auth.users(id),
 plan text not null check(plan in ('essential','complete')),
 billing_period text not null check(billing_period in ('monthly','annual')),
 amount integer not null, expected_revision integer not null,
 seller_id text not null, payer_id text,
 provider_id text unique, checkout_url text, notify_hash text not null,
 status text not null default 'creating' check(status in ('creating','creation_unknown','pending','authorized','paused','cancelled')),
 review_reason text, activated_at timestamptz, paid_until timestamptz,
 terms_version text not null default 'billing-2026-11-04', accepted_at timestamptz not null default now(),
 created_at timestamptz not null default now(), checked_at timestamptz, last_attempt_at timestamptz,
 lease_token uuid, lease_until timestamptz,
 check(notify_hash ~ '^[a-f0-9]{64}$'),
 check(amount=case when plan='essential' then case when billing_period='annual' then 900 else 90 end else case when billing_period='annual' then 1440 else 130 end end)
);
create unique index billing_one_open_per_farm on public.billing_contracts(farm_id) where status<>'cancelled';
create index billing_contract_due on public.billing_contracts(last_attempt_at nulls first) where provider_id is not null;
create index billing_contract_owner on public.billing_contracts(created_by,created_at desc);
create table public.billing_payments (
 payment_id text primary key, contract_id uuid not null references public.billing_contracts(id),
 status text not null, approved_at timestamptz, amount numeric not null,
 refunded_amount numeric not null default 0, provider_modified_at timestamptz not null,
 observed_at timestamptz not null default now()
);
create index billing_payment_contract on public.billing_payments(contract_id);
create table public.billing_audit (
 id bigint generated always as identity primary key,
 contract_id uuid not null references public.billing_contracts(id),
 action text not null, details jsonb not null default '{}',created_at timestamptz not null default now()
);
alter table public.farm_subscriptions add column billing_contract_id uuid references public.billing_contracts(id);
create schema if not exists private;
create table private.billing_runtime (
 id boolean primary key default true check(id),
 job_secret text not null default (replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''))
);
insert into private.billing_runtime(id) values(true);
alter table private.billing_runtime enable row level security;
revoke all on private.billing_runtime from public,anon,authenticated;
grant select on private.billing_runtime to service_role;
-- An invoker wrapper provides the Edge Function access to the job secret, never clients.
create function public.billing_job_secret() returns text language sql security invoker set search_path='' as $$ select job_secret from private.billing_runtime where id; $$;
revoke all on function public.billing_job_secret() from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function public.billing_job_secret() to service_role;

do $$ declare t text;begin
 foreach t in array array['billing_settings','billing_contracts','billing_payments','billing_audit'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update on public.%I to service_role',t);
 end loop;
end $$;
grant usage,select on sequence public.billing_audit_id_seq to service_role;

create function private.billing_owner(p_farm_id bigint) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare f public.farms%rowtype;s public.farm_subscriptions%rowtype;
begin
 if auth.uid() is null then raise exception 'Entre em sua conta.' using errcode='42501';end if;
 if exists(select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified') and coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then raise exception 'Conclua a verificação em duas etapas.' using errcode='42501';end if;
 select * into f from public.farms where owner_id=auth.uid() and (p_farm_id is null or id=p_farm_id) order by created_at limit 1;
 if not found then raise exception 'Conclua o cadastro da sua fazenda. Somente o proprietário pode contratar.' using errcode='42501';end if;
 select * into s from public.farm_subscriptions where farm_id=f.id;
 return jsonb_build_object('farm_id',f.id,'farm_name',f.name,'blocked',f.blocked,'archived',f.archived_at is not null,'plan',s.plan,'status',s.status,'expires_at',s.expires_at,'revision',s.revision,'billing_contract_id',s.billing_contract_id,'active_heads',(select count(*) from public.animals where farm_id=f.id and deleted_at is null and lower(coalesce(status,'active')) in ('active','ativo','')));
end $$;
create function public.billing_owner(p_farm_id bigint default null) returns jsonb language sql stable security invoker set search_path='' as $$ select private.billing_owner(p_farm_id); $$;
revoke all on function private.billing_owner(bigint),public.billing_owner(bigint) from public,anon,authenticated;
grant execute on function private.billing_owner(bigint),public.billing_owner(bigint) to authenticated;

create function public.billing_reserve(p_id uuid,p_actor uuid,p_farm_id bigint,p_plan text,p_period text,p_seller text,p_notify_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare f public.farms%rowtype;s public.farm_subscriptions%rowtype;c public.billing_contracts%rowtype;price integer;
begin
 select * into f from public.farms where id=p_farm_id for update;
 if not found or f.owner_id<>p_actor or f.blocked or f.archived_at is not null then raise exception 'Somente o proprietário de uma fazenda ativa pode contratar.' using errcode='42501';end if;
 select * into s from public.farm_subscriptions where farm_id=f.id for update;
 select * into c from public.billing_contracts where id=p_id;
 if found then
  if c.created_by<>p_actor or c.farm_id<>p_farm_id or c.plan<>p_plan or c.billing_period<>p_period then raise exception 'Tentativa incompatível.' using errcode='42501';end if;
  return jsonb_build_object('created',false,'contract',to_jsonb(c));
 end if;
 if not exists(select 1 from public.billing_settings where enabled and seller_id=p_seller) then raise exception 'Contratação automática ainda indisponível.' using errcode='42501';end if;
 if p_plan is null or p_plan not in ('essential','complete') or p_period is null or p_period not in ('monthly','annual') then raise exception 'Plano inválido.' using errcode='22023';end if;
 if s.status='active' and (s.expires_at is null or s.expires_at>now()) then raise exception 'Você já possui um período ativo. A troca pode ser feita ao encerrar esse período, após cancelar a renovação.' using errcode='22023';end if;
 if exists(select 1 from public.billing_contracts where farm_id=f.id and (status<>'cancelled' or review_reason is not null)) then raise exception 'Já existe uma contratação. Consulte ou cancele a tentativa anterior antes de iniciar outra.' using errcode='22023';end if;
 if p_plan='essential' and (select count(*) from public.animals where farm_id=f.id and deleted_at is null and lower(coalesce(status,'active')) in ('active','ativo',''))>150 then raise exception 'O Essencial permite até 150 animais ativos. Escolha o Completo.' using errcode='22023';end if;
 if (select count(*) from public.billing_contracts where created_by=p_actor and created_at>now()-interval '1 hour')>=6 then raise exception 'Limite de tentativas. Aguarde uma hora.' using errcode='54000';end if;
 price:=case when p_plan='essential' then case when p_period='annual' then 900 else 90 end else case when p_period='annual' then 1440 else 130 end end;
 insert into public.billing_contracts(id,farm_id,created_by,plan,billing_period,amount,expected_revision,seller_id,notify_hash)
 values(p_id,p_farm_id,p_actor,p_plan,p_period,price,s.revision,p_seller,p_notify_hash) returning * into c;
 insert into public.billing_audit(contract_id,action) values(c.id,'reserved');
 return jsonb_build_object('created',true,'contract',to_jsonb(c));
end $$;

create function public.billing_claim(p_id uuid,p_lease uuid) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 update public.billing_contracts set lease_token=p_lease,lease_until=clock_timestamp()+interval '90 seconds',last_attempt_at=clock_timestamp()
 where id=p_id and (lease_until is null or lease_until<clock_timestamp());
 return found;
end $$;

-- This RPC accepts only server-verified provider snapshots. Execute is service_role only.
-- Payment timestamps anchor periods, so retries never extend access a second time.
create function public.billing_apply(p_id uuid,p_lease uuid,p_status text,p_payer text,p_payments jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.billing_contracts%rowtype;s public.farm_subscriptions%rowtype;p jsonb;until_at timestamptz;before_row jsonb;reason text;heads bigint;contract_before jsonb;
begin
 select * into c from public.billing_contracts where id=p_id for update;
 if not found or c.lease_token is distinct from p_lease or c.lease_until<now() then raise exception 'Consulta concorrente. Atualize novamente.' using errcode='40001';end if;
 contract_before:=to_jsonb(c);
 if p_status is null or p_status not in ('pending','authorized','paused','cancelled') or p_payer is null or p_payer='' or jsonb_typeof(p_payments)<>'array' or jsonb_array_length(p_payments)>150 then raise exception 'Resposta de cobrança inválida.' using errcode='22023';end if;
 if c.payer_id is not null and c.payer_id<>p_payer then raise exception 'Comprador diferente.' using errcode='42501';end if;
 for p in select value from jsonb_array_elements(p_payments) loop
  if (p->>'amount')::numeric<>c.amount or (p->>'refunded_amount')::numeric<0 or (p->>'refunded_amount')::numeric>c.amount or (p->>'status') is null or (p->>'modified_at')::timestamptz>now()+interval '1 day' or ((p->>'status')='approved' and ((p->>'approved_at') is null or (p->>'approved_at')::timestamptz>now()+interval '5 minutes')) then raise exception 'Pagamento incompatível.' using errcode='22023';end if;
  if exists(select 1 from public.billing_payments where payment_id=p->>'id' and contract_id<>c.id) then raise exception 'Pagamento de outra assinatura.' using errcode='42501';end if;
  insert into public.billing_payments(payment_id,contract_id,status,approved_at,amount,refunded_amount,provider_modified_at)
  values(p->>'id',c.id,p->>'status',(p->>'approved_at')::timestamptz,(p->>'amount')::numeric,(p->>'refunded_amount')::numeric,(p->>'modified_at')::timestamptz)
  on conflict(payment_id) do update set status=excluded.status,approved_at=excluded.approved_at,refunded_amount=excluded.refunded_amount,provider_modified_at=excluded.provider_modified_at,observed_at=now()
  where public.billing_payments.contract_id=excluded.contract_id and public.billing_payments.provider_modified_at<=excluded.provider_modified_at;
 end loop;
 select max(((approved_at at time zone 'America/Sao_Paulo')+make_interval(months=>case when c.billing_period='annual' then 12 else 1 end)) at time zone 'America/Sao_Paulo') into until_at from public.billing_payments where contract_id=c.id and status='approved' and refunded_amount=0;
 select * into s from public.farm_subscriptions where farm_id=c.farm_id for update;
 reason:=c.review_reason;
 if s.billing_contract_id=c.id then
  before_row:=to_jsonb(s);
  update public.farm_subscriptions set status=case when until_at>now() then 'active' else 'suspended' end,expires_at=coalesce(until_at,now()),revision=revision+1,updated_at=now(),updated_by=c.created_by
  where farm_id=c.farm_id and (status is distinct from case when until_at>now() then 'active' else 'suspended' end or expires_at is distinct from coalesce(until_at,expires_at));
  if found then insert into public.subscription_audit(farm_id,actor_id,before_value,after_value) select c.farm_id,c.created_by,before_row,to_jsonb(t) from public.farm_subscriptions t where farm_id=c.farm_id;end if;
 elsif c.activated_at is null and until_at>now() and reason is null and p_status<>'pending' then
  if s.revision<>c.expected_revision then reason:='access_changed';
  elsif p_status<>'authorized' then reason:='payment_without_authorization';
  elsif exists(select 1 from public.farms where id=c.farm_id and (blocked or archived_at is not null)) then reason:='farm_blocked';
  else
   select count(*) into heads from public.animals where farm_id=c.farm_id and deleted_at is null and lower(coalesce(status,'active')) in ('active','ativo','');
   if c.plan='essential' and heads>150 then reason:='head_limit';end if;
  end if;
  if reason is null then
   before_row:=to_jsonb(s);
   update public.farm_subscriptions set plan=c.plan,status='active',billing_period=c.billing_period,expires_at=until_at,billing_contract_id=c.id,revision=revision+1,updated_at=now(),updated_by=c.created_by where farm_id=c.farm_id;
   insert into public.subscription_audit(farm_id,actor_id,before_value,after_value) select c.farm_id,c.created_by,before_row,to_jsonb(t) from public.farm_subscriptions t where farm_id=c.farm_id;
   update public.billing_contracts set activated_at=now() where id=c.id;
  end if;
 elsif c.activated_at is not null and s.billing_contract_id is distinct from c.id then reason:=coalesce(reason,'manual_override');
 end if;
 update public.billing_contracts set status=p_status,payer_id=p_payer,paid_until=until_at,review_reason=reason,checked_at=now(),lease_token=null,lease_until=null where id=c.id returning * into c;
 if (contract_before->>'status') is distinct from p_status or (contract_before->>'paid_until')::timestamptz is distinct from until_at or (contract_before->>'review_reason') is distinct from reason then
 insert into public.billing_audit(contract_id,action,details) values(c.id,'reconciled',jsonb_build_object('status',p_status,'paid_until',until_at,'review_reason',reason,'payments_seen',jsonb_array_length(p_payments)));
 end if;
 return to_jsonb(c);
end $$;

-- Preserve the existing audited admin workflow. A live recurring contract must be
-- cancelled before replacing it with a free/manual grant. Pending checkouts cannot
-- override a later admin decision because billing_apply checks expected_revision.
create function private.billing_manual_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.billing_contract_id is not distinct from old.billing_contract_id and old.billing_contract_id is not null and private.mg_platform_admin() then
  if exists(select 1 from public.billing_contracts where id=old.billing_contract_id and status<>'cancelled') then raise exception 'Cancele a renovação automática antes de substituir o acesso por um teste gratuito ou plano manual.' using errcode='22023';end if;
  new.billing_contract_id:=null;
 end if;
 return new;
end $$;
create trigger billing_manual_guard before update on public.farm_subscriptions for each row execute function private.billing_manual_guard();
revoke all on function private.billing_manual_guard() from public,anon,authenticated;

revoke all on function public.billing_reserve(uuid,uuid,bigint,text,text,text,text),public.billing_claim(uuid,uuid),public.billing_apply(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.billing_reserve(uuid,uuid,bigint,text,text,text,text),public.billing_claim(uuid,uuid),public.billing_apply(uuid,uuid,text,text,jsonb) to service_role;

-- Recovery for delayed/missing callbacks. Only an unprivileged random job token,
-- not a Supabase service key or Mercado Pago credential, enters pg_net's queue.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
revoke all on net.http_request_queue from public,anon,authenticated;
create function private.billing_run_job() returns bigint language plpgsql security invoker set search_path='' as $$
declare request_id bigint;
begin
 if not exists(select 1 from public.billing_contracts where status<>'cancelled' or paid_until>now()-interval '1 day') then return null;end if;
 select net.http_post(
  url:='https://eghqluvfvawiynzobaza.supabase.co/functions/v1/billing/reconcile-due',
  headers:=jsonb_build_object('Content-Type','application/json','x-billing-job',(select job_secret from private.billing_runtime where id)),
  body:='{}'::jsonb,timeout_milliseconds:=120000) into request_id;
 return request_id;
end $$;
revoke all on function private.billing_run_job() from public,anon,authenticated,service_role;
select cron.schedule('meu-gado-billing-reconcile','* * * * *','select private.billing_run_job();');
commit;
