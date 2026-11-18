-- Per-animal care, independent from the matrix's reproductive event.
alter table public.animals add column birth_checklist jsonb;
alter table public.animals add constraint animals_birth_checklist_valid check (
 birth_checklist is null or (
  jsonb_typeof(birth_checklist)='object'
  and (birth_checklist-array['colostro','umbigo','brinco','peso'])='{}'::jsonb
  and not jsonb_path_exists(birth_checklist,'$.* ? (@.type() != "boolean")')
 )
);
-- Existing animal RLS, farm isolation and subscription write guards apply.
-- Keep the historical checklist when the animal grows into another category.
