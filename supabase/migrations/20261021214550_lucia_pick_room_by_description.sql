begin;

-- Si Lucía no entrega el código de la opción (el resultado de la herramienta
-- no queda en el historial de turnos anteriores), la habitación se elige por
-- lo que el cliente eligió y no por la más barata de la hostal:
--   1. mismo grupo que la opción elegida (código);
--   2. la descripción de la habitación aparece en la opción elegida
--      ("Habitación con 1 cama matrimonial, baño privado y cocina compartida");
--   3. el total coincide con el monto cotizado;
--   4. el tipo de habitación coincide;
--   5. recién entonces, la más económica.

create or replace function public.lucia_pick_room(c public.lucia_conversations) returns uuid language sql stable security definer set search_path='' as $$
 select r.id from public.lodging_rooms r
 left join public.lodging_rooms p on p.id=c.preferred_room_id
 where r.business_unit_id=c.business_unit_id and r.active and r.status not in('maintenance','out_of_service') and r.capacity>=c.guests
  and not exists(select 1 from public.lodging_reservations x where x.room_id=r.id and x.status not in('cancelled','conflict')
    and x.check_in<c.check_out and x.check_out>c.check_in)
 order by
  (p.id is not null and r.room_type=p.room_type and coalesce(r.description,'')=coalesce(p.description,'')
    and r.capacity=p.capacity and r.base_rate=p.base_rate and coalesce(r.rates_by_guests,'{}')=coalesce(p.rates_by_guests,'{}')) desc,
  (c.room_type is not null and length(trim(coalesce(r.description,'')))>=6
    and position(lower(trim(r.description)) in lower(c.room_type))>0) desc,
  (c.quoted_amount is not null and public.lucia_rate_for_guests(r.base_rate,r.rates_by_guests,c.guests)*(c.check_out-c.check_in)=c.quoted_amount) desc,
  (c.room_type is not null and c.room_type ilike r.room_type||'%') desc,
  public.lucia_rate_for_guests(r.base_rate,r.rates_by_guests,c.guests),r.display_order,r.code
 limit 1
$$;
revoke execute on function public.lucia_pick_room(public.lucia_conversations) from public,anon,authenticated;

commit;
