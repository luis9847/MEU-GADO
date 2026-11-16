begin;

create index farm_sales_unreceived_due on public.farm_animal_sales(farm_id,due_date,id)
where cancelled_at is null and received_on is null and amount>0 and due_date is not null;

-- The existing animal trigger creates the financial entry. Updating it here in
-- the same transaction prevents a sale without its terms if either write fails.
create function public.mg_register_farm_sale(
 p_farm_id bigint,p_animal_id bigint,p_sale_date date,p_amount numeric,
 p_buyer text,p_due_date date,p_received_at_sale boolean,p_notes text
) returns bigint
language plpgsql security invoker set search_path='' as $$
declare sale_id bigint; animal_updated bigint; local_today date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 if auth.uid() is null or not private.mg_plan_feature(p_farm_id,'expenses')
    or not public.has_farm_role(p_farm_id,array['owner','admin','manager']) then
  raise exception 'Seu perfil não permite registrar vendas nesta fazenda.' using errcode='42501';
 end if;
 if p_sale_date is null or p_sale_date>local_today then
  raise exception 'Informe uma data de venda até hoje.' using errcode='22023';
 end if;
 if p_amount is null or p_amount<=0 or p_amount>999999999.99 or p_amount<>round(p_amount,2) then
  raise exception 'Informe um valor de venda válido com até duas casas decimais.' using errcode='22023';
 end if;
 if p_due_date<p_sale_date or (p_received_at_sale and p_due_date is not null) then
  raise exception 'Informe um vencimento válido para a venda a prazo.' using errcode='22023';
 end if;
 if char_length(coalesce(p_buyer,''))>120 or char_length(coalesce(p_notes,''))>500 then
  raise exception 'Reduza o nome do comprador ou as observações.' using errcode='22023';
 end if;

 update public.animals
 set status='inactive',exit_type='Vendido',exit_date=p_sale_date,exit_value=p_amount,exit_notes=nullif(btrim(p_notes),'')
 where farm_id=p_farm_id and id=p_animal_id and status='active' and deleted_at is null
 returning id into animal_updated;
 if animal_updated is null then
  raise exception 'Animal não está ativo. Atualize a lista e confira se a venda já foi registrada.' using errcode='22023';
 end if;

 update public.farm_animal_sales
 set buyer=nullif(btrim(p_buyer),''),due_date=p_due_date,received_on=case when p_received_at_sale then p_sale_date end
 where farm_id=p_farm_id and animal_id=p_animal_id and cancelled_at is null
 returning id into sale_id;
 if sale_id is null then
  raise exception 'Não foi possível registrar a venda no financeiro.' using errcode='P0001';
 end if;
 return sale_id;
end $$;
revoke all on function public.mg_register_farm_sale(bigint,bigint,date,numeric,text,date,boolean,text) from public,anon,authenticated;
grant execute on function public.mg_register_farm_sale(bigint,bigint,date,numeric,text,date,boolean,text) to authenticated;
commit;
