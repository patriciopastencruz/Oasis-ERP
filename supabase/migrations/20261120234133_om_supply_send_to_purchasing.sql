-- Todavía no hay manejo de stock: la lista compra lo que piden los maestros, sin descontar existencias
-- ni lo que ya viene en camino. Bodega ajusta las cantidades y envía a compras en un solo paso.
begin;

create or replace function public.om_supply_build_purchase_list(p_requests uuid[],p_notes text) returns uuid
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); u public.business_units; g record; mat public.inventory_materials;
 lid uuid:=gen_random_uuid(); iid uuid; n int; seq int; v_from date; v_to date; num text; prefix text;
 v_stock numeric; v_transit numeric; v_buy numeric; v_price numeric; v_sup uuid; v_supname text;
 today date:=(now() at time zone 'America/Santiago')::date;
begin
 if me is null or not public.has_permission('inventory.supply.consolidate') then raise exception 'Sin autorizacion'; end if;
 u:=public.om_supply_unit();
 if p_requests is null or cardinality(p_requests)=0 then raise exception 'Elige al menos un pedido'; end if;
 perform 1 from public.om_supply_requests where id=any(p_requests) for update;
 select count(*),min(cover_from),max(cover_to) into n,v_from,v_to from public.om_supply_requests
  where id=any(p_requests) and business_unit_id=u.id and status='submitted';
 if n=0 or n<>(select count(distinct x) from unnest(p_requests) x) then raise exception 'Algunos pedidos ya no estan disponibles'; end if;

 perform pg_advisory_xact_lock(hashtextextended('om_supply_list_'||u.id::text,0));
 prefix:='LC-'||to_char(today,'YYMMDD')||'-';
 select count(*)+1 into seq from public.om_supply_purchase_lists where business_unit_id=u.id and list_number like prefix||'%';
 num:=prefix||lpad(seq::text,2,'0');
 insert into public.om_supply_purchase_lists(id,company_id,business_unit_id,list_number,cover_from,cover_to,notes,created_by)
 values(lid,u.company_id,u.id,num,v_from,v_to,left(nullif(btrim(coalesce(p_notes,'')),''),1000),me);

 for g in
  select l.material_id,min(l.name) as name,min(l.unit) as unit,sum(l.quantity) as qty
  from public.om_supply_request_lines l where l.request_id=any(p_requests)
  group by l.material_id,case when l.material_id is null then lower(btrim(l.name))||'|'||lower(btrim(l.unit)) end
  order by min(l.name)
 loop
  v_stock:=0; v_transit:=0; v_price:=null; v_sup:=null; v_supname:=null;
  if g.material_id is not null then
   select * into mat from public.inventory_materials where id=g.material_id;
   v_price:=coalesce(mat.last_purchase_price,nullif(mat.average_price,0));
   select s.id,coalesce(nullif(btrim(s.trade_name),''),s.legal_name) into v_sup,v_supname
    from public.inventory_purchase_lines pln
    join public.inventory_purchase_invoices inv on inv.id=pln.invoice_id
    join public.suppliers s on s.id=inv.supplier_id
    where pln.material_id=mat.id order by inv.purchase_date desc,inv.entered_at desc limit 1;
  end if;
  v_buy:=g.qty;
  insert into public.om_supply_purchase_items(company_id,business_unit_id,list_id,material_id,name,unit,requested_quantity,stock_quantity,
   in_transit_quantity,quantity_to_buy,supplier_id,supplier_name,reference_price,status)
  values(u.company_id,u.id,lid,g.material_id,g.name,g.unit,g.qty,v_stock,v_transit,v_buy,v_sup,v_supname,v_price,
   case when v_buy=0 then 'covered' else 'pending' end) returning id into iid;
  update public.om_supply_request_lines set purchase_item_id=iid
   where request_id=any(p_requests)
    and ((g.material_id is not null and material_id=g.material_id)
     or (g.material_id is null and material_id is null and lower(btrim(name))=lower(btrim(g.name)) and lower(btrim(unit))=lower(btrim(g.unit))));
 end loop;

 update public.om_supply_requests set status='in_list',purchase_list_id=lid where id=any(p_requests);
 insert into public.notifications(company_id,business_unit_id,recipient_id,event_key,title,body,entity_type,entity_id,created_by)
 select distinct on (r.requested_by) u.company_id,u.id,r.requested_by,'inventory.supply.request_in_list','Tu pedido de materiales pasó a compras',
  'Bodega incluyó tu pedido para '||coalesce(r.project_number||' · ','')||r.project_name||' en la lista de compras '||num||'.',
  'om_supply_request',r.id,me
 from public.om_supply_requests r
 where r.id=any(p_requests) and r.requested_by<>me
 order by r.requested_by,r.created_at;
 return lid;
end $$;

-- Bodega: arma la lista con los pedidos elegidos, aplica las cantidades ajustadas y la envía a compras.
-- p_quantities: [{"line_id": <una línea de pedido del producto>, "quantity": <cantidad a comprar>}]
create function public.om_supply_send_to_purchasing(p_requests uuid[],p_quantities jsonb,p_notes text) returns uuid
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); u public.business_units; lid uuid; q jsonb; v_qty numeric; iid uuid;
begin
 if me is null or not public.has_permission('inventory.supply.consolidate') then raise exception 'Sin autorizacion'; end if;
 u:=public.om_supply_unit();
 if p_quantities is not null and jsonb_typeof(p_quantities)<>'array' then raise exception 'La cantidad a comprar no es valida'; end if;
 lid:=public.om_supply_build_purchase_list(p_requests,p_notes);
 for q in select * from jsonb_array_elements(coalesce(p_quantities,'[]'::jsonb)) loop
  v_qty:=nullif(q->>'quantity','')::numeric;
  if v_qty is null or v_qty<0 or v_qty>=1000000 then raise exception 'La cantidad a comprar no es valida'; end if;
  iid:=null;
  select l.purchase_item_id into iid from public.om_supply_request_lines l
   where l.id=nullif(q->>'line_id','')::uuid and l.request_id=any(p_requests);
  if iid is null then raise exception 'Los pedidos cambiaron mientras armabas la lista'; end if;
  update public.om_supply_purchase_items set quantity_to_buy=round(v_qty,3),status=case when v_qty=0 then 'covered' else 'pending' end
   where id=iid and list_id=lid;
 end loop;
 perform public.om_supply_issue_list(lid);
 return lid;
end $$;

revoke execute on function public.om_supply_build_purchase_list(uuid[],text),public.om_supply_send_to_purchasing(uuid[],jsonb,text) from public,anon;
grant execute on function public.om_supply_build_purchase_list(uuid[],text),public.om_supply_send_to_purchasing(uuid[],jsonb,text) to authenticated;

commit;
