begin;

-- Vincula cada producto de venta con su materia prima de empaque para poder
-- descontar stock automáticamente cuando un pedido se marca como entregado.
alter table public.dist_products add column material_id uuid references public.inventory_materials(id);
alter table public.dist_orders add column materials_consumed_at timestamptz;

-- Si la unidad DA ya generó su catálogo de materia prima (primer acceso a
-- Inventario y Materiales > Stock), se vincula de inmediato; si aún no existe,
-- ensure_distribution_stock_catalog completa el vínculo en el próximo acceso.
update public.dist_products p set material_id=m.id
from public.inventory_materials m
where m.business_unit_id=p.business_unit_id
  and m.code=case p.code
   when 'ICE-1KG' then 'DA-MP-ICE-1KG' when 'ICE-2KG' then 'DA-MP-ICE-2KG'
   when 'FRAPPE-1KG' then 'DA-MP-FRAPPE-1KG' when 'FRAPPE-2KG' then 'DA-MP-FRAPPE-2KG'
   when 'WATER-20L' then 'DA-MP-WATER-20L' when 'WATER-6L' then 'DA-MP-WATER-6L'
   when 'WATER-16L' then 'DA-MP-WATER-16L' when 'WATER-600' then 'DA-MP-WATER-600CC'
   else null end;

create or replace function public.ensure_distribution_stock_catalog(target_unit uuid)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); company uuid;
begin
 select company_id into company from public.business_units where id=target_unit and code='DA' and active;
 if actor is null or company is null or not public.can_access_unit(company,target_unit)
    or not public.has_permission('finance.distribution.stock.view') then
  raise exception 'Usuario no autorizado';
 end if;

 insert into public.inventory_materials(company_id,business_unit_id,code,name,category,unit_of_measure,standard_price,average_price,created_by)
 select company,target_unit,x.code,x.name,x.category,'unidad',0,0,actor
 from (values
  ('DA-MP-ICE-1KG','Bolsa para hielo 1 kg','Bolsas para hielo'),
  ('DA-MP-ICE-2KG','Bolsa para hielo 2 kg','Bolsas para hielo'),
  ('DA-MP-FRAPPE-1KG','Bolsa para frappé 1 kg','Bolsas para frappé'),
  ('DA-MP-FRAPPE-2KG','Bolsa para frappé 2 kg','Bolsas para frappé'),
  ('DA-MP-WATER-20L','Envase de agua 20 L','Envases de agua'),
  ('DA-MP-WATER-6L','Envase de agua 6 L','Envases de agua'),
  ('DA-MP-WATER-16L','Envase de agua 1,6 L','Envases de agua'),
  ('DA-MP-WATER-600CC','Envase de agua 600 cc','Envases de agua')
 ) x(code,name,category)
 on conflict(company_id,business_unit_id,code) do update
 set name=excluded.name,category=excluded.category,unit_of_measure=excluded.unit_of_measure,status='active';

 update public.dist_products p set material_id=m.id
 from public.inventory_materials m
 where p.business_unit_id=target_unit and m.business_unit_id=target_unit
   and p.material_id is null
   and m.code=case p.code
    when 'ICE-1KG' then 'DA-MP-ICE-1KG' when 'ICE-2KG' then 'DA-MP-ICE-2KG'
    when 'FRAPPE-1KG' then 'DA-MP-FRAPPE-1KG' when 'FRAPPE-2KG' then 'DA-MP-FRAPPE-2KG'
    when 'WATER-20L' then 'DA-MP-WATER-20L' when 'WATER-6L' then 'DA-MP-WATER-6L'
    when 'WATER-16L' then 'DA-MP-WATER-16L' when 'WATER-600' then 'DA-MP-WATER-600CC'
    else null end;
end $$;

-- El stock de materia prima de la Distribuidora refleja consumo real y puede
-- quedar negativo cuando la compra no alcanzó a cubrir lo entregado; esa
-- señal es intencional para anticipar la próxima compra. Los registros
-- manuales de salida (register_inventory_output) siguen bloqueando saldo
-- insuficiente porque son una acción explícita del operador.
alter table public.inventory_materials drop constraint inventory_materials_current_stock_check;
alter table public.inventory_movements drop constraint inventory_movements_stock_after_check;

create or replace function public.dist_consume_order_materials(target_order uuid) returns void language plpgsql security definer set search_path='' as $$
declare o public.dist_orders%rowtype; ln record; mat public.inventory_materials%rowtype; qty numeric; new_stock numeric;
begin
 select * into strict o from public.dist_orders where id=target_order for update;
 if o.status not in('delivered','partially_delivered') then raise exception 'Pedido no entregado'; end if;
 if o.materials_consumed_at is not null then return; end if;
 for ln in select l.planned_quantity,p.material_id,p.conversion_factor from public.dist_order_lines l join public.dist_products p on p.id=l.product_id where l.order_id=o.id and p.material_id is not null loop
  select * into mat from public.inventory_materials where id=ln.material_id for update;
  if found then
   qty:=ln.planned_quantity*ln.conversion_factor;
   new_stock:=mat.current_stock-qty;
   update public.inventory_materials set current_stock=new_stock where id=mat.id;
   insert into public.inventory_movements(company_id,business_unit_id,material_id,movement_type,quantity_out,stock_before,stock_after,document_reference,observation,created_by)
   values(mat.company_id,mat.business_unit_id,mat.id,'operational_consumption',qty,mat.current_stock,new_stock,o.order_number,'Consumo automático por entrega de pedido',auth.uid());
  end if;
 end loop;
 update public.dist_orders set materials_consumed_at=now() where id=o.id;
end $$;
revoke all on function public.dist_consume_order_materials(uuid) from public,anon;
grant execute on function public.dist_consume_order_materials(uuid) to authenticated,service_role;

create or replace function public.dist_guard_order_update() returns trigger language plpgsql set search_path='' as $$
declare paid numeric;
begin
 if old.status<>new.status and not (
  (old.status='scheduled' and new.status in('assigned','cancelled','voided')) or
  (old.status='assigned' and new.status in('en_route','scheduled','cancelled','voided')) or
  (old.status='en_route' and new.status in('delivered','partially_delivered','not_delivered')) or
  (old.status='not_delivered' and new.status='rescheduled')) then
  raise exception 'Transicion de pedido no permitida: % -> %',old.status,new.status;
 end if;
 if new.payment_status is distinct from old.payment_status then
  select coalesce(sum(a.amount),0) into paid from public.dist_payment_allocations a join public.dist_payments p on p.id=a.payment_id and p.status='confirmed' where a.order_id=old.id;
  new.payment_status:=case when paid=0 then case when old.payment_condition='credit' then 'credit' else 'pending' end when paid<old.total then 'partial' else 'paid' end;
 end if;
 if public.has_permission('finance.distribution.orders.manage') then return new; end if;
 if public.has_permission('finance.distribution.routes.manage') then
  if (to_jsonb(new)-array['driver_id','route_position','status','payment_status','updated_by','updated_at'])<>(to_jsonb(old)-array['driver_id','route_position','status','payment_status','updated_by','updated_at']) then raise exception 'El Administrativo no puede editar pedidos guardados'; end if;
  if new.status<>old.status and not (old.status='scheduled' and new.status='assigned') and not (old.status='assigned' and new.status='scheduled') then raise exception 'Cambio de estado no autorizado'; end if;
  return new;
 end if;
 if public.has_permission('finance.distribution.driver') and old.driver_id=auth.uid() then
  if (to_jsonb(new)-array['status','payment_status','actual_delivered_at','non_delivery_reason','non_delivery_notes','materials_consumed_at','updated_by','updated_at'])<>(to_jsonb(old)-array['status','payment_status','actual_delivered_at','non_delivery_reason','non_delivery_notes','materials_consumed_at','updated_by','updated_at']) then raise exception 'El chofer no puede editar datos comerciales'; end if;
  return new;
 end if;
 raise exception 'Actualizacion de pedido no autorizada';
end $$;

create or replace function public.dist_change_order_status(target_order uuid,target_status text,details jsonb default '{}'::jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare o record; allowed boolean:=false;
begin
 select * into strict o from public.dist_orders where id=target_order for update;
 if public.dist_closed(o.business_unit_id,o.delivery_date) then raise exception 'Fecha cerrada'; end if;
 if public.has_permission('finance.distribution.driver') and o.driver_id<>auth.uid() then raise exception 'Pedido de otro chofer'; end if;
 if not public.has_permission('finance.distribution.driver') and not public.has_permission('finance.distribution.orders.manage') then raise exception 'Sin autorizacion'; end if;
 allowed:= (o.status='scheduled' and target_status in('assigned','cancelled','voided')) or (o.status='assigned' and target_status in('en_route','scheduled','cancelled','voided')) or (o.status='en_route' and target_status in('delivered','partially_delivered','not_delivered')) or (o.status='not_delivered' and target_status='rescheduled');
 if not allowed then raise exception 'Transicion no permitida: % -> %',o.status,target_status; end if;
 if target_status='not_delivered' and nullif(trim(details->>'reason'),'') is null then raise exception 'Motivo obligatorio'; end if;
 update public.dist_orders set status=target_status,actual_delivered_at=case when target_status in('delivered','partially_delivered') then now() else actual_delivered_at end,non_delivery_reason=case when target_status='not_delivered' then details->>'reason' else non_delivery_reason end,non_delivery_notes=case when target_status='not_delivered' then details->>'notes' else non_delivery_notes end,updated_by=auth.uid() where id=target_order;
 insert into public.dist_order_status_history(company_id,business_unit_id,order_id,previous_status,new_status,reason,metadata,changed_by) values(o.company_id,o.business_unit_id,o.id,o.status,target_status,details->>'reason',details,auth.uid());
 if target_status in('delivered','partially_delivered') then
  insert into public.dist_deliveries(company_id,business_unit_id,order_id,driver_id,notes,latitude,longitude,evidence_path,created_by) values(o.company_id,o.business_unit_id,o.id,o.driver_id,details->>'notes',nullif(details->>'latitude','')::numeric,nullif(details->>'longitude','')::numeric,nullif(details->>'evidence_path',''),auth.uid()) on conflict(order_id) do nothing;
  perform public.dist_consume_order_materials(o.id);
 end if;
end $$;

commit;
