begin;

-- Datos de la persona de una reserva ya creada: nombre, teléfono, correo, documento y nacionalidad.
-- Hasta ahora solo las reservas importadas (Booking/Airbnb) tenían un formulario para completarlos.
-- La función valida permiso, hostal y estado (no se edita una reserva anulada), y deja en la auditoría
-- qué campos cambiaron (los nombres de los campos, no sus valores).
create function public.lodging_update_reservation_guest(p_reservation uuid,p_payload jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare r public.lodging_reservations; g public.lodging_guests; new_guest_id uuid; changed text[]:='{}';
 v_name text:=left(btrim(coalesce(p_payload->>'full_name','')),160);
 v_phone text:=left(btrim(coalesce(p_payload->>'phone','')),50);
 v_email text:=left(btrim(coalesce(p_payload->>'email','')),160);
 v_doc text:=left(btrim(coalesce(p_payload->>'document','')),80);
 v_nat text:=left(btrim(coalesce(p_payload->>'nationality','')),80);
begin
 if not public.has_permission('lodging.reservations.manage') then raise exception 'Sin autorizacion'; end if;
 select * into r from public.lodging_reservations where id=p_reservation for update;
 if r.id is null or not public.can_access_unit(r.company_id,r.business_unit_id) then raise exception 'Reserva no encontrada'; end if;
 if r.status in('cancelled','conflict') then raise exception 'La reserva esta anulada'; end if;
 if char_length(v_name)<3 then raise exception 'Indica el nombre del huesped'; end if;
 if char_length(v_phone)<6 then raise exception 'Indica el telefono del huesped'; end if;
 if v_email<>'' and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Correo invalido'; end if;
 select * into g from public.lodging_guests where id=r.guest_id for update;
 if g.id is null then
  insert into public.lodging_guests(company_id,business_unit_id,full_name,phone,email,document,nationality)
  values(r.company_id,r.business_unit_id,v_name,v_phone,nullif(v_email,''),nullif(v_doc,''),nullif(v_nat,'')) returning id into new_guest_id;
  update public.lodging_reservations set guest_id=new_guest_id where id=r.id;
  changed:=array['full_name','phone','email','document','nationality'];
 else
  if g.full_name is distinct from v_name then changed:=array_append(changed,'full_name'); end if;
  if g.phone is distinct from v_phone then changed:=array_append(changed,'phone'); end if;
  if g.email is distinct from nullif(v_email,'') then changed:=array_append(changed,'email'); end if;
  if g.document is distinct from nullif(v_doc,'') then changed:=array_append(changed,'document'); end if;
  if g.nationality is distinct from nullif(v_nat,'') then changed:=array_append(changed,'nationality'); end if;
  if cardinality(changed)=0 then return; end if;
  update public.lodging_guests set full_name=v_name,phone=v_phone,email=nullif(v_email,''),document=nullif(v_doc,''),nationality=nullif(v_nat,'')
  where id=g.id;
 end if;
 insert into public.audit_logs(company_id,business_unit_id,actor_id,action,entity_type,entity_id,new_data)
 values(r.company_id,r.business_unit_id,auth.uid(),'update_guest','lodging_reservations',r.id,jsonb_build_object('changed_fields',to_jsonb(changed)));
end $$;
revoke execute on function public.lodging_update_reservation_guest(uuid,jsonb) from public,anon;
grant execute on function public.lodging_update_reservation_guest(uuid,jsonb) to authenticated;

commit;
