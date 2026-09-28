begin;

-- Corregir el precio de una reserva directa (tarifa por noche, descuento y
-- recargo) cuando se ingresó con error. El total siempre lo calcula la base:
-- noches × tarifa − descuento + recargo. Requiere motivo y queda en
-- audit_logs. Una reserva con check-out ya hecho solo la corrige el
-- administrador o superior. Las reservas de Booking/Airbnb mantienen su
-- flujo "Completar información interna".

-- El administrador gestiona reservas (en producción ya lo tiene asignado).
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.key='administrator' and p.key='lodging.reservations.manage'
on conflict do nothing;

-- Protección ante cualquier UPDATE (no solo desde la interfaz): en reservas
-- directas el total nunca se acepta del navegador, se recalcula.
create or replace function public.guard_lodging_reservation_price()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.imported_from_ical or auth.role()='service_role' then return new; end if;
 if new.nightly_rate < 0 or new.discount < 0 or new.surcharge < 0 then raise exception 'Los montos no pueden ser negativos'; end if;
 new.total_value := ((new.check_out - new.check_in) * new.nightly_rate) - new.discount + new.surcharge;
 if new.total_value < 0 then raise exception 'El total recalculado no puede ser negativo'; end if;
 return new;
end $$;
create trigger guard_lodging_reservation_price
before update of nightly_rate, discount, surcharge, total_value on public.lodging_reservations
for each row execute function public.guard_lodging_reservation_price();
revoke execute on function public.guard_lodging_reservation_price() from public,anon,authenticated;

create or replace function public.update_lodging_reservation_price(target_reservation uuid,new_nightly_rate numeric,new_discount numeric,new_surcharge numeric,change_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.lodging_reservations; v_reason text:=btrim(coalesce(change_reason,'')); v_total numeric; paid numeric;
begin
 if auth.uid() is null or not public.has_permission('lodging.reservations.manage') then raise exception 'Sin autorizacion'; end if;
 select * into r from public.lodging_reservations where id=target_reservation for update;
 if r.id is null or not public.can_access_unit(r.company_id,r.business_unit_id) then raise exception 'Reserva no encontrada'; end if;
 if r.imported_from_ical then raise exception 'El valor de una reserva de Booking o Airbnb se corrige en Completar informacion interna'; end if;
 if r.status='cancelled' then raise exception 'La reserva esta anulada'; end if;
 if r.status='checked_out' and not public.has_permission('lodging.reservations.cancel_approve') then raise exception 'Solo el administrador corrige el precio de una reserva con check-out'; end if;
 if new_nightly_rate is null or new_discount is null or new_surcharge is null or new_nightly_rate<0 or new_discount<0 or new_surcharge<0 then raise exception 'Los montos no pueden ser negativos'; end if;
 if char_length(v_reason)<5 then raise exception 'Indica el motivo de la correccion'; end if;
 v_total:=((r.check_out-r.check_in)*new_nightly_rate)-new_discount+new_surcharge;
 if v_total<0 then raise exception 'El total recalculado no puede ser negativo'; end if;
 if r.nightly_rate=new_nightly_rate and r.discount=new_discount and r.surcharge=new_surcharge and r.total_value=v_total then
  return jsonb_build_object('changed',false,'total_value',v_total);
 end if;
 update public.lodging_reservations set nightly_rate=new_nightly_rate,discount=new_discount,surcharge=new_surcharge where id=r.id;
 select coalesce(sum(case when type='refund' then -amount else amount end),0) into paid from public.lodging_reservation_payments where reservation_id=r.id and status='confirmed';
 insert into public.audit_logs(company_id,business_unit_id,actor_id,action,entity_type,entity_id,old_data,new_data)
 values(r.company_id,r.business_unit_id,auth.uid(),'update_reservation_price','lodging_reservations',r.id,
  jsonb_build_object('nightly_rate',r.nightly_rate,'discount',r.discount,'surcharge',r.surcharge,'total_value',r.total_value),
  jsonb_build_object('nightly_rate',new_nightly_rate,'discount',new_discount,'surcharge',new_surcharge,'total_value',v_total,'reason',v_reason));
 return jsonb_build_object('changed',true,'total_value',v_total,'balance',v_total-paid);
end $$;
revoke execute on function public.update_lodging_reservation_price(uuid,numeric,numeric,numeric,text) from public,anon;
grant execute on function public.update_lodging_reservation_price(uuid,numeric,numeric,numeric,text) to authenticated;

commit;
