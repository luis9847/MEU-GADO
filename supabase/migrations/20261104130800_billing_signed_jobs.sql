begin;
-- pg_net queues may be readable to database roles. Queue only a short-lived HMAC
-- envelope, never the signing secret or a provider/service credential.
alter table private.billing_runtime add column last_job_ts bigint not null default 0;
create function public.billing_job_claim(p_ts bigint) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if abs((extract(epoch from clock_timestamp())*1000)::bigint-p_ts)>120000 then return false;end if;
 update private.billing_runtime set last_job_ts=p_ts where id and last_job_ts<p_ts;
 return found;
end $$;
revoke all on function public.billing_job_claim(bigint) from public,anon,authenticated;
grant execute on function public.billing_job_claim(bigint) to service_role;
grant update(last_job_ts) on private.billing_runtime to service_role;
create or replace function private.billing_run_job() returns bigint language plpgsql security invoker set search_path='' as $$
declare request_id bigint;nonce text:=gen_random_uuid()::text;ts text:=floor(extract(epoch from clock_timestamp())*1000)::bigint::text;signature text;
begin
 if not exists(select 1 from public.billing_contracts where status<>'cancelled' or paid_until>now()-interval '1 day') then return null;end if;
 select encode(extensions.hmac(ts||':'||nonce,job_secret,'sha256'),'hex') into signature from private.billing_runtime where id;
 select net.http_post(url:='https://eghqluvfvawiynzobaza.supabase.co/functions/v1/billing/reconcile-due',headers:=jsonb_build_object('Content-Type','application/json'),body:=jsonb_build_object('ts',ts,'nonce',nonce,'signature',signature),timeout_milliseconds:=120000) into request_id;
 return request_id;
end $$;
revoke all on function private.billing_run_job() from public,anon,authenticated,service_role;
commit;
