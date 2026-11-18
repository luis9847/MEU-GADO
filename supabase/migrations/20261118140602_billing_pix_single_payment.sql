begin;
alter table public.billing_contracts
 add column payment_method text not null default 'card' check(payment_method in ('card','pix')),
 add column pix_expires_at timestamptz;

-- One transaction reserves a farm, validates owner/prices/offer and persists the method.
create function public.billing_reserve_pix(p_id uuid,p_actor uuid,p_farm_id bigint,p_plan text,p_period text,p_seller text,p_notify_hash text,p_pilot boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb;c public.billing_contracts%rowtype;
begin
 if p_pilot and (p_plan<>'complete' or p_period<>'monthly') then raise exception 'Piloto inválido.' using errcode='22023';end if;
 if p_pilot then r:=public.billing_reserve_pilot(p_id,p_actor,p_farm_id,p_seller,p_notify_hash);
 else r:=public.billing_reserve(p_id,p_actor,p_farm_id,p_plan,p_period,p_seller,p_notify_hash);end if;
 select * into c from public.billing_contracts where id=p_id for update;
 if (r->>'created')::boolean then
  update public.billing_contracts set payment_method='pix',terms_version='billing-pix-2026-11-18' where id=p_id returning * into c;
 elsif c.payment_method<>'pix' then raise exception 'Esta tentativa já usa cartão. Consulte a contratação existente.' using errcode='22023';end if;
 return jsonb_build_object('created',(r->>'created')::boolean,'contract',to_jsonb(c));
end $$;
revoke all on function public.billing_reserve_pix(uuid,uuid,bigint,text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.billing_reserve_pix(uuid,uuid,bigint,text,text,text,text,boolean) to service_role;

create or replace function public.billing_apply(p_id uuid,p_lease uuid,p_status text,p_payer text,p_payments jsonb) returns jsonb
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
  if c.payment_method='pix' and c.status='cancelled' then reason:='payment_after_cancellation';
  elsif s.revision<>c.expected_revision then reason:='access_changed';
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
 -- A confirmed Pix has no future charges. Close it atomically while preserving paid access.
 if c.payment_method='pix' and p_status<>'pending' then p_status:='cancelled';end if;
 update public.billing_contracts set status=p_status,payer_id=p_payer,paid_until=until_at,review_reason=reason,checked_at=now(),lease_token=null,lease_until=null where id=c.id returning * into c;
 if (contract_before->>'status') is distinct from p_status or (contract_before->>'paid_until')::timestamptz is distinct from until_at or (contract_before->>'review_reason') is distinct from reason then
 insert into public.billing_audit(contract_id,action,details) values(c.id,'reconciled',jsonb_build_object('status',p_status,'paid_until',until_at,'review_reason',reason,'payments_seen',jsonb_array_length(p_payments)));
 end if;
 return to_jsonb(c);
end $$;

commit;
