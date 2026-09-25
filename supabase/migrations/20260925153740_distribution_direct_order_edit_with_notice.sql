begin;

-- Edición de pedidos sin autorización previa: quien puede solicitar cambios
-- (Administrativo, finance.distribution.requests.create) o administrar pedidos
-- edita directamente y el sistema solo notifica a quienes revisan solicitudes o
-- administran pedidos. La anulación sigue exigiendo solicitud y autorización.
-- Los precios y el total continúan calculándose en el servidor.

-- Las funciones de edición directa marcan la transacción para que el guard de
-- dist_orders acepte el cambio de un rol que no tiene orders.manage. La marca
-- es local a la transacción y solo la fijan funciones SECURITY DEFINER que ya
-- comprobaron permiso y unidad.
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
 if new.payment_status is distinct from old.payment_status and new.payment_status<>'voided' then
  select coalesce(sum(a.amount),0) into paid from public.dist_payment_allocations a join public.dist_payments p on p.id=a.payment_id and p.status='confirmed' where a.order_id=old.id;
  new.payment_status:=case when paid=0 then case when old.payment_condition='credit' then 'credit' else 'pending' end when paid<old.total then 'partial' else 'paid' end;
 end if;
 if current_setting('app.dist_direct_order_edit',true)='on' and new.status=old.status then return new; end if;
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

create or replace function public.dist_update_order(target_order uuid,payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare o public.dist_orders%rowtype; ln jsonb; priced record; subtotal_value numeric:=0; discount_value numeric:=coalesce((payload->>'discount')::numeric,0); new_delivery date;
 before_lines jsonb; after_lines jsonb; actor_name text;
begin
 select * into strict o from public.dist_orders where id=target_order for update;
 if not (public.has_permission('finance.distribution.orders.manage') or public.has_permission('finance.distribution.requests.create'))
  or not public.can_access_unit(o.company_id,o.business_unit_id) then raise exception 'Sin autorizacion'; end if;
 if o.status in('delivered','partially_delivered','cancelled','voided') then raise exception 'El pedido ya no admite ediciones'; end if;
 new_delivery:=coalesce((payload->>'delivery_date')::date,o.delivery_date);
 if public.dist_closed(o.business_unit_id,new_delivery) then raise exception 'Fecha cerrada'; end if;
 if jsonb_array_length(coalesce(payload->'lines','[]'::jsonb))=0 then raise exception 'El pedido requiere productos'; end if;
 for ln in select * from jsonb_array_elements(payload->'lines') loop
  if (ln->>'quantity')::numeric<=0 then raise exception 'Cantidad invalida'; end if;
  if not exists(select 1 from public.dist_products where id=(ln->>'product_id')::uuid and business_unit_id=o.business_unit_id and active and deleted_at is null) then raise exception 'Producto no autorizado'; end if;
  select * into priced from public.dist_resolve_price((ln->>'product_id')::uuid,o.customer_id,new_delivery);
  if priced.price_id is null then raise exception 'Producto sin precio vigente'; end if;
  subtotal_value:=subtotal_value+round(priced.amount*(ln->>'quantity')::numeric,2);
 end loop;
 if discount_value>subtotal_value then raise exception 'Descuento invalido'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('product_id',l.product_id,'quantity',l.planned_quantity,'unit_price',l.unit_price) order by l.created_at),'[]'::jsonb) into before_lines from public.dist_order_lines l where l.order_id=o.id;
 delete from public.dist_order_lines where order_id=o.id;
 for ln in select * from jsonb_array_elements(payload->'lines') loop
  select * into priced from public.dist_resolve_price((ln->>'product_id')::uuid,o.customer_id,new_delivery);
  insert into public.dist_order_lines(company_id,business_unit_id,order_id,product_id,planned_quantity,unit_price,price_origin,price_id,line_total,created_by)
  values(o.company_id,o.business_unit_id,o.id,(ln->>'product_id')::uuid,(ln->>'quantity')::numeric,priced.amount,priced.origin,priced.price_id,round(priced.amount*(ln->>'quantity')::numeric,2),auth.uid());
 end loop;
 perform set_config('app.dist_direct_order_edit','on',true);
 update public.dist_orders set delivery_date=new_delivery,estimated_time=nullif(payload->>'estimated_time','')::time,delivery_address=coalesce(nullif(trim(payload->>'delivery_address'),''),o.delivery_address),notes=nullif(trim(payload->>'notes'),''),subtotal=subtotal_value,discount=discount_value,total=subtotal_value-discount_value,updated_by=auth.uid() where id=o.id;
 perform set_config('app.dist_direct_order_edit','off',true);
 select coalesce(jsonb_agg(jsonb_build_object('product_id',l.product_id,'quantity',l.planned_quantity,'unit_price',l.unit_price) order by l.created_at),'[]'::jsonb) into after_lines from public.dist_order_lines l where l.order_id=o.id;

 -- Trazabilidad: queda registrado qué cambió y quién lo hizo.
 insert into public.dist_order_status_history(company_id,business_unit_id,order_id,previous_status,new_status,reason,metadata,changed_by)
 values(o.company_id,o.business_unit_id,o.id,o.status,o.status,'Pedido editado',
  jsonb_build_object('event','order_edited','before',jsonb_build_object('delivery_date',o.delivery_date,'delivery_address',o.delivery_address,'discount',o.discount,'total',o.total,'lines',before_lines),
   'after',jsonb_build_object('delivery_date',new_delivery,'discount',discount_value,'total',subtotal_value-discount_value,'lines',after_lines)),auth.uid());

 -- Solo se notifica; no requiere autorización.
 select coalesce(nullif(trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')),''),'Un usuario') into actor_name from public.profiles p where p.id=auth.uid();
 insert into public.notifications(company_id,business_unit_id,recipient_id,event_key,title,body,entity_type,entity_id,created_by)
 select o.company_id,o.business_unit_id,p.id,'distribution.order_changed','Pedido modificado',
  coalesce(actor_name,'Un usuario')||' modificó el pedido '||o.order_number||': total de $'||to_char(o.total,'FM999G999G990')||' a $'||to_char(subtotal_value-discount_value,'FM999G999G990')||'.',
  'dist_order',o.id,auth.uid()
 from public.profiles p
 join public.user_business_units ubu on ubu.user_id=p.id and ubu.company_id=o.company_id and ubu.business_unit_id=o.business_unit_id
 where p.active and p.deleted_at is null and p.id<>coalesce(auth.uid(),'00000000-0000-0000-0000-000000000000'::uuid)
  and exists(select 1 from public.role_permissions rp join public.permissions pm on pm.id=rp.permission_id
   where rp.role_id=p.role_id and pm.active and pm.key in('finance.distribution.requests.review','finance.distribution.orders.manage'));
end $$;
revoke all on function public.dist_update_order(uuid,jsonb) from public,anon;
grant execute on function public.dist_update_order(uuid,jsonb) to authenticated,service_role;

commit;
