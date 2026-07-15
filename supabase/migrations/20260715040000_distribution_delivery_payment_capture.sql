begin;

-- Los pedidos de contado (efectivo/transferencia) no deben poder quedar
-- "pendientes" tras la entrega: el chofer siempre cobra en el momento. Al
-- marcar un pedido como entregado se exige el medio de pago y se registra el
-- cobro completo automáticamente. Los pedidos a crédito no cambian: se cobran
-- después desde la pantalla "Cobros".

create or replace function public.dist_register_payment_core(o public.dist_orders,payment_amount numeric,payment_method text,receipt text,notes_text text,idempotency text) returns uuid language plpgsql security invoker set search_path='' as $$
declare paid numeric;pid uuid;
begin
 if not (public.has_permission('finance.distribution.payments.manage') or public.has_permission('finance.distribution.driver')) or payment_amount<=0 then raise exception 'Pago no autorizado'; end if;
 if public.has_permission('finance.distribution.driver') and o.driver_id<>auth.uid() then raise exception 'Pedido de otro chofer'; end if;
 select coalesce(sum(a.amount),0) into paid from public.dist_payment_allocations a join public.dist_payments p on p.id=a.payment_id and p.status='confirmed' where a.order_id=o.id;
 if paid+payment_amount>o.total then raise exception 'El pago supera la deuda'; end if;
 insert into public.dist_payments(company_id,business_unit_id,customer_id,amount,method,receipt_number,notes,idempotency_key,registered_by) values(o.company_id,o.business_unit_id,o.customer_id,payment_amount,payment_method,nullif(receipt,''),nullif(notes_text,''),idempotency,auth.uid()) returning id into pid;
 insert into public.dist_payment_allocations(payment_id,order_id,amount) values(pid,o.id,payment_amount);
 update public.dist_orders set payment_status=case when paid+payment_amount=o.total then 'paid' else 'partial' end,updated_by=auth.uid() where id=o.id;
 return pid;
end $$;
revoke all on function public.dist_register_payment_core(public.dist_orders,numeric,text,text,text,text) from public,anon;
grant execute on function public.dist_register_payment_core(public.dist_orders,numeric,text,text,text,text) to authenticated;

create or replace function public.dist_register_payment(target_order uuid,payment_amount numeric,payment_method text,receipt text,notes_text text,idempotency text) returns uuid language plpgsql security invoker set search_path='' as $$
declare o public.dist_orders;pid uuid;
begin
 select * into strict o from public.dist_orders where id=target_order for update;
 pid:=public.dist_register_payment_core(o,payment_amount,payment_method,receipt,notes_text,idempotency);
 return pid;
end $$;

create or replace function public.dist_change_order_status(target_order uuid,target_status text,details jsonb default '{}'::jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare o public.dist_orders; allowed boolean:=false; method text;
begin
 select * into strict o from public.dist_orders where id=target_order for update;
 if public.dist_closed(o.business_unit_id,o.delivery_date) then raise exception 'Fecha cerrada'; end if;
 if public.has_permission('finance.distribution.driver') and o.driver_id<>auth.uid() then raise exception 'Pedido de otro chofer'; end if;
 if not public.has_permission('finance.distribution.driver') and not public.has_permission('finance.distribution.orders.manage') then raise exception 'Sin autorizacion'; end if;
 allowed:= (o.status='scheduled' and target_status in('assigned','cancelled','voided')) or (o.status='assigned' and target_status in('en_route','scheduled','cancelled','voided')) or (o.status='en_route' and target_status in('delivered','partially_delivered','not_delivered')) or (o.status='not_delivered' and target_status='rescheduled');
 if not allowed then raise exception 'Transicion no permitida: % -> %',o.status,target_status; end if;
 if target_status='not_delivered' and nullif(trim(details->>'reason'),'') is null then raise exception 'Motivo obligatorio'; end if;
 if target_status in('delivered','partially_delivered') and o.payment_condition<>'credit' then
  method:=details->>'payment_method';
  if method is null or method not in('cash','transfer') then raise exception 'Medio de pago obligatorio'; end if;
 end if;
 update public.dist_orders set status=target_status,actual_delivered_at=case when target_status in('delivered','partially_delivered') then now() else actual_delivered_at end,non_delivery_reason=case when target_status='not_delivered' then details->>'reason' else non_delivery_reason end,non_delivery_notes=case when target_status='not_delivered' then details->>'notes' else non_delivery_notes end,updated_by=auth.uid() where id=target_order;
 insert into public.dist_order_status_history(company_id,business_unit_id,order_id,previous_status,new_status,reason,metadata,changed_by) values(o.company_id,o.business_unit_id,o.id,o.status,target_status,details->>'reason',details,auth.uid());
 if target_status in('delivered','partially_delivered') then
  insert into public.dist_deliveries(company_id,business_unit_id,order_id,driver_id,notes,latitude,longitude,evidence_path,created_by) values(o.company_id,o.business_unit_id,o.id,o.driver_id,details->>'notes',nullif(details->>'latitude','')::numeric,nullif(details->>'longitude','')::numeric,nullif(details->>'evidence_path',''),auth.uid()) on conflict(order_id) do nothing;
  perform public.dist_consume_order_materials(o.id);
  if method is not null then
   perform public.dist_register_payment_core(o,o.total,method,'','Cobro registrado al entregar','delivery:'||o.id::text);
  end if;
 end if;
end $$;

commit;
