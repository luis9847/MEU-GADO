begin;

alter table public.reproductive_events
 add column postpartum_checklist jsonb,
 add constraint reproductive_events_postpartum_checklist_valid check (
  postpartum_checklist is null or (
   event_type = 'Parto' and jsonb_typeof(postpartum_checklist) = 'object'
   and (postpartum_checklist - array['vaca','placenta','colostro','umbigo','brinco','peso','sem_cria_viva']) = '{}'::jsonb
   and not jsonb_path_exists(postpartum_checklist, '$.* ? (@.type() != "boolean")')
   and not (
    postpartum_checklist @> '{"sem_cria_viva":true}'::jsonb
    and postpartum_checklist ?| array['colostro','umbigo','brinco','peso']
   )
  )
 );

-- A checklist belongs to the original matrix and a recorded birth.
-- Keep it on date/notes corrections and soft deletion (which can be undone).
create function private.mg_reset_postpartum_on_reassignment()
returns trigger language plpgsql set search_path = '' as $$
begin
 if old.postpartum_checklist is not null
    and (new.animal_id is distinct from old.animal_id or new.event_type is distinct from old.event_type) then
  new.postpartum_checklist := null;
 end if;
 return new;
end $$;
revoke all on function private.mg_reset_postpartum_on_reassignment() from public, anon, authenticated;
create trigger mg_reset_postpartum_on_reassignment
before update of animal_id, event_type on public.reproductive_events
for each row execute function private.mg_reset_postpartum_on_reassignment();

commit;
