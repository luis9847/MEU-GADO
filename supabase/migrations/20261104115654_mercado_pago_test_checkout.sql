begin;
-- Isolated sandbox records. This migration never changes any farm access.
create table public.billing_test_checkouts (
 id uuid primary key,
 created_by uuid not null references auth.users(id),
 plan text not null check(plan in ('essential','complete')),
 billing_period text not null check(billing_period in ('monthly','annual')),
 amount integer not null check(amount>0),
 buyer_id text not null check(buyer_id ~ '^[0-9]{5,20}$'),
 seller_id text not null check(seller_id ~ '^[0-9]{5,20}$'),
 notify_hash text not null check(notify_hash ~ '^[a-f0-9]{64}$'),
 provider_id text unique,
 checkout_url text,
 status text not null default 'creating' check(status in ('creating','creation_unknown','pending','authorized','paused','cancelled')),
 payments jsonb not null default '[]'::jsonb check(jsonb_typeof(payments)='array'),
 created_at timestamptz not null default now(),
 checked_at timestamptz,
 last_attempt_at timestamptz,
 check(buyer_id<>seller_id),
 check(amount=case when plan='essential' then case when billing_period='annual' then 900 else 90 end else case when billing_period='annual' then 1440 else 130 end end)
);
create index billing_test_owner_created on public.billing_test_checkouts(created_by,created_at desc);
alter table public.billing_test_checkouts enable row level security;
revoke all on public.billing_test_checkouts from public,anon,authenticated;
grant select,insert,update on public.billing_test_checkouts to service_role;
create function public.billing_test_is_admin() returns boolean language sql stable security invoker set search_path='' as $$ select private.mg_platform_admin(); $$;
revoke all on function public.billing_test_is_admin() from public,anon,authenticated;
grant execute on function public.billing_test_is_admin() to authenticated;
-- Only the authenticated Edge Function's service client may reserve a sandbox attempt.
create function public.billing_test_reserve(p_id uuid,p_actor uuid,p_plan text,p_period text,p_buyer text,p_seller text,p_notify_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.billing_test_checkouts%rowtype; price integer;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_actor::text,72411));
 if not exists(select 1 from public.admin_users where user_id=p_actor) then raise exception 'Administrador necessário.' using errcode='42501'; end if;
 select * into r from public.billing_test_checkouts where id=p_id;
 if found then
  if r.created_by<>p_actor then raise exception 'Teste de outro administrador.' using errcode='42501';end if;
  return jsonb_build_object('created',false,'row',to_jsonb(r));
 end if;
 if (select count(*) from public.billing_test_checkouts where created_by=p_actor and created_at>now()-interval '10 minutes')>=12 then raise exception 'Aguarde dez minutos para criar novos testes.' using errcode='54000'; end if;
 if p_plan is null or p_plan not in ('essential','complete') or p_period is null or p_period not in ('monthly','annual') then raise exception 'Plano ou período inválido.' using errcode='22023';end if;
 price:=case when p_plan='essential' then case when p_period='annual' then 900 else 90 end else case when p_period='annual' then 1440 else 130 end end;
 insert into public.billing_test_checkouts(id,created_by,plan,billing_period,amount,buyer_id,seller_id,notify_hash)
 values(p_id,p_actor,p_plan,p_period,price,p_buyer,p_seller,p_notify_hash) returning * into r;
 return jsonb_build_object('created',true,'row',to_jsonb(r));
end $$;
create function public.billing_test_claim(p_id uuid) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 update public.billing_test_checkouts set last_attempt_at=clock_timestamp() where id=p_id and (last_attempt_at is null or last_attempt_at<clock_timestamp()-interval '10 seconds');
 return found;
end $$;
revoke all on function public.billing_test_reserve(uuid,uuid,text,text,text,text,text),public.billing_test_claim(uuid) from public,anon,authenticated;
grant execute on function public.billing_test_reserve(uuid,uuid,text,text,text,text,text),public.billing_test_claim(uuid) to service_role;
commit;
