begin;
-- Only a verified, cancelled and wholly unpaid attempt can be retried.
-- Paid/refunded/disputed pilots continue to count as used; history is retained.
create function public.billing_pilot_used(p_farm_id bigint) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.billing_contracts c where c.farm_id=p_farm_id and c.is_pilot and
  (c.status<>'cancelled' or c.provider_id is null or c.activated_at is not null or c.paid_until is not null or c.review_reason is not null
   or exists(select 1 from public.billing_payments p where p.contract_id=c.id)));
$$;
revoke all on function public.billing_pilot_used(bigint) from public,anon,authenticated;
grant execute on function public.billing_pilot_used(bigint) to service_role;
drop index public.billing_one_pilot_per_farm;
create unique index billing_one_pilot_per_farm on public.billing_contracts(farm_id) where is_pilot and status<>'cancelled';
create or replace function public.billing_reserve_pilot(p_id uuid,p_actor uuid,p_farm_id bigint,p_seller text,p_notify_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.billing_contracts%rowtype; cfg public.billing_settings%rowtype; reserved jsonb;
begin
 -- Serialize offer changes and pilot reservations without changing the regular catalogue.
 select * into cfg from public.billing_settings where id for update;
 if not exists(select 1 from public.farms where id=p_farm_id and owner_id=p_actor and not blocked and archived_at is null) then
  raise exception 'Somente o proprietário de uma fazenda ativa pode contratar.' using errcode='42501';
 end if;
 select * into c from public.billing_contracts where id=p_id;
 if found then
  if not c.is_pilot or c.farm_id<>p_farm_id or c.created_by<>p_actor or c.seller_id<>p_seller then
   raise exception 'Tentativa piloto incompatível.' using errcode='42501';
  end if;
  return jsonb_build_object('created',false,'contract',to_jsonb(c));
 end if;
 if not cfg.enabled or cfg.seller_id is distinct from p_seller or cfg.pilot_farm_id is distinct from p_farm_id
  or cfg.pilot_owner_id is distinct from p_actor or cfg.pilot_expires_at is null or cfg.pilot_expires_at<=now() then
  raise exception 'O piloto não está disponível para esta fazenda.' using errcode='42501';
 end if;
 if public.billing_pilot_used(p_farm_id) then
  raise exception 'A contratação piloto já foi utilizada nesta fazenda.' using errcode='22023';
 end if;
 reserved:=public.billing_reserve(p_id,p_actor,p_farm_id,'complete','monthly',p_seller,p_notify_hash);
 if not coalesce((reserved->>'created')::boolean,false) then
  raise exception 'Tentativa piloto incompatível.' using errcode='42501';
 end if;
 update public.billing_contracts set is_pilot=true,amount=5 where id=p_id returning * into c;
 return jsonb_build_object('created',true,'contract',to_jsonb(c));
end $$;
commit;
