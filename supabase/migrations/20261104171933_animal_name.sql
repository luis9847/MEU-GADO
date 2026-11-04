-- Optional bovine name, independent from the existing unique farm/number identifier.
-- Existing RLS, commercial admission triggers and grants remain in force.
alter table public.animals add column name text;
alter table public.animals add constraint animals_name_length check (name is null or char_length(name) <= 120);
comment on column public.animals.name is 'Nome opcional do bovino, informado pelo criador. Não comprova registro genealógico.';
