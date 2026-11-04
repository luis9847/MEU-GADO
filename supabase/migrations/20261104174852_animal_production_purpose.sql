-- Optional animal-level purpose. Existing animals remain unclassified until the producer chooses.
alter table public.animals add column production_purpose text;
alter table public.animals add constraint animals_production_purpose_values check (production_purpose is null or production_purpose in ('cria','recria','engorda','genetica'));
comment on column public.animals.production_purpose is 'Atividade opcional do bovino: cria, recria, engorda ou genética. Escolhida pelo criador, independente da raça.';
