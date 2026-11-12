begin;
-- A temporary, single-farm offer. Existing billing settings are service-only.
alter table public.billing_settings
 add column pilot_farm_id bigint,
 add column pilot_owner_id uuid,
 add column pilot_expires_at timestamptz,
 add constraint billing_pilot_offer_complete check (
   (pilot_farm_id is null and pilot_owner_id is null and pilot_expires_at is null)
   or (pilot_farm_id is not null and pilot_owner_id is not null and pilot_expires_at is not null)
 );

alter table public.billing_contracts
 add column is_pilot boolean not null default false,
 drop constraint billing_contracts_check,
 add constraint billing_contracts_amount_check check (
   case when is_pilot then plan='complete' and billing_period='monthly' and amount=5
   else amount=case when plan='essential' then case when billing_period='annual' then 900 else 90 end
                    else case when billing_period='annual' then 1440 else 130 end end end
 );
create unique index billing_one_pilot_per_farm on public.billing_contracts(farm_id) where is_pilot;

create function public.billing_reserve_pilot(p_id uuid,p_actor uuid,p_farm_id bigint,p_seller text,p_notify_hash text)
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
 if exists(select 1 from public.billing_contracts where farm_id=p_farm_id and is_pilot) then
  raise exception 'A contratação piloto já foi utilizada nesta fazenda.' using errcode='22023';
 end if;
 reserved:=public.billing_reserve(p_id,p_actor,p_farm_id,'complete','monthly',p_seller,p_notify_hash);
 if not coalesce((reserved->>'created')::boolean,false) then
  raise exception 'Tentativa piloto incompatível.' using errcode='42501';
 end if;
 update public.billing_contracts set is_pilot=true,amount=5 where id=p_id returning * into c;
 return jsonb_build_object('created',true,'contract',to_jsonb(c));
end $$;
revoke all on function public.billing_reserve_pilot(uuid,uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function public.billing_reserve_pilot(uuid,uuid,bigint,text,text) to service_role;
commit;
