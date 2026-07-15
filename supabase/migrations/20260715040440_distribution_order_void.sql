begin;

-- Anulación de pedidos con la misma lógica que la edición: el Administrador
-- anula directamente; el Administrativo solo puede solicitarlo y el
-- Administrador aprueba o rechaza. Solo procede mientras el pedido admite la
-- transición a 'voided' (programado o asignado, sin chofer en ruta).
create or replace function public.dist_void_order(target_order uuid,reason_text text) returns void language plpgsql security invoker set search_path='' as $$
declare o public.dist_orders%rowtype;
begin
 if not public.has_permission('finance.distribution.orders.manage') then raise exception 'Sin autorizacion'; end if;
 if length(trim(reason_text))<3 then raise exception 'El motivo es obligatorio'; end if;
 select * into strict o from public.dist_orders where id=target_order for update;
 if o.status not in('scheduled','assigned') then raise exception 'El pedido ya no admite anulación directa'; end if;
 update public.dist_orders set status='voided',payment_status='voided',voided_at=now(),voided_by=auth.uid(),void_reason=reason_text,updated_by=auth.uid() where id=o.id;
 insert into public.dist_order_status_history(company_id,business_unit_id,order_id,previous_status,new_status,reason,changed_by) values(o.company_id,o.business_unit_id,o.id,o.status,'voided',reason_text,auth.uid());
end $$;
revoke all on function public.dist_void_order(uuid,text) from public,anon;
grant execute on function public.dist_void_order(uuid,text) to authenticated,service_role;

-- El recálculo automático de payment_status no debe pisar una anulación
-- explícita (el saldo pagado siempre es 0 en un pedido recién anulado, lo
-- que antes recomputaba 'credit'/'pending' en vez de dejar 'voided').
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

create or replace function public.dist_request_order_change(target_order uuid,request_type text,reason_text text,proposed jsonb default null) returns uuid language plpgsql security invoker set search_path='' as $$
declare o public.dist_orders; rid uuid; ln jsonb;
begin
 if not public.has_permission('finance.distribution.requests.create') then raise exception 'Sin autorizacion'; end if;
 if request_type not in('edit','void') or length(trim(reason_text))<3 then raise exception 'Solicitud invalida'; end if;
 select * into strict o from public.dist_orders where id=target_order;
 if request_type='edit' then
  if o.status in('delivered','partially_delivered','cancelled','voided') then raise exception 'El pedido ya no admite ediciones'; end if;
  if jsonb_array_length(coalesce(proposed->'lines','[]'::jsonb))=0 then raise exception 'La edicion requiere productos'; end if;
  for ln in select * from jsonb_array_elements(proposed->'lines') loop
   if (ln->>'quantity')::numeric<=0 then raise exception 'Cantidad invalida'; end if;
   if not exists(select 1 from public.dist_products where id=(ln->>'product_id')::uuid and business_unit_id=o.business_unit_id and active and deleted_at is null) then raise exception 'Producto no autorizado'; end if;
  end loop;
 elsif request_type='void' and o.status not in('scheduled','assigned') then
  raise exception 'El pedido ya no admite anulación';
 end if;
 insert into public.dist_change_requests(company_id,business_unit_id,order_id,type,reason,current_data,proposed_data,requested_by)
 values(o.company_id,o.business_unit_id,o.id,request_type,reason_text,
  jsonb_build_object('order',to_jsonb(o),'lines',coalesce((select jsonb_agg(jsonb_build_object('product_id',l.product_id,'quantity',l.planned_quantity,'unit_price',l.unit_price)) from public.dist_order_lines l where l.order_id=o.id),'[]'::jsonb)),
  proposed,auth.uid()) returning id into rid;
 return rid;
end $$;

commit;
