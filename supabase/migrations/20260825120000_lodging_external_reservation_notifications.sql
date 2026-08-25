begin;

-- Avisa por correo a un destinatario fijo (Patricio y Kathya) cada vez que
-- llega una reserva desde un canal externo (Booking o Airbnb), sin importar
-- si la creó el sync de iCal o el staff a mano. Reutiliza el mecanismo ya
-- existente de notifications -> approval_email_outbox (ver
-- 20260714134220_approval_email_notifications.sql): basta con que
-- event_key termine en '.review_assigned' para que enqueue_approval_email()
-- encole el correo automáticamente, y notificationActionPath() ya resuelve
-- entity_type 'lodging_reservation' hacia /lodging/reservations/:id sin
-- casos especiales por event_key.
--
-- A diferencia de notify_lodging_public_request (que notifica a todo el que
-- tenga el permiso lodging.reservations.manage en la unidad), aquí el
-- destinatario es explícito por correo: el pedido fue "avísame a mí y a
-- Kathya", no "avísale a todo el equipo".
create or replace function public.notify_lodging_external_reservation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  room_name text;
begin
  if new.origin not in ('booking', 'airbnb') then
    return new;
  end if;

  select name into room_name
  from public.lodging_rooms
  where id = new.room_id;

  insert into public.notifications(
    company_id, business_unit_id, recipient_id, event_key, title, body,
    entity_type, entity_id, created_by
  )
  select new.company_id, new.business_unit_id, p.id,
    'lodging.review_assigned',
    'Nueva reserva de ' || initcap(new.origin),
    'Llegó una reserva de ' || initcap(new.origin) || ' para '
      || coalesce(room_name, 'una habitación') || ', del ' || new.check_in
      || ' al ' || new.check_out || '.',
    'lodging_reservation', new.id, null
  from public.profiles p
  where p.active and p.deleted_at is null
    and lower(p.email) in ('patriciopastencruz@gmail.com', 'sozakathya@gmail.com')
    and not exists (
      select 1 from public.notifications n
      where n.recipient_id = p.id and n.entity_type = 'lodging_reservation'
        and n.entity_id = new.id and n.event_key = 'lodging.review_assigned'
    );
  return new;
end
$$;

create trigger notify_lodging_external_reservation_created
after insert on public.lodging_reservations
for each row execute function public.notify_lodging_external_reservation();

revoke execute on function public.notify_lodging_external_reservation() from public, anon, authenticated;

commit;
