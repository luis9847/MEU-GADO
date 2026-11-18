begin;
-- A service-side verified rejection/absence is distinct from an uncertain timeout.
-- No client role can write this audit evidence or use this helper directly.
create or replace function public.billing_pilot_used(p_farm_id bigint) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.billing_contracts c where c.farm_id=p_farm_id and c.is_pilot and
  (c.status<>'cancelled'
   or (c.provider_id is null and not (c.payment_method='pix' and exists(
    select 1 from public.billing_audit a where a.contract_id=c.id and a.action='provider_creation_absent_verified'
     and a.details->>'provider'='mercadopago' and a.details->>'matches'='0' and a.details->>'total'='0')))
   or c.activated_at is not null or c.paid_until is not null or c.review_reason is not null
   or exists(select 1 from public.billing_payments p where p.contract_id=c.id)));
$$;
commit;
