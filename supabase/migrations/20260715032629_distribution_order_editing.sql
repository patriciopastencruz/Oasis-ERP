begin;

-- Permite editar pedidos no entregados: el Administrador (o superior) edita
-- directamente; el Administrativo debe solicitarlo y el Administrador aprueba.
-- La función recalcula precios y totales en el servidor; el navegador nunca
-- decide el total.
create or replace function public.dist_update_order(target_order uuid,payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare o public.dist_orders%rowtype; ln jsonb; priced record; subtotal_value numeric:=0; discount_value numeric:=coalesce((payload->>'discount')::numeric,0); new_delivery date;
begin
 select * into strict o from public.dist_orders where id=target_order for update;
 if not public.has_permission('finance.distribution.orders.manage') then raise exception 'Sin autorizacion'; end if;
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
 delete from public.dist_order_lines where order_id=o.id;
 for ln in select * from jsonb_array_elements(payload->'lines') loop
  select * into priced from public.dist_resolve_price((ln->>'product_id')::uuid,o.customer_id,new_delivery);
  insert into public.dist_order_lines(company_id,business_unit_id,order_id,product_id,planned_quantity,unit_price,price_origin,price_id,line_total,created_by)
  values(o.company_id,o.business_unit_id,o.id,(ln->>'product_id')::uuid,(ln->>'quantity')::numeric,priced.amount,priced.origin,priced.price_id,round(priced.amount*(ln->>'quantity')::numeric,2),auth.uid());
 end loop;
 update public.dist_orders set delivery_date=new_delivery,estimated_time=nullif(payload->>'estimated_time','')::time,delivery_address=coalesce(nullif(trim(payload->>'delivery_address'),''),o.delivery_address),notes=nullif(trim(payload->>'notes'),''),subtotal=subtotal_value,discount=discount_value,total=subtotal_value-discount_value,updated_by=auth.uid() where id=o.id;
end $$;
revoke all on function public.dist_update_order(uuid,jsonb) from public,anon;
grant execute on function public.dist_update_order(uuid,jsonb) to authenticated,service_role;

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
 end if;
 insert into public.dist_change_requests(company_id,business_unit_id,order_id,type,reason,current_data,proposed_data,requested_by)
 values(o.company_id,o.business_unit_id,o.id,request_type,reason_text,
  jsonb_build_object('order',to_jsonb(o),'lines',coalesce((select jsonb_agg(jsonb_build_object('product_id',l.product_id,'quantity',l.planned_quantity,'unit_price',l.unit_price)) from public.dist_order_lines l where l.order_id=o.id),'[]'::jsonb)),
  proposed,auth.uid()) returning id into rid;
 return rid;
end $$;

create or replace function public.dist_review_order_change(target_request uuid,decision text,comment_text text) returns void language plpgsql security invoker set search_path='' as $$
declare r public.dist_change_requests;o public.dist_orders;
begin
 if not public.has_permission('finance.distribution.requests.review') or decision not in('approved','rejected') then raise exception 'Sin autorizacion'; end if;
 select * into strict r from public.dist_change_requests where id=target_request for update;
 if r.status not in('pending','in_review') then raise exception 'Solicitud ya resuelta'; end if;
 select * into strict o from public.dist_orders where id=r.order_id for update;
 if decision='approved' then
  if r.type='void' then update public.dist_orders set status='voided',payment_status='voided',voided_at=now(),voided_by=auth.uid(),void_reason=r.reason,updated_by=auth.uid() where id=o.id;
  else perform public.dist_update_order(o.id,r.proposed_data); end if;
 end if;
 update public.dist_change_requests set status=decision,reviewed_by=auth.uid(),resolution_comment=comment_text,reviewed_at=now(),applied_data=case when decision='approved' then (select to_jsonb(x) from public.dist_orders x where x.id=o.id) end where id=r.id;
end $$;

commit;
