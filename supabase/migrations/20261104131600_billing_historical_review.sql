begin;
create or replace function public.billing_reserve(p_id uuid,p_actor uuid,p_farm_id bigint,p_plan text,p_period text,p_seller text,p_notify_hash text) returns jsonb
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
 if exists(select 1 from public.billing_contracts where farm_id=f.id and (status<>'cancelled' or (review_reason is not null and activated_at is null))) then raise exception 'Já existe uma contratação. Consulte ou cancele a tentativa anterior antes de iniciar outra.' using errcode='22023';end if;
 if p_plan='essential' and (select count(*) from public.animals where farm_id=f.id and deleted_at is null and lower(coalesce(status,'active')) in ('active','ativo',''))>150 then raise exception 'O Essencial permite até 150 animais ativos. Escolha o Completo.' using errcode='22023';end if;
 if (select count(*) from public.billing_contracts where created_by=p_actor and created_at>now()-interval '1 hour')>=6 then raise exception 'Limite de tentativas. Aguarde uma hora.' using errcode='54000';end if;
 price:=case when p_plan='essential' then case when p_period='annual' then 900 else 90 end else case when p_period='annual' then 1440 else 130 end end;
 insert into public.billing_contracts(id,farm_id,created_by,plan,billing_period,amount,expected_revision,seller_id,notify_hash)
 values(p_id,p_farm_id,p_actor,p_plan,p_period,price,s.revision,p_seller,p_notify_hash) returning * into c;
 insert into public.billing_audit(contract_id,action) values(c.id,'reserved');
 return jsonb_build_object('created',true,'contract',to_jsonb(c));
end $$;

commit;
