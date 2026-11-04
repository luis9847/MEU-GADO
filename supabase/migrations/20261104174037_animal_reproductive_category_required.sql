-- CHECK expressions must also reject an unknown/null category when classification is provided.
alter table public.animals add constraint animals_reproductive_category_known check ((reproductive_role is null and male_condition is null) or coalesce(category,'') in ('Boi','Touro','Novilho','Bezerro','Vaca','Novilha','Bezerra'));
